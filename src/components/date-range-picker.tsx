"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const presets = [
  { value: "today", label: "Oggi" },
  { value: "7d", label: "Ultimi 7 giorni" },
  { value: "30d", label: "Ultimi 30 giorni" },
  { value: "90d", label: "Ultimi 90 giorni" },
  { value: "12m", label: "Ultimi 12 mesi" },
  { value: "2025", label: "Anno 2025" },
  { value: "custom", label: "Personalizzato" },
];

export function DateRangePicker() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const fromParam = searchParams.get("from") ?? "";
  const toParam = searchParams.get("to") ?? "";
  const periodParam = searchParams.get("period") ?? "30d";

  const isCustom = !!(fromParam && toParam);
  const selectValue = isCustom ? "custom" : periodParam;

  const [fromDate, setFromDate] = useState(fromParam);
  const [toDate, setToDate] = useState(toParam);

  function handlePresetChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "custom") {
      params.delete("period");
      // keep existing from/to if present
    } else {
      params.set("period", value);
      params.delete("from");
      params.delete("to");
      router.push(`?${params.toString()}`);
    }
  }

  function applyCustomRange() {
    if (!fromDate || !toDate) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("from", fromDate);
    params.set("to", toDate);
    params.delete("period");
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={selectValue} onValueChange={handlePresetChange}>
        <SelectTrigger className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {presets.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectValue === "custom" && (
        <>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-36"
          />
          <span className="text-sm text-muted-foreground">→</span>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-36"
          />
          <Button size="sm" onClick={applyCustomRange} disabled={!fromDate || !toDate}>
            Applica
          </Button>
        </>
      )}
    </div>
  );
}
