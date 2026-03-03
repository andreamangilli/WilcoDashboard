import { PageHeader } from "@/components/page-header";
import { DateRangePicker } from "@/components/date-range-picker";
import { getUnifiedOrders } from "@/lib/queries/orders";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OrderRow } from "@/components/order-row";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface Props {
  searchParams: Promise<{
    period?: string;
    from?: string;
    to?: string;
    channel?: string;
    status?: string;
    page?: string;
  }>;
}

export default async function OrdiniPage({ searchParams }: Props) {
  const {
    period = "30d",
    from,
    to,
    channel = "all",
    status = "all",
    page = "1",
  } = await searchParams;

  const { orders, total, pageSize } = await getUnifiedOrders(
    period,
    from,
    to,
    channel as "all" | "shopify" | "amazon",
    status,
    parseInt(page)
  );

  const currentPage = parseInt(page);
  const totalPages = Math.ceil(total / pageSize);

  function buildUrl(overrides: Record<string, string>) {
    const params = new URLSearchParams({
      ...(period !== "30d" ? { period } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(channel !== "all" ? { channel } : {}),
      ...(status !== "all" ? { status } : {}),
      page: "1",
      ...overrides,
    });
    return `?${params.toString()}`;
  }

  return (
    <div>
      <PageHeader title="Ordini" description={`${total} ordini trovati`}>
        <DateRangePicker />
      </PageHeader>

      {/* Channel filter */}
      <div className="mb-4 flex gap-2">
        {(["all", "shopify", "amazon"] as const).map((c) => (
          <Link
            key={c}
            href={buildUrl({ channel: c, page: "1" })}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              channel === c
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {c === "all" ? "Tutti" : c === "shopify" ? "Shopify" : "Amazon"}
          </Link>
        ))}
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-6" />
            <TableHead>Data</TableHead>
            <TableHead>N° Ordine</TableHead>
            <TableHead>Canale</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Prodotti</TableHead>
            <TableHead className="text-right">Totale</TableHead>
            <TableHead>Stato</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.length === 0 ? (
            <TableRow>
              <td
                colSpan={8}
                className="py-8 text-center text-sm text-gray-500"
              >
                Nessun ordine trovato per il periodo selezionato.
              </td>
            </TableRow>
          ) : (
            orders.map((order) => <OrderRow key={order.id} order={order} />)
          )}
        </TableBody>
      </Table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>
            Pagina {currentPage} di {totalPages} ({total} ordini totali)
          </span>
          <div className="flex gap-2">
            {currentPage > 1 && (
              <Link href={buildUrl({ page: String(currentPage - 1) })}>
                <Button variant="outline" size="sm">
                  Precedente
                </Button>
              </Link>
            )}
            {currentPage < totalPages && (
              <Link href={buildUrl({ page: String(currentPage + 1) })}>
                <Button variant="outline" size="sm">
                  Successiva
                </Button>
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
