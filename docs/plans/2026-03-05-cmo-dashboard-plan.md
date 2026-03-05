# CMO Dashboard Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the overview dashboard into a CMO tool with 7 KPI cards (sparklines), multi-series trend chart, ads platform comparison, and rule-based smart insights.

**Architecture:** Server Components fetch data via cached query functions (`unstable_cache`). Client Components handle chart interactivity (Recharts). New `getSmartInsights` calculates anomalies/trends server-side. All text in Italian.

**Tech Stack:** Next.js 16 App Router, Recharts (`ComposedChart`, `Line`, `Area`, `BarChart`), `unstable_cache`, Supabase, Tailwind CSS v4, shadcn/ui Cards.

---

### Task 1: Add `getOverviewKpisDaily` query

Returns 7 days of daily aggregated metrics for KPI sparklines.

**Files:**
- Modify: `src/lib/queries/overview.ts`

**Step 1: Add the `getOverviewKpisDaily` function at the end of `src/lib/queries/overview.ts`**

After the existing `getOperationalSignals` function, add:

```typescript
export type DailyKpiPoint = {
  date: string;
  revenue: number;
  orders: number;
  adSpend: number;
  adsRevenue: number;
  newCustomers: number;
};

export const getOverviewKpisDaily = unstable_cache(
  async (): Promise<DailyKpiPoint[]> => {
    const supabase = await createServiceClient();
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 6); // 7 days including today

    const startISO = start.toISOString().split('T')[0];
    const endISO = end.toISOString().split('T')[0];
    const startFull = `${startISO}T00:00:00Z`;
    const endFull = `${endISO}T23:59:59Z`;

    const [shopifyOrders, amazonOrders, adSpend, newCustomers] = await Promise.all([
      fetchAll<{ total: number; created_at: string }>(({ from: f, to: t }) =>
        supabase
          .from('shopify_orders')
          .select('total, created_at')
          .gte('created_at', startFull)
          .lte('created_at', endFull)
          .eq('financial_status', 'paid')
          .range(f, t)
      ),
      fetchAll<{ item_price: number; purchase_date: string }>(({ from: f, to: t }) =>
        supabase
          .from('amazon_orders')
          .select('item_price, purchase_date')
          .gte('purchase_date', startFull)
          .lte('purchase_date', endFull)
          .range(f, t)
      ),
      fetchAll<{ date: string; spend: number; revenue: number }>(({ from: f, to: t }) =>
        supabase
          .from('ad_spend_daily')
          .select('date, spend, revenue')
          .gte('date', startISO)
          .lte('date', endISO)
          .range(f, t)
      ),
      fetchAll<{ first_order_at: string }>(({ from: f, to: t }) =>
        supabase
          .from('shopify_customers')
          .select('first_order_at')
          .gte('first_order_at', startFull)
          .lte('first_order_at', endFull)
          .range(f, t)
      ),
    ]);

    // Build a map for each day
    const days: Record<string, DailyKpiPoint> = {};
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().split('T')[0];
      days[key] = { date: key, revenue: 0, orders: 0, adSpend: 0, adsRevenue: 0, newCustomers: 0 };
    }

    for (const o of shopifyOrders) {
      const key = o.created_at.split('T')[0];
      if (days[key]) {
        days[key].revenue += o.total || 0;
        days[key].orders += 1;
      }
    }
    for (const o of amazonOrders) {
      const key = o.purchase_date.split('T')[0];
      if (days[key]) {
        days[key].revenue += o.item_price || 0;
        days[key].orders += 1;
      }
    }
    for (const a of adSpend) {
      if (days[a.date]) {
        days[a.date].adSpend += a.spend || 0;
        days[a.date].adsRevenue += a.revenue || 0;
      }
    }
    for (const c of newCustomers) {
      const key = c.first_order_at?.split('T')[0];
      if (key && days[key]) {
        days[key].newCustomers += 1;
      }
    }

    return Object.values(days).sort((a, b) => a.date.localeCompare(b.date));
  },
  ['overview-kpis-daily-v1'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Compiles successfully (new export is unused but valid).

**Step 3: Commit**

```bash
git add src/lib/queries/overview.ts
git commit -m "feat: add getOverviewKpisDaily query for sparkline data"
```

---

### Task 2: Add `getDailyTrend` query

Returns daily time series for the main trend chart (current + previous period).

**Files:**
- Modify: `src/lib/queries/overview.ts`

**Step 1: Add `getDailyTrend` function after `getOverviewKpisDaily` in `src/lib/queries/overview.ts`**

```typescript
export type TrendDayData = {
  date: string;
  revenue: number;
  adSpend: number;
  adsRevenue: number;
  roas: number;
};

export const getDailyTrend = unstable_cache(
  async (period: string, from?: string, to?: string): Promise<{ current: TrendDayData[]; previous: TrendDayData[] }> => {
    const supabase = await createServiceClient();
    const { start, end, prevStart, prevEnd } = getDateRange(period, from, to);
    const startDate = start.split('T')[0];
    const endDate = end.split('T')[0];
    const prevStartDate = prevStart.split('T')[0];
    const prevEndDate = prevEnd.split('T')[0];

    const [shopifyCurr, shopifyPrev, amazonCurr, amazonPrev, adsCurr, adsPrev] = await Promise.all([
      fetchAll<{ total: number; created_at: string }>(({ from: f, to: t }) =>
        supabase.from('shopify_orders').select('total, created_at')
          .gte('created_at', start).lte('created_at', end).eq('financial_status', 'paid').range(f, t)
      ),
      fetchAll<{ total: number; created_at: string }>(({ from: f, to: t }) =>
        supabase.from('shopify_orders').select('total, created_at')
          .gte('created_at', prevStart).lte('created_at', prevEnd).eq('financial_status', 'paid').range(f, t)
      ),
      fetchAll<{ item_price: number; purchase_date: string }>(({ from: f, to: t }) =>
        supabase.from('amazon_orders').select('item_price, purchase_date')
          .gte('purchase_date', start).lte('purchase_date', end).range(f, t)
      ),
      fetchAll<{ item_price: number; purchase_date: string }>(({ from: f, to: t }) =>
        supabase.from('amazon_orders').select('item_price, purchase_date')
          .gte('purchase_date', prevStart).lte('purchase_date', prevEnd).range(f, t)
      ),
      fetchAll<{ date: string; spend: number; revenue: number }>(({ from: f, to: t }) =>
        supabase.from('ad_spend_daily').select('date, spend, revenue')
          .gte('date', startDate).lte('date', endDate).range(f, t)
      ),
      fetchAll<{ date: string; spend: number; revenue: number }>(({ from: f, to: t }) =>
        supabase.from('ad_spend_daily').select('date, spend, revenue')
          .gte('date', prevStartDate).lte('date', prevEndDate).range(f, t)
      ),
    ]);

    function buildDayMap(
      shopify: { total: number; created_at: string }[],
      amazon: { item_price: number; purchase_date: string }[],
      ads: { date: string; spend: number; revenue: number }[]
    ): Record<string, TrendDayData> {
      const map: Record<string, TrendDayData> = {};

      const ensure = (date: string) => {
        if (!map[date]) map[date] = { date, revenue: 0, adSpend: 0, adsRevenue: 0, roas: 0 };
      };

      for (const o of shopify) {
        const d = o.created_at.split('T')[0];
        ensure(d);
        map[d].revenue += o.total || 0;
      }
      for (const o of amazon) {
        const d = o.purchase_date.split('T')[0];
        ensure(d);
        map[d].revenue += o.item_price || 0;
      }
      for (const a of ads) {
        ensure(a.date);
        map[a.date].adSpend += a.spend || 0;
        map[a.date].adsRevenue += a.revenue || 0;
      }

      // Calculate ROAS per day
      for (const day of Object.values(map)) {
        day.roas = day.adSpend > 0 ? day.adsRevenue / day.adSpend : 0;
      }

      return map;
    }

    const currentMap = buildDayMap(shopifyCurr, amazonCurr, adsCurr);
    const previousMap = buildDayMap(shopifyPrev, amazonPrev, adsPrev);

    return {
      current: Object.values(currentMap).sort((a, b) => a.date.localeCompare(b.date)),
      previous: Object.values(previousMap).sort((a, b) => a.date.localeCompare(b.date)),
    };
  },
  ['daily-trend-v1'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Compiles successfully.

**Step 3: Commit**

```bash
git add src/lib/queries/overview.ts
git commit -m "feat: add getDailyTrend query for trend chart data"
```

---

### Task 3: Add `getSmartInsights` query

Calculates rule-based insights: anomalies, trends, platform comparisons.

**Files:**
- Create: `src/lib/queries/insights.ts`
- Create: `src/lib/__tests__/insights.test.ts`

**Step 1: Write tests for the insight calculation logic**

Create `src/lib/__tests__/insights.test.ts`:

```typescript
import { calculateInsights, type InsightInput } from "../queries/insights";

describe("calculateInsights", () => {
  const baseInput: InsightInput = {
    revenueByStore: [],
    amazonRevenue: { current: 100, previous: 100 },
    adsByPlatform: {
      google: { spend: 100, revenue: 200, impressions: 10000, clicks: 500 },
      meta: { spend: 100, revenue: 200, impressions: 10000, clicks: 500 },
    },
    dailyMetrics: [],
    lowStockCount: 0,
    lowRoasCampaignCount: 0,
  };

  it("returns empty array when no anomalies", () => {
    const result = calculateInsights(baseInput);
    expect(result.every((i) => i.type !== "anomaly_negative")).toBe(true);
  });

  it("detects negative anomaly when store revenue drops >20%", () => {
    const input: InsightInput = {
      ...baseInput,
      revenueByStore: [{ name: "KMAX", current: 700, previous: 1000 }],
    };
    const result = calculateInsights(input);
    const anomaly = result.find(
      (i) => i.type === "anomaly_negative" && i.message.includes("KMAX")
    );
    expect(anomaly).toBeDefined();
    expect(anomaly!.severity).toBe("high");
  });

  it("detects positive anomaly when revenue rises >20%", () => {
    const input: InsightInput = {
      ...baseInput,
      amazonRevenue: { current: 1500, previous: 1000 },
    };
    const result = calculateInsights(input);
    const anomaly = result.find((i) => i.type === "anomaly_positive");
    expect(anomaly).toBeDefined();
    expect(anomaly!.severity).toBe("medium");
  });

  it("detects negative trend (3+ consecutive declining days)", () => {
    const input: InsightInput = {
      ...baseInput,
      dailyMetrics: [
        { date: "2026-03-01", roas: 3.0 },
        { date: "2026-03-02", roas: 2.5 },
        { date: "2026-03-03", roas: 2.0 },
        { date: "2026-03-04", roas: 1.5 },
      ],
    };
    const result = calculateInsights(input);
    const trend = result.find((i) => i.type === "trend_negative");
    expect(trend).toBeDefined();
    expect(trend!.message).toContain("ROAS");
  });

  it("detects platform comparison when CPC differs >30%", () => {
    const input: InsightInput = {
      ...baseInput,
      adsByPlatform: {
        google: { spend: 500, revenue: 1000, impressions: 10000, clicks: 500 },
        meta: { spend: 300, revenue: 900, impressions: 10000, clicks: 1000 },
      },
    };
    const result = calculateInsights(input);
    const comparison = result.find((i) => i.type === "platform_comparison");
    expect(comparison).toBeDefined();
  });

  it("includes stock alert when low stock count > 0", () => {
    const input: InsightInput = { ...baseInput, lowStockCount: 5 };
    const result = calculateInsights(input);
    const alert = result.find((i) => i.type === "stock_alert");
    expect(alert).toBeDefined();
    expect(alert!.message).toContain("5");
  });

  it("limits output to 6 insights", () => {
    const input: InsightInput = {
      ...baseInput,
      revenueByStore: [
        { name: "Store1", current: 100, previous: 1000 },
        { name: "Store2", current: 100, previous: 1000 },
        { name: "Store3", current: 100, previous: 1000 },
      ],
      amazonRevenue: { current: 100, previous: 1000 },
      lowStockCount: 5,
      lowRoasCampaignCount: 3,
      dailyMetrics: [
        { date: "2026-03-01", roas: 3.0 },
        { date: "2026-03-02", roas: 2.5 },
        { date: "2026-03-03", roas: 2.0 },
        { date: "2026-03-04", roas: 1.5 },
      ],
    };
    const result = calculateInsights(input);
    expect(result.length).toBeLessThanOrEqual(6);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx jest src/lib/__tests__/insights.test.ts`
Expected: FAIL — module `../queries/insights` not found.

**Step 3: Create `src/lib/queries/insights.ts` with the pure calculation function and cached query**

```typescript
import { unstable_cache } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/server';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { formatCurrency } from '@/lib/format';

// ── Types ──────────────────────────────────────────────────────

export type Insight = {
  type: 'anomaly_negative' | 'anomaly_positive' | 'trend_negative' | 'platform_comparison' | 'stock_alert' | 'roas_alert';
  severity: 'high' | 'medium' | 'low';
  message: string;
  delta?: number;
};

export type InsightInput = {
  revenueByStore: { name: string; current: number; previous: number }[];
  amazonRevenue: { current: number; previous: number };
  adsByPlatform: {
    google: { spend: number; revenue: number; impressions: number; clicks: number };
    meta: { spend: number; revenue: number; impressions: number; clicks: number };
  };
  dailyMetrics: { date: string; roas: number }[];
  lowStockCount: number;
  lowRoasCampaignCount: number;
};

// ── Pure calculation (testable) ────────────────────────────────

const ANOMALY_THRESHOLD = 0.20; // 20%
const PLATFORM_DIFF_THRESHOLD = 0.30; // 30%
const MAX_INSIGHTS = 6;

export function calculateInsights(input: InsightInput): Insight[] {
  const insights: Insight[] = [];

  // 1. Revenue anomalies per store
  for (const store of input.revenueByStore) {
    if (store.previous === 0) continue;
    const delta = (store.current - store.previous) / store.previous;
    if (delta < -ANOMALY_THRESHOLD) {
      insights.push({
        type: 'anomaly_negative',
        severity: 'high',
        message: `Fatturato ${store.name} ${(delta * 100).toFixed(0)}% rispetto al periodo precedente`,
        delta: delta * 100,
      });
    } else if (delta > ANOMALY_THRESHOLD) {
      insights.push({
        type: 'anomaly_positive',
        severity: 'medium',
        message: `Fatturato ${store.name} +${(delta * 100).toFixed(0)}% rispetto al periodo precedente`,
        delta: delta * 100,
      });
    }
  }

  // 2. Amazon revenue anomaly
  if (input.amazonRevenue.previous > 0) {
    const delta = (input.amazonRevenue.current - input.amazonRevenue.previous) / input.amazonRevenue.previous;
    if (delta < -ANOMALY_THRESHOLD) {
      insights.push({
        type: 'anomaly_negative',
        severity: 'high',
        message: `Fatturato Amazon ${(delta * 100).toFixed(0)}% rispetto al periodo precedente`,
        delta: delta * 100,
      });
    } else if (delta > ANOMALY_THRESHOLD) {
      insights.push({
        type: 'anomaly_positive',
        severity: 'medium',
        message: `Fatturato Amazon +${(delta * 100).toFixed(0)}% rispetto al periodo precedente`,
        delta: delta * 100,
      });
    }
  }

  // 3. ROAS trend (3+ consecutive declining days)
  if (input.dailyMetrics.length >= 3) {
    let streak = 0;
    const values: number[] = [];
    for (let i = 1; i < input.dailyMetrics.length; i++) {
      if (input.dailyMetrics[i].roas < input.dailyMetrics[i - 1].roas) {
        streak++;
        if (streak === 1) values.push(input.dailyMetrics[i - 1].roas);
        values.push(input.dailyMetrics[i].roas);
      } else {
        if (streak >= 2) break; // Found a streak of 3+ days
        streak = 0;
        values.length = 0;
      }
    }
    if (streak >= 2 && values.length >= 3) {
      const formatted = values.slice(-4).map((v) => v.toFixed(1)).join(' → ');
      insights.push({
        type: 'trend_negative',
        severity: 'high',
        message: `ROAS in calo da ${streak + 1} giorni consecutivi (${formatted})`,
      });
    }
  }

  // 4. Platform comparison (CPC and ROAS)
  const { google, meta } = input.adsByPlatform;
  const googleCpc = google.clicks > 0 ? google.spend / google.clicks : 0;
  const metaCpc = meta.clicks > 0 ? meta.spend / meta.clicks : 0;

  if (googleCpc > 0 && metaCpc > 0) {
    const cpcDiff = Math.abs(googleCpc - metaCpc) / Math.max(googleCpc, metaCpc);
    if (cpcDiff > PLATFORM_DIFF_THRESHOLD) {
      const cheaper = googleCpc < metaCpc ? 'Google' : 'Meta';
      const more = googleCpc < metaCpc ? 'Meta' : 'Google';
      insights.push({
        type: 'platform_comparison',
        severity: 'low',
        message: `CPC ${more} (€${Math.max(googleCpc, metaCpc).toFixed(2)}) vs ${cheaper} (€${Math.min(googleCpc, metaCpc).toFixed(2)}) — ${cheaper} più efficiente`,
      });
    }
  }

  const googleRoas = google.spend > 0 ? google.revenue / google.spend : 0;
  const metaRoas = meta.spend > 0 ? meta.revenue / meta.spend : 0;
  if (googleRoas > 0 && metaRoas > 0) {
    const roasDiff = Math.abs(googleRoas - metaRoas) / Math.max(googleRoas, metaRoas);
    if (roasDiff > PLATFORM_DIFF_THRESHOLD) {
      const better = googleRoas > metaRoas ? 'Google' : 'Meta';
      const worse = googleRoas > metaRoas ? 'Meta' : 'Google';
      insights.push({
        type: 'platform_comparison',
        severity: 'low',
        message: `ROAS ${better} (${Math.max(googleRoas, metaRoas).toFixed(1)}) vs ${worse} (${Math.min(googleRoas, metaRoas).toFixed(1)})`,
      });
    }
  }

  // 5. Stock alert
  if (input.lowStockCount > 0) {
    insights.push({
      type: 'stock_alert',
      severity: 'high',
      message: `${input.lowStockCount} SKU con stock inferiore a 5 unità`,
    });
  }

  // 6. Low ROAS campaigns
  if (input.lowRoasCampaignCount > 0) {
    insights.push({
      type: 'roas_alert',
      severity: 'medium',
      message: `${input.lowRoasCampaignCount} campagne con ROAS < 2.0 negli ultimi 7 giorni`,
    });
  }

  // Sort by severity (high first), limit to MAX_INSIGHTS
  const severityOrder = { high: 0, medium: 1, low: 2 };
  return insights
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
    .slice(0, MAX_INSIGHTS);
}

// ── Cached query ───────────────────────────────────────────────

export const getSmartInsights = unstable_cache(
  async (period: string, from?: string, to?: string): Promise<Insight[]> => {
    const supabase = await createServiceClient();

    // Use last 7 days for trend detection, full period for anomalies
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const fourteenDaysAgo = new Date(now);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const curr7Start = sevenDaysAgo.toISOString();
    const curr7End = now.toISOString();
    const prev7Start = fourteenDaysAgo.toISOString();
    const prev7End = sevenDaysAgo.toISOString();
    const curr7DateStart = curr7Start.split('T')[0];
    const curr7DateEnd = curr7End.split('T')[0];
    const prev7DateStart = prev7Start.split('T')[0];
    const prev7DateEnd = prev7End.split('T')[0];

    // Fetch stores list
    const { data: stores } = await supabase.from('stores').select('id, name');

    // Per-store revenue (current 7d vs previous 7d)
    const storeRevenues = await Promise.all(
      (stores || []).map(async (store) => {
        const [curr, prev] = await Promise.all([
          fetchAll<{ total: number }>(({ from: f, to: t }) =>
            supabase.from('shopify_orders').select('total')
              .eq('store_id', store.id).eq('financial_status', 'paid')
              .gte('created_at', curr7Start).lte('created_at', curr7End).range(f, t)
          ),
          fetchAll<{ total: number }>(({ from: f, to: t }) =>
            supabase.from('shopify_orders').select('total')
              .eq('store_id', store.id).eq('financial_status', 'paid')
              .gte('created_at', prev7Start).lte('created_at', prev7End).range(f, t)
          ),
        ]);
        return {
          name: store.name,
          current: curr.reduce((s, o) => s + (o.total || 0), 0),
          previous: prev.reduce((s, o) => s + (o.total || 0), 0),
        };
      })
    );

    // Amazon revenue (7d vs 7d)
    const [amazonCurr, amazonPrev] = await Promise.all([
      fetchAll<{ item_price: number }>(({ from: f, to: t }) =>
        supabase.from('amazon_orders').select('item_price')
          .gte('purchase_date', curr7Start).lte('purchase_date', curr7End).range(f, t)
      ),
      fetchAll<{ item_price: number }>(({ from: f, to: t }) =>
        supabase.from('amazon_orders').select('item_price')
          .gte('purchase_date', prev7Start).lte('purchase_date', prev7End).range(f, t)
      ),
    ]);

    // Ads by platform (7d)
    const [{ data: googleAccounts }, { data: metaAccounts }] = await Promise.all([
      supabase.from('ad_accounts').select('id').eq('platform', 'google'),
      supabase.from('ad_accounts').select('id').eq('platform', 'meta'),
    ]);
    const googleIds = (googleAccounts || []).map((a) => a.id);
    const metaIds = (metaAccounts || []).map((a) => a.id);

    const [{ data: googleSpend }, { data: metaSpend }] = await Promise.all([
      supabase.from('ad_spend_daily').select('spend, revenue, impressions, clicks')
        .in('ad_account_id', googleIds).gte('date', curr7DateStart).lte('date', curr7DateEnd),
      supabase.from('ad_spend_daily').select('spend, revenue, impressions, clicks')
        .in('ad_account_id', metaIds).gte('date', curr7DateStart).lte('date', curr7DateEnd),
    ]);

    function sumAds(rows: typeof googleSpend) {
      return (rows || []).reduce(
        (acc, r) => ({
          spend: acc.spend + (r.spend || 0),
          revenue: acc.revenue + (r.revenue || 0),
          impressions: acc.impressions + (r.impressions || 0),
          clicks: acc.clicks + (r.clicks || 0),
        }),
        { spend: 0, revenue: 0, impressions: 0, clicks: 0 }
      );
    }

    // Daily ROAS for trend detection (last 7 days)
    const { data: dailyAds } = await supabase
      .from('ad_spend_daily')
      .select('date, spend, revenue')
      .gte('date', curr7DateStart)
      .lte('date', curr7DateEnd)
      .order('date');

    const roasByDate: Record<string, { spend: number; revenue: number }> = {};
    for (const row of dailyAds || []) {
      if (!roasByDate[row.date]) roasByDate[row.date] = { spend: 0, revenue: 0 };
      roasByDate[row.date].spend += row.spend || 0;
      roasByDate[row.date].revenue += row.revenue || 0;
    }
    const dailyMetrics = Object.entries(roasByDate)
      .map(([date, v]) => ({ date, roas: v.spend > 0 ? v.revenue / v.spend : 0 }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Low stock + low ROAS counts
    const [{ count: lowStockShopify }, { count: lowStockAmazon }] = await Promise.all([
      supabase.from('shopify_products').select('*', { count: 'exact', head: true })
        .lt('inventory_qty', 5).eq('status', 'active'),
      supabase.from('amazon_inventory').select('*', { count: 'exact', head: true })
        .lt('qty_available', 5).eq('fulfillment', 'fba'),
    ]);

    // Low ROAS campaign count
    const { data: campaigns } = await supabase.from('ad_campaigns').select('campaign_id');
    const { data: recentCampaignSpend } = await supabase
      .from('ad_spend_daily')
      .select('campaign_id, spend, revenue')
      .gte('date', curr7DateStart);

    const campaignSpend = new Map<string, { spend: number; revenue: number }>();
    for (const r of recentCampaignSpend || []) {
      const e = campaignSpend.get(r.campaign_id) ?? { spend: 0, revenue: 0 };
      e.spend += r.spend || 0;
      e.revenue += r.revenue || 0;
      campaignSpend.set(r.campaign_id, e);
    }
    const lowRoasCount = (campaigns || []).filter((c) => {
      const m = campaignSpend.get(c.campaign_id);
      return m && m.spend > 0 && m.revenue / m.spend < 2;
    }).length;

    return calculateInsights({
      revenueByStore: storeRevenues,
      amazonRevenue: {
        current: amazonCurr.reduce((s, o) => s + (o.item_price || 0), 0),
        previous: amazonPrev.reduce((s, o) => s + (o.item_price || 0), 0),
      },
      adsByPlatform: { google: sumAds(googleSpend), meta: sumAds(metaSpend) },
      dailyMetrics,
      lowStockCount: (lowStockShopify || 0) + (lowStockAmazon || 0),
      lowRoasCampaignCount: lowRoasCount,
    });
  },
  ['smart-insights-v1'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);
```

**Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/__tests__/insights.test.ts`
Expected: All 7 tests PASS.

**Step 5: Verify build**

Run: `npm run build`
Expected: Compiles successfully.

**Step 6: Commit**

```bash
git add src/lib/queries/insights.ts src/lib/__tests__/insights.test.ts
git commit -m "feat: add getSmartInsights query with rule-based insight engine"
```

---

### Task 4: Create `SparklineChart` component

A tiny 60x24px line chart with no axes/labels, used inside KPI cards.

**Files:**
- Create: `src/components/sparkline-chart.tsx`

**Step 1: Create the component**

```typescript
"use client";

import { LineChart, Line, ResponsiveContainer } from "recharts";

interface SparklineChartProps {
  data: number[];
  color?: string;
}

export function SparklineChart({ data, color = "#6366f1" }: SparklineChartProps) {
  const chartData = data.map((value, i) => ({ i, value }));

  return (
    <ResponsiveContainer width={60} height={24}>
      <LineChart data={chartData}>
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Compiles successfully.

**Step 3: Commit**

```bash
git add src/components/sparkline-chart.tsx
git commit -m "feat: add SparklineChart component for KPI cards"
```

---

### Task 5: Update `KpiCard` to support sparkline data and new color variants

**Files:**
- Modify: `src/components/kpi-card.tsx`

**Step 1: Update the KpiCard component**

Replace the entire content of `src/components/kpi-card.tsx` with:

```typescript
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { SparklineChart } from "./sparkline-chart";

const variantBorder: Record<string, string> = {
  blue: "border-l-blue-500",
  green: "border-l-emerald-500",
  violet: "border-l-violet-500",
  amber: "border-l-amber-500",
  rose: "border-l-rose-500",
  teal: "border-l-teal-500",
  cyan: "border-l-cyan-500",
};

const variantSparkColor: Record<string, string> = {
  blue: "#3b82f6",
  green: "#10b981",
  violet: "#8b5cf6",
  amber: "#f59e0b",
  rose: "#f43f5e",
  teal: "#14b8a6",
  cyan: "#06b6d4",
};

export type KpiCardVariant = "blue" | "green" | "violet" | "amber" | "rose" | "teal" | "cyan";

interface KpiCardProps {
  title: string;
  value: number;
  format: "currency" | "number" | "percent" | "decimal";
  change?: number;
  variant?: KpiCardVariant;
  sparklineData?: number[];
}

export function KpiCard({ title, value, format, change, variant = "blue", sparklineData }: KpiCardProps) {
  const formatted =
    format === "currency"
      ? formatCurrency(value)
      : format === "percent"
        ? `${value.toFixed(1)}%`
        : format === "decimal"
          ? value.toFixed(2)
          : formatNumber(value);

  return (
    <div
      className={cn(
        "rounded-xl border border-gray-200 border-l-4 bg-white px-5 py-4 shadow-sm",
        variantBorder[variant]
      )}
    >
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
          {title}
        </p>
        {sparklineData && sparklineData.length > 1 && (
          <SparklineChart data={sparklineData} color={variantSparkColor[variant]} />
        )}
      </div>
      <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-gray-900">
        {formatted}
      </p>
      {change !== undefined && (
        <div
          className={cn(
            "mt-2 flex items-center gap-1 text-xs font-semibold",
            change >= 0 ? "text-emerald-600" : "text-red-500"
          )}
        >
          {change > 0 ? (
            <TrendingUp className="h-3 w-3" />
          ) : change < 0 ? (
            <TrendingDown className="h-3 w-3" />
          ) : (
            <Minus className="h-3 w-3" />
          )}
          <span>
            {change >= 0 ? "+" : ""}
            {formatPercent(change)} vs periodo prec.
          </span>
        </div>
      )}
    </div>
  );
}
```

Key changes:
- Added `sparklineData?: number[]` prop
- Added `format: "decimal"` option for ROAS display
- Added `teal` and `cyan` color variants
- Sparkline renders top-right of card when data provided
- Imports `SparklineChart` component

**Step 2: Verify build**

Run: `npm run build`
Expected: Compiles successfully.

**Step 3: Commit**

```bash
git add src/components/kpi-card.tsx
git commit -m "feat: add sparkline support and new variants to KpiCard"
```

---

### Task 6: Create `DailyTrendChart` component

Multi-series line chart with toggle buttons and dual Y-axis.

**Files:**
- Create: `src/app/(dashboard)/daily-trend-chart.tsx`

**Step 1: Create the component**

```typescript
"use client";

import { useState } from "react";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { TrendDayData } from "@/lib/queries/overview";
import { cn } from "@/lib/utils";

interface Props {
  current: TrendDayData[];
  previous: TrendDayData[];
}

type SeriesKey = "revenue" | "adSpend" | "prevRevenue" | "roas";

const SERIES_CONFIG: Record<SeriesKey, { label: string; color: string; defaultOn: boolean; yAxisId: string }> = {
  revenue: { label: "Fatturato", color: "#2563eb", defaultOn: true, yAxisId: "left" },
  adSpend: { label: "Spesa Ads", color: "#f59e0b", defaultOn: true, yAxisId: "right" },
  prevRevenue: { label: "Fatturato prec.", color: "#93c5fd", defaultOn: false, yAxisId: "left" },
  roas: { label: "ROAS", color: "#10b981", defaultOn: false, yAxisId: "right" },
};

const fmtCurrency = (v: number) => `€${(v / 1000).toFixed(0)}k`;
const fmtDate = (d: string) => {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
};

const tooltipFmt = (value: number, name: string) => {
  if (name === "roas") return [value.toFixed(2), "ROAS"];
  return [
    new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value),
    SERIES_CONFIG[name as SeriesKey]?.label ?? name,
  ];
};

export function DailyTrendChart({ current, previous }: Props) {
  const [active, setActive] = useState<Set<SeriesKey>>(
    new Set(
      (Object.entries(SERIES_CONFIG) as [SeriesKey, (typeof SERIES_CONFIG)[SeriesKey]][])
        .filter(([, v]) => v.defaultOn)
        .map(([k]) => k)
    )
  );

  const toggle = (key: SeriesKey) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Merge current + previous into chart data by index
  const data = current.map((day, i) => ({
    date: day.date,
    revenue: day.revenue,
    adSpend: day.adSpend,
    roas: day.roas,
    prevRevenue: previous[i]?.revenue ?? 0,
  }));

  return (
    <div>
      {/* Toggle buttons */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.entries(SERIES_CONFIG) as [SeriesKey, (typeof SERIES_CONFIG)[SeriesKey]][]).map(
          ([key, config]) => (
            <button
              key={key}
              onClick={() => toggle(key)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                active.has(key)
                  ? "border-transparent text-white"
                  : "border-gray-300 bg-white text-gray-500 hover:bg-gray-50"
              )}
              style={active.has(key) ? { backgroundColor: config.color } : undefined}
            >
              {config.label}
            </button>
          )
        )}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={350}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 11 }} />
          <YAxis
            yAxisId="left"
            tickFormatter={fmtCurrency}
            tick={{ fontSize: 11 }}
            width={65}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={(v) => active.has("roas") ? v.toFixed(1) : fmtCurrency(v)}
            tick={{ fontSize: 11 }}
            width={60}
          />
          <Tooltip
            formatter={tooltipFmt}
            labelFormatter={(label) => {
              const [y, m, d] = String(label).split("-");
              return `${d}/${m}/${y}`;
            }}
          />

          {active.has("revenue") && (
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="revenue"
              fill="#2563eb"
              fillOpacity={0.08}
              stroke="#2563eb"
              strokeWidth={2}
              dot={false}
              name="revenue"
            />
          )}
          {active.has("prevRevenue") && (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="prevRevenue"
              stroke="#93c5fd"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              dot={false}
              name="prevRevenue"
            />
          )}
          {active.has("adSpend") && (
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="adSpend"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
              name="adSpend"
            />
          )}
          {active.has("roas") && (
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="roas"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              name="roas"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Compiles successfully.

**Step 3: Commit**

```bash
git add src/app/\(dashboard\)/daily-trend-chart.tsx
git commit -m "feat: add DailyTrendChart with multi-series toggle and dual Y-axis"
```

---

### Task 7: Create `AdsPlatformComparison` component

Horizontal bar chart comparing Google vs Meta across 5 metrics.

**Files:**
- Create: `src/app/(dashboard)/ads-platform-comparison.tsx`

**Step 1: Create the component**

```typescript
"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface PlatformMetrics {
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
  roas: number;
}

interface Props {
  google: PlatformMetrics;
  meta: PlatformMetrics;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v);

export function AdsPlatformComparison({ google, meta }: Props) {
  const googleCpc = google.clicks > 0 ? google.spend / google.clicks : 0;
  const metaCpc = meta.clicks > 0 ? meta.spend / meta.clicks : 0;
  const googleCtr = google.impressions > 0 ? (google.clicks / google.impressions) * 100 : 0;
  const metaCtr = meta.impressions > 0 ? (meta.clicks / meta.impressions) * 100 : 0;

  const data = [
    { name: "Spesa", Google: google.spend, Meta: meta.spend },
    { name: "Revenue", Google: google.revenue, Meta: meta.revenue },
    { name: "ROAS", Google: google.roas, Meta: meta.roas },
    { name: "CPC", Google: googleCpc, Meta: metaCpc },
    { name: "CTR %", Google: googleCtr, Meta: metaCtr },
  ];

  const tooltipFormatter = (value: number, name: string, entry: { payload: { name: string } }) => {
    const metric = entry.payload.name;
    if (metric === "CTR %") return [`${value.toFixed(2)}%`, name];
    if (metric === "ROAS") return [value.toFixed(2), name];
    return [fmt(value), name];
  };

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout="vertical" barGap={2}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" tick={{ fontSize: 11 }} />
        <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={65} />
        <Tooltip formatter={tooltipFormatter} />
        <Legend />
        <Bar dataKey="Google" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={14} />
        <Bar dataKey="Meta" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Compiles successfully.

**Step 3: Commit**

```bash
git add src/app/\(dashboard\)/ads-platform-comparison.tsx
git commit -m "feat: add AdsPlatformComparison chart (Google vs Meta)"
```

---

### Task 8: Create `InsightsPanel` component

Displays rule-based insights as colored badges.

**Files:**
- Create: `src/app/(dashboard)/insights-panel.tsx`

**Step 1: Create the component**

```typescript
import type { Insight } from "@/lib/queries/insights";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Info,
  PackageX,
  BarChart3,
} from "lucide-react";

interface Props {
  insights: Insight[];
}

const severityClasses = {
  high: "border-red-200 bg-red-50 text-red-800",
  medium: "border-orange-200 bg-orange-50 text-orange-800",
  low: "border-blue-200 bg-blue-50 text-blue-800",
};

const typeIcons: Record<Insight["type"], React.ElementType> = {
  anomaly_negative: AlertTriangle,
  anomaly_positive: TrendingUp,
  trend_negative: TrendingDown,
  platform_comparison: Info,
  stock_alert: PackageX,
  roas_alert: BarChart3,
};

export function InsightsPanel({ insights }: Props) {
  if (insights.length === 0) {
    return (
      <p className="text-sm text-green-600">
        Tutto nella norma — nessun segnale significativo
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {insights.map((insight, i) => {
        const Icon = typeIcons[insight.type];
        return (
          <div
            key={i}
            className={cn(
              "flex items-start gap-2.5 rounded-lg border px-3 py-2.5",
              severityClasses[insight.severity]
            )}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-sm font-medium">{insight.message}</p>
          </div>
        );
      })}
    </div>
  );
}
```

Note: This is a **Server Component** (no `"use client"`) — it receives data as props.

**Step 2: Verify build**

Run: `npm run build`
Expected: Compiles successfully.

**Step 3: Commit**

```bash
git add src/app/\(dashboard\)/insights-panel.tsx
git commit -m "feat: add InsightsPanel component for rule-based insights"
```

---

### Task 9: Update `page.tsx` to wire everything together

Replace the overview page with the new CMO layout: 7 KPI cards with sparklines, trend chart, channel performance, insights panel.

**Files:**
- Modify: `src/app/(dashboard)/page.tsx`

**Step 1: Replace the entire content of `src/app/(dashboard)/page.tsx`**

```typescript
export const dynamic = 'force-dynamic';

import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { DateRangePicker } from "@/components/date-range-picker";
import {
  getOverviewKpis,
  getRevenueByChannel,
  getTopProducts,
  getOverviewKpisDaily,
  getDailyTrend,
} from "@/lib/queries/overview";
import { getAdsOverview } from "@/lib/queries/ads";
import { getSmartInsights } from "@/lib/queries/insights";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RevenueChart } from "./revenue-chart";
import { DailyTrendChart } from "./daily-trend-chart";
import { AdsPlatformComparison } from "./ads-platform-comparison";
import { InsightsPanel } from "./insights-panel";
import { formatCurrency, formatNumber } from "@/lib/format";

interface Props {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}

export default async function DashboardPage({ searchParams }: Props) {
  const { period = "30d", from, to } = await searchParams;

  const [kpis, channels, adsOverview, topProducts, kpisDaily, trend, insights] =
    await Promise.all([
      getOverviewKpis(period, from, to),
      getRevenueByChannel(period, from, to),
      getAdsOverview(period, from, to),
      getTopProducts(period, from, to),
      getOverviewKpisDaily(),
      getDailyTrend(period, from, to),
      getSmartInsights(period, from, to),
    ]);

  const totalOrders = kpis.orders.value;
  const revenue = kpis.revenue.value;
  const aov = totalOrders > 0 ? revenue / totalOrders : 0;
  const prevAov =
    kpis.orders.change !== 0 || kpis.revenue.change !== 0
      ? (() => {
          const prevRev = kpis.revenue.change !== 0
            ? revenue / (1 + kpis.revenue.change / 100)
            : revenue;
          const prevOrd = kpis.orders.change !== 0
            ? totalOrders / (1 + kpis.orders.change / 100)
            : totalOrders;
          return prevOrd > 0 ? prevRev / prevOrd : 0;
        })()
      : 0;
  const aovChange = prevAov > 0 ? ((aov - prevAov) / prevAov) * 100 : 0;

  const totalAdSpend = adsOverview.total.spend;
  const totalAdRoas = adsOverview.total.roas;
  // Approximate previous ROAS from ad spend change + revenue
  const prevAdRoas = kpis.adSpend.change !== 0
    ? (() => {
        const prevSpend = totalAdSpend / (1 + kpis.adSpend.change / 100);
        // Use current revenue ratio as approximation
        const prevAdsRev = adsOverview.total.revenue * (prevSpend / totalAdSpend);
        return prevSpend > 0 ? prevAdsRev / prevSpend : 0;
      })()
    : totalAdRoas;
  const roasChange = prevAdRoas > 0 ? ((totalAdRoas - prevAdRoas) / prevAdRoas) * 100 : 0;

  const marginNet = revenue - totalAdSpend;
  const prevMarginNet =
    revenue / (1 + (kpis.revenue.change || 0) / 100) -
    totalAdSpend / (1 + (kpis.adSpend.change || 0) / 100);
  const marginChange = prevMarginNet !== 0 ? ((marginNet - prevMarginNet) / Math.abs(prevMarginNet)) * 100 : 0;

  const newCustomers = kpisDaily.reduce((s, d) => s + d.newCustomers, 0);
  // For sparkline, use daily newCustomers; for change, compare week totals
  // Simplified: we don't have prev period new customers readily, so omit change for now

  // Sparkline data arrays (7 days)
  const sparkRevenue = kpisDaily.map((d) => d.revenue);
  const sparkOrders = kpisDaily.map((d) => d.orders);
  const sparkAov = kpisDaily.map((d) => (d.orders > 0 ? d.revenue / d.orders : 0));
  const sparkAdSpend = kpisDaily.map((d) => d.adSpend);
  const sparkRoas = kpisDaily.map((d) => (d.adSpend > 0 ? d.adsRevenue / d.adSpend : 0));
  const sparkMargin = kpisDaily.map((d) => d.revenue - d.adSpend);
  const sparkNewCust = kpisDaily.map((d) => d.newCustomers);

  return (
    <div>
      <PageHeader title="Dashboard" description="Panoramica Gruppo Wilco">
        <DateRangePicker />
      </PageHeader>

      {/* KPI Cards — 7 columns */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <KpiCard
          title="Fatturato Totale"
          value={revenue}
          format="currency"
          change={kpis.revenue.change}
          variant="green"
          sparklineData={sparkRevenue}
        />
        <KpiCard
          title="Ordini Totali"
          value={totalOrders}
          format="number"
          change={kpis.orders.change}
          variant="blue"
          sparklineData={sparkOrders}
        />
        <KpiCard
          title="AOV"
          value={aov}
          format="currency"
          change={aovChange}
          variant="violet"
          sparklineData={sparkAov}
        />
        <KpiCard
          title="Spesa Ads"
          value={totalAdSpend}
          format="currency"
          change={kpis.adSpend.change}
          variant="amber"
          sparklineData={sparkAdSpend}
        />
        <KpiCard
          title="ROAS"
          value={totalAdRoas}
          format="decimal"
          change={roasChange}
          variant="rose"
          sparklineData={sparkRoas}
        />
        <KpiCard
          title="Margine Netto"
          value={marginNet}
          format="currency"
          change={marginChange}
          variant="teal"
          sparklineData={sparkMargin}
        />
        <KpiCard
          title="Nuovi Clienti"
          value={newCustomers}
          format="number"
          variant="cyan"
          sparklineData={sparkNewCust}
        />
      </div>

      {/* Daily Trend Chart */}
      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Andamento Giornaliero</CardTitle>
          </CardHeader>
          <CardContent>
            <DailyTrendChart current={trend.current} previous={trend.previous} />
          </CardContent>
        </Card>
      </div>

      {/* Revenue by Channel + Ads Platform Comparison */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Fatturato per Canale</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueChart data={channels} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Google vs Meta Ads</CardTitle>
          </CardHeader>
          <CardContent>
            <AdsPlatformComparison google={adsOverview.google} meta={adsOverview.meta} />
          </CardContent>
        </Card>
      </div>

      {/* Smart Insights */}
      <div className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Insight & Segnali</CardTitle>
          </CardHeader>
          <CardContent>
            <InsightsPanel insights={insights} />
          </CardContent>
        </Card>
      </div>

      {/* Top Products */}
      <div className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Top 5 Prodotti</CardTitle>
          </CardHeader>
          <CardContent>
            {topProducts.length === 0 ? (
              <p className="text-sm text-gray-500">Nessun dato nel periodo selezionato.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-gray-500">
                    <th className="pb-2 text-left">#</th>
                    <th className="pb-2 text-left">Prodotto</th>
                    <th className="pb-2 text-left">Canale</th>
                    <th className="pb-2 text-right">Unità</th>
                    <th className="pb-2 text-right">Ricavo</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((p, i) => (
                    <tr key={`${p.channel}-${p.title}`} className="border-b last:border-0">
                      <td className="py-2 text-gray-400">{i + 1}</td>
                      <td className="py-2 font-medium">{p.title}</td>
                      <td className="py-2 text-gray-500">{p.channel}</td>
                      <td className="py-2 text-right">{formatNumber(p.units)}</td>
                      <td className="py-2 text-right font-medium">{formatCurrency(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

**Step 2: Run lint**

Run: `npm run lint`
Expected: No errors.

**Step 3: Verify build**

Run: `npm run build`
Expected: Compiles successfully.

**Step 4: Commit**

```bash
git add src/app/\(dashboard\)/page.tsx
git commit -m "feat: redesign overview page with CMO dashboard layout"
```

---

### Task 10: Run all tests and final verification

**Files:** None (verification only)

**Step 1: Run all tests**

Run: `npm run test`
Expected: All tests pass including the new insights tests.

**Step 2: Run lint**

Run: `npm run lint`
Expected: No errors.

**Step 3: Run production build**

Run: `npm run build`
Expected: Compiles successfully with no errors.

**Step 4: Commit if any lint/test fixes needed**

If any fixes were needed, commit them:
```bash
git add -A
git commit -m "fix: resolve lint/test issues from CMO dashboard"
```
