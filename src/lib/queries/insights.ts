import { unstable_cache } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/server';
import { fetchAll } from '@/lib/supabase/fetch-all';

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

const ANOMALY_THRESHOLD = 0.20;
const PLATFORM_DIFF_THRESHOLD = 0.30;
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
        if (streak >= 2) break;
        streak = 0;
        values.length = 0;
      }
    }
    if (streak >= 2 && values.length >= 3) {
      const formatted = values.slice(-4).map((v) => v.toFixed(1)).join(' \u2192 ');
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
        message: `CPC ${more} (\u20AC${Math.max(googleCpc, metaCpc).toFixed(2)}) vs ${cheaper} (\u20AC${Math.min(googleCpc, metaCpc).toFixed(2)}) \u2014 ${cheaper} pi\u00F9 efficiente`,
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
      message: `${input.lowStockCount} SKU con stock inferiore a 5 unit\u00E0`,
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

  const severityOrder = { high: 0, medium: 1, low: 2 };
  return insights
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
    .slice(0, MAX_INSIGHTS);
}

// ── Cached query ───────────────────────────────────────────────

export const getSmartInsights = unstable_cache(
  async (_period: string, _from?: string, _to?: string): Promise<Insight[]> => {
    const supabase = await createServiceClient();

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

    const { data: stores } = await supabase.from('stores').select('id, name');

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

    const [{ count: lowStockShopify }, { count: lowStockAmazon }] = await Promise.all([
      supabase.from('shopify_products').select('*', { count: 'exact', head: true })
        .lt('inventory_qty', 5).eq('status', 'active'),
      supabase.from('amazon_inventory').select('*', { count: 'exact', head: true })
        .lt('qty_available', 5).eq('fulfillment', 'fba'),
    ]);

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
