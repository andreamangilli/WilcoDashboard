import { unstable_cache } from 'next/cache';
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";
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

const round2 = (n: number) => Math.round(n * 100) / 100;

export function aggregateLineItems(
  orders: Array<{ line_items: unknown; total: unknown }>,
  storeName: string
): ShopifyProductPerf[] {
  const map = new Map<string, ShopifyProductPerf>();

  for (const order of orders) {
    const items = (order.line_items as RawLineItem[]) || [];
    const seenInOrder = new Set<string>();

    for (const li of items) {
      const title = li.title || "—";
      const key = `${storeName}::${title}`;
      const qty = li.quantity || 1;
      const price = parseFloat(String(li.price || "0"));

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
      entry.revenue = round2(entry.revenue + qty * price);
      if (!seenInOrder.has(key)) {
        entry.ordersCount += 1;
        seenInOrder.add(key);
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
    entry.revenue = round2(entry.revenue + (o.item_price || 0));
    entry.totalFees = round2(entry.totalFees + (o.amazon_fees || 0) + (o.fba_fees || 0));
  }

  for (const entry of map.values()) {
    entry.netMargin = round2(entry.revenue - entry.totalFees);
    entry.feePercent = entry.revenue > 0 ? round2((entry.totalFees / entry.revenue) * 100) : 0;
    entry.netMarginPct = entry.revenue > 0 ? round2((entry.netMargin / entry.revenue) * 100) : 0;
  }

  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
}

export const getShopifyProductPerf = unstable_cache(
  async (period: string, from?: string, to?: string) => {
    const supabase = await createServiceClient();
    const { start, end } = getDateRange(period, from, to);

    const { data: stores, error: storesError } = await supabase.from('stores').select('id, name');
    if (storesError) throw new Error(`Failed to load stores: ${storesError.message}`);

    const perStoreResults = await Promise.all(
      (stores || []).map(async (store) => {
        const [orders, { data: products }] = await Promise.all([
          fetchAll<{ line_items: unknown; total: number }>(({ from: f, to: t }) =>
            supabase.from('shopify_orders').select('line_items, total').eq('store_id', store.id).eq('financial_status', 'paid').gte('created_at', start).lte('created_at', end).range(f, t)
          ),
          supabase.from('shopify_products').select('title, sku, inventory_qty').eq('store_id', store.id),
        ]);

        const aggregated = aggregateLineItems(orders, store.name);

        const inventoryByTitle = new Map((products || []).map((p) => [p.title, p.inventory_qty]));
        const inventoryBySku = new Map((products || []).filter((p) => p.sku).map((p) => [p.sku, p.inventory_qty]));

        return aggregated.map((row) => ({
          ...row,
          inventoryQty: (row.sku ? inventoryBySku.get(row.sku) : undefined) ?? inventoryByTitle.get(row.title) ?? null,
        }));
      })
    );

    return perStoreResults.flat().sort((a, b) => b.revenue - a.revenue);
  },
  ['shopify-product-perf-v4'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);

export const getAmazonProductPerf = unstable_cache(
  async (period: string, from?: string, to?: string) => {
    const supabase = await createServiceClient();
    const { start, end } = getDateRange(period, from, to);

    const [orders, { data: inventory }] = await Promise.all([
      fetchAll<{ asin: string; sku: string | null; quantity: number; item_price: number; amazon_fees: number; fba_fees: number }>(({ from: f, to: t }) =>
        supabase.from('amazon_orders').select('asin, sku, quantity, item_price, amazon_fees, fba_fees').gte('purchase_date', start).lte('purchase_date', end).range(f, t)
      ),
      supabase.from('amazon_inventory').select('asin, qty_available').eq('fulfillment', 'fba'),
    ]);

    const results = aggregateAmazonProducts(
      orders.map((o) => ({
        ...o,
        quantity: o.quantity || 1,
        item_price: o.item_price || 0,
        amazon_fees: o.amazon_fees || 0,
        fba_fees: o.fba_fees || 0,
      }))
    );

    const invMap = new Map((inventory || []).map((i) => [i.asin, i.qty_available]));

    return results.map((row) => ({ ...row, qtyAvailable: invMap.get(row.asin) ?? null }));
  },
  ['amazon-product-perf-v4'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);
