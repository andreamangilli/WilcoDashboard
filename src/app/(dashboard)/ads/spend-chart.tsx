"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  data: { date: string; spend: number; clicks: number; conversions: number }[];
}

export function SpendChart({ data }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Spesa Giornaliera</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip
              formatter={(value: number | undefined) =>
                new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value ?? 0)
              }
            />
            <Line type="monotone" dataKey="spend" stroke="#2563eb" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
