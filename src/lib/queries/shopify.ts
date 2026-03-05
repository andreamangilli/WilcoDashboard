import { unstable_cache } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/server';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { getDateRange } from './utils';

export const getShopifyStoreKpis = unstable_cache(
  async (storeId: string, period: string, from?: string, to?: string) => {
    const supabase = await createServiceClient();
    const { start, end, prevStart, prevEnd } = getDateRange(period, from, to);

    const [current, prev] = await Promise.all([
      fetchAll<{ total: number; subtotal: number; customer_email: string | null }>(({ from: f, to: t }) =>
        supabase.from('shopify_orders').select('total, subtotal, customer_email').eq('store_id', storeId).gte('created_at', start).lte('created_at', end).eq('financial_status', 'paid').range(f, t)
      ),
      fetchAll<{ total: number }>(({ from: f, to: t }) =>
        supabase.from('shopify_orders').select('total').eq('store_id', storeId).gte('created_at', prevStart).lte('created_at', prevEnd).eq('financial_status', 'paid').range(f, t)
      ),
    ]);

    const revenue = current.reduce((s, o) => s + (o.total || 0), 0);
    const prevRevenue = prev.reduce((s, o) => s + (o.total || 0), 0);
    const orders = current.length;
    const prevOrders = prev.length;

    return {
      revenue: { value: revenue, change: prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0 },
      orders: { value: orders, change: prevOrders > 0 ? ((orders - prevOrders) / prevOrders) * 100 : 0 },
      aov: { value: orders > 0 ? revenue / orders : 0 },
    };
  },
  ['shopify-store-kpis-v4'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);

export const getShopifyAllStoresKpis = unstable_cache(
  async (period: string, from?: string, to?: string) => {
    const supabase = await createServiceClient();
    const { data: stores } = await supabase.from('stores').select('id, name, slug');

    return Promise.all(
      (stores || []).map(async (store) => {
        const kpis = await getShopifyStoreKpis(store.id, period, from, to);
        return { ...store, ...kpis };
      })
    );
  },
  ['shopify-all-stores-kpis-v4'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);

export const getShopifyProducts = unstable_cache(
  async (storeId: string) => {
    const supabase = await createServiceClient();
    const { data } = await supabase.from('shopify_products').select('*').eq('store_id', storeId).order('title');
    return data || [];
  },
  ['shopify-products-v4'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);

export const getShopifyCustomers = unstable_cache(
  async (storeId: string) => {
    const supabase = await createServiceClient();
    const { data } = await supabase.from('shopify_customers').select('*').eq('store_id', storeId).order('total_spent', { ascending: false });
    return data || [];
  },
  ['shopify-customers-v4'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);

export const getStoreBySlug = unstable_cache(
  async (slug: string) => {
    const supabase = await createServiceClient();
    const { data } = await supabase.from('stores').select('*').eq('slug', slug).single();
    return data;
  },
  ['store-by-slug-v4'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);
