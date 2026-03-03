import { createClient } from "@/lib/supabase/server";
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

export async function getUnifiedOrders(
  period: string,
  from?: string,
  to?: string,
  channel: "all" | "shopify" | "amazon" = "all",
  status = "all",
  page = 1
) {
  const supabase = await createClient();
  const { start, end } = getDateRange(period, from, to);
  const PAGE_SIZE = 50;
  const offset = (page - 1) * PAGE_SIZE;

  let shopifyRows: ShopifyOrderRow[] = [];
  let amazonRows: AmazonOrderRow[] = [];

  if (channel === "all" || channel === "shopify") {
    const { data: stores } = await supabase
      .from("stores")
      .select("id, name");

    for (const store of stores || []) {
      let query = supabase
        .from("shopify_orders")
        .select("id, order_number, total, customer_email, financial_status, fulfillment_status, created_at, line_items")
        .eq("store_id", store.id)
        .gte("created_at", start)
        .lte("created_at", end);

      if (status !== "all") query = query.eq("financial_status", status);

      const { data: orders } = await query;
      for (const o of orders || []) {
        const rawItems = (o.line_items as Array<{
          title?: string;
          sku?: string;
          quantity?: number;
          price?: string | number;
        }>) || [];
        shopifyRows.push({
          id: o.id,
          source: "shopify",
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
        });
      }
    }
  }

  if (channel === "all" || channel === "amazon") {
    const { data: accounts } = await supabase
      .from("amazon_accounts")
      .select("id, name");

    for (const account of accounts || []) {
      let query = supabase
        .from("amazon_orders")
        .select("id, amazon_order_id, asin, sku, item_price, order_status, fulfillment_channel, purchase_date")
        .eq("account_id", account.id)
        .gte("purchase_date", start)
        .lte("purchase_date", end);

      if (status !== "all") query = query.eq("order_status", status);

      const { data: orders } = await query;
      for (const o of orders || []) {
        amazonRows.push({
          id: o.id,
          source: "amazon",
          accountName: account.name,
          date: o.purchase_date,
          orderNumber: o.amazon_order_id,
          asin: o.asin,
          sku: o.sku,
          total: o.item_price || 0,
          status: o.order_status,
          fulfillmentChannel: o.fulfillment_channel,
        });
      }
    }
  }

  const all = mergeAndSortOrders(shopifyRows, amazonRows);
  const total = all.length;
  const paginated = all.slice(offset, offset + PAGE_SIZE);

  return { orders: paginated, total, page, pageSize: PAGE_SIZE };
}
