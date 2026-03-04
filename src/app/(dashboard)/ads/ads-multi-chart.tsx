"use client";

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface DailyData {
  date: string;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
}

interface Props {
  data: DailyData[];
}

const eurFormatter = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
});

export function AdsMultiChart({ data }: Props) {
  const chartData = data.map((d) => ({
    ...d,
    roas: d.spend > 0 ? d.revenue / d.spend : 0,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance Giornaliera</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" fontSize={12} />
            <YAxis
              yAxisId="eur"
              fontSize={12}
              tickFormatter={(v) => `\u20AC${v}`}
            />
            <YAxis
              yAxisId="roas"
              orientation="right"
              fontSize={12}
              tickFormatter={(v: number) => `${v.toFixed(1)}x`}
            />
            <Tooltip
              formatter={(value, name) => {
                const v = typeof value === "number" ? value : 0;
                if (name === "roas")
                  return [`${v.toFixed(2)}x`, "ROAS"];
                if (name === "spend")
                  return [eurFormatter.format(v), "Spesa"];
                if (name === "revenue")
                  return [eurFormatter.format(v), "Revenue"];
                return [v, name];
              }}
            />
            <Legend />
            <Area
              yAxisId="eur"
              type="monotone"
              dataKey="spend"
              name="Spesa"
              fill="#3b82f6"
              fillOpacity={0.1}
              stroke="#3b82f6"
              strokeWidth={2}
            />
            <Line
              yAxisId="eur"
              type="monotone"
              dataKey="revenue"
              name="Revenue"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
            />
            <Line
              yAxisId="roas"
              type="monotone"
              dataKey="roas"
              name="ROAS"
              stroke="#f59e0b"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
