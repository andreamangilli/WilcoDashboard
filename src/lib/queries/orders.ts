import { unstable_cache } from 'next/cache';
import { createServiceClient } from "@/lib/supabase/server";
import { getDateRange } from "./utils";

export type ShopifyOrderRow = {
  id: string;
  source: "shopify";
  storeName: string;
  date: string;
  orderNumber: string;
  customerEmail: string | null;
  lineItems: Array<{ title: string; sku: string | null; quantity: number; price: number }>;
  total: number;
  status: string;
  fulfillmentStatus: string | null;
};

export type AmazonOrderRow = {
  id: string;
  source: "amazon";
  accountName: string;
  date: string;
  orderNumber: string;
  asin: string;
  sku: string | null;
  total: number;
  status: string;
  fulfillmentChannel: string;
};

export type UnifiedOrder = ShopifyOrderRow | AmazonOrderRow;

export function mergeAndSortOrders(
  shopify: ShopifyOrderRow[],
  amazon: AmazonOrderRow[]
): UnifiedOrder[] {
  return [...shopify, ...amazon].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

/**
 * Fetches unified orders across Shopify and Amazon for the given period.
 *
 * @param status - Filter by order status. For Shopify this maps to
 *   `financial_status` (e.g. "paid", "refunded"); for Amazon it maps to
 *   `order_status` (e.g. "Shipped", "Canceled"). Pass "all" to skip
 *   filtering. Note: the same value is applied to both platforms, so
 *   cross-platform status strings will not match — prefer "all" when
 *   querying across channels.
 */
export const getUnifiedOrders = unstable_cache(
  async (
    period: string,
    from?: string,
    to?: string,
    channel: "all" | "shopify" | "amazon" = "all",
    status = "all",
    page = 1
  ) => {
    const supabase = await createServiceClient();
    const { start, end } = getDateRange(period, from, to);
    const PAGE_SIZE = 50;
    const offset = (page - 1) * PAGE_SIZE;

    let shopifyRows: ShopifyOrderRow[] = [];
    let amazonRows: AmazonOrderRow[] = [];

    if (channel === "all" || channel === "shopify") {
      const { data: stores, error: storesError } = await supabase
        .from("stores")
        .select("id, name");
      if (storesError) throw new Error(`Failed to load stores: ${storesError.message}`);

      const shopifyResults = await Promise.all(
        (stores || []).map(async (store) => {
          let query = supabase
            .from("shopify_orders")
            .select("id, order_number, total, customer_email, financial_status, fulfillment_status, created_at, line_items")
            .eq("store_id", store.id)
            .gte("created_at", start)
            .lte("created_at", end);
          if (status !== "all") query = query.eq("financial_status", status);
          const { data: orders, error: ordersError } = await query;
          if (ordersError) throw new Error(`Failed to load orders for store ${store.id}: ${ordersError.message}`);
          return (orders || []).map((o) => {
            const rawItems = (o.line_items as Array<{
              title?: string; sku?: string; quantity?: number; price?: string | number;
            }>) || [];
            return {
              id: o.id,
              source: "shopify" as const,
              storeName: store.name,
              date: o.created_at,
              orderNumber: o.order_number,
              customerEmail: o.customer_email,
              lineItems: rawItems.map((li) => ({
                title: li.title || "—",
                sku: li.sku || null,
                quantity: li.quantity || 1,
                price: parseFloat(String(li.price || "0")),
              })),
              total: o.total || 0,
              status: o.financial_status,
              fulfillmentStatus: o.fulfillment_status,
            } satisfies ShopifyOrderRow;
          });
        })
      );
      shopifyRows = shopifyResults.flat();
    }

    if (channel === "all" || channel === "amazon") {
      const { data: accounts, error: accountsError } = await supabase
        .from("amazon_accounts")
        .select("id, name");
      if (accountsError) throw new Error(`Failed to load amazon_accounts: ${accountsError.message}`);

      const amazonResults = await Promise.all(
        (accounts || []).map(async (account) => {
          let query = supabase
            .from("amazon_orders")
            .select("id, amazon_order_id, asin, sku, item_price, order_status, fulfillment_channel, purchase_date")
            .eq("account_id", account.id)
            .gte("purchase_date", start)
            .lte("purchase_date", end);
          if (status !== "all") query = query.eq("order_status", status);
          const { data: orders, error: ordersError } = await query;
          if (ordersError) throw new Error(`Failed to load orders for account ${account.id}: ${ordersError.message}`);
          return (orders || []).map((o) => ({
            id: o.id,
            source: "amazon" as const,
            accountName: account.name,
            date: o.purchase_date,
            orderNumber: o.amazon_order_id,
            asin: o.asin,
            sku: o.sku,
            total: o.item_price || 0,
            status: o.order_status,
            fulfillmentChannel: o.fulfillment_channel,
          } satisfies AmazonOrderRow));
        })
      );
      amazonRows = amazonResults.flat();
    }

    const all = mergeAndSortOrders(shopifyRows, amazonRows);
    const total = all.length;
    // NOTE: In-memory pagination — fetches all orders for the period then slices.
    // Acceptable for current data volumes. If orders per period exceed ~500,
    // migrate to server-side pagination with Supabase .range().
    const paginated = all.slice(offset, offset + PAGE_SIZE);

    return { orders: paginated, total, page, pageSize: PAGE_SIZE };
  },
  ['unified-orders-v2'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);
