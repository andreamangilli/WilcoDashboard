export const dynamic = 'force-dynamic';

import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { DateRangePicker } from "@/components/date-range-picker";
import { KpiCard } from "@/components/kpi-card";
import { Badge } from "@/components/ui/badge";
import { getCampaignDailySpend, getCampaignInfo } from "@/lib/queries/ads";
import { AdsMultiChart } from "../../ads-multi-chart";

interface Props {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}

export default async function MetaCampaignDetailPage({ params, searchParams }: Props) {
  const { campaignId } = await params;
  const { period = "30d", from, to } = await searchParams;

  const [campaign, dailySpend] = await Promise.all([
    getCampaignInfo(campaignId),
    getCampaignDailySpend(campaignId, period, from, to),
  ]);

  if (!campaign) return notFound();

  const totals = dailySpend.reduce(
    (acc, d) => ({
      spend: acc.spend + d.spend,
      revenue: acc.revenue + d.revenue,
      clicks: acc.clicks + d.clicks,
      conversions: acc.conversions + d.conversions,
      impressions: acc.impressions + d.impressions,
    }),
    { spend: 0, revenue: 0, clicks: 0, conversions: 0, impressions: 0 }
  );

  const roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;
  const cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
  const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;

  return (
    <div>
      <PageHeader title={campaign.campaign_name || "Campagna"}>
        <DateRangePicker />
      </PageHeader>

      <div className="mb-6 flex items-center gap-2">
        <Badge variant={campaign.status === "ACTIVE" ? "default" : "secondary"}>
          {campaign.status}
        </Badge>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard title="Spesa" value={totals.spend} format="currency" />
        <KpiCard title="Revenue" value={totals.revenue} format="currency" variant="green" />
        <KpiCard title="ROAS" value={roas} format="number" variant="violet" />
        <KpiCard title="CPC" value={cpc} format="currency" variant="amber" />
        <KpiCard title="CTR" value={ctr} format="percent" />
        <KpiCard title="Conversioni" value={totals.conversions} format="number" variant="rose" />
      </div>

      <AdsMultiChart data={dailySpend} />
    </div>
  );
}
