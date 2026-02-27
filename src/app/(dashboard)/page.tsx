import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { DateRangePicker } from "@/components/date-range-picker";
import { getOverviewKpis, getRevenueByChannel } from "@/lib/queries/overview";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RevenueChart } from "./revenue-chart";

interface Props {
  searchParams: Promise<{ period?: string }>;
}

export default async function DashboardPage({ searchParams }: Props) {
  const { period = "30d" } = await searchParams;
  const [kpis, channels] = await Promise.all([
    getOverviewKpis(period),
    getRevenueByChannel(period),
  ]);

  return (
    <div>
      <PageHeader title="Dashboard" description="Panoramica Gruppo Wilco">
        <DateRangePicker />
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Fatturato Totale"
          value={kpis.revenue.value}
          format="currency"
          change={kpis.revenue.change}
        />
        <KpiCard
          title="Ordini Totali"
          value={kpis.orders.value}
          format="number"
          change={kpis.orders.change}
        />
        <KpiCard
          title="AOV"
          value={kpis.orders.value > 0 ? kpis.revenue.value / kpis.orders.value : 0}
          format="currency"
        />
        <KpiCard
          title="Spesa Ads"
          value={kpis.adSpend.value}
          format="currency"
          change={kpis.adSpend.change}
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Fatturato per Canale</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueChart data={channels} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
