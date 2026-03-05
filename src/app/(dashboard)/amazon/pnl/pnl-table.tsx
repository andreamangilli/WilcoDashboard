"use client";

import { useState, useMemo } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatNumber } from "@/lib/format";
import { ArrowUp, ArrowDown } from "lucide-react";
import type { AmazonPnlRow } from "@/lib/queries/amazon";

type SortKey = "asin" | "revenue" | "units" | "amazonFees" | "fbaFees" | "shippingCost" | "netProfit" | "marginPct";
type SortDir = "asc" | "desc";

interface Props {
  rows: AmazonPnlRow[];
}

export function PnlTable({ rows }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) => r.asin.toLowerCase().includes(q) || (r.sku && r.sku.toLowerCase().includes(q))
    );
  }, [rows, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
  }, [filtered, sortKey, sortDir]);

  const totals = useMemo(() => {
    return sorted.reduce(
      (acc, r) => ({
        revenue: acc.revenue + r.revenue,
        units: acc.units + r.units,
        amazonFees: acc.amazonFees + r.amazonFees,
        fbaFees: acc.fbaFees + r.fbaFees,
        shippingCost: acc.shippingCost + r.shippingCost,
        netProfit: acc.netProfit + r.netProfit,
      }),
      { revenue: 0, units: 0, amazonFees: 0, fbaFees: 0, shippingCost: 0, netProfit: 0 }
    );
  }, [sorted]);

  const totalMargin = totals.revenue > 0 ? (totals.netProfit / totals.revenue) * 100 : 0;

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
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Input
          placeholder="Cerca ASIN o SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
        <span className="text-sm text-gray-500">{sorted.length} prodotti</span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{renderSortHeader("ASIN", "asin")}</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead className="text-right">{renderSortHeader("Fatturato", "revenue")}</TableHead>
            <TableHead className="text-right">{renderSortHeader("Unita", "units")}</TableHead>
            <TableHead className="text-right">{renderSortHeader("Fee Amazon", "amazonFees")}</TableHead>
            <TableHead className="text-right">{renderSortHeader("Fee FBA", "fbaFees")}</TableHead>
            <TableHead className="text-right">{renderSortHeader("Spedizione", "shippingCost")}</TableHead>
            <TableHead className="text-right">{renderSortHeader("Profitto", "netProfit")}</TableHead>
            <TableHead className="text-right">{renderSortHeader("Margine", "marginPct")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="py-8 text-center text-sm text-gray-500">
                Nessun dato trovato per il periodo selezionato.
              </TableCell>
            </TableRow>
          ) : (
            <>
              {sorted.map((r) => (
                <TableRow key={r.asin}>
                  <TableCell className="font-mono text-sm">{r.asin}</TableCell>
                  <TableCell className="text-sm text-gray-500">{r.sku || "\u2014"}</TableCell>
                  <TableCell className="text-right">{formatCurrency(r.revenue)}</TableCell>
                  <TableCell className="text-right">{formatNumber(r.units)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(r.amazonFees)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(r.fbaFees)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(r.shippingCost)}</TableCell>
                  <TableCell className="text-right font-medium">
                    <span className={r.netProfit >= 0 ? "text-emerald-600" : "text-red-600"}>
                      {formatCurrency(r.netProfit)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={r.marginPct >= 0 ? "default" : "destructive"}>
                      {r.marginPct.toFixed(1)}%
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 bg-gray-50 font-semibold">
                <TableCell>Totale</TableCell>
                <TableCell />
                <TableCell className="text-right">{formatCurrency(totals.revenue)}</TableCell>
                <TableCell className="text-right">{formatNumber(totals.units)}</TableCell>
                <TableCell className="text-right">{formatCurrency(totals.amazonFees)}</TableCell>
                <TableCell className="text-right">{formatCurrency(totals.fbaFees)}</TableCell>
                <TableCell className="text-right">{formatCurrency(totals.shippingCost)}</TableCell>
                <TableCell className="text-right">
                  <span className={totals.netProfit >= 0 ? "text-emerald-600" : "text-red-600"}>
                    {formatCurrency(totals.netProfit)}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant={totalMargin >= 0 ? "default" : "destructive"}>
                    {totalMargin.toFixed(1)}%
                  </Badge>
                </TableCell>
              </TableRow>
            </>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
