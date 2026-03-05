"use client";

import { useState } from "react";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { TrendDayData } from "@/lib/queries/overview";
import { cn } from "@/lib/utils";

interface Props {
  current: TrendDayData[];
  previous: TrendDayData[];
}

type SeriesKey = "revenue" | "adSpend" | "prevRevenue" | "roas";

const SERIES_CONFIG: Record<SeriesKey, { label: string; color: string; defaultOn: boolean; yAxisId: string }> = {
  revenue: { label: "Fatturato", color: "#2563eb", defaultOn: true, yAxisId: "left" },
  adSpend: { label: "Spesa Ads", color: "#f59e0b", defaultOn: true, yAxisId: "right" },
  prevRevenue: { label: "Fatturato prec.", color: "#93c5fd", defaultOn: false, yAxisId: "left" },
  roas: { label: "ROAS", color: "#10b981", defaultOn: false, yAxisId: "right" },
};

const fmtCurrency = (v: number) => `\u20AC${(v / 1000).toFixed(0)}k`;
const fmtDate = (d: string) => {
  const parts = d.split("-");
  return `${parts[2]}/${parts[1]}`;
};

const tooltipFmt = (value: number | undefined, name: string | undefined) => {
  const v = value ?? 0;
  const n = name ?? "";
  if (n === "roas") return [v.toFixed(2), "ROAS"];
  const label = SERIES_CONFIG[n as SeriesKey]?.label ?? n;
  return [
    new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v),
    label,
  ];
};

export function DailyTrendChart({ current, previous }: Props) {
  const [active, setActive] = useState<Set<SeriesKey>>(
    new Set(
      (Object.entries(SERIES_CONFIG) as [SeriesKey, (typeof SERIES_CONFIG)[SeriesKey]][])
        .filter(([, v]) => v.defaultOn)
        .map(([k]) => k)
    )
  );

  const toggle = (key: SeriesKey) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Merge current + previous into chart data by index
  const data = current.map((day, i) => ({
    date: day.date,
    revenue: day.revenue,
    adSpend: day.adSpend,
    roas: day.roas,
    prevRevenue: previous[i]?.revenue ?? 0,
  }));

  return (
    <div>
      {/* Toggle buttons */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.entries(SERIES_CONFIG) as [SeriesKey, (typeof SERIES_CONFIG)[SeriesKey]][]).map(
          ([key, config]) => (
            <button
              key={key}
              onClick={() => toggle(key)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                active.has(key)
                  ? "border-transparent text-white"
                  : "border-gray-300 bg-white text-gray-500 hover:bg-gray-50"
              )}
              style={active.has(key) ? { backgroundColor: config.color } : undefined}
            >
              {config.label}
            </button>
          )
        )}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={350}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 11 }} />
          <YAxis
            yAxisId="left"
            tickFormatter={fmtCurrency}
            tick={{ fontSize: 11 }}
            width={65}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={(v) => active.has("roas") ? v.toFixed(1) : fmtCurrency(v)}
            tick={{ fontSize: 11 }}
            width={60}
          />
          <Tooltip
            formatter={tooltipFmt}
            labelFormatter={(label) => {
              const [y, m, d] = String(label).split("-");
              return `${d}/${m}/${y}`;
            }}
          />

          {active.has("revenue") && (
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="revenue"
              fill="#2563eb"
              fillOpacity={0.08}
              stroke="#2563eb"
              strokeWidth={2}
              dot={false}
              name="revenue"
            />
          )}
          {active.has("prevRevenue") && (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="prevRevenue"
              stroke="#93c5fd"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              dot={false}
              name="prevRevenue"
            />
          )}
          {active.has("adSpend") && (
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="adSpend"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
              name="adSpend"
            />
          )}
          {active.has("roas") && (
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="roas"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              name="roas"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
