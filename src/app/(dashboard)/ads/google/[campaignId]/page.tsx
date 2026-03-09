export const dynamic = 'force-dynamic';

import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { DateRangePicker } from "@/components/date-range-picker";
import { KpiCard } from "@/components/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCampaignDailySpend, getCampaignInfo, getCampaignAdGroups } from "@/lib/queries/ads";
import { formatCurrency, formatNumber } from "@/lib/format";
import { AdsMultiChart } from "../../ads-multi-chart";
import { AdGroupsTable } from "./ad-groups-table";

interface Props {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}

const campaignTypeLabels: Record<string, string> = {
  SEARCH: "Ricerca",
  DISPLAY: "Display",
  SHOPPING: "Shopping",
  VIDEO: "Video",
  PERFORMANCE_MAX: "Performance Max",
  DISCOVERY: "Discovery",
  DEMAND_GEN: "Demand Gen",
  OTHER: "Altro",
};

const biddingLabels: Record<string, string> = {
  TARGET_CPA: "CPA Target",
  TARGET_ROAS: "ROAS Target",
  MAXIMIZE_CONVERSIONS: "Massimizza Conversioni",
  MAXIMIZE_CONVERSION_VALUE: "Massimizza Valore Conversioni",
  MANUAL_CPC: "CPC Manuale",
  ENHANCED_CPC: "CPC Ottimizzato",
  TARGET_SPEND: "Massimizza Click",
  OTHER: "Altro",
};

export default async function GoogleCampaignDetailPage({ params, searchParams }: Props) {
  const { campaignId } = await params;
  const { period = "30d", from, to } = await searchParams;

  const [campaign, dailySpend, adGroups] = await Promise.all([
    getCampaignInfo(campaignId),
    getCampaignDailySpend(campaignId, period, from, to),
    getCampaignAdGroups(campaignId, period, from, to),
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
  const cpa = totals.conversions > 0 ? totals.spend / totals.conversions : 0;
  const convRate = totals.clicks > 0 ? (totals.conversions / totals.clicks) * 100 : 0;

  const campaignType = campaign.campaign_type
    ? campaignTypeLabels[campaign.campaign_type] || campaign.campaign_type
    : null;
  const bidding = campaign.bidding_strategy
    ? biddingLabels[campaign.bidding_strategy] || campaign.bidding_strategy
    : null;

  return (
    <div>
      <PageHeader title={campaign.campaign_name || "Campagna"}>
        <DateRangePicker />
      </PageHeader>

      {/* Campaign Info */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge variant={campaign.status === "ENABLED" ? "default" : "secondary"}>
          {campaign.status}
        </Badge>
        {campaignType && (
          <Badge variant="outline">{campaignType}</Badge>
        )}
        {bidding && (
          <Badge variant="outline" className="bg-muted">{bidding}</Badge>
        )}
        {campaign.daily_budget && (
          <Badge variant="outline" className="bg-muted">
            Budget: {formatCurrency(campaign.daily_budget)}/giorno
          </Badge>
        )}
      </div>

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-8">
        <KpiCard title="Spesa" value={totals.spend} format="currency" />
        <KpiCard title="Revenue" value={totals.revenue} format="currency" variant="green" />
        <KpiCard title="ROAS" value={roas} format="number" variant="violet" />
        <KpiCard title="CPC" value={cpc} format="currency" variant="amber" />
        <KpiCard title="CTR" value={ctr} format="percent" />
        <KpiCard title="CPA" value={cpa} format="currency" variant="amber" />
        <KpiCard title="Conv. Rate" value={convRate} format="percent" variant="green" />
        <KpiCard title="Conversioni" value={totals.conversions} format="number" variant="rose" />
      </div>

      {/* Impressions & Clicks summary */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-muted-foreground text-xs uppercase">Impressions</p>
            <p className="text-2xl font-bold">{formatNumber(totals.impressions)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-muted-foreground text-xs uppercase">Click</p>
            <p className="text-2xl font-bold">{formatNumber(totals.clicks)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-muted-foreground text-xs uppercase">CPM</p>
            <p className="text-2xl font-bold">{formatCurrency(totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-muted-foreground text-xs uppercase">Costo/Conv.</p>
            <p className="text-2xl font-bold">{formatCurrency(cpa)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Daily Chart */}
      <AdsMultiChart data={dailySpend} />

      {/* Ad Groups Table */}
      {adGroups.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Gruppi di Annunci</CardTitle>
          </CardHeader>
          <CardContent>
            <AdGroupsTable data={adGroups} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
