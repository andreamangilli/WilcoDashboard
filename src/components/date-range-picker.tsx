"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const presets = [
  { value: "today", label: "Oggi" },
  { value: "7d",    label: "7g" },
  { value: "30d",   label: "30g" },
  { value: "90d",   label: "90g" },
  { value: "12m",   label: "12m" },
  { value: "2025",  label: "2025" },
  { value: "custom", label: "Personalizzato" },
];

export function DateRangePicker() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const fromParam  = searchParams.get("from") ?? "";
  const toParam    = searchParams.get("to")   ?? "";
  const periodParam = searchParams.get("period") ?? "30d";

  const isCustom = !!(fromParam && toParam);
  const selected = isCustom ? "custom" : periodParam;

  const [fromDate, setFromDate] = useState(fromParam);
  const [toDate,   setToDate]   = useState(toParam);
  const [showCustom, setShowCustom] = useState(isCustom);

  function handlePreset(value: string) {
    if (value === "custom") {
      setShowCustom(true);
      return;
    }
    setShowCustom(false);
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", value);
    params.delete("from");
    params.delete("to");
    router.push(`?${params.toString()}`);
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
      {/* Preset pills */}
      <div className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-1">
        {presets.map((p) => (
          <button
            key={p.value}
            onClick={() => handlePreset(p.value)}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-semibold transition-all",
              selected === p.value || (p.value === "custom" && showCustom && !isCustom)
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-800"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom range inputs */}
      {(showCustom || isCustom) && (
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-8 w-32 rounded-lg border-gray-200 text-xs"
          />
          <span className="text-xs text-gray-400">→</span>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="h-8 w-32 rounded-lg border-gray-200 text-xs"
          />
          <Button
            size="sm"
            onClick={applyCustomRange}
            disabled={!fromDate || !toDate}
            className="h-8 rounded-lg px-3 text-xs"
          >
            Applica
          </Button>
        </div>
      )}
    </div>
  );
}
