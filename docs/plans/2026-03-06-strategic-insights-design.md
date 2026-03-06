# Strategic Insights Dashboard Enrichment

**Date:** 2026-03-06
**Status:** Approved

## Overview

Enrich the overview page (`src/app/(dashboard)/page.tsx`) with 4 new strategic sections below existing content. All data comes from existing Supabase tables. No external APIs needed.

## Architecture

### New Query Functions (`src/lib/queries/strategic.ts`)

All functions follow existing pattern: server-side, `createServiceClient()`, `unstable_cache()` with 30-min revalidation.

#### 1. `getCampaignMatrix(from, to)`
Returns campaigns with spend + ROAS, classified into quadrants:
- `scale` (ROAS >= 2.0, spend >= median)
- `opportunity` (ROAS >= 2.0, spend < median)
- `cut` (ROAS < 2.0, spend >= median)
- `watch` (ROAS < 2.0, spend < median)

Source tables: `ad_campaigns`, `ad_spend_daily`

```ts
type CampaignQuadrant = 'scale' | 'opportunity' | 'cut' | 'watch'
interface CampaignMatrixItem {
  campaign_id: string
  campaign_name: string
  platform: 'google' | 'meta'
  total_spend: number
  total_revenue: number
  roas: number
  quadrant: CampaignQuadrant
}
```

#### 2. `getParetoAnalysis(from, to)`
Calculates 80/20 concentration for products and channels.

Source tables: `shopify_orders`, `amazon_orders`

```ts
interface ParetoResult {
  products: {
    top20pct_count: number
    top20pct_revenue: number
    total_revenue: number
    concentration_pct: number  // e.g. 78 = "top 20% generates 78%"
    top_items: { name: string; revenue: number; pct: number }[]
  }
  channels: {
    items: { name: string; revenue: number; pct: number }[]
    hhi: number  // Herfindahl index for concentration risk
  }
}
```

#### 3. `getCustomerHealth(from, to)`
Customer behavior metrics from Shopify data.

Source tables: `shopify_customers`, `shopify_orders`

```ts
interface CustomerHealth {
  total_customers: number
  repeat_customers: number
  repeat_rate: number          // repeat/total as %
  avg_ltv: number              // avg total_spent per customer
  avg_orders_per_customer: number
  new_customers_period: number // customers with first_order in period
  returning_orders_period: number
  aov_current: number
  aov_previous: number
  aov_change_pct: number
}
```

#### 4. `getStrategicRecommendations(from, to)`
Generates actionable recommendations by analyzing all data through marketing frameworks.

Returns array of recommendations, each framed with a psychology principle:

```ts
type Framework = 'loss_aversion' | 'pareto' | 'anchoring' | 'theory_of_constraints' | 'second_order' | 'barbell'
type Priority = 'high' | 'medium' | 'low'

interface StrategicRecommendation {
  framework: Framework
  framework_label: string  // Italian
  title: string
  description: string
  metric?: string          // e.g. "€1.234" or "78%"
  priority: Priority
}
```

Logic:
- **Loss Aversion**: Find campaigns with ROAS < 1.0, calculate wasted spend
- **Pareto**: If top 20% products > 75% revenue, suggest focus
- **Anchoring**: Compare Google vs Meta CPA, flag >30% difference
- **Theory of Constraints**: Identify bottleneck (traffic vs conversion vs AOV)
- **Second-Order**: Detect ROAS declining trends (3+ days)
- **Barbell**: Check if ad budget follows 80/20 proven/experimental split

## New Components

### 1. `CampaignMatrix` (client component)
- `src/app/(dashboard)/campaign-matrix.tsx`
- Recharts ScatterChart with 4 colored quadrants
- X-axis: spend, Y-axis: ROAS
- Reference lines at median spend and ROAS=2.0
- Tooltip showing campaign name, platform, spend, ROAS
- Legend with quadrant labels in Italian

### 2. `ParetoChart` (client component)
- `src/app/(dashboard)/pareto-chart.tsx`
- Horizontal bar chart: top products by revenue with cumulative % line
- Below: channel concentration bars with HHI risk indicator
- Badge: "Concentrazione alta/media/bassa"

### 3. `CustomerHealthPanel` (server component)
- `src/app/(dashboard)/customer-health-panel.tsx`
- 4 mini KPI cards in a row: Tasso Riacquisto, LTV Medio, Nuovi Clienti, AOV Trend
- Each with sparkline or change arrow
- Uses existing KpiCard component where possible

### 4. `StrategicAdvisor` (server component)
- `src/app/(dashboard)/strategic-advisor.tsx`
- Card with "Consigliere Strategico" title
- List of recommendations, each with:
  - Framework badge (colored by type)
  - Priority indicator (high=red, medium=amber, low=blue)
  - Title + description text
  - Optional metric highlight
- Max 6 recommendations, sorted by priority

## Page Layout Changes

In `src/app/(dashboard)/page.tsx`, add after existing Section 4 (Insights & Signals):

```
Section 5: Campaign Matrix + Customer Health (2-column)
  Left: CampaignMatrix (col-span-7)
  Right: CustomerHealthPanel (col-span-5)

Section 6: Pareto Analysis + Strategic Advisor (2-column)
  Left: ParetoChart (col-span-5)
  Right: StrategicAdvisor (col-span-7)
```

## Data Flow

```
page.tsx (RSC)
  ├── getCampaignMatrix(from, to)     → CampaignMatrix (client)
  ├── getParetoAnalysis(from, to)     → ParetoChart (client)
  ├── getCustomerHealth(from, to)     → CustomerHealthPanel (server)
  └── getStrategicRecommendations()   → StrategicAdvisor (server)
```

All queries run in parallel via Promise.all in the page component.

## Italian Labels

- Matrice Campagne / Scala / Opportunita' / Taglia / Monitora
- Analisi Pareto / Concentrazione Alta-Media-Bassa
- Salute Clienti / Tasso Riacquisto / LTV Medio / Nuovi Clienti / Trend AOV
- Consigliere Strategico / with framework names in Italian

## Testing

Add `src/lib/__tests__/strategic.test.ts`:
- Test quadrant classification logic
- Test Pareto calculation (known input → expected concentration)
- Test recommendation generation with mock data
- Test edge cases (no campaigns, no customers, empty periods)
