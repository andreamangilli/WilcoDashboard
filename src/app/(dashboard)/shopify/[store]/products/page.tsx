import { PageHeader } from "@/components/page-header";
import { getShopifyProducts, getStoreBySlug } from "@/lib/queries/shopify";
import { notFound } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber } from "@/lib/format";

interface Props {
  params: Promise<{ store: string }>;
}

export default async function ProductsPage({ params }: Props) {
  const { store: slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  const products = await getShopifyProducts(store.id);

  return (
    <div>
      <PageHeader title={`${store.name} — Prodotti`} description={`${products.length} prodotti`} />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Prodotto</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead className="text-right">Prezzo</TableHead>
            <TableHead className="text-right">Costo</TableHead>
            <TableHead className="text-right">Inventario</TableHead>
            <TableHead>Stato</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.title}</TableCell>
              <TableCell>{p.sku || "—"}</TableCell>
              <TableCell className="text-right">{formatCurrency(p.price || 0)}</TableCell>
              <TableCell className="text-right">{p.cost ? formatCurrency(p.cost) : "—"}</TableCell>
              <TableCell className="text-right">{formatNumber(p.inventory_qty || 0)}</TableCell>
              <TableCell>
                <Badge variant={p.status === "active" ? "default" : "secondary"}>
                  {p.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
