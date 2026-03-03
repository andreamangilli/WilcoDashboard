import { createClient } from "@/lib/supabase/server";
import { getDateRange } from "./utils";

export type ShopifyProductPerf = {
  title: string;
  storeName: string;
  sku: string | null;
  units: number;
  revenue: number;
  ordersCount: number;
  inventoryQty: number | null;
};

export type AmazonProductPerf = {
  asin: string;
  sku: string | null;
  units: number;
  revenue: number;
  totalFees: number;
  feePercent: number;
  netMargin: number;
  netMarginPct: number;
  qtyAvailable: number | null;
};

type RawLineItem = {
  title?: string;
  sku?: string;
  quantity?: number;
  price?: string | number;
};

export function aggregateLineItems(
  orders: Array<{ line_items: unknown; total: unknown }>,
  storeName: string
): ShopifyProductPerf[] {
  const map = new Map<string, ShopifyProductPerf>();

  for (const order of orders) {
    const items = (order.line_items as RawLineItem[]) || [];
    const seenTitlesInOrder = new Set<string>();

    for (const li of items) {
      const title = li.title || "—";
      const key = `${storeName}::${title}`;
      const qty = li.quantity || 1;
      const price = parseFloat(String(li.price || "0"));
      const lineRevenue = qty * price;

      if (!map.has(key)) {
        map.set(key, {
          title,
          storeName,
          sku: li.sku || null,
          units: 0,
          revenue: 0,
          ordersCount: 0,
          inventoryQty: null,
        });
      }
      const entry = map.get(key)!;
      entry.units += qty;
      entry.revenue += lineRevenue;
      if (!seenTitlesInOrder.has(key)) {
        entry.ordersCount += 1;
        seenTitlesInOrder.add(key);
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
}

export function aggregateAmazonProducts(
  orders: Array<{
    asin: string;
    sku: string | null;
    quantity: number;
    item_price: number;
    amazon_fees: number;
    fba_fees: number;
  }>
): AmazonProductPerf[] {
  const map = new Map<string, AmazonProductPerf>();

  for (const o of orders) {
    if (!map.has(o.asin)) {
      map.set(o.asin, {
        asin: o.asin,
        sku: o.sku,
        units: 0,
        revenue: 0,
        totalFees: 0,
        feePercent: 0,
        netMargin: 0,
        netMarginPct: 0,
        qtyAvailable: null,
      });
    }
    const entry = map.get(o.asin)!;
    entry.units += o.quantity || 1;
    entry.revenue += o.item_price || 0;
    entry.totalFees += (o.amazon_fees || 0) + (o.fba_fees || 0);
  }

  for (const entry of map.values()) {
    entry.netMargin = entry.revenue - entry.totalFees;
    entry.feePercent = entry.revenue > 0 ? (entry.totalFees / entry.revenue) * 100 : 0;
    entry.netMarginPct = entry.revenue > 0 ? (entry.netMargin / entry.revenue) * 100 : 0;
  }

  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
}

export async function getShopifyProductPerf(period: string, from?: string, to?: string) {
  const supabase = await createClient();
  const { start, end } = getDateRange(period, from, to);

  const { data: stores, error: storesError } = await supabase.from("stores").select("id, name");
  if (storesError) throw new Error(`Failed to load stores: ${storesError.message}`);

  const results: ShopifyProductPerf[] = [];

  await Promise.all(
    (stores || []).map(async (store) => {
      const { data: orders, error: ordersError } = await supabase
        .from("shopify_orders")
        .select("line_items, total")
        .eq("store_id", store.id)
        .eq("financial_status", "paid")
        .gte("created_at", start)
        .lte("created_at", end);

      if (ordersError) throw new Error(`Failed to load orders for store ${store.id}: ${ordersError.message}`);

      const aggregated = aggregateLineItems(orders || [], store.name);

      // Enrich with current inventory
      const { data: products } = await supabase
        .from("shopify_products")
        .select("title, sku, inventory_qty")
        .eq("store_id", store.id);

      const inventoryMap = new Map(
        (products || []).map((p) => [p.title, p.inventory_qty])
      );

      for (const row of aggregated) {
        row.inventoryQty = inventoryMap.get(row.title) ?? null;
        results.push(row);
      }
    })
  );

  return results.sort((a, b) => b.revenue - a.revenue);
}

export async function getAmazonProductPerf(period: string, from?: string, to?: string) {
  const supabase = await createClient();
  const { start, end } = getDateRange(period, from, to);

  const { data: orders, error: ordersError } = await supabase
    .from("amazon_orders")
    .select("asin, sku, quantity, item_price, amazon_fees, fba_fees")
    .gte("purchase_date", start)
    .lte("purchase_date", end);

  if (ordersError) throw new Error(`Failed to load amazon orders: ${ordersError.message}`);

  const results = aggregateAmazonProducts(
    (orders || []).map((o) => ({
      ...o,
      quantity: o.quantity || 1,
      item_price: o.item_price || 0,
      amazon_fees: o.amazon_fees || 0,
      fba_fees: o.fba_fees || 0,
    }))
  );

  // Enrich with FBA inventory
  const { data: inventory } = await supabase
    .from("amazon_inventory")
    .select("asin, qty_available")
    .eq("fulfillment", "fba");

  const invMap = new Map(
    (inventory || []).map((i) => [i.asin, i.qty_available])
  );

  for (const row of results) {
    row.qtyAvailable = invMap.get(row.asin) ?? null;
  }

  return results;
}
