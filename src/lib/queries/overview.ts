import { unstable_cache } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/server';
import { getDateRange } from './utils';

export const getOverviewKpis = unstable_cache(
  async (period: string, from?: string, to?: string) => {
    const supabase = await createServiceClient();
    const { start, end, prevStart, prevEnd } = getDateRange(period, from, to);

    const [
      { data: currentShopify },
      { data: prevShopify },
      { data: currentAmazon },
      { data: prevAmazon },
      { data: currentAds },
      { data: prevAds },
    ] = await Promise.all([
      supabase.from('shopify_orders').select('total').gte('created_at', start).lte('created_at', end).eq('financial_status', 'paid'),
      supabase.from('shopify_orders').select('total').gte('created_at', prevStart).lte('created_at', prevEnd).eq('financial_status', 'paid'),
      supabase.from('amazon_orders').select('item_price, quantity').gte('purchase_date', start).lte('purchase_date', end),
      supabase.from('amazon_orders').select('item_price').gte('purchase_date', prevStart).lte('purchase_date', prevEnd),
      supabase.from('ad_spend_daily').select('spend').gte('date', start.split('T')[0]).lte('date', end.split('T')[0]),
      supabase.from('ad_spend_daily').select('spend').gte('date', prevStart.split('T')[0]).lte('date', prevEnd.split('T')[0]),
    ]);

    const shopifyRevenue = (currentShopify || []).reduce((s, o) => s + (o.total || 0), 0);
    const prevShopifyRevenue = (prevShopify || []).reduce((s, o) => s + (o.total || 0), 0);
    const amazonRevenue = (currentAmazon || []).reduce((s, o) => s + (o.item_price || 0), 0);
    const prevAmazonRevenue = (prevAmazon || []).reduce((s, o) => s + (o.item_price || 0), 0);

    const totalRevenue = shopifyRevenue + amazonRevenue;
    const prevTotalRevenue = prevShopifyRevenue + prevAmazonRevenue;

    const totalOrders = (currentShopify?.length || 0) + (currentAmazon?.length || 0);
    const prevTotalOrders = (prevShopify?.length || 0) + (prevAmazon?.length || 0);

    const adSpend = (currentAds || []).reduce((s, a) => s + (a.spend || 0), 0);
    const prevAdSpend = (prevAds || []).reduce((s, a) => s + (a.spend || 0), 0);

    return {
      revenue: {
        value: totalRevenue,
        change: prevTotalRevenue > 0 ? ((totalRevenue - prevTotalRevenue) / prevTotalRevenue) * 100 : 0,
      },
      orders: {
        value: totalOrders,
        change: prevTotalOrders > 0 ? ((totalOrders - prevTotalOrders) / prevTotalOrders) * 100 : 0,
      },
      adSpend: {
        value: adSpend,
        change: prevAdSpend > 0 ? ((adSpend - prevAdSpend) / prevAdSpend) * 100 : 0,
      },
      shopifyRevenue,
      amazonRevenue,
    };
  },
  ['overview-kpis'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);

export const getRevenueByChannel = unstable_cache(
  async (period: string, from?: string, to?: string) => {
    const supabase = await createServiceClient();
    const { start, end, prevStart, prevEnd } = getDateRange(period, from, to);

    const { data: stores } = await supabase.from('stores').select('id, name, slug');

    const storeChannels = await Promise.all(
      (stores || []).map(async (store) => {
        const [{ data: orders }, { data: prevOrders }] = await Promise.all([
          supabase.from('shopify_orders').select('total').eq('store_id', store.id).gte('created_at', start).lte('created_at', end).eq('financial_status', 'paid'),
          supabase.from('shopify_orders').select('total').eq('store_id', store.id).gte('created_at', prevStart).lte('created_at', prevEnd).eq('financial_status', 'paid'),
        ]);
        return {
          name: store.name,
          revenue: (orders || []).reduce((s, o) => s + (o.total || 0), 0),
          prevRevenue: (prevOrders || []).reduce((s, o) => s + (o.total || 0), 0),
        };
      })
    );

    const [{ data: amazonOrders }, { data: prevAmazonOrders }] = await Promise.all([
      supabase.from('amazon_orders').select('item_price').gte('purchase_date', start).lte('purchase_date', end),
      supabase.from('amazon_orders').select('item_price').gte('purchase_date', prevStart).lte('purchase_date', prevEnd),
    ]);

    return [
      ...storeChannels,
      {
        name: 'Amazon',
        revenue: (amazonOrders || []).reduce((s, o) => s + (o.item_price || 0), 0),
        prevRevenue: (prevAmazonOrders || []).reduce((s, o) => s + (o.item_price || 0), 0),
      },
    ];
  },
  ['revenue-by-channel'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);

export const getTopProducts = unstable_cache(
  async (period: string, from?: string, to?: string) => {
    const supabase = await createServiceClient();
    const { start, end } = getDateRange(period, from, to);

    // RPC fetches top 10 Shopify products (not 5) so that after merging with
    // Amazon the combined top-5 by revenue is accurate across both channels.
    const [{ data: shopifyTop }, { data: amazonOrders }] = await Promise.all([
      supabase.rpc('get_top_products', { p_start: start, p_end: end, p_limit: 10 }),
      supabase.from('amazon_orders').select('asin, sku, quantity, item_price').gte('purchase_date', start).lte('purchase_date', end).limit(500),
    ]);

    const shopifyResults = (shopifyTop || []).map((r: { title: string; units: unknown; revenue: unknown; store_name: string }) => ({
      title: r.title,
      channel: r.store_name,
      units: Number(r.units),
      revenue: Number(r.revenue),
    }));

    const amazonMap = new Map<string, { title: string; channel: string; units: number; revenue: number }>();
    for (const o of amazonOrders || []) {
      const existing = amazonMap.get(o.asin) ?? { title: o.sku || o.asin, channel: 'Amazon', units: 0, revenue: 0 };
      existing.units += o.quantity || 1;
      existing.revenue += o.item_price || 0;
      amazonMap.set(o.asin, existing);
    }

    return [...shopifyResults, ...amazonMap.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  },
  ['top-products'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);

export const getOperationalSignals = unstable_cache(
  async () => {
    const supabase = await createServiceClient();

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const dateStr = sevenDaysAgo.toISOString().split('T')[0];

    const [
      { data: lowStockShopify },
      { data: lowStockAmazon },
      { data: campaigns },
      { data: recentSpend },
    ] = await Promise.all([
      supabase.from('shopify_products').select('title, inventory_qty').lt('inventory_qty', 5).eq('status', 'active'),
      supabase.from('amazon_inventory').select('sku, qty_available').lt('qty_available', 5).eq('fulfillment', 'fba'),
      supabase.from('ad_campaigns').select('campaign_name, campaign_id'),
      supabase.from('ad_spend_daily').select('campaign_id, spend, revenue').gte('date', dateStr),
    ]);

    const spendMap = new Map<string, { spend: number; revenue: number }>();
    for (const r of recentSpend || []) {
      const e = spendMap.get(r.campaign_id) ?? { spend: 0, revenue: 0 };
      e.spend += r.spend || 0;
      e.revenue += r.revenue || 0;
      spendMap.set(r.campaign_id, e);
    }

    const lowRoasCampaigns = (campaigns || []).filter((c) => {
      const metrics = spendMap.get(c.campaign_id);
      if (!metrics || metrics.spend === 0) return false;
      return metrics.revenue / metrics.spend < 2;
    });

    return {
      lowStockSkus: [
        ...(lowStockShopify || []).map((p) => ({ name: p.title, qty: p.inventory_qty as number, channel: 'Shopify' })),
        ...(lowStockAmazon || []).map((p) => ({ name: p.sku as string, qty: p.qty_available as number, channel: 'Amazon FBA' })),
      ],
      lowRoasCampaigns: lowRoasCampaigns.map((c) => ({ name: c.campaign_name })),
    };
  },
  ['operational-signals'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);
