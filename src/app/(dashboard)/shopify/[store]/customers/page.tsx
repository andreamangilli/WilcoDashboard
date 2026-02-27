import { PageHeader } from "@/components/page-header";
import { getShopifyCustomers, getStoreBySlug } from "@/lib/queries/shopify";
import { notFound } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatNumber } from "@/lib/format";

interface Props {
  params: Promise<{ store: string }>;
}

export default async function CustomersPage({ params }: Props) {
  const { store: slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  const customers = await getShopifyCustomers(store.id);

  return (
    <div>
      <PageHeader title={`${store.name} — Clienti`} description={`${customers.length} clienti`} />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Email</TableHead>
            <TableHead className="text-right">Ordini</TableHead>
            <TableHead className="text-right">Totale Speso</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">{c.first_name} {c.last_name}</TableCell>
              <TableCell>{c.email || "—"}</TableCell>
              <TableCell className="text-right">{formatNumber(c.orders_count || 0)}</TableCell>
              <TableCell className="text-right">{formatCurrency(c.total_spent || 0)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
