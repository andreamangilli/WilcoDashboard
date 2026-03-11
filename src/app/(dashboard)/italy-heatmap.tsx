"use client";

import { useState, useMemo } from "react";
import { ITALY_REGIONS, ITALY_VIEWBOX } from "@/lib/geo/italy-svg-paths";
import { formatNumber, formatCurrency } from "@/lib/format";
import type { RegionData } from "@/lib/queries/geographic";

type Mode = "orders" | "revenue";

interface Props {
  data: RegionData[];
}

function getColor(value: number, max: number): string {
  if (max === 0 || value === 0) return "#f5f5f4"; // stone-100
  const ratio = Math.min(value / max, 1);
  // Gradient: stone-100 → amber-200 → amber-500 → amber-700
  if (ratio < 0.25) {
    const t = ratio / 0.25;
    // f5f5f4 → fde68a
    const r = Math.round(245 + (253 - 245) * t);
    const g = Math.round(245 + (230 - 245) * t);
    const b = Math.round(244 + (138 - 244) * t);
    return `rgb(${r},${g},${b})`;
  } else if (ratio < 0.6) {
    const t = (ratio - 0.25) / 0.35;
    // fde68a → f59e0b
    const r = Math.round(253 + (245 - 253) * t);
    const g = Math.round(230 + (158 - 230) * t);
    const b = Math.round(138 + (11 - 138) * t);
    return `rgb(${r},${g},${b})`;
  } else {
    const t = (ratio - 0.6) / 0.4;
    // f59e0b → b45309
    const r = Math.round(245 + (180 - 245) * t);
    const g = Math.round(158 + (83 - 158) * t);
    const b = Math.round(11 + (9 - 11) * t);
    return `rgb(${r},${g},${b})`;
  }
}

export function ItalyHeatmap({ data }: Props) {
  const [mode, setMode] = useState<Mode>("orders");
  const [hovered, setHovered] = useState<string | null>(null);

  const dataMap = useMemo(() => {
    const m = new Map<string, RegionData>();
    for (const d of data) m.set(d.region, d);
    return m;
  }, [data]);

  const maxValue = useMemo(() => {
    if (data.length === 0) return 0;
    return Math.max(...data.map((d) => (mode === "orders" ? d.orders : d.revenue)));
  }, [data, mode]);

  const ranked = useMemo(() => {
    return [...data].sort((a, b) =>
      mode === "orders" ? b.orders - a.orders : b.revenue - a.revenue
    );
  }, [data, mode]);

  const totalOrders = useMemo(() => data.reduce((s, d) => s + d.orders, 0), [data]);
  const totalRevenue = useMemo(() => data.reduce((s, d) => s + d.revenue, 0), [data]);

  const hoveredData = hovered ? dataMap.get(hovered) : null;

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
      {/* Map */}
      <div className="relative flex-1 min-w-0">
        {/* Toggle */}
        <div className="mb-3 flex items-center gap-1 rounded-lg bg-gray-100 p-0.5 w-fit">
          <button
            onClick={() => setMode("orders")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              mode === "orders"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Ordini
          </button>
          <button
            onClick={() => setMode("revenue")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              mode === "revenue"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Fatturato
          </button>
        </div>

        <svg
          viewBox={ITALY_VIEWBOX}
          className="mx-auto h-auto w-full max-w-[320px]"
          xmlns="http://www.w3.org/2000/svg"
        >
          {ITALY_REGIONS.map((region) => {
            const rd = dataMap.get(region.name);
            const value = rd ? (mode === "orders" ? rd.orders : rd.revenue) : 0;
            const isHovered = hovered === region.name;
            return (
              <path
                key={region.name}
                d={region.d}
                fill={getColor(value, maxValue)}
                stroke={isHovered ? "#1f2937" : "#9ca3af"}
                strokeWidth={isHovered ? 1.5 : 0.5}
                className="cursor-pointer transition-colors duration-150"
                onMouseEnter={() => setHovered(region.name)}
                onMouseLeave={() => setHovered(null)}
              />
            );
          })}
        </svg>

        {/* Tooltip */}
        {hoveredData && (
          <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-lg border bg-white px-3 py-2 text-xs shadow-lg">
            <p className="font-semibold text-gray-900">{hoveredData.region}</p>
            <p className="text-gray-600">
              {formatNumber(hoveredData.orders)} ordini &middot; {formatCurrency(hoveredData.revenue)}
            </p>
          </div>
        )}
      </div>

      {/* Ranked list */}
      <div className="w-full lg:w-56 shrink-0">
        <div className="mb-2 flex items-baseline justify-between text-xs text-gray-500">
          <span>Top Regioni</span>
          <span>
            {mode === "orders"
              ? `${formatNumber(totalOrders)} totali`
              : formatCurrency(totalRevenue)}
          </span>
        </div>
        <div className="space-y-1.5">
          {ranked.slice(0, 10).map((d, i) => {
            const value = mode === "orders" ? d.orders : d.revenue;
            const pct = mode === "orders"
              ? totalOrders > 0 ? (d.orders / totalOrders) * 100 : 0
              : totalRevenue > 0 ? (d.revenue / totalRevenue) * 100 : 0;
            return (
              <div
                key={d.region}
                className="group flex items-center gap-2 rounded-md px-2 py-1 hover:bg-gray-50 transition-colors"
                onMouseEnter={() => setHovered(d.region)}
                onMouseLeave={() => setHovered(null)}
              >
                <span className="w-4 text-right text-[10px] font-medium text-gray-400">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-xs font-medium text-gray-800">
                      {d.region}
                    </span>
                    <span className="shrink-0 text-xs text-gray-600">
                      {mode === "orders" ? formatNumber(value) : formatCurrency(value)}
                    </span>
                  </div>
                  <div className="mt-0.5 h-1 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-amber-500 transition-all duration-300"
                      style={{ width: `${Math.max(pct, 1)}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
