import { unstable_cache } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/server';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { getDateRange } from './utils';

export const getAmazonKpis = unstable_cache(
  async (period: string, from?: string, to?: string) => {
    const supabase = await createServiceClient();
    const { start, end, prevStart, prevEnd } = getDateRange(period, from, to);

    const [current, prev] = await Promise.all([
      fetchAll<{ item_price: number; quantity: number; amazon_fees: number; fba_fees: number }>(({ from: f, to: t }) =>
        supabase.from('amazon_orders').select('item_price, quantity, amazon_fees, fba_fees').gte('purchase_date', start).lte('purchase_date', end).range(f, t)
      ),
      fetchAll<{ item_price: number }>(({ from: f, to: t }) =>
        supabase.from('amazon_orders').select('item_price').gte('purchase_date', prevStart).lte('purchase_date', prevEnd).range(f, t)
      ),
    ]);

    const revenue = current.reduce((s, o) => s + (o.item_price || 0), 0);
    const prevRevenue = prev.reduce((s, o) => s + (o.item_price || 0), 0);
    const orders = current.length;
    const totalFees = current.reduce((s, o) => s + Math.abs(o.amazon_fees || 0) + Math.abs(o.fba_fees || 0), 0);

    return {
      revenue: { value: revenue, change: prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0 },
      orders: {
        value: orders,
        change: prev.length > 0 ? ((orders - prev.length) / prev.length) * 100 : 0,
      },
      fees: { value: totalFees },
    };
  },
  ['amazon-kpis-v4'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);

export type AmazonPnlRow = {
  asin: string;
  sku: string | null;
  revenue: number;
  units: number;
  amazonFees: number;
  fbaFees: number;
  shippingCost: number;
  netProfit: number;
  marginPct: number;
};

export const getAmazonPnlFromOrders = unstable_cache(
  async (period: string, from?: string, to?: string): Promise<AmazonPnlRow[]> => {
    const supabase = await createServiceClient();
    const { start, end } = getDateRange(period, from, to);

    const orders = await fetchAll<{
      asin: string; sku: string; quantity: number; item_price: number;
      amazon_fees: number; fba_fees: number; shipping_cost: number;
    }>(({ from: f, to: t }) =>
      supabase.from('amazon_orders')
        .select('asin, sku, quantity, item_price, amazon_fees, fba_fees, shipping_cost')
        .gte('purchase_date', start)
        .lte('purchase_date', end)
        .range(f, t)
    );

    const byAsin = new Map<string, {
      sku: string | null; revenue: number; units: number;
      amazonFees: number; fbaFees: number; shippingCost: number;
    }>();

    for (const o of orders) {
      if (!o.asin) continue;
      const existing = byAsin.get(o.asin) ?? {
        sku: o.sku, revenue: 0, units: 0, amazonFees: 0, fbaFees: 0, shippingCost: 0,
      };
      existing.revenue += o.item_price || 0;
      existing.units += o.quantity || 1;
      existing.amazonFees += Math.abs(o.amazon_fees || 0);
      existing.fbaFees += Math.abs(o.fba_fees || 0);
      existing.shippingCost += Math.abs(o.shipping_cost || 0);
      byAsin.set(o.asin, existing);
    }

    return Array.from(byAsin.entries())
      .map(([asin, agg]) => {
        const totalCosts = agg.amazonFees + agg.fbaFees + agg.shippingCost;
        const netProfit = agg.revenue - totalCosts;
        const marginPct = agg.revenue > 0 ? (netProfit / agg.revenue) * 100 : 0;
        return {
          asin, sku: agg.sku, revenue: agg.revenue, units: agg.units,
          amazonFees: agg.amazonFees, fbaFees: agg.fbaFees, shippingCost: agg.shippingCost,
          netProfit, marginPct,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  },
  ['amazon-pnl-from-orders-v4'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);

export const getAmazonInventory = unstable_cache(
  async () => {
    const supabase = await createServiceClient();
    const { data } = await supabase.from('amazon_inventory').select('*').order('asin');
    return data || [];
  },
  ['amazon-inventory-v4'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);
