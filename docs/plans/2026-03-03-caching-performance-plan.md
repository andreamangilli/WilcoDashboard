# Caching & Performance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce dashboard load times via `unstable_cache` (30 min TTL) on all query functions, replace the expensive `getTopProducts` JS aggregation with a Supabase SQL RPC, and add `loading.tsx` skeleton loaders for instant perceived performance.

**Architecture:** `unstable_cache` wraps all exported query functions using `createServiceClient` (service role, no cookies) with `revalidate: 1800`. Pages keep `export const dynamic = 'force-dynamic'` so `searchParams` always work. A `loading.tsx` per route segment provides React Suspense skeleton UI during navigations.

**Tech Stack:** Next.js `unstable_cache` (`next/cache`), `createServiceClient` from `@/lib/supabase/server`, Supabase SQL RPC, Tailwind `animate-pulse`

---

### Task 1: Create `get_top_products` SQL migration

**Files:**
- Create: `supabase/migrations/003_get_top_products_rpc.sql`

**Step 1: Create the file**

```sql
-- supabase/migrations/003_get_top_products_rpc.sql
CREATE OR REPLACE FUNCTION get_top_products(
  p_start timestamptz,
  p_end   timestamptz,
  p_limit int DEFAULT 5
)
RETURNS TABLE(title text, units bigint, revenue numeric, store_name text)
LANGUAGE sql STABLE AS $$
  SELECT
    li->>'title'                                              AS title,
    SUM((li->>'quantity')::int)                              AS units,
    SUM((li->>'quantity')::int * (li->>'price')::numeric)    AS revenue,
    s.name                                                    AS store_name
  FROM shopify_orders o
  JOIN stores s ON s.id = o.store_id
  CROSS JOIN LATERAL jsonb_array_elements(o.line_items) AS li
  WHERE o.created_at BETWEEN p_start AND p_end
    AND o.financial_status = 'paid'
    AND li->>'title' IS NOT NULL
    AND li->>'price' ~ '^[0-9]+(\.[0-9]+)?$'
  GROUP BY li->>'title', s.name
  ORDER BY revenue DESC
  LIMIT p_limit;
$$;
```

**Step 2: Apply to Supabase**

Option A (simpler): Open Supabase Dashboard → SQL Editor → paste the SQL above → Run.
Option B (CLI): `npx supabase db push` (requires `supabase link` to be set up).

**Step 3: Verify the function works**

In Supabase SQL Editor run:
```sql
SELECT * FROM get_top_products(now() - interval '30 days', now(), 5);
```
Expected: table with `title, units, revenue, store_name` columns (rows or empty, no error).

**Step 4: Commit**

```bash
git add supabase/migrations/003_get_top_products_rpc.sql
git commit -m "feat: add get_top_products SQL RPC to avoid JS line_items aggregation"
```

---

### Task 2: Refactor and cache `overview.ts`

**Files:**
- Modify: `src/lib/queries/overview.ts`

**Step 1: Replace the entire file with this content**

Key changes vs current:
- `createClient()` → `createServiceClient()` (service role, no cookies)
- 6 sequential Supabase awaits in `getOverviewKpis` → single `Promise.all`
- `getRevenueByChannel` sequential store loop → `Promise.all`
- `getTopProducts` JS line_items aggregation → `supabase.rpc('get_top_products', ...)`
- All 4 exported functions wrapped with `unstable_cache(fn, [key], { revalidate: 1800, tags: ['dashboard-data'] })`

```typescript
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

    const [{ data: shopifyTop }, { data: amazonOrders }] = await Promise.all([
      supabase.rpc('get_top_products', { p_start: start, p_end: end, p_limit: 10 }),
      supabase.from('amazon_orders').select('asin, sku, quantity, item_price').gte('purchase_date', start).lte('purchase_date', end),
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
```

**Step 2: Build check**

```bash
npm run build
```
Expected: no TypeScript errors. If type error on `supabase.rpc(...)` return type, add `as any` temporarily.

**Step 3: Commit**

```bash
git add src/lib/queries/overview.ts
git commit -m "perf: cache overview queries + parallel fetches + getTopProducts via RPC"
```

---

### Task 3: Refactor and cache `shopify.ts`

**Files:**
- Modify: `src/lib/queries/shopify.ts`

**Step 1: Replace entire file**

```typescript
import { unstable_cache } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/server';
import { getDateRange } from './utils';

export const getShopifyStoreKpis = unstable_cache(
  async (storeId: string, period: string, from?: string, to?: string) => {
    const supabase = await createServiceClient();
    const { start, end, prevStart, prevEnd } = getDateRange(period, from, to);

    const [{ data: current }, { data: prev }] = await Promise.all([
      supabase.from('shopify_orders').select('total, subtotal, customer_email').eq('store_id', storeId).gte('created_at', start).lte('created_at', end).eq('financial_status', 'paid'),
      supabase.from('shopify_orders').select('total').eq('store_id', storeId).gte('created_at', prevStart).lte('created_at', prevEnd).eq('financial_status', 'paid'),
    ]);

    const revenue = (current || []).reduce((s, o) => s + (o.total || 0), 0);
    const prevRevenue = (prev || []).reduce((s, o) => s + (o.total || 0), 0);
    const orders = current?.length || 0;
    const prevOrders = prev?.length || 0;

    return {
      revenue: { value: revenue, change: prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0 },
      orders: { value: orders, change: prevOrders > 0 ? ((orders - prevOrders) / prevOrders) * 100 : 0 },
      aov: { value: orders > 0 ? revenue / orders : 0 },
    };
  },
  ['shopify-store-kpis'],
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
  ['shopify-all-stores-kpis'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);

export const getShopifyProducts = unstable_cache(
  async (storeId: string) => {
    const supabase = await createServiceClient();
    const { data } = await supabase.from('shopify_products').select('*').eq('store_id', storeId).order('title');
    return data || [];
  },
  ['shopify-products'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);

export const getShopifyCustomers = unstable_cache(
  async (storeId: string) => {
    const supabase = await createServiceClient();
    const { data } = await supabase.from('shopify_customers').select('*').eq('store_id', storeId).order('total_spent', { ascending: false });
    return data || [];
  },
  ['shopify-customers'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);

export const getStoreBySlug = unstable_cache(
  async (slug: string) => {
    const supabase = await createServiceClient();
    const { data } = await supabase.from('stores').select('*').eq('slug', slug).single();
    return data;
  },
  ['store-by-slug'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);
```

**Step 2: Build check**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add src/lib/queries/shopify.ts
git commit -m "perf: cache shopify queries + parallel fetches"
```

---

### Task 4: Refactor and cache `amazon.ts`

**Files:**
- Modify: `src/lib/queries/amazon.ts`

**Step 1: Replace entire file**

```typescript
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
```

**Step 2: Build check + commit**

```bash
npm run build && git add src/lib/queries/amazon.ts && git commit -m "perf: cache amazon queries"
```

---

### Task 5: Refactor and cache `ads.ts`

**Files:**
- Modify: `src/lib/queries/ads.ts`

**Step 1: Replace entire file**

```typescript
import { unstable_cache } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/server';
import { getDateRange } from './utils';

export type CampaignWithMetrics = {
  id: string;
  campaign_id: string;
  campaign_name: string;
  status: string;
  daily_budget: number | null;
  spend: number;
  revenue: number;
  roas: number;
  cpc: number;
  conversions: number;
  clicks: number;
};

export const getAdsOverview = unstable_cache(
  async (period: string, from?: string, to?: string) => {
    const supabase = await createServiceClient();
    const { start, end } = getDateRange(period, from, to);
    const startDate = start.split('T')[0];
    const endDate = end.split('T')[0];

    const [{ data: googleAccounts }, { data: metaAccounts }] = await Promise.all([
      supabase.from('ad_accounts').select('id').eq('platform', 'google'),
      supabase.from('ad_accounts').select('id').eq('platform', 'meta'),
    ]);

    const googleIds = (googleAccounts || []).map((a) => a.id);
    const metaIds = (metaAccounts || []).map((a) => a.id);

    const [{ data: googleSpend }, { data: metaSpend }] = await Promise.all([
      supabase.from('ad_spend_daily').select('spend, impressions, clicks, conversions, revenue').in('ad_account_id', googleIds).gte('date', startDate).lte('date', endDate),
      supabase.from('ad_spend_daily').select('spend, impressions, clicks, conversions, revenue').in('ad_account_id', metaIds).gte('date', startDate).lte('date', endDate),
    ]);

    function aggregate(rows: typeof googleSpend) {
      return (rows || []).reduce(
        (acc, r) => ({
          spend: acc.spend + (r.spend || 0),
          impressions: acc.impressions + (r.impressions || 0),
          clicks: acc.clicks + (r.clicks || 0),
          conversions: acc.conversions + (r.conversions || 0),
          revenue: acc.revenue + (r.revenue || 0),
        }),
        { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 }
      );
    }

    const google = aggregate(googleSpend);
    const meta = aggregate(metaSpend);

    return {
      google: { ...google, roas: google.spend > 0 ? google.revenue / google.spend : 0 },
      meta: { ...meta, roas: meta.spend > 0 ? meta.revenue / meta.spend : 0 },
      total: {
        spend: google.spend + meta.spend,
        revenue: google.revenue + meta.revenue,
        roas: google.spend + meta.spend > 0 ? (google.revenue + meta.revenue) / (google.spend + meta.spend) : 0,
      },
    };
  },
  ['ads-overview'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);

export const getAdsCampaignsWithMetrics = unstable_cache(
  async (platform: 'google' | 'meta', period: string, from?: string, to?: string): Promise<CampaignWithMetrics[]> => {
    const supabase = await createServiceClient();
    const { start, end } = getDateRange(period, from, to);
    const startDate = start.split('T')[0];
    const endDate = end.split('T')[0];

    const { data: accounts } = await supabase.from('ad_accounts').select('id').eq('platform', platform);
    const accountIds = (accounts || []).map((a) => a.id);

    const [{ data: campaigns }, { data: spendData }] = await Promise.all([
      supabase.from('ad_campaigns').select('*').in('ad_account_id', accountIds).order('campaign_name'),
      supabase.from('ad_spend_daily').select('campaign_id, spend, revenue, clicks, conversions').in('ad_account_id', accountIds).gte('date', startDate).lte('date', endDate),
    ]);

    const spendByCampaign = new Map<string, { spend: number; revenue: number; clicks: number; conversions: number }>();
    for (const row of spendData || []) {
      const existing = spendByCampaign.get(row.campaign_id) ?? { spend: 0, revenue: 0, clicks: 0, conversions: 0 };
      existing.spend += row.spend || 0;
      existing.revenue += row.revenue || 0;
      existing.clicks += row.clicks || 0;
      existing.conversions += row.conversions || 0;
      spendByCampaign.set(row.campaign_id, existing);
    }

    return (campaigns || []).map((c) => {
      const metrics = spendByCampaign.get(c.campaign_id) ?? { spend: 0, revenue: 0, clicks: 0, conversions: 0 };
      return {
        id: c.id,
        campaign_id: c.campaign_id,
        campaign_name: c.campaign_name,
        status: c.status,
        daily_budget: c.daily_budget,
        spend: metrics.spend,
        revenue: metrics.revenue,
        roas: metrics.spend > 0 ? metrics.revenue / metrics.spend : 0,
        cpc: metrics.clicks > 0 ? metrics.spend / metrics.clicks : 0,
        conversions: metrics.conversions,
        clicks: metrics.clicks,
      };
    });
  },
  ['ads-campaigns-with-metrics'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);

export const getAdsDailySpend = unstable_cache(
  async (platform: 'google' | 'meta', period: string, from?: string, to?: string) => {
    const supabase = await createServiceClient();
    const { start, end } = getDateRange(period, from, to);

    const { data: accounts } = await supabase.from('ad_accounts').select('id').eq('platform', platform);
    const accountIds = (accounts || []).map((a) => a.id);

    const { data } = await supabase
      .from('ad_spend_daily')
      .select('date, spend, impressions, clicks, conversions, revenue')
      .in('ad_account_id', accountIds)
      .gte('date', start.split('T')[0])
      .lte('date', end.split('T')[0])
      .order('date');

    const byDate: Record<string, { date: string; spend: number; impressions: number; clicks: number; conversions: number; revenue: number }> = {};
    for (const row of data || []) {
      if (!byDate[row.date]) {
        byDate[row.date] = { date: row.date, spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 };
      }
      byDate[row.date].spend += row.spend || 0;
      byDate[row.date].impressions += row.impressions || 0;
      byDate[row.date].clicks += row.clicks || 0;
      byDate[row.date].conversions += row.conversions || 0;
      byDate[row.date].revenue += row.revenue || 0;
    }

    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  },
  ['ads-daily-spend'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);
```

**Step 2: Build check + commit**

```bash
npm run build && git add src/lib/queries/ads.ts && git commit -m "perf: cache ads queries + parallel account fetches"
```

---

### Task 6: Refactor and cache `products.ts`

**Files:**
- Modify: `src/lib/queries/products.ts`

**Step 1: Replace the two async query functions at the bottom of the file (lines 116–199)**

Keep the helper functions `aggregateLineItems`, `aggregateAmazonProducts`, and all type definitions unchanged (lines 1–114). Only replace the two exported async functions:

```typescript
// Replace from line 116 to end of file:

import { unstable_cache } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/server';
```

Add this import at the top of the file alongside existing imports, then replace the two functions:

```typescript
export const getShopifyProductPerf = unstable_cache(
  async (period: string, from?: string, to?: string) => {
    const supabase = await createServiceClient();
    const { start, end } = getDateRange(period, from, to);

    const { data: stores, error: storesError } = await supabase.from('stores').select('id, name');
    if (storesError) throw new Error(`Failed to load stores: ${storesError.message}`);

    const perStoreResults = await Promise.all(
      (stores || []).map(async (store) => {
        const [{ data: orders, error: ordersError }, { data: products }] = await Promise.all([
          supabase.from('shopify_orders').select('line_items, total').eq('store_id', store.id).eq('financial_status', 'paid').gte('created_at', start).lte('created_at', end),
          supabase.from('shopify_products').select('title, sku, inventory_qty').eq('store_id', store.id),
        ]);

        if (ordersError) throw new Error(`Failed to load orders for store ${store.id}: ${ordersError.message}`);

        const aggregated = aggregateLineItems(orders || [], store.name);

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
  ['shopify-product-perf'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);

export const getAmazonProductPerf = unstable_cache(
  async (period: string, from?: string, to?: string) => {
    const supabase = await createServiceClient();
    const { start, end } = getDateRange(period, from, to);

    const [{ data: orders, error: ordersError }, { data: inventory }] = await Promise.all([
      supabase.from('amazon_orders').select('asin, sku, quantity, item_price, amazon_fees, fba_fees').gte('purchase_date', start).lte('purchase_date', end),
      supabase.from('amazon_inventory').select('asin, qty_available').eq('fulfillment', 'fba'),
    ]);

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

    const invMap = new Map((inventory || []).map((i) => [i.asin, i.qty_available]));

    return results.map((row) => ({ ...row, qtyAvailable: invMap.get(row.asin) ?? null }));
  },
  ['amazon-product-perf'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);
```

Note: The full file structure is: existing imports → type definitions → helper functions → add `import { unstable_cache } from 'next/cache'` and `import { createServiceClient }` alongside existing imports → replace last 2 async functions with the above.

**Step 2: Build check + commit**

```bash
npm run build && git add src/lib/queries/products.ts && git commit -m "perf: cache product queries + parallel fetches"
```

---

### Task 7: Refactor and cache `orders.ts`

**Files:**
- Modify: `src/lib/queries/orders.ts`

**Step 1: Change the import and client inside `getUnifiedOrders`**

At top of file, add `unstable_cache` import and change `createClient` to `createServiceClient`:

```typescript
// Replace:
import { createClient } from "@/lib/supabase/server";
// With:
import { unstable_cache } from 'next/cache';
import { createServiceClient } from "@/lib/supabase/server";
```

**Step 2: Wrap `getUnifiedOrders` with `unstable_cache`**

The function signature stays the same. Wrap the entire body:

```typescript
export const getUnifiedOrders = unstable_cache(
  async (
    period: string,
    from?: string,
    to?: string,
    channel: 'all' | 'shopify' | 'amazon' = 'all',
    status = 'all',
    page = 1
  ) => {
    const supabase = await createServiceClient();  // ← changed from createClient()
    // ... rest of function body unchanged, just using `supabase` already defined above
  },
  ['unified-orders'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);
```

Keep all helper types (`ShopifyOrderRow`, `AmazonOrderRow`, `UnifiedOrder`) and `mergeAndSortOrders` unchanged.

**Step 3: Build check + commit**

```bash
npm run build && git add src/lib/queries/orders.ts && git commit -m "perf: cache orders query"
```

---

### Task 8: Skeleton loader — dashboard

**Files:**
- Create: `src/app/(dashboard)/loading.tsx`

**Step 1: Create the file**

```tsx
export default function DashboardLoading() {
  return (
    <div>
      {/* PageHeader skeleton */}
      <div className="mb-8 flex items-center justify-between border-b border-gray-200 pb-5">
        <div>
          <div className="h-6 w-32 animate-pulse rounded-md bg-gray-200" />
          <div className="mt-1 h-4 w-48 animate-pulse rounded-md bg-gray-100" />
        </div>
        <div className="h-9 w-64 animate-pulse rounded-lg bg-gray-100" />
      </div>

      {/* KPI cards skeleton */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 border-l-4 border-l-gray-200">
            <div className="h-3 w-24 animate-pulse rounded bg-gray-200" />
            <div className="mt-3 h-7 w-20 animate-pulse rounded bg-gray-200" />
            <div className="mt-2 h-3 w-16 animate-pulse rounded bg-gray-100" />
          </div>
        ))}
      </div>

      {/* Chart + signals skeleton */}
      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-4 h-5 w-40 animate-pulse rounded bg-gray-200" />
          <div className="h-52 animate-pulse rounded-lg bg-gray-100" />
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-4 h-5 w-36 animate-pulse rounded bg-gray-200" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-4 animate-pulse rounded bg-gray-100" />
            ))}
          </div>
        </div>
      </div>

      {/* Top products skeleton */}
      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-6">
        <div className="mb-4 h-5 w-28 animate-pulse rounded bg-gray-200" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex justify-between">
              <div className="h-4 w-48 animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-20 animate-pulse rounded bg-gray-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verify visually**

Run `npm run dev`, navigate to `/` and observe the skeleton while data loads on first visit.

**Step 3: Commit**

```bash
git add src/app/\(dashboard\)/loading.tsx
git commit -m "feat: add dashboard skeleton loader"
```

---

### Task 9: Skeleton loaders — all other routes

**Files:**
- Create: `src/app/(dashboard)/ordini/loading.tsx`
- Create: `src/app/(dashboard)/prodotti/loading.tsx`
- Create: `src/app/(dashboard)/shopify/loading.tsx`
- Create: `src/app/(dashboard)/amazon/loading.tsx`
- Create: `src/app/(dashboard)/ads/loading.tsx`
- Create: `src/app/(dashboard)/ads/google/loading.tsx`
- Create: `src/app/(dashboard)/ads/meta/loading.tsx`

**Pattern — table page skeleton (use for ordini, prodotti, ads/google, ads/meta):**

```tsx
// ordini/loading.tsx
export default function OrdiniLoading() {
  return (
    <div>
      <div className="mb-8 flex items-center justify-between border-b border-gray-200 pb-5">
        <div className="h-6 w-24 animate-pulse rounded-md bg-gray-200" />
        <div className="h-9 w-64 animate-pulse rounded-lg bg-gray-100" />
      </div>
      <div className="mb-5 h-9 w-72 animate-pulse rounded-lg bg-gray-100" />
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 flex gap-8">
          {['Data', 'N° Ordine', 'Canale', 'Cliente', 'Prodotti', 'Totale', 'Stato'].map((h) => (
            <div key={h} className="h-3 w-16 animate-pulse rounded bg-gray-200" />
          ))}
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex gap-8 px-4 py-3 border-t border-gray-100">
            {Array.from({ length: 7 }).map((_, j) => (
              <div key={j} className="h-4 w-16 animate-pulse rounded bg-gray-100" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

Create similar files for the remaining routes adjusting titles and row counts. Key differences:
- `prodotti/loading.tsx` — add 2 tab buttons above the table
- `shopify/loading.tsx` — 3 card placeholders (one per store) instead of table
- `amazon/loading.tsx` — 3 KPI cards only
- `ads/loading.tsx` — 3 KPI cards + 2 platform cards side by side
- `ads/google/loading.tsx` and `ads/meta/loading.tsx` — 5 KPI cards + chart placeholder + table

**Step 2: Build check**

```bash
npm run build
```

**Step 3: Commit all skeletons**

```bash
git add src/app/\(dashboard\)/ordini/loading.tsx \
        src/app/\(dashboard\)/prodotti/loading.tsx \
        src/app/\(dashboard\)/shopify/loading.tsx \
        src/app/\(dashboard\)/amazon/loading.tsx \
        src/app/\(dashboard\)/ads/loading.tsx \
        "src/app/(dashboard)/ads/google/loading.tsx" \
        "src/app/(dashboard)/ads/meta/loading.tsx"
git commit -m "feat: add skeleton loaders for all dashboard routes"
```

---

### Task 10: Final build + push

**Step 1: Full build**

```bash
npm run build
```
Expected: clean build, all routes `ƒ (Dynamic)`.

**Step 2: Push to production**

```bash
git push origin main
```

**Step 3: Smoke test in production**

1. Open the dashboard — should show skeleton for ~1s on first load, then data
2. Navigate between periods (30g, 7g, oggi) — data should change correctly
3. Navigate back to a previously visited period — should load instantly (cache hit)
4. Check `/ordini`, `/prodotti`, `/shopify`, `/amazon`, `/ads` pages — all should show skeletons then data
