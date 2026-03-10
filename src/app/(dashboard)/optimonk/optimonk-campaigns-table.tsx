"use client";

import { useState, useMemo } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatNumber } from "@/lib/format";
import { ArrowUp, ArrowDown } from "lucide-react";
import type { OptimonkCampaign } from "@/lib/queries/optimonk";

type SortKey = "name" | "impressions" | "conversions" | "conversion_rate" | "variants_count";
type SortDir = "asc" | "desc";

interface Props {
  campaigns: OptimonkCampaign[];
}

export function OptimonkCampaignsTable({ campaigns }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("impressions");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [statusFilter, setStatusFilter] = useState("active");

  const filtered = useMemo(() => {
    if (statusFilter === "all") return campaigns;
    return campaigns.filter((c) => c.status === statusFilter);
  }, [campaigns, statusFilter]);

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
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte</SelectItem>
            <SelectItem value="active">Attive</SelectItem>
            <SelectItem value="inactive">Inattive</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-gray-500">{sorted.length} campagne</span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{renderSortHeader("Campagna", "name")}</TableHead>
            <TableHead>Stato</TableHead>
            <TableHead className="text-right">{renderSortHeader("Impressioni", "impressions")}</TableHead>
            <TableHead className="text-right">{renderSortHeader("Conversioni", "conversions")}</TableHead>
            <TableHead className="text-right">{renderSortHeader("CR %", "conversion_rate")}</TableHead>
            <TableHead className="text-right">{renderSortHeader("Varianti", "variants_count")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-sm text-gray-500">
                Nessuna campagna trovata.
              </TableCell>
            </TableRow>
          ) : (
            sorted.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="max-w-[400px] truncate font-medium">{c.name}</TableCell>
                <TableCell>
                  <Badge
                    variant={c.status === "active" ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {c.status === "active" ? "Attiva" : "Inattiva"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{formatNumber(c.impressions)}</TableCell>
                <TableCell className="text-right">{formatNumber(c.conversions)}</TableCell>
                <TableCell className="text-right">
                  <Badge
                    variant={
                      c.conversion_rate > 0.1
                        ? "default"
                        : c.conversion_rate > 0.03
                          ? "outline"
                          : "secondary"
                    }
                  >
                    {(c.conversion_rate * 100).toFixed(1)}%
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{c.variants_count}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
