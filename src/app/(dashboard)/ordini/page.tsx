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
import { cn } from "@/lib/utils";

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

const CHANNEL_OPTIONS = [
  { value: "all",     label: "Tutti i canali" },
  { value: "shopify", label: "Shopify" },
  { value: "amazon",  label: "Amazon" },
] as const;

const SHOPIFY_STATUSES = [
  { value: "all",      label: "Tutti" },
  { value: "paid",     label: "Pagati" },
  { value: "pending",  label: "In Attesa" },
  { value: "refunded", label: "Rimborsati" },
];

const AMAZON_STATUSES = [
  { value: "all",       label: "Tutti" },
  { value: "Shipped",   label: "Spediti" },
  { value: "Unshipped", label: "In Attesa" },
  { value: "Pending",   label: "Pending" },
];

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
    parseInt(page, 10)
  );

  const currentPage = parseInt(page, 10);
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

  const statusOptions =
    channel === "shopify"
      ? SHOPIFY_STATUSES
      : channel === "amazon"
        ? AMAZON_STATUSES
        : null;

  return (
    <div>
      <PageHeader title="Ordini" description={`${total} ordini trovati`}>
        <DateRangePicker />
      </PageHeader>

      {/* Filters row */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {/* Channel filter */}
        <div className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-1">
          {CHANNEL_OPTIONS.map((c) => (
            <Link
              key={c.value}
              href={buildUrl({ channel: c.value, status: "all" })}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-semibold transition-all",
                channel === c.value
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-800"
              )}
            >
              {c.label}
            </Link>
          ))}
        </div>

        {/* Status filter — only shown when a specific channel is selected */}
        {statusOptions && (
          <div className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-1">
            {statusOptions.map((s) => (
              <Link
                key={s.value}
                href={buildUrl({ status: s.value })}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-semibold transition-all",
                  status === s.value
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-800"
                )}
              >
                {s.label}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 hover:bg-gray-50">
              <TableHead className="w-6" />
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-gray-500">Data</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-gray-500">N° Ordine</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-gray-500">Canale</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-gray-500">Cliente</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-gray-500">Prodotti</TableHead>
              <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Totale</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-gray-500">Stato</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow>
                <td
                  colSpan={8}
                  className="py-12 text-center text-sm text-gray-400"
                >
                  Nessun ordine trovato per il periodo selezionato.
                </td>
              </TableRow>
            ) : (
              orders.map((order) => <OrderRow key={order.id} order={order} />)
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>
            Pagina {currentPage} di {totalPages} · {total} ordini totali
          </span>
          <div className="flex gap-2">
            {currentPage > 1 && (
              <Link href={buildUrl({ page: String(currentPage - 1) })}>
                <Button variant="outline" size="sm" className="rounded-lg">
                  ← Precedente
                </Button>
              </Link>
            )}
            {currentPage < totalPages && (
              <Link href={buildUrl({ page: String(currentPage + 1) })}>
                <Button variant="outline" size="sm" className="rounded-lg">
                  Successiva →
                </Button>
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
