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
