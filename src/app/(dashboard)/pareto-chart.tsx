"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { ParetoResult } from "@/lib/queries/strategic";

interface Props {
  data: ParetoResult;
}

const fmt = (value: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value);

function hhiLabel(hhi: number): { text: string; color: string } {
  if (hhi > 0.25) return { text: "Concentrazione Alta", color: "text-red-600" };
  if (hhi > 0.15) return { text: "Concentrazione Media", color: "text-amber-600" };
  return { text: "Concentrazione Bassa", color: "text-green-600" };
}

export function ParetoChart({ data }: Props) {
  if (data.products.top_items.length === 0) {
    return <p className="text-sm text-gray-500">Nessun dato prodotti nel periodo.</p>;
  }

  // Build chart data with cumulative %
  const chartData = data.products.top_items.reduce<
    { name: string; revenue: number; pct: number; cumulative: number }[]
  >((acc, item) => {
    const prev = acc.length > 0 ? acc[acc.length - 1].cumulative : 0;
    acc.push({
      name: item.name.length > 20 ? item.name.slice(0, 18) + "…" : item.name,
      revenue: item.revenue,
      pct: item.pct,
      cumulative: prev + item.pct,
    });
    return acc;
  }, []);

  const hhi = hhiLabel(data.channels.hhi);

  return (
    <div className="space-y-4">
      {/* Product Pareto */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-700">
            Top 20% → {data.products.concentration_pct}% fatturato
          </span>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={chartData} layout="horizontal" margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={50} />
            <YAxis yAxisId="left" tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
            <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} domain={[0, 100]} />
            <Tooltip formatter={(value, name) => name === "cumulative" ? `${value}%` : fmt(Number(value))} />
            <Legend />
            <Bar yAxisId="left" dataKey="revenue" name="Fatturato" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="cumulative" name="Cumulativo %" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Channel Concentration */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Concentrazione Canali</p>
          <span className={`text-xs font-semibold ${hhi.color}`}>{hhi.text}</span>
        </div>
        <div className="space-y-1.5">
          {data.channels.items.map((ch) => (
            <div key={ch.name} className="flex items-center gap-2">
              <span className="w-20 truncate text-xs text-gray-600">{ch.name}</span>
              <div className="flex-1">
                <div className="h-3 rounded-full bg-gray-100">
                  <div
                    className="h-3 rounded-full bg-blue-500 transition-all"
                    style={{ width: `${Math.min(ch.pct, 100)}%` }}
                  />
                </div>
              </div>
              <span className="w-10 text-right text-xs font-medium text-gray-700">{ch.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
