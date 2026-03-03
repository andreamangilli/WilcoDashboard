export const dynamic = 'force-dynamic';

import { PageHeader } from "@/components/page-header";
import { DateRangePicker } from "@/components/date-range-picker";
import { getShopifyProductPerf, getAmazonProductPerf } from "@/lib/queries/products";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber } from "@/lib/format";
import Link from "next/link";

interface Props {
  searchParams: Promise<{
    period?: string;
    from?: string;
    to?: string;
    tab?: string;
  }>;
}

export default async function ProdottiPage({ searchParams }: Props) {
  const { period = "30d", from, to, tab = "shopify" } = await searchParams;

  const [shopifyData, amazonData] = await Promise.all([
    getShopifyProductPerf(period, from, to),
    getAmazonProductPerf(period, from, to),
  ]);

  const params = new URLSearchParams({
    ...(period !== "30d" ? { period } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  });

  const tabLink = (t: string) =>
    `?${new URLSearchParams({ ...Object.fromEntries(params), tab: t })}`;

  return (
    <div>
      <PageHeader title="Prodotti" description="Performance prodotti per periodo">
        <DateRangePicker />
      </PageHeader>

      {/* Tab navigation */}
      <div className="mb-6 flex gap-2">
        {(["shopify", "amazon"] as const).map((t) => (
          <Link
            key={t}
            href={tabLink(t)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t === "shopify" ? "Shopify" : "Amazon"}
          </Link>
        ))}
      </div>

      {tab === "shopify" && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Prodotto</TableHead>
              <TableHead>Store</TableHead>
              <TableHead className="text-right">Unità</TableHead>
              <TableHead className="text-right">Ricavo</TableHead>
              <TableHead className="text-right">AOV</TableHead>
              <TableHead className="text-right">Stock</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shopifyData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-gray-500">
                  Nessun dato per il periodo selezionato.
                </TableCell>
              </TableRow>
            ) : (
              shopifyData.map((p) => (
                <TableRow key={`${p.storeName}::${p.title}`}>
                  <TableCell className="font-medium">{p.title}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{p.storeName}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{formatNumber(p.units)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(p.revenue)}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(p.ordersCount > 0 ? p.revenue / p.ordersCount : 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    {p.inventoryQty !== null ? (
                      <span
                        className={
                          p.inventoryQty < 10
                            ? "font-semibold text-red-600"
                            : "text-gray-700"
                        }
                      >
                        {formatNumber(p.inventoryQty)}
                        {p.inventoryQty < 10 && " ⚠"}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      {tab === "amazon" && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ASIN</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Unità</TableHead>
              <TableHead className="text-right">Ricavo</TableHead>
              <TableHead className="text-right">Fee %</TableHead>
              <TableHead className="text-right">Margine Netto</TableHead>
              <TableHead className="text-right">FBA Stock</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {amazonData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-gray-500">
                  Nessun dato per il periodo selezionato.
                </TableCell>
              </TableRow>
            ) : (
              amazonData.map((p) => (
                <TableRow key={p.asin}>
                  <TableCell className="font-mono text-xs">{p.asin}</TableCell>
                  <TableCell className="text-sm text-gray-500">{p.sku ?? "—"}</TableCell>
                  <TableCell className="text-right">{formatNumber(p.units)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(p.revenue)}</TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant={p.feePercent > 35 ? "destructive" : "secondary"}
                    >
                      {p.feePercent.toFixed(1)}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={p.netMargin >= 0 ? "text-green-700 font-medium" : "text-red-600 font-medium"}>
                      {formatCurrency(p.netMargin)}{" "}
                      <span className="text-xs">({p.netMarginPct.toFixed(1)}%)</span>
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {p.qtyAvailable !== null ? (
                      <span className={p.qtyAvailable < 5 ? "font-semibold text-red-600" : "text-gray-700"}>
                        {formatNumber(p.qtyAvailable)}
                        {p.qtyAvailable < 5 && " ⚠"}
                      </span>
                    ) : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
