export const dynamic = 'force-dynamic';

import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { DateRangePicker } from "@/components/date-range-picker";
import {
  getOverviewKpis,
  getRevenueByChannel,
  getTopProducts,
  getOverviewKpisDaily,
  getDailyTrend,
} from "@/lib/queries/overview";
import { getAdsOverview } from "@/lib/queries/ads";
import { getSmartInsights } from "@/lib/queries/insights";
import {
  getCampaignMatrix,
  getParetoAnalysis,
  getCustomerHealth,
  getStrategicRecommendations,
} from "@/lib/queries/strategic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RevenueChart } from "./revenue-chart";
import { DailyTrendChart } from "./daily-trend-chart";
import { AdsPlatformComparison } from "./ads-platform-comparison";
import { InsightsPanel } from "./insights-panel";
import { CampaignMatrix } from "./campaign-matrix";
import { ParetoChart } from "./pareto-chart";
import { CustomerHealthPanel } from "./customer-health-panel";
import { StrategicAdvisor } from "./strategic-advisor";
import { formatCurrency, formatNumber } from "@/lib/format";
import { SyncButton } from "@/components/sync-button";

interface Props {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}

export default async function DashboardPage({ searchParams }: Props) {
  const { period = "30d", from, to } = await searchParams;

  const [kpis, channels, adsOverview, topProducts, kpisDaily, trend, insights, campaignMatrix, pareto, customerHealth, strategicRecs] =
    await Promise.all([
      getOverviewKpis(period, from, to),
      getRevenueByChannel(period, from, to),
      getAdsOverview(period, from, to),
      getTopProducts(period, from, to),
      getOverviewKpisDaily(),
      getDailyTrend(period, from, to),
      getSmartInsights(period, from, to),
      getCampaignMatrix(period, from, to),
      getParetoAnalysis(period, from, to),
      getCustomerHealth(period, from, to),
      getStrategicRecommendations(period, from, to),
    ]);

  const totalOrders = kpis.orders.value;
  const revenue = kpis.revenue.value;
  const aov = totalOrders > 0 ? revenue / totalOrders : 0;
  const prevAov =
    kpis.orders.change !== 0 || kpis.revenue.change !== 0
      ? (() => {
          const prevRev = kpis.revenue.change !== 0
            ? revenue / (1 + kpis.revenue.change / 100)
            : revenue;
          const prevOrd = kpis.orders.change !== 0
            ? totalOrders / (1 + kpis.orders.change / 100)
            : totalOrders;
          return prevOrd > 0 ? prevRev / prevOrd : 0;
        })()
      : 0;
  const aovChange = prevAov > 0 ? ((aov - prevAov) / prevAov) * 100 : 0;

  const totalAdSpend = adsOverview.total.spend;
  const totalAdRoas = adsOverview.total.roas;
  const prevAdRoas = kpis.adSpend.change !== 0
    ? (() => {
        const prevSpend = totalAdSpend / (1 + kpis.adSpend.change / 100);
        const prevAdsRev = adsOverview.total.revenue * (prevSpend / totalAdSpend);
        return prevSpend > 0 ? prevAdsRev / prevSpend : 0;
      })()
    : totalAdRoas;
  const roasChange = prevAdRoas > 0 ? ((totalAdRoas - prevAdRoas) / prevAdRoas) * 100 : 0;

  const marginNet = revenue - totalAdSpend;
  const prevMarginNet =
    revenue / (1 + (kpis.revenue.change || 0) / 100) -
    totalAdSpend / (1 + (kpis.adSpend.change || 0) / 100);
  const marginChange = prevMarginNet !== 0 ? ((marginNet - prevMarginNet) / Math.abs(prevMarginNet)) * 100 : 0;

  const newCustomers = kpisDaily.reduce((s, d) => s + d.newCustomers, 0);

  // Sparkline data arrays (7 days)
  const sparkRevenue = kpisDaily.map((d) => d.revenue);
  const sparkOrders = kpisDaily.map((d) => d.orders);
  const sparkAov = kpisDaily.map((d) => (d.orders > 0 ? d.revenue / d.orders : 0));
  const sparkAdSpend = kpisDaily.map((d) => d.adSpend);
  const sparkRoas = kpisDaily.map((d) => (d.adSpend > 0 ? d.adsRevenue / d.adSpend : 0));
  const sparkMargin = kpisDaily.map((d) => d.revenue - d.adSpend);
  const sparkNewCust = kpisDaily.map((d) => d.newCustomers);

  return (
    <div>
      <PageHeader title="Dashboard" description="Panoramica Gruppo Wilco">
        <div className="flex items-center gap-2">
          <SyncButton />
          <DateRangePicker />
        </div>
      </PageHeader>

      {/* KPI Cards — 7 columns */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <KpiCard
          title="Fatturato Totale"
          value={revenue}
          format="currency"
          change={kpis.revenue.change}
          variant="green"
          sparklineData={sparkRevenue}
        />
        <KpiCard
          title="Ordini Totali"
          value={totalOrders}
          format="number"
          change={kpis.orders.change}
          variant="blue"
          sparklineData={sparkOrders}
        />
        <KpiCard
          title="AOV"
          value={aov}
          format="currency"
          change={aovChange}
          variant="violet"
          sparklineData={sparkAov}
        />
        <KpiCard
          title="Spesa Ads"
          value={totalAdSpend}
          format="currency"
          change={kpis.adSpend.change}
          variant="amber"
          sparklineData={sparkAdSpend}
        />
        <KpiCard
          title="ROAS"
          value={totalAdRoas}
          format="decimal"
          change={roasChange}
          variant="rose"
          sparklineData={sparkRoas}
        />
        <KpiCard
          title="Margine Netto"
          value={marginNet}
          format="currency"
          change={marginChange}
          variant="teal"
          sparklineData={sparkMargin}
        />
        <KpiCard
          title="Nuovi Clienti"
          value={newCustomers}
          format="number"
          variant="cyan"
          sparklineData={sparkNewCust}
        />
      </div>

      {/* Daily Trend Chart */}
      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Andamento Giornaliero</CardTitle>
          </CardHeader>
          <CardContent>
            <DailyTrendChart current={trend.current} previous={trend.previous} />
          </CardContent>
        </Card>
      </div>

      {/* Revenue by Channel + Ads Platform Comparison */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
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
            <CardTitle>Google vs Meta Ads</CardTitle>
          </CardHeader>
          <CardContent>
            <AdsPlatformComparison google={adsOverview.google} meta={adsOverview.meta} />
          </CardContent>
        </Card>
      </div>

      {/* Smart Insights */}
      <div className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Insight & Segnali</CardTitle>
          </CardHeader>
          <CardContent>
            <InsightsPanel insights={insights} />
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

      {/* Campaign Matrix + Customer Health */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle>Matrice Campagne</CardTitle>
          </CardHeader>
          <CardContent>
            <CampaignMatrix
              data={campaignMatrix}
              medianSpend={campaignMatrix.length > 0
                ? [...campaignMatrix].sort((a, b) => a.total_spend - b.total_spend)[Math.floor(campaignMatrix.length / 2)].total_spend
                : 0
              }
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle>Salute Clienti</CardTitle>
          </CardHeader>
          <CardContent>
            <CustomerHealthPanel data={customerHealth} />
          </CardContent>
        </Card>
      </div>

      {/* Pareto Analysis + Strategic Advisor */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle>Analisi Pareto</CardTitle>
          </CardHeader>
          <CardContent>
            <ParetoChart data={pareto} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle>Consigliere Strategico</CardTitle>
          </CardHeader>
          <CardContent>
            <StrategicAdvisor recommendations={strategicRecs} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
