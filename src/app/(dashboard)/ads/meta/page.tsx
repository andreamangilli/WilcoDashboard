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

export default async function MetaAdsPage({ searchParams }: Props) {
  const { period = "30d", from, to } = await searchParams;
  const [overview, campaigns, dailySpend] = await Promise.all([
    getAdsOverview(period, from, to),
    getAdsCampaignsWithMetrics("meta", period, from, to),
    getAdsDailySpend("meta", period, from, to),
  ]);

  const m = overview.meta;
  const cpc = m.clicks > 0 ? m.spend / m.clicks : 0;
  const ctr = m.impressions > 0 ? (m.clicks / m.impressions) * 100 : 0;
  const cpm = m.impressions > 0 ? (m.spend / m.impressions) * 1000 : 0;
  const cpa = m.conversions > 0 ? m.spend / m.conversions : 0;

  return (
    <div>
      <PageHeader title="Meta Ads" description="Campagne e performance">
        <DateRangePicker />
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-5">
        <KpiCard title="Spesa" value={m.spend} format="currency" />
        <KpiCard title="Revenue" value={m.revenue} format="currency" variant="green" />
        <KpiCard title="ROAS" value={m.roas} format="number" variant="violet" />
        <KpiCard title="CPA" value={cpa} format="currency" variant="amber" />
        <KpiCard title="Conversioni" value={m.conversions} format="number" variant="rose" />
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

      <AdsCampaignsTable campaigns={campaigns} platform="meta" />
    </div>
  );
}
