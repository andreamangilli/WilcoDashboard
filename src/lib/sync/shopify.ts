import { createServiceClient } from "@/lib/supabase/server";
import { sleep, logSyncStart, logSyncSuccess, logSyncError } from "./utils";

interface ShopifyStoreConfig {
  storeId: string;
  slug: string;
  domain: string;
  accessToken: string;
}

const SHOPIFY_API_VERSION = "2024-10";
const DEFAULT_SYNC_SINCE = "2024-01-01T00:00:00Z";
const SYNC_BUFFER_SECONDS = 30;

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

function getBufferedSince(completedAt: string): string {
  const date = new Date(completedAt);
  date.setSeconds(date.getSeconds() - SYNC_BUFFER_SECONDS);
  return date.toISOString();
}

async function getLastSyncTime(source: string): Promise<string> {
  const supabase = await createServiceClient();
  const { data: lastSync } = await supabase
    .from("sync_log")
    .select("completed_at")
    .eq("source", source)
    .eq("status", "success")
    .order("completed_at", { ascending: false })
    .limit(1)
    .single();

  if (lastSync?.completed_at) {
    return getBufferedSince(lastSync.completed_at);
  }
  return DEFAULT_SYNC_SINCE;
}

export async function syncShopifyOrders(config: ShopifyStoreConfig): Promise<{ synced: number; customerIds: Set<number> }> {
  const source = `shopify_orders_${config.slug}`;
  const logId = await logSyncStart(source);

  try {
    const supabase = await createServiceClient();
    const updatedAtMin = await getLastSyncTime(source);

    const params: Record<string, string> = {
      status: "any",
      limit: "250",
      order: "updated_at asc",
      updated_at_min: updatedAtMin,
    };

    let synced = 0;
    const customerIds = new Set<number>();
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

        if (order.customer?.id) {
          customerIds.add(order.customer.id);
        }
      }

      hasMore = orders.length === 250;
      if (hasMore) {
        params.since_id = orders[orders.length - 1].id.toString();
        delete params.order; // Shopify doesn't allow order + since_id together
      }
    }

    await logSyncSuccess(logId, synced);
    return { synced, customerIds };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await logSyncError(logId, message);
    throw err;
  }
}

export async function syncShopifyProducts(config: ShopifyStoreConfig) {
  const source = `shopify_products_${config.slug}`;
  const logId = await logSyncStart(source);

  try {
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

    await logSyncSuccess(logId, synced);
    return synced;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await logSyncError(logId, message);
    throw err;
  }
}

const CUSTOMER_BATCH_SIZE = 100;

export async function syncShopifyCustomers(config: ShopifyStoreConfig, customerIds: Set<number>) {
  const source = `shopify_customers_${config.slug}`;
  const logId = await logSyncStart(source);

  try {
    if (customerIds.size === 0) {
      await logSyncSuccess(logId, 0);
      return 0;
    }

    const supabase = await createServiceClient();
    let synced = 0;
    const idArray = Array.from(customerIds);

    // Fetch customers in batches using Shopify's ids parameter
    for (let i = 0; i < idArray.length; i += CUSTOMER_BATCH_SIZE) {
      const batch = idArray.slice(i, i + CUSTOMER_BATCH_SIZE);
      const data = await shopifyFetch(
        config.domain,
        config.accessToken,
        "customers",
        { ids: batch.join(","), limit: "250" }
      );

      const customers = data.customers || [];

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
    }

    await logSyncSuccess(logId, synced);
    return synced;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await logSyncError(logId, message);
    throw err;
  }
}
