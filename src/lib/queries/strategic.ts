import { unstable_cache } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/server';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { getDateRange } from './utils';

// ── Types ──────────────────────────────────────────────────────

export type CampaignQuadrant = 'scale' | 'opportunity' | 'cut' | 'watch';

export interface CampaignMatrixItem {
  campaign_id: string;
  campaign_name: string;
  platform: 'google' | 'meta';
  total_spend: number;
  total_revenue: number;
  roas: number;
  quadrant: CampaignQuadrant;
}

export interface ParetoResult {
  products: {
    top20pct_count: number;
    top20pct_revenue: number;
    total_revenue: number;
    concentration_pct: number;
    top_items: { name: string; revenue: number; pct: number }[];
  };
  channels: {
    items: { name: string; revenue: number; pct: number }[];
    hhi: number;
  };
}

export interface CustomerHealth {
  total_customers: number;
  repeat_customers: number;
  repeat_rate: number;
  avg_ltv: number;
  avg_orders_per_customer: number;
  new_customers_period: number;
  returning_orders_period: number;
  aov_current: number;
  aov_previous: number;
  aov_change_pct: number;
}

export type Framework = 'loss_aversion' | 'pareto' | 'anchoring' | 'theory_of_constraints' | 'second_order' | 'barbell';
export type Priority = 'high' | 'medium' | 'low';

export interface StrategicRecommendation {
  framework: Framework;
  framework_label: string;
  title: string;
  description: string;
  metric?: string;
  priority: Priority;
}

// ── Helpers ────────────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function classifyQuadrant(roas: number, spend: number, medianSpend: number): CampaignQuadrant {
  if (roas >= 2.0 && spend >= medianSpend) return 'scale';
  if (roas >= 2.0 && spend < medianSpend) return 'opportunity';
  if (roas < 2.0 && spend >= medianSpend) return 'cut';
  return 'watch';
}

export function calculateHHI(shares: number[]): number {
  return shares.reduce((sum, s) => sum + s * s, 0);
}

export function calculateParetoConcentration(items: { revenue: number }[]): {
  top20pct_count: number;
  top20pct_revenue: number;
  total_revenue: number;
  concentration_pct: number;
} {
  const sorted = [...items].sort((a, b) => b.revenue - a.revenue);
  const total = sorted.reduce((s, i) => s + i.revenue, 0);
  const top20Count = Math.max(1, Math.ceil(sorted.length * 0.2));
  const top20Revenue = sorted.slice(0, top20Count).reduce((s, i) => s + i.revenue, 0);
  return {
    top20pct_count: top20Count,
    top20pct_revenue: top20Revenue,
    total_revenue: total,
    concentration_pct: total > 0 ? Math.round((top20Revenue / total) * 100) : 0,
  };
}

export function generateRecommendations(input: {
  campaigns: CampaignMatrixItem[];
  pareto: ParetoResult;
  health: CustomerHealth;
  dailyRoas: { date: string; roas: number }[];
  googleCpa: number;
  metaCpa: number;
  totalAdSpend: number;
  provenSpend: number;
}): StrategicRecommendation[] {
  const recs: StrategicRecommendation[] = [];

  // 1. Loss Aversion: campaigns with ROAS < 1.0
  const losingCampaigns = input.campaigns.filter((c) => c.roas < 1.0 && c.total_spend > 0);
  if (losingCampaigns.length > 0) {
    const wastedSpend = losingCampaigns.reduce((s, c) => s + c.total_spend - c.total_revenue, 0);
    recs.push({
      framework: 'loss_aversion',
      framework_label: 'Avversione alla Perdita',
      title: `${losingCampaigns.length} campagne in perdita`,
      description: `Stai perdendo €${Math.round(wastedSpend).toLocaleString('it-IT')} su campagne con ROAS < 1.0. Ogni euro speso qui è un euro perso — rialloca il budget verso le campagne in quadrante "Scala".`,
      metric: `€${Math.round(wastedSpend).toLocaleString('it-IT')}`,
      priority: 'high',
    });
  }

  // 2. Pareto: high concentration
  if (input.pareto.products.concentration_pct > 75) {
    recs.push({
      framework: 'pareto',
      framework_label: 'Principio di Pareto',
      title: 'Alta concentrazione prodotti',
      description: `Il top 20% dei prodotti genera il ${input.pareto.products.concentration_pct}% del fatturato. Focalizza le campagne ads sui best-seller e valuta se gli altri prodotti meritano l'investimento pubblicitario.`,
      metric: `${input.pareto.products.concentration_pct}%`,
      priority: 'medium',
    });
  }

  // 3. Anchoring: CPA difference > 30%
  if (input.googleCpa > 0 && input.metaCpa > 0) {
    const maxCpa = Math.max(input.googleCpa, input.metaCpa);
    const minCpa = Math.min(input.googleCpa, input.metaCpa);
    const diff = (maxCpa - minCpa) / maxCpa;
    if (diff > 0.3) {
      const expensive = input.googleCpa > input.metaCpa ? 'Google' : 'Meta';
      const cheap = input.googleCpa > input.metaCpa ? 'Meta' : 'Google';
      recs.push({
        framework: 'anchoring',
        framework_label: 'Effetto Ancoraggio',
        title: `CPA ${expensive} molto più alto di ${cheap}`,
        description: `Il CPA su ${expensive} (€${maxCpa.toFixed(2)}) è ${Math.round(diff * 100)}% più alto di ${cheap} (€${minCpa.toFixed(2)}). Valuta se il canale più costoso genera clienti di qualità superiore o se conviene ribilanciare.`,
        metric: `€${maxCpa.toFixed(2)} vs €${minCpa.toFixed(2)}`,
        priority: 'medium',
      });
    }
  }

  // 4. Theory of Constraints: identify bottleneck
  const hasTraffic = input.campaigns.some((c) => c.total_spend > 0);
  if (hasTraffic) {
    const avgRoas = input.campaigns.reduce((s, c) => s + c.roas, 0) / input.campaigns.length;
    if (avgRoas < 1.5 && input.health.aov_current > 0) {
      recs.push({
        framework: 'theory_of_constraints',
        framework_label: 'Teoria dei Vincoli',
        title: 'Conversione è il collo di bottiglia',
        description: `ROAS medio basso (${avgRoas.toFixed(1)}x) nonostante spesa attiva. Il vincolo è nella conversione, non nel traffico. Concentrati su CRO, landing page e offerte prima di aumentare il budget ads.`,
        metric: `${avgRoas.toFixed(1)}x`,
        priority: 'high',
      });
    } else if (input.health.aov_current < input.health.aov_previous && input.health.aov_change_pct < -10) {
      recs.push({
        framework: 'theory_of_constraints',
        framework_label: 'Teoria dei Vincoli',
        title: 'AOV in calo significativo',
        description: `L'AOV è sceso del ${Math.abs(input.health.aov_change_pct).toFixed(0)}%. Il vincolo è nel valore per ordine. Valuta upsell, bundle, o soglie di spedizione gratuita per aumentare il carrello medio.`,
        metric: `${input.health.aov_change_pct.toFixed(0)}%`,
        priority: 'medium',
      });
    }
  }

  // 5. Second-Order: ROAS declining 3+ days
  if (input.dailyRoas.length >= 3) {
    let streak = 0;
    for (let i = 1; i < input.dailyRoas.length; i++) {
      if (input.dailyRoas[i].roas < input.dailyRoas[i - 1].roas) {
        streak++;
      } else {
        if (streak >= 2) break;
        streak = 0;
      }
    }
    if (streak >= 2) {
      recs.push({
        framework: 'second_order',
        framework_label: 'Pensiero di Secondo Ordine',
        title: `ROAS in calo da ${streak + 1} giorni`,
        description: `Il ROAS è in calo costante. Effetto di primo ordine: meno efficienza. Effetto di secondo ordine: se continua, erode il margine e costringe a tagliare budget, perdendo anche le campagne profittevoli.`,
        priority: 'high',
      });
    }
  }

  // 6. Barbell: check 80/20 budget split
  if (input.totalAdSpend > 0 && input.provenSpend > 0) {
    const provenPct = (input.provenSpend / input.totalAdSpend) * 100;
    if (provenPct < 70) {
      recs.push({
        framework: 'barbell',
        framework_label: 'Strategia Barbell',
        title: 'Troppo budget su campagne non provate',
        description: `Solo il ${Math.round(provenPct)}% del budget è su campagne con ROAS > 2.0. La strategia Barbell suggerisce 80% su campagne provate e 20% sperimentali. Ribilancia per ridurre il rischio.`,
        metric: `${Math.round(provenPct)}%`,
        priority: 'medium',
      });
    }
  }

  // Sort by priority and limit to 6
  const priorityOrder: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
  return recs.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]).slice(0, 6);
}

// ── Cached Queries ─────────────────────────────────────────────

export const getCampaignMatrix = unstable_cache(
  async (period: string, from?: string, to?: string): Promise<CampaignMatrixItem[]> => {
    const supabase = await createServiceClient();
    const { start, end } = getDateRange(period, from, to);
    const startDate = start.split('T')[0];
    const endDate = end.split('T')[0];

    const [{ data: campaigns }, { data: spendData }] = await Promise.all([
      supabase.from('ad_campaigns').select('campaign_id, campaign_name, ad_account_id'),
      supabase.from('ad_spend_daily').select('campaign_id, spend, revenue').gte('date', startDate).lte('date', endDate),
    ]);

    const [{ data: googleAccounts }, { data: metaAccounts }] = await Promise.all([
      supabase.from('ad_accounts').select('id').eq('platform', 'google'),
      supabase.from('ad_accounts').select('id').eq('platform', 'meta'),
    ]);
    const googleIds = new Set((googleAccounts || []).map((a) => a.id));
    const metaIds = new Set((metaAccounts || []).map((a) => a.id));

    // Aggregate spend by campaign
    const spendMap = new Map<string, { spend: number; revenue: number }>();
    for (const row of spendData || []) {
      const e = spendMap.get(row.campaign_id) ?? { spend: 0, revenue: 0 };
      e.spend += row.spend || 0;
      e.revenue += row.revenue || 0;
      spendMap.set(row.campaign_id, e);
    }

    const items: CampaignMatrixItem[] = [];
    for (const c of campaigns || []) {
      const metrics = spendMap.get(c.campaign_id);
      if (!metrics || metrics.spend === 0) continue;

      const platform = googleIds.has(c.ad_account_id) ? 'google' : metaIds.has(c.ad_account_id) ? 'meta' : null;
      if (!platform) continue;

      items.push({
        campaign_id: c.campaign_id,
        campaign_name: c.campaign_name,
        platform,
        total_spend: metrics.spend,
        total_revenue: metrics.revenue,
        roas: metrics.revenue / metrics.spend,
        quadrant: 'watch', // placeholder, classified below
      });
    }

    // Classify quadrants
    const medianSpend = median(items.map((i) => i.total_spend));
    for (const item of items) {
      item.quadrant = classifyQuadrant(item.roas, item.total_spend, medianSpend);
    }

    return items;
  },
  ['campaign-matrix-v1'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);

export const getParetoAnalysis = unstable_cache(
  async (period: string, from?: string, to?: string): Promise<ParetoResult> => {
    const supabase = await createServiceClient();
    const { start, end } = getDateRange(period, from, to);

    // Product revenue: use RPC for Shopify (extracts from line_items JSONB), raw query for Amazon
    const [{ data: shopifyTop }, amazonOrders] = await Promise.all([
      supabase.rpc('get_top_products', { p_start: start, p_end: end, p_limit: 100 }),
      fetchAll<{ asin: string; sku: string; item_price: number }>(({ from: f, to: t }) =>
        supabase.from('amazon_orders').select('asin, sku, item_price')
          .gte('purchase_date', start).lte('purchase_date', end).range(f, t)
      ),
    ]);

    // Aggregate by product
    const productMap = new Map<string, number>();
    for (const r of (shopifyTop || []) as { title: string; units: number; revenue: number; store_name: string }[]) {
      productMap.set(r.title, (productMap.get(r.title) || 0) + Number(r.revenue || 0));
    }
    for (const o of amazonOrders) {
      const name = o.sku || o.asin || 'Amazon SKU';
      productMap.set(name, (productMap.get(name) || 0) + (o.item_price || 0));
    }

    const productItems = Array.from(productMap.entries())
      .map(([name, revenue]) => ({ name, revenue }))
      .sort((a, b) => b.revenue - a.revenue);

    const paretoCalc = calculateParetoConcentration(productItems);
    const totalProductRevenue = paretoCalc.total_revenue;

    const topItems = productItems.slice(0, 10).map((p) => ({
      name: p.name,
      revenue: p.revenue,
      pct: totalProductRevenue > 0 ? Math.round((p.revenue / totalProductRevenue) * 100) : 0,
    }));

    // Channel revenue
    const { data: stores } = await supabase.from('stores').select('id, name');
    const channelRevenues: { name: string; revenue: number }[] = [];

    for (const store of stores || []) {
      const orders = await fetchAll<{ total: number }>(({ from: f, to: t }) =>
        supabase.from('shopify_orders').select('total')
          .eq('store_id', store.id).gte('created_at', start).lte('created_at', end)
          .eq('financial_status', 'paid').range(f, t)
      );
      channelRevenues.push({
        name: store.name,
        revenue: orders.reduce((s, o) => s + (o.total || 0), 0),
      });
    }
    channelRevenues.push({
      name: 'Amazon',
      revenue: amazonOrders.reduce((s, o) => s + (o.item_price || 0), 0),
    });

    const totalChannelRev = channelRevenues.reduce((s, c) => s + c.revenue, 0);
    const channelItems = channelRevenues
      .map((c) => ({
        name: c.name,
        revenue: c.revenue,
        pct: totalChannelRev > 0 ? Math.round((c.revenue / totalChannelRev) * 100) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const shares = channelItems.map((c) => totalChannelRev > 0 ? c.revenue / totalChannelRev : 0);

    return {
      products: { ...paretoCalc, top_items: topItems },
      channels: { items: channelItems, hhi: calculateHHI(shares) },
    };
  },
  ['pareto-analysis-v1'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);

export const getCustomerHealth = unstable_cache(
  async (period: string, from?: string, to?: string): Promise<CustomerHealth> => {
    const supabase = await createServiceClient();
    const { start, end, prevStart, prevEnd } = getDateRange(period, from, to);

    const [allCustomers, currentOrders, prevOrders] = await Promise.all([
      fetchAll<{ id: string; email: string; orders_count: number; total_spent: number; first_order_at: string }>(({ from: f, to: t }) =>
        supabase.from('shopify_customers').select('id, email, orders_count, total_spent, first_order_at').range(f, t)
      ),
      fetchAll<{ total: number; customer_email: string }>(({ from: f, to: t }) =>
        supabase.from('shopify_orders').select('total, customer_email')
          .gte('created_at', start).lte('created_at', end)
          .eq('financial_status', 'paid').range(f, t)
      ),
      fetchAll<{ total: number }>(({ from: f, to: t }) =>
        supabase.from('shopify_orders').select('total')
          .gte('created_at', prevStart).lte('created_at', prevEnd)
          .eq('financial_status', 'paid').range(f, t)
      ),
    ]);

    const totalCustomers = allCustomers.length;
    const repeatCustomers = allCustomers.filter((c) => (c.orders_count || 0) > 1).length;
    const repeatRate = totalCustomers > 0 ? (repeatCustomers / totalCustomers) * 100 : 0;
    const avgLtv = totalCustomers > 0
      ? allCustomers.reduce((s, c) => s + (c.total_spent || 0), 0) / totalCustomers
      : 0;
    const avgOrdersPerCustomer = totalCustomers > 0
      ? allCustomers.reduce((s, c) => s + (c.orders_count || 0), 0) / totalCustomers
      : 0;

    // New customers in period
    const newCustomersPeriod = allCustomers.filter((c) => {
      if (!c.first_order_at) return false;
      return c.first_order_at >= start && c.first_order_at <= end;
    }).length;

    // Returning orders (customers with orders_count > 1 placing orders in period)
    const repeatEmails = new Set(allCustomers.filter((c) => (c.orders_count || 0) > 1).map((c) => c.email));
    const returningOrdersPeriod = currentOrders.filter((o) => o.customer_email && repeatEmails.has(o.customer_email)).length;

    // AOV
    const currentRevenue = currentOrders.reduce((s, o) => s + (o.total || 0), 0);
    const prevRevenue = prevOrders.reduce((s, o) => s + (o.total || 0), 0);
    const aovCurrent = currentOrders.length > 0 ? currentRevenue / currentOrders.length : 0;
    const aovPrevious = prevOrders.length > 0 ? prevRevenue / prevOrders.length : 0;
    const aovChangePct = aovPrevious > 0 ? ((aovCurrent - aovPrevious) / aovPrevious) * 100 : 0;

    return {
      total_customers: totalCustomers,
      repeat_customers: repeatCustomers,
      repeat_rate: repeatRate,
      avg_ltv: avgLtv,
      avg_orders_per_customer: avgOrdersPerCustomer,
      new_customers_period: newCustomersPeriod,
      returning_orders_period: returningOrdersPeriod,
      aov_current: aovCurrent,
      aov_previous: aovPrevious,
      aov_change_pct: aovChangePct,
    };
  },
  ['customer-health-v1'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);

export const getStrategicRecommendations = unstable_cache(
  async (period: string, from?: string, to?: string): Promise<StrategicRecommendation[]> => {
    const supabase = await createServiceClient();
    const { start, end } = getDateRange(period, from, to);
    const startDate = start.split('T')[0];
    const endDate = end.split('T')[0];

    // Get campaign matrix, pareto, health, and daily ROAS in parallel
    const [campaigns, pareto, health] = await Promise.all([
      getCampaignMatrix(period, from, to),
      getParetoAnalysis(period, from, to),
      getCustomerHealth(period, from, to),
    ]);

    // Daily ROAS for trend
    const { data: dailyAds } = await supabase
      .from('ad_spend_daily')
      .select('date, spend, revenue')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date');

    const roasByDate: Record<string, { spend: number; revenue: number }> = {};
    for (const row of dailyAds || []) {
      if (!roasByDate[row.date]) roasByDate[row.date] = { spend: 0, revenue: 0 };
      roasByDate[row.date].spend += row.spend || 0;
      roasByDate[row.date].revenue += row.revenue || 0;
    }
    const dailyRoas = Object.entries(roasByDate)
      .map(([date, v]) => ({ date, roas: v.spend > 0 ? v.revenue / v.spend : 0 }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // CPA by platform
    const [{ data: googleAccounts }, { data: metaAccounts }] = await Promise.all([
      supabase.from('ad_accounts').select('id').eq('platform', 'google'),
      supabase.from('ad_accounts').select('id').eq('platform', 'meta'),
    ]);
    const googleIds = (googleAccounts || []).map((a) => a.id);
    const metaIds = (metaAccounts || []).map((a) => a.id);

    const [{ data: googleSpend }, { data: metaSpend }] = await Promise.all([
      supabase.from('ad_spend_daily').select('spend, conversions').in('ad_account_id', googleIds).gte('date', startDate).lte('date', endDate),
      supabase.from('ad_spend_daily').select('spend, conversions').in('ad_account_id', metaIds).gte('date', startDate).lte('date', endDate),
    ]);

    const gAgg = (googleSpend || []).reduce((a, r) => ({ spend: a.spend + (r.spend || 0), conv: a.conv + (r.conversions || 0) }), { spend: 0, conv: 0 });
    const mAgg = (metaSpend || []).reduce((a, r) => ({ spend: a.spend + (r.spend || 0), conv: a.conv + (r.conversions || 0) }), { spend: 0, conv: 0 });

    const totalAdSpend = campaigns.reduce((s, c) => s + c.total_spend, 0);
    const provenSpend = campaigns.filter((c) => c.roas >= 2.0).reduce((s, c) => s + c.total_spend, 0);

    return generateRecommendations({
      campaigns,
      pareto,
      health,
      dailyRoas,
      googleCpa: gAgg.conv > 0 ? gAgg.spend / gAgg.conv : 0,
      metaCpa: mAgg.conv > 0 ? mAgg.spend / mAgg.conv : 0,
      totalAdSpend,
      provenSpend,
    });
  },
  ['strategic-recommendations-v1'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);
