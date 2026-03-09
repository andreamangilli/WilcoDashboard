"use client";

import { useState, useMemo } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatNumber } from "@/lib/format";
import { ArrowUp, ArrowDown } from "lucide-react";
import type { KlaviyoCampaign } from "@/lib/queries/klaviyo";

type SortKey = "name" | "send_time" | "recipients" | "opens" | "open_rate" | "clicks" | "click_rate" | "conversions" | "revenue";
type SortDir = "asc" | "desc";

interface Props {
  campaigns: KlaviyoCampaign[];
}

export function KlaviyoCampaignsTable({ campaigns }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("send_time");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [statusFilter, setStatusFilter] = useState("sent");
  const [channelFilter, setChannelFilter] = useState("all");

  const filtered = useMemo(() => {
    let result = campaigns;
    if (statusFilter === "sent") {
      result = result.filter((c) => c.status === "Sent");
    } else if (statusFilter === "draft") {
      result = result.filter((c) => c.status === "Draft");
    } else if (statusFilter === "cancelled") {
      result = result.filter((c) => c.status === "Cancelled");
    }
    if (channelFilter === "email") {
      result = result.filter((c) => c.channel === "email");
    } else if (channelFilter === "sms") {
      result = result.filter((c) => c.channel === "sms");
    }
    return result;
  }, [campaigns, statusFilter, channelFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let aVal: string | number = a[sortKey] as string | number;
      let bVal: string | number = b[sortKey] as string | number;

      if (sortKey === "send_time") {
        aVal = a.send_time || "";
        bVal = b.send_time || "";
      }

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

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "\u2014";
    return new Date(dateStr).toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
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
            <SelectItem value="sent">Inviate</SelectItem>
            <SelectItem value="draft">Bozze</SelectItem>
            <SelectItem value="cancelled">Cancellate</SelectItem>
          </SelectContent>
        </Select>
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Canale" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-gray-500">{sorted.length} campagne</span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{renderSortHeader("Campagna", "name")}</TableHead>
            <TableHead>{renderSortHeader("Invio", "send_time")}</TableHead>
            <TableHead>Stato</TableHead>
            <TableHead className="text-right">{renderSortHeader("Dest.", "recipients")}</TableHead>
            <TableHead className="text-right">{renderSortHeader("Aperture", "opens")}</TableHead>
            <TableHead className="text-right">{renderSortHeader("Open %", "open_rate")}</TableHead>
            <TableHead className="text-right">{renderSortHeader("Click", "clicks")}</TableHead>
            <TableHead className="text-right">{renderSortHeader("Click %", "click_rate")}</TableHead>
            <TableHead className="text-right">{renderSortHeader("Conv.", "conversions")}</TableHead>
            <TableHead className="text-right">{renderSortHeader("Revenue", "revenue")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 ? (
            <TableRow>
              <TableCell colSpan={10} className="py-8 text-center text-sm text-gray-500">
                Nessuna campagna trovata.
              </TableCell>
            </TableRow>
          ) : (
            sorted.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="max-w-[300px] truncate font-medium">{c.name}</TableCell>
                <TableCell className="whitespace-nowrap text-sm text-gray-500">
                  {formatDate(c.send_time)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={c.status === "Sent" ? "default" : c.status === "Draft" ? "outline" : "secondary"}
                    className="text-xs"
                  >
                    {c.channel === "sms" ? "SMS" : ""} {c.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{formatNumber(c.recipients)}</TableCell>
                <TableCell className="text-right">{formatNumber(c.opens)}</TableCell>
                <TableCell className="text-right">
                  {c.recipients > 0 ? (
                    <Badge variant={c.open_rate > 0.25 ? "default" : c.open_rate > 0.15 ? "outline" : "destructive"}>
                      {(c.open_rate * 100).toFixed(1)}%
                    </Badge>
                  ) : "\u2014"}
                </TableCell>
                <TableCell className="text-right">{formatNumber(c.clicks)}</TableCell>
                <TableCell className="text-right">
                  {c.recipients > 0 ? (
                    <Badge variant={c.click_rate > 0.03 ? "default" : c.click_rate > 0.015 ? "outline" : "destructive"}>
                      {(c.click_rate * 100).toFixed(2)}%
                    </Badge>
                  ) : "\u2014"}
                </TableCell>
                <TableCell className="text-right">{formatNumber(c.conversions)}</TableCell>
                <TableCell className="text-right">{c.revenue > 0 ? formatCurrency(c.revenue) : "\u2014"}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
