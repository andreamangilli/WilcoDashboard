import { PageHeader } from "@/components/page-header";
import { DateRangePicker } from "@/components/date-range-picker";
import { KpiCard } from "@/components/kpi-card";
import {
  getAdsOverview,
  getAdsCampaignsWithMetrics,
  getAdsDailySpend,
} from "@/lib/queries/ads";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber } from "@/lib/format";
import { SpendChart } from "../spend-chart";

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

  return (
    <div>
      <PageHeader title="Google Ads" description="Campagne e performance">
        <DateRangePicker />
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        <KpiCard title="Spesa" value={g.spend} format="currency" />
        <KpiCard title="ROAS" value={g.roas} format="number" />
        <KpiCard title="CPC Medio" value={cpc} format="currency" />
        <KpiCard title="Conversioni" value={g.conversions} format="number" />
        <KpiCard title="Ricavo Ads" value={g.revenue} format="currency" />
      </div>

      <div className="mb-8">
        <SpendChart data={dailySpend} />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Campagna</TableHead>
            <TableHead>Stato</TableHead>
            <TableHead className="text-right">Budget/g</TableHead>
            <TableHead className="text-right">Spesa</TableHead>
            <TableHead className="text-right">ROAS</TableHead>
            <TableHead className="text-right">Conversioni</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {campaigns.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-sm text-gray-500">
                Nessuna campagna trovata.
              </TableCell>
            </TableRow>
          ) : (
            campaigns.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.campaign_name}</TableCell>
                <TableCell>
                  <Badge variant={c.status === "ENABLED" ? "default" : "secondary"}>
                    {c.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {c.daily_budget ? formatCurrency(c.daily_budget) : "—"}
                </TableCell>
                <TableCell className="text-right">{formatCurrency(c.spend)}</TableCell>
                <TableCell className="text-right">
                  {c.spend > 0 ? (
                    <Badge
                      variant={
                        c.roas < 2 ? "destructive" : c.roas < 3 ? "outline" : "default"
                      }
                    >
                      {c.roas.toFixed(1)}x
                    </Badge>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-right">{formatNumber(c.conversions)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
