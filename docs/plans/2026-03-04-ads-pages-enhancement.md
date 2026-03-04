# Ads Pages Enhancement — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve `/ads/meta` and `/ads/google` pages with richer KPIs (CTR, CPM, CPA, Reach, Frequency), multi-metric charts, campaign breakdown chart, interactive table with sorting/filtering, and per-campaign detail pages.

**Architecture:** Incremental evolution of existing RSC pages. New client components for charts and interactive table. One new query function. One DB migration for reach/frequency columns. Meta sync updated to fetch reach/frequency.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Supabase, Recharts, shadcn/ui, Tailwind CSS v4

---

### Task 1: DB Migration — Add reach and frequency columns

**Files:**
- Create: `supabase/migrations/005_add_reach_frequency.sql`

**Step 1: Write migration SQL**

```sql
ALTER TABLE ad_spend_daily
ADD COLUMN IF NOT EXISTS reach INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS frequency NUMERIC(10,4) DEFAULT 0;
```

**Step 2: Apply migration**

Run: `npx supabase db push` or apply directly via Supabase dashboard SQL editor.

**Step 3: Commit**

```bash
git add supabase/migrations/005_add_reach_frequency.sql
git commit -m "feat: add reach and frequency columns to ad_spend_daily"
```

---

### Task 2: Update Meta sync — fetch reach and frequency

**Files:**
- Modify: `src/lib/sync/meta-ads.ts`

**Step 1: Add reach,frequency to insights fields**

In `syncMetaAds`, change the insights fetch `fields` parameter from:
```
"spend,impressions,clicks,actions,action_values"
```
to:
```
"spend,impressions,clicks,actions,action_values,reach,frequency"
```

**Step 2: Add reach/frequency to the upsert object**

In the `for (const day of insightsData.data || [])` loop, add to the upsert object:
```typescript
reach: parseInt(day.reach || "0"),
frequency: parseFloat(day.frequency || "0"),
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds with no errors.

**Step 4: Commit**

```bash
git add src/lib/sync/meta-ads.ts
git commit -m "feat: sync reach and frequency from Meta Ads API"
```

---

### Task 3: New query — getCampaignDailySpend

**Files:**
- Modify: `src/lib/queries/ads.ts`

**Step 1: Add getCampaignDailySpend function**

Append after `getAdsDailySpend`:

```typescript
export const getCampaignDailySpend = unstable_cache(
  async (campaignId: string, period: string, from?: string, to?: string) => {
    const supabase = await createServiceClient();
    const { start, end } = getDateRange(period, from, to);

    const { data } = await supabase
      .from('ad_spend_daily')
      .select('date, spend, impressions, clicks, conversions, revenue')
      .eq('campaign_id', campaignId)
      .gte('date', start.split('T')[0])
      .lte('date', end.split('T')[0])
      .order('date');

    return (data || []).map((row) => ({
      date: row.date,
      spend: row.spend || 0,
      impressions: row.impressions || 0,
      clicks: row.clicks || 0,
      conversions: row.conversions || 0,
      revenue: row.revenue || 0,
    }));
  },
  ['campaign-daily-spend-v1'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);
```

**Step 2: Add getCampaignInfo helper**

Append after `getCampaignDailySpend`:

```typescript
export const getCampaignInfo = unstable_cache(
  async (campaignId: string) => {
    const supabase = await createServiceClient();
    const { data } = await supabase
      .from('ad_campaigns')
      .select('id, ad_account_id, campaign_id, campaign_name, status, daily_budget')
      .eq('campaign_id', campaignId)
      .single();
    return data;
  },
  ['campaign-info-v1'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add src/lib/queries/ads.ts
git commit -m "feat: add getCampaignDailySpend and getCampaignInfo queries"
```

---

### Task 4: Multi-metric chart component

**Files:**
- Create: `src/app/(dashboard)/ads/ads-multi-chart.tsx`

**Step 1: Create the ComposedChart component**

```typescript
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
              tickFormatter={(v) => `€${v}`}
            />
            <YAxis
              yAxisId="roas"
              orientation="right"
              fontSize={12}
              tickFormatter={(v) => `${v.toFixed(1)}x`}
            />
            <Tooltip
              formatter={(value: number, name: string) => {
                if (name === "roas") return [`${value.toFixed(2)}x`, "ROAS"];
                if (name === "spend") return [eurFormatter.format(value), "Spesa"];
                if (name === "revenue") return [eurFormatter.format(value), "Revenue"];
                return [value, name];
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
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/app/\(dashboard\)/ads/ads-multi-chart.tsx
git commit -m "feat: add multi-metric ads chart component"
```

---

### Task 5: Campaign breakdown chart component

**Files:**
- Create: `src/app/(dashboard)/ads/ads-campaign-breakdown.tsx`

**Step 1: Create the horizontal bar chart component**

```typescript
"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
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

const eurFormatter = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
});

export function AdsCampaignBreakdown({ data }: Props) {
  const top10 = data
    .filter((c) => c.spend > 0)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 10)
    .map((c) => ({
      ...c,
      name: c.campaign_name.length > 30
        ? c.campaign_name.slice(0, 27) + "..."
        : c.campaign_name,
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
              formatter={(value: number, name: string) => [
                eurFormatter.format(value),
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
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/app/\(dashboard\)/ads/ads-campaign-breakdown.tsx
git commit -m "feat: add campaign breakdown chart component"
```

---

### Task 6: Interactive campaigns table component

**Files:**
- Create: `src/app/(dashboard)/ads/ads-campaigns-table.tsx`

**Step 1: Create the interactive table component**

```typescript
"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatNumber } from "@/lib/format";
import { ArrowUp, ArrowDown } from "lucide-react";
import type { CampaignWithMetrics } from "@/lib/queries/ads";

type SortKey = "campaign_name" | "spend" | "revenue" | "roas" | "cpc" | "clicks" | "conversions";
type SortDir = "asc" | "desc";

interface Props {
  campaigns: CampaignWithMetrics[];
  platform: "meta" | "google";
}

const activeStatuses: Record<string, string[]> = {
  meta: ["ACTIVE"],
  google: ["ENABLED"],
};

const pausedStatuses = ["PAUSED", "INACTIVE"];

export function AdsCampaignsTable({ campaigns, platform }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    let result = campaigns;
    if (statusFilter === "active") {
      result = result.filter((c) => activeStatuses[platform].includes(c.status));
    } else if (statusFilter === "paused") {
      result = result.filter((c) => pausedStatuses.includes(c.status));
    } else if (statusFilter === "removed") {
      result = result.filter((c) => c.status === "REMOVED");
    }
    return result;
  }, [campaigns, statusFilter, platform]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function SortHeader({ label, field }: { label: string; field: SortKey }) {
    const active = sortKey === field;
    return (
      <button
        onClick={() => toggleSort(field)}
        className="inline-flex items-center gap-1 hover:text-gray-900"
      >
        {label}
        {active && (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    );
  }

  const isActive = (status: string) =>
    activeStatuses[platform].includes(status);

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Filtra per stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte</SelectItem>
            <SelectItem value="active">Attive</SelectItem>
            <SelectItem value="paused">In pausa</SelectItem>
            {platform === "google" && <SelectItem value="removed">Rimosse</SelectItem>}
          </SelectContent>
        </Select>
        <span className="text-sm text-gray-500">{sorted.length} campagne</span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead><SortHeader label="Campagna" field="campaign_name" /></TableHead>
            <TableHead>Stato</TableHead>
            <TableHead className="text-right">Budget/g</TableHead>
            <TableHead className="text-right"><SortHeader label="Spesa" field="spend" /></TableHead>
            <TableHead className="text-right"><SortHeader label="Revenue" field="revenue" /></TableHead>
            <TableHead className="text-right"><SortHeader label="ROAS" field="roas" /></TableHead>
            <TableHead className="text-right"><SortHeader label="CPC" field="cpc" /></TableHead>
            <TableHead className="text-right"><SortHeader label="Click" field="clicks" /></TableHead>
            <TableHead className="text-right"><SortHeader label="Conv." field="conversions" /></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="py-8 text-center text-sm text-gray-500">
                Nessuna campagna trovata.
              </TableCell>
            </TableRow>
          ) : (
            sorted.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/ads/${platform}/${c.campaign_id}`}
                    className="hover:underline"
                  >
                    {c.campaign_name}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={isActive(c.status) ? "default" : "secondary"}>
                    {c.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {c.daily_budget ? formatCurrency(c.daily_budget) : "—"}
                </TableCell>
                <TableCell className="text-right">{formatCurrency(c.spend)}</TableCell>
                <TableCell className="text-right">{formatCurrency(c.revenue)}</TableCell>
                <TableCell className="text-right">
                  {c.spend > 0 ? (
                    <Badge variant={c.roas < 2 ? "destructive" : c.roas < 3 ? "outline" : "default"}>
                      {c.roas.toFixed(1)}x
                    </Badge>
                  ) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {c.cpc > 0 ? formatCurrency(c.cpc) : "—"}
                </TableCell>
                <TableCell className="text-right">{formatNumber(c.clicks)}</TableCell>
                <TableCell className="text-right">{formatNumber(c.conversions)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/app/\(dashboard\)/ads/ads-campaigns-table.tsx
git commit -m "feat: add interactive campaigns table with sort and filter"
```

---

### Task 7: Update Meta Ads page

**Files:**
- Modify: `src/app/(dashboard)/ads/meta/page.tsx`

**Step 1: Replace the entire page with updated version**

```typescript
export const dynamic = 'force-dynamic';

import { PageHeader } from "@/components/page-header";
import { DateRangePicker } from "@/components/date-range-picker";
import { KpiCard } from "@/components/kpi-card";
import {
  getAdsOverview,
  getAdsCampaignsWithMetrics,
  getAdsDailySpend,
} from "@/lib/queries/ads";
import { AdsMultiChart } from "../ads-multi-chart";
import { AdsCampaignBreakdown } from "../ads-campaign-breakdown";
import { AdsCampaignsTable } from "../ads-campaigns-table";

interface Props {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}

export default async function MetaAdsPage({ searchParams }: Props) {
  const { period = "30d", from, to } = await searchParams;
  const [overview, campaigns, dailySpend] = await Promise.all([
    getAdsOverview(period, from, to),
    getAdsCampaignsWithMetrics("meta", period, from, to),
    getAdsDailySpend("meta", period, from, to),
  ]);

  const m = overview.meta;
  const cpc = m.clicks > 0 ? m.spend / m.clicks : 0;
  const ctr = m.impressions > 0 ? (m.clicks / m.impressions) * 100 : 0;
  const cpm = m.impressions > 0 ? (m.spend / m.impressions) * 1000 : 0;
  const cpa = m.conversions > 0 ? m.spend / m.conversions : 0;

  return (
    <div>
      <PageHeader title="Meta Ads" description="Campagne e performance">
        <DateRangePicker />
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-5">
        <KpiCard title="Spesa" value={m.spend} format="currency" />
        <KpiCard title="Revenue" value={m.revenue} format="currency" variant="green" />
        <KpiCard title="ROAS" value={m.roas} format="number" variant="violet" />
        <KpiCard title="CPA" value={cpa} format="currency" variant="amber" />
        <KpiCard title="Conversioni" value={m.conversions} format="number" variant="rose" />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <KpiCard title="CTR" value={ctr} format="percent" />
        <KpiCard title="CPM" value={cpm} format="currency" />
        <KpiCard title="CPC" value={cpc} format="currency" />
      </div>

      <div className="mb-8 space-y-6">
        <AdsMultiChart data={dailySpend} />
        <AdsCampaignBreakdown data={campaigns} />
      </div>

      <AdsCampaignsTable campaigns={campaigns} platform="meta" />
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/app/\(dashboard\)/ads/meta/page.tsx
git commit -m "feat: update Meta Ads page with new KPIs, charts, and interactive table"
```

---

### Task 8: Update Google Ads page

**Files:**
- Modify: `src/app/(dashboard)/ads/google/page.tsx`

**Step 1: Replace the entire page with updated version**

Same structure as Meta page but using `overview.google` and `platform="google"`, without Reach/Frequency KPI cards.

```typescript
export const dynamic = 'force-dynamic';

import { PageHeader } from "@/components/page-header";
import { DateRangePicker } from "@/components/date-range-picker";
import { KpiCard } from "@/components/kpi-card";
import {
  getAdsOverview,
  getAdsCampaignsWithMetrics,
  getAdsDailySpend,
} from "@/lib/queries/ads";
import { AdsMultiChart } from "../ads-multi-chart";
import { AdsCampaignBreakdown } from "../ads-campaign-breakdown";
import { AdsCampaignsTable } from "../ads-campaigns-table";

interface Props {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}

export default async function GoogleAdsPage({ searchParams }: Props) {
  const { period = "30d", from, to } = await searchParams;
  const [overview, campaigns, dailySpend] = await Promise.all([
    getAdsOverview(period, from, to),
    getAdsCampaignsWithMetrics("google", period, from, to),
    getAdsDailySpend("google", period, from, to),
  ]);

  const g = overview.google;
  const cpc = g.clicks > 0 ? g.spend / g.clicks : 0;
  const ctr = g.impressions > 0 ? (g.clicks / g.impressions) * 100 : 0;
  const cpm = g.impressions > 0 ? (g.spend / g.impressions) * 1000 : 0;
  const cpa = g.conversions > 0 ? g.spend / g.conversions : 0;

  return (
    <div>
      <PageHeader title="Google Ads" description="Campagne e performance">
        <DateRangePicker />
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-5">
        <KpiCard title="Spesa" value={g.spend} format="currency" />
        <KpiCard title="Revenue" value={g.revenue} format="currency" variant="green" />
        <KpiCard title="ROAS" value={g.roas} format="number" variant="violet" />
        <KpiCard title="CPA" value={cpa} format="currency" variant="amber" />
        <KpiCard title="Conversioni" value={g.conversions} format="number" variant="rose" />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <KpiCard title="CTR" value={ctr} format="percent" />
        <KpiCard title="CPM" value={cpm} format="currency" />
        <KpiCard title="CPC" value={cpc} format="currency" />
      </div>

      <div className="mb-8 space-y-6">
        <AdsMultiChart data={dailySpend} />
        <AdsCampaignBreakdown data={campaigns} />
      </div>

      <AdsCampaignsTable campaigns={campaigns} platform="google" />
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/app/\(dashboard\)/ads/google/page.tsx
git commit -m "feat: update Google Ads page with new KPIs, charts, and interactive table"
```

---

### Task 9: Campaign detail page — Meta

**Files:**
- Create: `src/app/(dashboard)/ads/meta/[campaignId]/page.tsx`
- Create: `src/app/(dashboard)/ads/meta/[campaignId]/loading.tsx`

**Step 1: Create detail page**

```typescript
export const dynamic = 'force-dynamic';

import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { DateRangePicker } from "@/components/date-range-picker";
import { KpiCard } from "@/components/kpi-card";
import { Badge } from "@/components/ui/badge";
import { getCampaignDailySpend, getCampaignInfo } from "@/lib/queries/ads";
import { AdsMultiChart } from "../../ads-multi-chart";

interface Props {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}

export default async function MetaCampaignDetailPage({ params, searchParams }: Props) {
  const { campaignId } = await params;
  const { period = "30d", from, to } = await searchParams;

  const [campaign, dailySpend] = await Promise.all([
    getCampaignInfo(campaignId),
    getCampaignDailySpend(campaignId, period, from, to),
  ]);

  if (!campaign) return notFound();

  const totals = dailySpend.reduce(
    (acc, d) => ({
      spend: acc.spend + d.spend,
      revenue: acc.revenue + d.revenue,
      clicks: acc.clicks + d.clicks,
      conversions: acc.conversions + d.conversions,
      impressions: acc.impressions + d.impressions,
    }),
    { spend: 0, revenue: 0, clicks: 0, conversions: 0, impressions: 0 }
  );

  const roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;
  const cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
  const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;

  return (
    <div>
      <PageHeader
        title={campaign.campaign_name || "Campagna"}
        description={
          <Badge variant={campaign.status === "ACTIVE" ? "default" : "secondary"}>
            {campaign.status}
          </Badge>
        }
      >
        <DateRangePicker />
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard title="Spesa" value={totals.spend} format="currency" />
        <KpiCard title="Revenue" value={totals.revenue} format="currency" variant="green" />
        <KpiCard title="ROAS" value={roas} format="number" variant="violet" />
        <KpiCard title="CPC" value={cpc} format="currency" variant="amber" />
        <KpiCard title="CTR" value={ctr} format="percent" />
        <KpiCard title="Conversioni" value={totals.conversions} format="number" variant="rose" />
      </div>

      <AdsMultiChart data={dailySpend} />
    </div>
  );
}
```

**Step 2: Create loading skeleton**

```typescript
export default function CampaignDetailLoading() {
  return (
    <div>
      <div className="mb-8 flex items-center justify-between border-b border-gray-200 pb-5">
        <div className="h-6 w-48 animate-pulse rounded-md bg-gray-200" />
        <div className="h-9 w-64 animate-pulse rounded-lg bg-gray-100" />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="h-3 w-20 animate-pulse rounded bg-gray-200" />
            <div className="mt-3 h-7 w-16 animate-pulse rounded bg-gray-200" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="h-[350px] animate-pulse rounded-lg bg-gray-100" />
      </div>
    </div>
  );
}
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds. New route `/ads/meta/[campaignId]` appears in output.

**Step 4: Commit**

```bash
git add src/app/\(dashboard\)/ads/meta/\[campaignId\]/
git commit -m "feat: add Meta campaign detail page"
```

---

### Task 10: Campaign detail page — Google

**Files:**
- Create: `src/app/(dashboard)/ads/google/[campaignId]/page.tsx`
- Create: `src/app/(dashboard)/ads/google/[campaignId]/loading.tsx`

**Step 1: Create detail page**

Identical to Meta detail page except:
- Badge variant check: `campaign.status === "ENABLED"` instead of `"ACTIVE"`

```typescript
export const dynamic = 'force-dynamic';

import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { DateRangePicker } from "@/components/date-range-picker";
import { KpiCard } from "@/components/kpi-card";
import { Badge } from "@/components/ui/badge";
import { getCampaignDailySpend, getCampaignInfo } from "@/lib/queries/ads";
import { AdsMultiChart } from "../../ads-multi-chart";

interface Props {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}

export default async function GoogleCampaignDetailPage({ params, searchParams }: Props) {
  const { campaignId } = await params;
  const { period = "30d", from, to } = await searchParams;

  const [campaign, dailySpend] = await Promise.all([
    getCampaignInfo(campaignId),
    getCampaignDailySpend(campaignId, period, from, to),
  ]);

  if (!campaign) return notFound();

  const totals = dailySpend.reduce(
    (acc, d) => ({
      spend: acc.spend + d.spend,
      revenue: acc.revenue + d.revenue,
      clicks: acc.clicks + d.clicks,
      conversions: acc.conversions + d.conversions,
      impressions: acc.impressions + d.impressions,
    }),
    { spend: 0, revenue: 0, clicks: 0, conversions: 0, impressions: 0 }
  );

  const roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;
  const cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
  const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;

  return (
    <div>
      <PageHeader
        title={campaign.campaign_name || "Campagna"}
        description={
          <Badge variant={campaign.status === "ENABLED" ? "default" : "secondary"}>
            {campaign.status}
          </Badge>
        }
      >
        <DateRangePicker />
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard title="Spesa" value={totals.spend} format="currency" />
        <KpiCard title="Revenue" value={totals.revenue} format="currency" variant="green" />
        <KpiCard title="ROAS" value={roas} format="number" variant="violet" />
        <KpiCard title="CPC" value={cpc} format="currency" variant="amber" />
        <KpiCard title="CTR" value={ctr} format="percent" />
        <KpiCard title="Conversioni" value={totals.conversions} format="number" variant="rose" />
      </div>

      <AdsMultiChart data={dailySpend} />
    </div>
  );
}
```

**Step 2: Create loading skeleton**

Same as Meta loading skeleton (copy from Task 9 Step 2).

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add src/app/\(dashboard\)/ads/google/\[campaignId\]/
git commit -m "feat: add Google campaign detail page"
```

---

### Task 11: Update loading skeletons

**Files:**
- Modify: `src/app/(dashboard)/ads/meta/loading.tsx`
- Modify: `src/app/(dashboard)/ads/google/loading.tsx`

**Step 1: Update Meta loading skeleton**

Update to reflect new layout: 2 rows of KPI cards (5 + 3), chart area, breakdown area, table with 9 columns.

```typescript
export default function MetaAdsLoading() {
  return (
    <div>
      <div className="mb-8 flex items-center justify-between border-b border-gray-200 pb-5">
        <div className="h-6 w-28 animate-pulse rounded-md bg-gray-200" />
        <div className="h-9 w-64 animate-pulse rounded-lg bg-gray-100" />
      </div>
      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="h-3 w-20 animate-pulse rounded bg-gray-200" />
            <div className="mt-3 h-7 w-16 animate-pulse rounded bg-gray-200" />
          </div>
        ))}
      </div>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="h-3 w-20 animate-pulse rounded bg-gray-200" />
            <div className="mt-3 h-7 w-16 animate-pulse rounded bg-gray-200" />
          </div>
        ))}
      </div>
      <div className="mb-8 space-y-6">
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="h-[350px] animate-pulse rounded-lg bg-gray-100" />
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="h-60 animate-pulse rounded-lg bg-gray-100" />
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 flex gap-6">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-3 w-14 animate-pulse rounded bg-gray-200" />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-6 px-4 py-3 border-t border-gray-100">
            {Array.from({ length: 9 }).map((_, j) => (
              <div key={j} className="h-4 w-14 animate-pulse rounded bg-gray-100" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Update Google loading skeleton**

Same as Meta loading skeleton (copy).

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add src/app/\(dashboard\)/ads/meta/loading.tsx src/app/\(dashboard\)/ads/google/loading.tsx
git commit -m "feat: update ads loading skeletons for new layout"
```

---

### Task 12: Final verification and deploy

**Step 1: Full build**

Run: `npm run build`
Expected: Build succeeds with all new routes visible.

**Step 2: Lint**

Run: `npm run lint`
Expected: No errors.

**Step 3: Push**

```bash
git push
```

Expected: Vercel auto-deploys.
