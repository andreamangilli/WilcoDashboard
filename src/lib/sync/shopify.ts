import { createServiceClient } from "@/lib/supabase/server";
import { sleep } from "./utils";

interface ShopifyStoreConfig {
  storeId: string;
  domain: string;
  accessToken: string;
}

const SHOPIFY_API_VERSION = "2024-10";

async function shopifyFetch(
  domain: string,
  accessToken: string,
  endpoint: string,
  params: Record<string, string> = {}
) {
  const url = new URL(
    `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/${endpoint}.json`
  );
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: { "X-Shopify-Access-Token": accessToken },
  });

  if (!res.ok) {
    throw new Error(`Shopify API error: ${res.status} ${res.statusText}`);
  }

  // Rate limiting: respect 2 req/sec
  await sleep(500);

  return res.json();
}

export async function syncShopifyOrders(config: ShopifyStoreConfig) {
  const supabase = await createServiceClient();

  // Get last sync time for incremental sync
  const { data: lastSync } = await supabase
    .from("sync_log")
    .select("completed_at")
    .eq("source", `shopify_orders_${config.storeId}`)
    .eq("status", "success")
    .order("completed_at", { ascending: false })
    .limit(1)
    .single();

  const params: Record<string, string> = {
    status: "any",
    limit: "250",
    order: "updated_at asc",
  };
  if (lastSync?.completed_at) {
    params.updated_at_min = lastSync.completed_at;
  }

  let synced = 0;
  let hasMore = true;

  while (hasMore) {
    const data = await shopifyFetch(
      config.domain,
      config.accessToken,
      "orders",
      params
    );

    const orders = data.orders || [];
    if (orders.length === 0) break;

    for (const order of orders) {
      await supabase.from("shopify_orders").upsert(
        {
          store_id: config.storeId,
          shopify_id: order.id,
          order_number: order.name,
          total: parseFloat(order.total_price || "0"),
          subtotal: parseFloat(order.subtotal_price || "0"),
          total_tax: parseFloat(order.total_tax || "0"),
          total_discounts: parseFloat(order.total_discounts || "0"),
          customer_email: order.email,
          financial_status: order.financial_status,
          fulfillment_status: order.fulfillment_status,
          created_at: order.created_at,
          updated_at: order.updated_at,
          line_items: order.line_items,
        },
        { onConflict: "store_id,shopify_id" }
      );
      synced++;
    }

    hasMore = orders.length === 250;
    if (hasMore) {
      params.since_id = orders[orders.length - 1].id.toString();
    }
  }

  return synced;
}

export async function syncShopifyProducts(config: ShopifyStoreConfig) {
  const supabase = await createServiceClient();
  let synced = 0;
  let sinceId = "0";
  let hasMore = true;

  while (hasMore) {
    const data = await shopifyFetch(
      config.domain,
      config.accessToken,
      "products",
      { limit: "250", since_id: sinceId }
    );

    const products = data.products || [];
    if (products.length === 0) break;

    for (const product of products) {
      for (const variant of product.variants || []) {
        await supabase.from("shopify_products").upsert(
          {
            store_id: config.storeId,
            shopify_id: variant.id,
            title: `${product.title}${variant.title !== "Default Title" ? ` - ${variant.title}` : ""}`,
            sku: variant.sku,
            cost: variant.cost ? parseFloat(variant.cost) : null,
            price: parseFloat(variant.price || "0"),
            inventory_qty: variant.inventory_quantity || 0,
            status: product.status,
            updated_at: product.updated_at,
          },
          { onConflict: "store_id,shopify_id" }
        );
        synced++;
      }
    }

    hasMore = products.length === 250;
    sinceId = products[products.length - 1].id.toString();
  }

  return synced;
}

export async function syncShopifyCustomers(config: ShopifyStoreConfig) {
  const supabase = await createServiceClient();
  let synced = 0;
  let sinceId = "0";
  let hasMore = true;

  while (hasMore) {
    const data = await shopifyFetch(
      config.domain,
      config.accessToken,
      "customers",
      { limit: "250", since_id: sinceId }
    );

    const customers = data.customers || [];
    if (customers.length === 0) break;

    for (const c of customers) {
      await supabase.from("shopify_customers").upsert(
        {
          store_id: config.storeId,
          shopify_id: c.id,
          email: c.email,
          first_name: c.first_name,
          last_name: c.last_name,
          orders_count: c.orders_count || 0,
          total_spent: parseFloat(c.total_spent || "0"),
          first_order_at: c.orders_count > 0 ? c.created_at : null,
          created_at: c.created_at,
        },
        { onConflict: "store_id,shopify_id" }
      );
      synced++;
    }

    hasMore = customers.length === 250;
    sinceId = customers[customers.length - 1].id.toString();
  }

  return synced;
}

export function getShopifyStoreConfigs(): ShopifyStoreConfig[] {
  return [
    {
      storeId: "",
      domain: process.env.SHOPIFY_VITAMINITY_DOMAIN!,
      accessToken: process.env.SHOPIFY_VITAMINITY_ACCESS_TOKEN!,
    },
    {
      storeId: "",
      domain: process.env.SHOPIFY_KMAX_DOMAIN!,
      accessToken: process.env.SHOPIFY_KMAX_ACCESS_TOKEN!,
    },
    {
      storeId: "",
      domain: process.env.SHOPIFY_HAIRSHOP_DOMAIN!,
      accessToken: process.env.SHOPIFY_HAIRSHOP_ACCESS_TOKEN!,
    },
  ];
}
