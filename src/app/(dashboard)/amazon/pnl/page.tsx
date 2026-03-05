export const dynamic = 'force-dynamic';

import { PageHeader } from "@/components/page-header";
import { DateRangePicker } from "@/components/date-range-picker";
import { KpiCard } from "@/components/kpi-card";
import { getAmazonPnlFromOrders } from "@/lib/queries/amazon";
import { PnlTable } from "./pnl-table";

interface Props {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}

export default async function AmazonPnlPage({ searchParams }: Props) {
  const { period = "30d", from, to } = await searchParams;
  const rows = await getAmazonPnlFromOrders(period, from, to);

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalFees = rows.reduce((s, r) => s + r.amazonFees + r.fbaFees + r.shippingCost, 0);
  const totalProfit = rows.reduce((s, r) => s + r.netProfit, 0);
  const totalMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  return (
    <div>
      <PageHeader title="Amazon P&L" description="Profitto e perdita per ASIN">
        <DateRangePicker />
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <KpiCard title="Fatturato" value={totalRevenue} format="currency" variant="blue" />
        <KpiCard title="Fee Totali" value={totalFees} format="currency" variant="amber" />
        <KpiCard
          title="Profitto Netto"
          value={totalProfit}
          format="currency"
          variant={totalProfit >= 0 ? "green" : "rose"}
        />
        <KpiCard title="Margine" value={totalMargin} format="percent" variant={totalMargin >= 0 ? "green" : "rose"} />
      </div>

      <div className="mt-6">
        <PnlTable rows={rows} />
      </div>
    </div>
  );
}
