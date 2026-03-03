import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { DateRangePicker } from "@/components/date-range-picker";
import { getAmazonKpis } from "@/lib/queries/amazon";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface Props {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}

export default async function AmazonPage({ searchParams }: Props) {
  const { period = "30d", from, to } = await searchParams;
  const kpis = await getAmazonKpis(period, from, to);

  return (
    <div>
      <PageHeader title="Amazon" description="Panoramica marketplace">
        <DateRangePicker />
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard title="Fatturato" value={kpis.revenue.value} format="currency" change={kpis.revenue.change} />
        <KpiCard title="Ordini" value={kpis.orders.value} format="number" change={kpis.orders.change} />
        <KpiCard title="Fee Totali" value={kpis.fees.value} format="currency" />
      </div>

      <div className="mt-6 flex gap-4">
        <Link href="/amazon/pnl"><Button variant="outline">P&L per ASIN</Button></Link>
        <Link href="/amazon/inventory"><Button variant="outline">Inventario</Button></Link>
      </div>
    </div>
  );
}
