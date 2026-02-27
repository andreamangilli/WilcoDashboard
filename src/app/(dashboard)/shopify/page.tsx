import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { DateRangePicker } from "@/components/date-range-picker";
import { getShopifyAllStoresKpis } from "@/lib/queries/shopify";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

interface Props {
  searchParams: Promise<{ period?: string }>;
}

export default async function ShopifyPage({ searchParams }: Props) {
  const { period = "30d" } = await searchParams;
  const stores = await getShopifyAllStoresKpis(period);

  return (
    <div>
      <PageHeader title="Shopify" description="Panoramica store">
        <DateRangePicker />
      </PageHeader>

      <div className="space-y-6">
        {stores.map((store) => (
          <Link key={store.id} href={`/shopify/${store.slug}`} className="block">
            <Card className="transition-shadow hover:shadow-md">
              <CardHeader>
                <CardTitle>{store.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <KpiCard title="Fatturato" value={store.revenue.value} format="currency" change={store.revenue.change} />
                  <KpiCard title="Ordini" value={store.orders.value} format="number" change={store.orders.change} />
                  <KpiCard title="AOV" value={store.aov.value} format="currency" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
