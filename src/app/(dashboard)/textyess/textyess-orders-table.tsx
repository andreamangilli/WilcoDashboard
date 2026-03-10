"use client";

import { useState, useMemo } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatNumber, formatCurrency } from "@/lib/format";
import { ArrowUp, ArrowDown } from "lucide-react";
import type { TextyessOrder } from "@/lib/queries/textyess";

type SortKey = "order_number" | "total" | "created_at";
type SortDir = "asc" | "desc";

interface Props {
  orders: TextyessOrder[];
}

export function TextyessOrdersTable({ orders }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    return [...orders].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (sortKey === "created_at") {
        const aTime = new Date(aVal as string).getTime();
        const bTime = new Date(bVal as string).getTime();
        return sortDir === "asc" ? aTime - bTime : bTime - aTime;
      }
      return sortDir === "asc"
        ? ((aVal as number) || 0) - ((bVal as number) || 0)
        : ((bVal as number) || 0) - ((aVal as number) || 0);
    });
  }, [orders, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function renderSortHeader(label: string, field: SortKey) {
    const active = sortKey === field;
    return (
      <button
        onClick={() => toggleSort(field)}
        className="inline-flex items-center gap-1 hover:text-gray-900"
      >
        {label}
        {active && (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{renderSortHeader("Ordine #", "order_number")}</TableHead>
          <TableHead>Cliente</TableHead>
          <TableHead className="text-right">{renderSortHeader("Totale", "total")}</TableHead>
          <TableHead>Articoli</TableHead>
          <TableHead>Fonte</TableHead>
          <TableHead>{renderSortHeader("Data", "created_at")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="py-8 text-center text-sm text-gray-500">
              Nessun ordine trovato.
            </TableCell>
          </TableRow>
        ) : (
          sorted.map((o) => (
            <TableRow key={o.id}>
              <TableCell className="font-medium">
                {o.order_number ? `#${formatNumber(o.order_number)}` : "—"}
              </TableCell>
              <TableCell>
                {[o.customer_first_name, o.customer_last_name].filter(Boolean).join(" ") || "—"}
              </TableCell>
              <TableCell className="text-right">{formatCurrency(o.total)}</TableCell>
              <TableCell>{o.items_number}</TableCell>
              <TableCell>
                <Badge
                  variant={o.winning_source === "campaign" ? "default" : "secondary"}
                  className="text-xs"
                >
                  {o.winning_source === "campaign" ? "Campagna" : "Automazione"}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-gray-500">
                {new Date(o.created_at).toLocaleDateString("it-IT")}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
