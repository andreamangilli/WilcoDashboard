"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatNumber } from "@/lib/format";
import { ArrowUp, ArrowDown } from "lucide-react";
import type { CampaignWithMetrics } from "@/lib/queries/ads";

type SortKey = "campaign_name" | "spend" | "revenue" | "roas" | "cpc" | "clicks" | "conversions";
type SortDir = "asc" | "desc";

interface Props {
  campaigns: CampaignWithMetrics[];
  platform: "meta" | "google";
}

const activeStatuses: Record<string, string[]> = {
  meta: ["ACTIVE"],
  google: ["ENABLED"],
};

const pausedStatuses = ["PAUSED", "INACTIVE"];

export function AdsCampaignsTable({ campaigns, platform }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    let result = campaigns;
    if (statusFilter === "active") {
      result = result.filter((c) => activeStatuses[platform].includes(c.status));
    } else if (statusFilter === "paused") {
      result = result.filter((c) => pausedStatuses.includes(c.status));
    } else if (statusFilter === "removed") {
      result = result.filter((c) => c.status === "REMOVED");
    }
    return result;
  }, [campaigns, statusFilter, platform]);

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

  const isActive = (status: string) => activeStatuses[platform].includes(status);

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Filtra per stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte</SelectItem>
            <SelectItem value="active">Attive</SelectItem>
            <SelectItem value="paused">In pausa</SelectItem>
            {platform === "google" && <SelectItem value="removed">Rimosse</SelectItem>}
          </SelectContent>
        </Select>
        <span className="text-sm text-gray-500">{sorted.length} campagne</span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{renderSortHeader("Campagna", "campaign_name")}</TableHead>
            <TableHead>Stato</TableHead>
            <TableHead className="text-right">Budget/g</TableHead>
            <TableHead className="text-right">{renderSortHeader("Spesa", "spend")}</TableHead>
            <TableHead className="text-right">{renderSortHeader("Revenue", "revenue")}</TableHead>
            <TableHead className="text-right">{renderSortHeader("ROAS", "roas")}</TableHead>
            <TableHead className="text-right">{renderSortHeader("CPC", "cpc")}</TableHead>
            <TableHead className="text-right">{renderSortHeader("Click", "clicks")}</TableHead>
            <TableHead className="text-right">{renderSortHeader("Conv.", "conversions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="py-8 text-center text-sm text-gray-500">
                Nessuna campagna trovata.
              </TableCell>
            </TableRow>
          ) : (
            sorted.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">
                  <Link href={`/ads/${platform}/${c.campaign_id}`} className="hover:underline">
                    {c.campaign_name}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={isActive(c.status) ? "default" : "secondary"}>{c.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  {c.daily_budget ? formatCurrency(c.daily_budget) : "\u2014"}
                </TableCell>
                <TableCell className="text-right">{formatCurrency(c.spend)}</TableCell>
                <TableCell className="text-right">{formatCurrency(c.revenue)}</TableCell>
                <TableCell className="text-right">
                  {c.spend > 0 ? (
                    <Badge variant={c.roas < 2 ? "destructive" : c.roas < 3 ? "outline" : "default"}>
                      {c.roas.toFixed(1)}x
                    </Badge>
                  ) : "\u2014"}
                </TableCell>
                <TableCell className="text-right">{c.cpc > 0 ? formatCurrency(c.cpc) : "\u2014"}</TableCell>
                <TableCell className="text-right">{formatNumber(c.clicks)}</TableCell>
                <TableCell className="text-right">{formatNumber(c.conversions)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
