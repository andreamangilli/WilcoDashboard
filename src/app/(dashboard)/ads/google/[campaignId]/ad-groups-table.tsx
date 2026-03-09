"use client";

import { useState, useMemo } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber } from "@/lib/format";
import { ArrowUp, ArrowDown } from "lucide-react";
import type { AdGroupWithMetrics } from "@/lib/queries/ads";

type SortKey = "ad_group_name" | "spend" | "revenue" | "roas" | "cpc" | "clicks" | "conversions" | "impressions";
type SortDir = "asc" | "desc";

interface Props {
  data: AdGroupWithMetrics[];
}

export function AdGroupsTable({ data }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
  }, [data, sortKey, sortDir]);

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
          <TableHead>{renderSortHeader("Gruppo di Annunci", "ad_group_name")}</TableHead>
          <TableHead>Stato</TableHead>
          <TableHead className="text-right">{renderSortHeader("Spesa", "spend")}</TableHead>
          <TableHead className="text-right">{renderSortHeader("Revenue", "revenue")}</TableHead>
          <TableHead className="text-right">{renderSortHeader("ROAS", "roas")}</TableHead>
          <TableHead className="text-right">{renderSortHeader("CPC", "cpc")}</TableHead>
          <TableHead className="text-right">{renderSortHeader("Click", "clicks")}</TableHead>
          <TableHead className="text-right">{renderSortHeader("Impressions", "impressions")}</TableHead>
          <TableHead className="text-right">{renderSortHeader("Conv.", "conversions")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.length === 0 ? (
          <TableRow>
            <TableCell colSpan={9} className="py-8 text-center text-sm text-gray-500">
              Nessun gruppo di annunci.
            </TableCell>
          </TableRow>
        ) : (
          sorted.map((g) => (
            <TableRow key={g.ad_group_id}>
              <TableCell className="font-medium">{g.ad_group_name}</TableCell>
              <TableCell>
                <Badge variant={g.ad_group_status === "ENABLED" ? "default" : "secondary"}>
                  {g.ad_group_status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">{formatCurrency(g.spend)}</TableCell>
              <TableCell className="text-right">{formatCurrency(g.revenue)}</TableCell>
              <TableCell className="text-right">
                {g.spend > 0 ? (
                  <Badge variant={g.roas < 2 ? "destructive" : g.roas < 3 ? "outline" : "default"}>
                    {g.roas.toFixed(1)}x
                  </Badge>
                ) : "\u2014"}
              </TableCell>
              <TableCell className="text-right">{g.cpc > 0 ? formatCurrency(g.cpc) : "\u2014"}</TableCell>
              <TableCell className="text-right">{formatNumber(g.clicks)}</TableCell>
              <TableCell className="text-right">{formatNumber(g.impressions)}</TableCell>
              <TableCell className="text-right">{formatNumber(g.conversions)}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
