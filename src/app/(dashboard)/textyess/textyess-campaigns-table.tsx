"use client";

import { useState, useMemo } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatNumber, formatCurrency } from "@/lib/format";
import { ArrowUp, ArrowDown } from "lucide-react";
import type { TextyessCampaign } from "@/lib/queries/textyess";

type SortKey = "name" | "orders_count" | "open_rate" | "conversion_rate" | "recipients" | "revenue" | "roas";
type SortDir = "asc" | "desc";

interface Props {
  campaigns: TextyessCampaign[];
}

export function TextyessCampaignsTable({ campaigns }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("orders_count");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [typeFilter, setTypeFilter] = useState("all");

  const filtered = useMemo(() => {
    if (typeFilter === "all") return campaigns;
    return campaigns.filter((c) => c.campaign_type === typeFilter);
  }, [campaigns, typeFilter]);

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
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte</SelectItem>
            <SelectItem value="campaign">Campagne</SelectItem>
            <SelectItem value="outbound-automations">Automazioni</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-gray-500">{sorted.length} risultati</span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{renderSortHeader("Nome", "name")}</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead className="text-right">{renderSortHeader("Destinatari", "recipients")}</TableHead>
            <TableHead className="text-right">{renderSortHeader("Open %", "open_rate")}</TableHead>
            <TableHead className="text-right">{renderSortHeader("CR %", "conversion_rate")}</TableHead>
            <TableHead className="text-right">{renderSortHeader("Ordini", "orders_count")}</TableHead>
            <TableHead className="text-right">{renderSortHeader("Revenue", "revenue")}</TableHead>
            <TableHead className="text-right">{renderSortHeader("ROAS", "roas")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="py-8 text-center text-sm text-gray-500">
                Nessuna campagna trovata.
              </TableCell>
            </TableRow>
          ) : (
            sorted.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="max-w-[300px] truncate font-medium">{c.name}</TableCell>
                <TableCell>
                  <Badge
                    variant={c.campaign_type === "campaign" ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {c.campaign_type === "campaign" ? "Campagna" : "Automazione"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{formatNumber(c.recipients)}</TableCell>
                <TableCell className="text-right">
                  {c.open_rate > 0 ? `${c.open_rate.toFixed(1)}%` : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {c.conversion_rate > 0 ? `${c.conversion_rate.toFixed(1)}%` : "—"}
                </TableCell>
                <TableCell className="text-right">{formatNumber(c.orders_count)}</TableCell>
                <TableCell className="text-right">
                  {c.revenue > 0 ? formatCurrency(c.revenue) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {c.roas > 0 ? (
                    <Badge variant={c.roas > 5 ? "default" : c.roas > 2 ? "outline" : "secondary"}>
                      {c.roas.toFixed(1)}x
                    </Badge>
                  ) : "—"}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
