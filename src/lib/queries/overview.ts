import { createClient } from "@/lib/supabase/server";
import { getDateRange } from "./utils";

export async function getOverviewKpis(period: string, from?: string, to?: string) {
  const supabase = await createClient();
  const { start, end, prevStart, prevEnd } = getDateRange(period, from, to);

  // Current period - Shopify revenue
  const { data: currentShopify } = await supabase
    .from("shopify_orders")
    .select("total, subtotal")
    .gte("created_at", start)
    .lte("created_at", end)
    .eq("financial_status", "paid");

  // Previous period
  const { data: prevShopify } = await supabase
    .from("shopify_orders")
    .select("total")
    .gte("created_at", prevStart)
    .lte("created_at", prevEnd)
    .eq("financial_status", "paid");

  // Amazon revenue
  const { data: currentAmazon } = await supabase
    .from("amazon_orders")
    .select("item_price, quantity")
    .gte("purchase_date", start)
    .lte("purchase_date", end);

  const { data: prevAmazon } = await supabase
    .from("amazon_orders")
    .select("item_price")
    .gte("purchase_date", prevStart)
    .lte("purchase_date", prevEnd);

  // Ad spend
  const { data: currentAds } = await supabase
    .from("ad_spend_daily")
    .select("spend")
    .gte("date", start.split("T")[0])
    .lte("date", end.split("T")[0]);

  const { data: prevAds } = await supabase
    .from("ad_spend_daily")
    .select("spend")
    .gte("date", prevStart.split("T")[0])
    .lte("date", prevEnd.split("T")[0]);

  const shopifyRevenue = (currentShopify || []).reduce(
    (s, o) => s + (o.total || 0),
    0
  );
  const prevShopifyRevenue = (prevShopify || []).reduce(
    (s, o) => s + (o.total || 0),
    0
  );
  const amazonRevenue = (currentAmazon || []).reduce(
    (s, o) => s + (o.item_price || 0),
    0
  );
  const prevAmazonRevenue = (prevAmazon || []).reduce(
    (s, o) => s + (o.item_price || 0),
    0
  );

  const totalRevenue = shopifyRevenue + amazonRevenue;
  const prevTotalRevenue = prevShopifyRevenue + prevAmazonRevenue;
  const revenueChange =
    prevTotalRevenue > 0
      ? ((totalRevenue - prevTotalRevenue) / prevTotalRevenue) * 100
      : 0;

  const totalOrders =
    (currentShopify?.length || 0) + (currentAmazon?.length || 0);
  const prevTotalOrders =
    (prevShopify?.length || 0) + (prevAmazon?.length || 0);
  const ordersChange =
    prevTotalOrders > 0
      ? ((totalOrders - prevTotalOrders) / prevTotalOrders) * 100
      : 0;

  const adSpend = (currentAds || []).reduce((s, a) => s + (a.spend || 0), 0);
  const prevAdSpend = (prevAds || []).reduce((s, a) => s + (a.spend || 0), 0);
  const adSpendChange =
    prevAdSpend > 0 ? ((adSpend - prevAdSpend) / prevAdSpend) * 100 : 0;

  return {
    revenue: { value: totalRevenue, change: revenueChange },
    orders: { value: totalOrders, change: ordersChange },
    adSpend: { value: adSpend, change: adSpendChange },
    shopifyRevenue,
    amazonRevenue,
  };
}

export async function getRevenueByChannel(period: string, from?: string, to?: string) {
  const supabase = await createClient();
  const { start, end, prevStart, prevEnd } = getDateRange(period, from, to);

  const { data: stores } = await supabase
    .from("stores")
    .select("id, name, slug");

  const channels: { name: string; revenue: number; prevRevenue: number }[] = [];

  for (const store of stores || []) {
    const [{ data: orders }, { data: prevOrders }] = await Promise.all([
      supabase
        .from("shopify_orders")
        .select("total")
        .eq("store_id", store.id)
        .gte("created_at", start)
        .lte("created_at", end)
        .eq("financial_status", "paid"),
      supabase
        .from("shopify_orders")
        .select("total")
        .eq("store_id", store.id)
        .gte("created_at", prevStart)
        .lte("created_at", prevEnd)
        .eq("financial_status", "paid"),
    ]);

    channels.push({
      name: store.name,
      revenue: (orders || []).reduce((s, o) => s + (o.total || 0), 0),
      prevRevenue: (prevOrders || []).reduce((s, o) => s + (o.total || 0), 0),
    });
  }

  const [{ data: amazonOrders }, { data: prevAmazonOrders }] = await Promise.all([
    supabase
      .from("amazon_orders")
      .select("item_price")
      .gte("purchase_date", start)
      .lte("purchase_date", end),
    supabase
      .from("amazon_orders")
      .select("item_price")
      .gte("purchase_date", prevStart)
      .lte("purchase_date", prevEnd),
  ]);

  channels.push({
    name: "Amazon",
    revenue: (amazonOrders || []).reduce((s, o) => s + (o.item_price || 0), 0),
    prevRevenue: (prevAmazonOrders || []).reduce((s, o) => s + (o.item_price || 0), 0),
  });

  return channels;
}

export async function getTopProducts(period: string, from?: string, to?: string) {
  const supabase = await createClient();
  const { start, end } = getDateRange(period, from, to);

  // Shopify top products
  const { data: stores } = await supabase.from("stores").select("id, name");
  const shopifyMap = new Map<string, { title: string; channel: string; units: number; revenue: number }>();

  for (const store of stores || []) {
    const { data: orders } = await supabase
      .from("shopify_orders")
      .select("line_items")
      .eq("store_id", store.id)
      .eq("financial_status", "paid")
      .gte("created_at", start)
      .lte("created_at", end);

    for (const order of orders || []) {
      const items = (order.line_items as Array<{ title?: string; quantity?: number; price?: string | number }>) || [];
      for (const li of items) {
        const key = `shopify::${li.title}`;
        const existing = shopifyMap.get(key) ?? { title: li.title || "—", channel: store.name, units: 0, revenue: 0 };
        existing.units += li.quantity || 1;
        existing.revenue += (li.quantity || 1) * parseFloat(String(li.price || "0"));
        shopifyMap.set(key, existing);
      }
    }
  }

  // Amazon top products
  const { data: amazonOrders } = await supabase
    .from("amazon_orders")
    .select("asin, sku, quantity, item_price")
    .gte("purchase_date", start)
    .lte("purchase_date", end);

  const amazonMap = new Map<string, { title: string; channel: string; units: number; revenue: number }>();
  for (const o of amazonOrders || []) {
    const key = `amazon::${o.asin}`;
    const existing = amazonMap.get(key) ?? { title: o.sku || o.asin, channel: "Amazon", units: 0, revenue: 0 };
    existing.units += o.quantity || 1;
    existing.revenue += o.item_price || 0;
    amazonMap.set(key, existing);
  }

  return [...shopifyMap.values(), ...amazonMap.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
}

export async function getOperationalSignals() {
  const supabase = await createClient();

  // Low stock Shopify (< 5 units)
  const { data: lowStockShopify } = await supabase
    .from("shopify_products")
    .select("title, inventory_qty")
    .lt("inventory_qty", 5)
    .eq("status", "active");

  // Low stock Amazon FBA (< 5 units)
  const { data: lowStockAmazon } = await supabase
    .from("amazon_inventory")
    .select("sku, qty_available")
    .lt("qty_available", 5)
    .eq("fulfillment", "fba");

  // Low ROAS campaigns — last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const dateStr = sevenDaysAgo.toISOString().split("T")[0];

  const { data: campaigns } = await supabase
    .from("ad_campaigns")
    .select("campaign_name, campaign_id");

  const { data: recentSpend } = await supabase
    .from("ad_spend_daily")
    .select("campaign_id, spend, revenue")
    .gte("date", dateStr);

  const spendMap = new Map<string, { spend: number; revenue: number }>();
  for (const r of recentSpend || []) {
    const e = spendMap.get(r.campaign_id) ?? { spend: 0, revenue: 0 };
    e.spend += r.spend || 0;
    e.revenue += r.revenue || 0;
    spendMap.set(r.campaign_id, e);
  }

  const lowRoasCampaigns = (campaigns || []).filter((c) => {
    const metrics = spendMap.get(c.campaign_id);
    if (!metrics || metrics.spend === 0) return false;
    return metrics.revenue / metrics.spend < 2;
  });

  return {
    lowStockSkus: [
      ...(lowStockShopify || []).map((p) => ({ name: p.title, qty: p.inventory_qty as number, channel: "Shopify" })),
      ...(lowStockAmazon || []).map((p) => ({ name: p.sku as string, qty: p.qty_available as number, channel: "Amazon FBA" })),
    ],
    lowRoasCampaigns: lowRoasCampaigns.map((c) => ({ name: c.campaign_name })),
  };
}
