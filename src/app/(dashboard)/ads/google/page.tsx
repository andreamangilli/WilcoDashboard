export const dynamic = 'force-dynamic';

import { PageHeader } from "@/components/page-header";
import { DateRangePicker } from "@/components/date-range-picker";
import { KpiCard } from "@/components/kpi-card";
import {
  getAdsOverview,
  getAdsCampaignsWithMetrics,
  getAdsDailySpend,
} from "@/lib/queries/ads";
import { AdsMultiChart } from "../ads-multi-chart";
import { AdsCampaignBreakdown } from "../ads-campaign-breakdown";
import { AdsCampaignsTable } from "../ads-campaigns-table";

interface Props {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}

export default async function GoogleAdsPage({ searchParams }: Props) {
  const { period = "30d", from, to } = await searchParams;
  const [overview, campaigns, dailySpend] = await Promise.all([
    getAdsOverview(period, from, to),
    getAdsCampaignsWithMetrics("google", period, from, to),
    getAdsDailySpend("google", period, from, to),
  ]);

  const g = overview.google;
  const cpc = g.clicks > 0 ? g.spend / g.clicks : 0;
  const ctr = g.impressions > 0 ? (g.clicks / g.impressions) * 100 : 0;
  const cpm = g.impressions > 0 ? (g.spend / g.impressions) * 1000 : 0;
  const cpa = g.conversions > 0 ? g.spend / g.conversions : 0;

  return (
    <div>
      <PageHeader title="Google Ads" description="Campagne e performance">
        <DateRangePicker />
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-5">
        <KpiCard title="Spesa" value={g.spend} format="currency" />
        <KpiCard title="Revenue" value={g.revenue} format="currency" variant="green" />
        <KpiCard title="ROAS" value={g.roas} format="number" variant="violet" />
        <KpiCard title="CPA" value={cpa} format="currency" variant="amber" />
        <KpiCard title="Conversioni" value={g.conversions} format="number" variant="rose" />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <KpiCard title="CTR" value={ctr} format="percent" />
        <KpiCard title="CPM" value={cpm} format="currency" />
        <KpiCard title="CPC" value={cpc} format="currency" />
      </div>

      <div className="mb-8 space-y-6">
        <AdsMultiChart data={dailySpend} />
        <AdsCampaignBreakdown data={campaigns} />
      </div>

      <AdsCampaignsTable campaigns={campaigns} platform="google" />
    </div>
  );
}
