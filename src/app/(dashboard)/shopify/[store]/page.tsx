import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { DateRangePicker } from "@/components/date-range-picker";
import { getShopifyStoreKpis, getStoreBySlug } from "@/lib/queries/shopify";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface Props {
  params: Promise<{ store: string }>;
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}

export default async function StoreDetailPage({ params, searchParams }: Props) {
  const { store: slug } = await params;
  const { period = "30d", from, to } = await searchParams;

  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  const kpis = await getShopifyStoreKpis(store.id, period, from, to);

  return (
    <div>
      <PageHeader title={store.name} description={store.shopify_domain}>
        <DateRangePicker />
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard title="Fatturato" value={kpis.revenue.value} format="currency" change={kpis.revenue.change} />
        <KpiCard title="Ordini" value={kpis.orders.value} format="number" change={kpis.orders.change} />
        <KpiCard title="AOV" value={kpis.aov.value} format="currency" />
      </div>

      <div className="mt-6 flex gap-4">
        <Link href={`/shopify/${slug}/products`}>
          <Button variant="outline">Prodotti</Button>
        </Link>
        <Link href={`/shopify/${slug}/customers`}>
          <Button variant="outline">Clienti</Button>
        </Link>
      </div>
    </div>
  );
}
