import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { DateRangePicker } from "@/components/date-range-picker";
import { getAdsOverview } from "@/lib/queries/ads";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";

interface Props {
  searchParams: Promise<{ period?: string }>;
}

export default async function AdsPage({ searchParams }: Props) {
  const { period = "30d" } = await searchParams;
  const overview = await getAdsOverview(period);

  return (
    <div>
      <PageHeader title="Advertising" description="Panoramica spesa pubblicitaria">
        <DateRangePicker />
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard title="Spesa Totale" value={overview.total.spend} format="currency" />
        <KpiCard title="Revenue da Ads" value={overview.total.revenue} format="currency" />
        <KpiCard title="ROAS Totale" value={overview.total.roas} format="number" />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Google Ads</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p>Spesa: <strong>{formatCurrency(overview.google.spend)}</strong></p>
            <p>ROAS: <strong>{overview.google.roas.toFixed(2)}</strong></p>
            <p>Click: <strong>{overview.google.clicks.toLocaleString("it-IT")}</strong></p>
            <Link href="/ads/google"><Button variant="outline" className="mt-2">Dettaglio</Button></Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Meta Ads</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p>Spesa: <strong>{formatCurrency(overview.meta.spend)}</strong></p>
            <p>ROAS: <strong>{overview.meta.roas.toFixed(2)}</strong></p>
            <p>Click: <strong>{overview.meta.clicks.toLocaleString("it-IT")}</strong></p>
            <Link href="/ads/meta"><Button variant="outline" className="mt-2">Dettaglio</Button></Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
