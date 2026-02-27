import { createServiceClient } from "@/lib/supabase/server";
import { sleep } from "./utils";

const AMAZON_SP_API_BASE = "https://sellingpartnerapi-eu.amazon.com";

async function getAmazonAccessToken(): Promise<string> {
  const res = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: process.env.AMAZON_REFRESH_TOKEN!,
      client_id: process.env.AMAZON_CLIENT_ID!,
      client_secret: process.env.AMAZON_CLIENT_SECRET!,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Amazon auth error: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function amazonFetch(accessToken: string, path: string, params: Record<string, string> = {}) {
  const url = new URL(`${AMAZON_SP_API_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "x-amz-access-token": accessToken,
    },
  });

  if (res.status === 429) {
    await sleep(2000);
    return amazonFetch(accessToken, path, params);
  }

  if (!res.ok) {
    throw new Error(`Amazon SP-API error: ${res.status} ${await res.text()}`);
  }

  await sleep(500);
  return res.json();
}

export async function syncAmazonOrders(accountId: string) {
  const supabase = await createServiceClient();
  const accessToken = await getAmazonAccessToken();
  const marketplaceId = process.env.AMAZON_MARKETPLACE_ID!;

  const createdAfter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const data = await amazonFetch(accessToken, "/orders/v0/orders", {
    MarketplaceIds: marketplaceId,
    CreatedAfter: createdAfter,
    OrderStatuses: "Shipped,Unshipped",
  });

  let synced = 0;
  const orders = data.payload?.Orders || [];

  for (const order of orders) {
    const itemsData = await amazonFetch(
      accessToken,
      `/orders/v0/orders/${order.AmazonOrderId}/orderItems`
    );
    const items = itemsData.payload?.OrderItems || [];

    for (const item of items) {
      await supabase.from("amazon_orders").upsert(
        {
          account_id: accountId,
          amazon_order_id: `${order.AmazonOrderId}_${item.ASIN}`,
          asin: item.ASIN,
          sku: item.SellerSKU,
          quantity: item.QuantityOrdered || 1,
          item_price: parseFloat(item.ItemPrice?.Amount || "0"),
          amazon_fees: parseFloat(item.ItemFee?.Amount || "0"),
          fba_fees: parseFloat(item.FBAFees?.Amount || "0"),
          shipping_cost: parseFloat(item.ShippingPrice?.Amount || "0"),
          order_status: order.OrderStatus,
          fulfillment_channel: order.FulfillmentChannel,
          purchase_date: order.PurchaseDate,
        },
        { onConflict: "amazon_order_id" }
      );
      synced++;
    }
  }

  return synced;
}

export async function syncAmazonInventory(accountId: string) {
  const supabase = await createServiceClient();
  const accessToken = await getAmazonAccessToken();

  const data = await amazonFetch(
    accessToken,
    "/fba/inventory/v1/summaries",
    {
      granularityType: "Marketplace",
      granularityId: process.env.AMAZON_MARKETPLACE_ID!,
      marketplaceIds: process.env.AMAZON_MARKETPLACE_ID!,
    }
  );

  let synced = 0;
  const summaries = data.payload?.inventorySummaries || [];

  for (const inv of summaries) {
    await supabase.from("amazon_inventory").upsert(
      {
        account_id: accountId,
        asin: inv.asin,
        sku: inv.sellerSku,
        fulfillment: inv.condition === "FBA" ? "fba" : "fbm",
        qty_available: inv.inventoryDetails?.fulfillableQuantity || 0,
        qty_inbound: inv.inventoryDetails?.inboundWorkingQuantity || 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id,asin,fulfillment" }
    );
    synced++;
  }

  return synced;
}

export async function calculateAmazonPnl(accountId: string) {
  const supabase = await createServiceClient();

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split("T")[0];
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .split("T")[0];

  const { data: orders } = await supabase
    .from("amazon_orders")
    .select("asin, sku, quantity, item_price, amazon_fees, fba_fees, shipping_cost")
    .eq("account_id", accountId)
    .gte("purchase_date", periodStart)
    .lte("purchase_date", `${periodEnd}T23:59:59`);

  const byAsin: Record<string, {
    sku: string;
    revenue: number;
    units: number;
    amazonFees: number;
    fbaFees: number;
  }> = {};

  for (const o of orders || []) {
    if (!byAsin[o.asin]) {
      byAsin[o.asin] = { sku: o.sku, revenue: 0, units: 0, amazonFees: 0, fbaFees: 0 };
    }
    byAsin[o.asin].revenue += o.item_price || 0;
    byAsin[o.asin].units += o.quantity || 1;
    byAsin[o.asin].amazonFees += Math.abs(o.amazon_fees || 0);
    byAsin[o.asin].fbaFees += Math.abs(o.fba_fees || 0);
  }

  for (const [asin, agg] of Object.entries(byAsin)) {
    let productCost = 0;
    if (agg.sku) {
      const { data: product } = await supabase
        .from("shopify_products")
        .select("cost")
        .eq("sku", agg.sku)
        .limit(1)
        .single();
      productCost = (product?.cost || 0) * agg.units;
    }

    const { data: inv } = await supabase
      .from("amazon_inventory")
      .select("storage_fees_monthly")
      .eq("asin", asin)
      .limit(1)
      .single();
    const storageFees = inv?.storage_fees_monthly || 0;

    const netProfit =
      agg.revenue - agg.amazonFees - agg.fbaFees - storageFees - productCost;
    const marginPct = agg.revenue > 0 ? (netProfit / agg.revenue) * 100 : 0;

    await supabase.from("amazon_pnl").upsert(
      {
        account_id: accountId,
        asin,
        sku: agg.sku,
        period_start: periodStart,
        period_end: periodEnd,
        revenue: agg.revenue,
        units_sold: agg.units,
        amazon_fees: agg.amazonFees,
        fba_fees: agg.fbaFees,
        storage_fees: storageFees,
        product_cost: productCost,
        net_profit: netProfit,
        margin_pct: marginPct,
      },
      { onConflict: "asin,period_start,period_end" }
    );
  }
}
