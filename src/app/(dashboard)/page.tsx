import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { DateRangePicker } from "@/components/date-range-picker";
import {
  getOverviewKpis,
  getRevenueByChannel,
  getTopProducts,
  getOperationalSignals,
} from "@/lib/queries/overview";
import { getAdsOverview } from "@/lib/queries/ads";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RevenueChart } from "./revenue-chart";
import { formatCurrency, formatNumber } from "@/lib/format";

interface Props {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}

export default async function DashboardPage({ searchParams }: Props) {
  const { period = "30d", from, to } = await searchParams;

  const [kpis, channels, adsOverview, topProducts, signals] = await Promise.all([
    getOverviewKpis(period, from, to),
    getRevenueByChannel(period, from, to),
    getAdsOverview(period, from, to),
    getTopProducts(period, from, to),
    getOperationalSignals(),
  ]);

  const totalOrders = kpis.orders.value;
  const aov = totalOrders > 0 ? kpis.revenue.value / totalOrders : 0;
  const totalAdSpend = adsOverview.total.spend;
  const totalAdRoas = adsOverview.total.roas;

  return (
    <div>
      <PageHeader title="Dashboard" description="Panoramica Gruppo Wilco">
        <DateRangePicker />
      </PageHeader>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
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
          value={aov}
          format="currency"
        />
        <KpiCard
          title="Spesa Ads"
          value={kpis.adSpend.value}
          format="currency"
          change={kpis.adSpend.change}
        />
        <KpiCard
          title="ROAS Complessivo"
          value={totalAdRoas}
          format="number"
        />
      </div>

      {/* Revenue chart + Operational Signals */}
      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Fatturato per Canale</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueChart data={channels} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Segnali Operativi</CardTitle>
          </CardHeader>
          <CardContent>
            {signals.lowStockSkus.length === 0 && signals.lowRoasCampaigns.length === 0 ? (
              <p className="text-sm text-green-600">Nessun segnale critico</p>
            ) : (
              <div className="space-y-3">
                {signals.lowStockSkus.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase text-red-600">
                      ⚠ Stock Basso
                    </p>
                    <ul className="space-y-1">
                      {signals.lowStockSkus.slice(0, 5).map((s) => (
                        <li key={`${s.channel}-${s.name}`} className="text-sm text-gray-700">
                          {s.name}{" "}
                          <span className="text-red-600 font-medium">
                            ({s.qty} pz — {s.channel})
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {signals.lowRoasCampaigns.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase text-orange-600">
                      📉 ROAS Basso (7gg)
                    </p>
                    <ul className="space-y-1">
                      {signals.lowRoasCampaigns.slice(0, 3).map((c) => (
                        <li key={c.name} className="text-sm text-gray-700">
                          {c.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Products */}
      <div className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Top 5 Prodotti</CardTitle>
          </CardHeader>
          <CardContent>
            {topProducts.length === 0 ? (
              <p className="text-sm text-gray-500">Nessun dato nel periodo selezionato.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-gray-500">
                    <th className="pb-2 text-left">#</th>
                    <th className="pb-2 text-left">Prodotto</th>
                    <th className="pb-2 text-left">Canale</th>
                    <th className="pb-2 text-right">Unità</th>
                    <th className="pb-2 text-right">Ricavo</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((p, i) => (
                    <tr key={`${p.channel}-${p.title}`} className="border-b last:border-0">
                      <td className="py-2 text-gray-400">{i + 1}</td>
                      <td className="py-2 font-medium">{p.title}</td>
                      <td className="py-2 text-gray-500">{p.channel}</td>
                      <td className="py-2 text-right">{formatNumber(p.units)}</td>
                      <td className="py-2 text-right font-medium">{formatCurrency(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
