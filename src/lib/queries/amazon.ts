import { unstable_cache } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/server';
import { getDateRange } from './utils';

export const getAmazonKpis = unstable_cache(
  async (period: string, from?: string, to?: string) => {
    const supabase = await createServiceClient();
    const { start, end, prevStart, prevEnd } = getDateRange(period, from, to);

    const [{ data: current }, { data: prev }] = await Promise.all([
      supabase.from('amazon_orders').select('item_price, quantity, amazon_fees, fba_fees').gte('purchase_date', start).lte('purchase_date', end),
      supabase.from('amazon_orders').select('item_price').gte('purchase_date', prevStart).lte('purchase_date', prevEnd),
    ]);

    const revenue = (current || []).reduce((s, o) => s + (o.item_price || 0), 0);
    const prevRevenue = (prev || []).reduce((s, o) => s + (o.item_price || 0), 0);
    const orders = current?.length || 0;
    const totalFees = (current || []).reduce((s, o) => s + Math.abs(o.amazon_fees || 0) + Math.abs(o.fba_fees || 0), 0);

    return {
      revenue: { value: revenue, change: prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0 },
      orders: {
        value: orders,
        change: (prev?.length || 0) > 0 ? ((orders - (prev?.length || 0)) / (prev?.length || 0)) * 100 : 0,
      },
      fees: { value: totalFees },
    };
  },
  ['amazon-kpis'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);

export const getAmazonPnl = unstable_cache(
  async () => {
    const supabase = await createServiceClient();
    const { data } = await supabase.from('amazon_pnl').select('*').order('revenue', { ascending: false });
    return data || [];
  },
  ['amazon-pnl'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);

export const getAmazonInventory = unstable_cache(
  async () => {
    const supabase = await createServiceClient();
    const { data } = await supabase.from('amazon_inventory').select('*').order('asin');
    return data || [];
  },
  ['amazon-inventory'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);
