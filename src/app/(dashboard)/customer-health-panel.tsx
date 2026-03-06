import { KpiCard } from "@/components/kpi-card";
import type { CustomerHealth } from "@/lib/queries/strategic";

interface Props {
  data: CustomerHealth;
}

export function CustomerHealthPanel({ data }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <KpiCard
        title="Tasso Riacquisto"
        value={data.repeat_rate}
        format="percent"
        variant="teal"
      />
      <KpiCard
        title="LTV Medio"
        value={data.avg_ltv}
        format="currency"
        variant="green"
      />
      <KpiCard
        title="Nuovi Clienti"
        value={data.new_customers_period}
        format="number"
        variant="cyan"
      />
      <KpiCard
        title="Trend AOV"
        value={data.aov_current}
        format="currency"
        change={data.aov_change_pct}
        variant="violet"
      />
    </div>
  );
}
