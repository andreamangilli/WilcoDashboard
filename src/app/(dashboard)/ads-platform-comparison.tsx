"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface PlatformMetrics {
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
  roas: number;
}

interface Props {
  google: PlatformMetrics;
  meta: PlatformMetrics;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v);

export function AdsPlatformComparison({ google, meta }: Props) {
  const googleCpc = google.clicks > 0 ? google.spend / google.clicks : 0;
  const metaCpc = meta.clicks > 0 ? meta.spend / meta.clicks : 0;
  const googleCtr = google.impressions > 0 ? (google.clicks / google.impressions) * 100 : 0;
  const metaCtr = meta.impressions > 0 ? (meta.clicks / meta.impressions) * 100 : 0;

  const data = [
    { name: "Spesa", Google: google.spend, Meta: meta.spend },
    { name: "Revenue", Google: google.revenue, Meta: meta.revenue },
    { name: "ROAS", Google: google.roas, Meta: meta.roas },
    { name: "CPC", Google: googleCpc, Meta: metaCpc },
    { name: "CTR %", Google: googleCtr, Meta: metaCtr },
  ];

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout="vertical" barGap={2}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" tick={{ fontSize: 11 }} />
        <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={65} />
        <Tooltip
          formatter={(
            value: number | undefined,
            name: string | undefined,
            item: { payload?: { name?: string } },
          ) => {
            const v = value ?? 0;
            const n = name ?? "";
            const metric = item.payload?.name;
            if (metric === "CTR %") return [`${v.toFixed(2)}%`, n];
            if (metric === "ROAS") return [v.toFixed(2), n];
            return [fmt(v), n];
          }}
        />
        <Legend />
        <Bar dataKey="Google" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={14} />
        <Bar dataKey="Meta" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
}
