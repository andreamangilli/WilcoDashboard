"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CampaignData {
  campaign_name: string;
  spend: number;
  revenue: number;
}

interface Props {
  data: CampaignData[];
}

const eurFormatter = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

export function AdsCampaignBreakdown({ data }: Props) {
  const top10 = data
    .filter((c) => c.spend > 0)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 10)
    .map((c) => ({
      ...c,
      name: c.campaign_name.length > 30 ? c.campaign_name.slice(0, 27) + "..." : c.campaign_name,
    }));

  if (top10.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Campagne per Spesa</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={Math.max(250, top10.length * 45)}>
          <BarChart data={top10} layout="vertical" margin={{ left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" fontSize={12} tickFormatter={(v) => `€${v}`} />
            <YAxis type="category" dataKey="name" width={180} fontSize={11} />
            <Tooltip
              formatter={(value, name) => [
                eurFormatter.format(typeof value === "number" ? value : 0),
                name === "spend" ? "Spesa" : "Revenue",
              ]}
            />
            <Legend />
            <Bar dataKey="spend" name="Spesa" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            <Bar dataKey="revenue" name="Revenue" fill="#10b981" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
