"use client";

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";
import type { CampaignMatrixItem, CampaignQuadrant } from "@/lib/queries/strategic";

interface Props {
  data: CampaignMatrixItem[];
  medianSpend: number;
}

const quadrantColors: Record<CampaignQuadrant, string> = {
  scale: "#10b981",
  opportunity: "#3b82f6",
  cut: "#ef4444",
  watch: "#f59e0b",
};

const quadrantLabels: Record<CampaignQuadrant, string> = {
  scale: "Scala",
  opportunity: "Opportunità",
  cut: "Taglia",
  watch: "Monitora",
};

const fmt = (value: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value);

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: CampaignMatrixItem }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-md">
      <p className="text-sm font-semibold">{d.campaign_name}</p>
      <p className="text-xs text-gray-500 capitalize">{d.platform}</p>
      <p className="mt-1 text-xs">Spesa: {fmt(d.total_spend)}</p>
      <p className="text-xs">ROAS: {d.roas.toFixed(2)}x</p>
      <p className="text-xs">
        Quadrante:{" "}
        <span style={{ color: quadrantColors[d.quadrant] }} className="font-semibold">
          {quadrantLabels[d.quadrant]}
        </span>
      </p>
    </div>
  );
}

export function CampaignMatrix({ data, medianSpend }: Props) {
  if (data.length === 0) {
    return <p className="text-sm text-gray-500">Nessuna campagna con spesa nel periodo.</p>;
  }

  // Group by quadrant for colored scatter layers
  const grouped = Object.entries(quadrantColors).map(([q, color]) => ({
    quadrant: q as CampaignQuadrant,
    color,
    label: quadrantLabels[q as CampaignQuadrant],
    items: data.filter((d) => d.quadrant === q),
  }));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          type="number"
          dataKey="total_spend"
          name="Spesa"
          tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
          tick={{ fontSize: 11 }}
        />
        <YAxis
          type="number"
          dataKey="roas"
          name="ROAS"
          tickFormatter={(v) => `${Number(v).toFixed(1)}x`}
          tick={{ fontSize: 11 }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <ReferenceLine y={2.0} stroke="#6b7280" strokeDasharray="4 4" label={{ value: "ROAS 2.0", position: "insideTopLeft", fontSize: 10 }} />
        <ReferenceLine x={medianSpend} stroke="#6b7280" strokeDasharray="4 4" label={{ value: "Mediana", position: "insideTopRight", fontSize: 10 }} />
        {grouped.map(({ quadrant, color, label, items }) =>
          items.length > 0 ? (
            <Scatter key={quadrant} name={label} data={items} fill={color} />
          ) : null
        )}
      </ScatterChart>
    </ResponsiveContainer>
  );
}
