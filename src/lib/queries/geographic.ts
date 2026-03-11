import { unstable_cache } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/server';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { getDateRange } from './utils';
import { provinceToRegion } from '@/lib/geo/italy-provinces';

export type RegionData = {
  region: string;
  orders: number;
  revenue: number;
};

export const getShippingByRegion = unstable_cache(
  async (period: string, from?: string, to?: string): Promise<RegionData[]> => {
    const supabase = await createServiceClient();
    const { start, end } = getDateRange(period, from, to);

    const [shopifyRows, amazonRows] = await Promise.all([
      fetchAll<{ shipping_province: string | null; total: number }>(({ from: f, to: t }) =>
        supabase
          .from('shopify_orders')
          .select('shipping_province, total')
          .eq('shipping_country_code', 'IT')
          .eq('financial_status', 'paid')
          .gte('created_at', start)
          .lte('created_at', end)
          .range(f, t)
      ),
      fetchAll<{ shipping_province: string | null; item_price: number }>(({ from: f, to: t }) =>
        supabase
          .from('amazon_orders')
          .select('shipping_province, item_price')
          .eq('shipping_country_code', 'IT')
          .gte('purchase_date', start)
          .lte('purchase_date', end)
          .range(f, t)
      ),
    ]);

    const regionMap = new Map<string, { orders: number; revenue: number }>();

    for (const row of shopifyRows) {
      const region = provinceToRegion(row.shipping_province);
      if (!region) continue;
      const curr = regionMap.get(region) || { orders: 0, revenue: 0 };
      curr.orders += 1;
      curr.revenue += row.total || 0;
      regionMap.set(region, curr);
    }

    for (const row of amazonRows) {
      const region = provinceToRegion(row.shipping_province);
      if (!region) continue;
      const curr = regionMap.get(region) || { orders: 0, revenue: 0 };
      curr.orders += 1;
      curr.revenue += row.item_price || 0;
      regionMap.set(region, curr);
    }

    return Array.from(regionMap.entries())
      .map(([region, data]) => ({ region, ...data }))
      .sort((a, b) => b.orders - a.orders);
  },
  ['shipping-by-region-v1'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);
