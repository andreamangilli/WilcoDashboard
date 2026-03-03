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
  const { start, end } = getDateRange(period, from, to);

  const { data: stores } = await supabase
    .from("stores")
    .select("id, name, slug");

  const channels: { name: string; revenue: number }[] = [];

  for (const store of stores || []) {
    const { data: orders } = await supabase
      .from("shopify_orders")
      .select("total")
      .eq("store_id", store.id)
      .gte("created_at", start)
      .lte("created_at", end)
      .eq("financial_status", "paid");

    channels.push({
      name: store.name,
      revenue: (orders || []).reduce((s, o) => s + (o.total || 0), 0),
    });
  }

  const { data: amazonOrders } = await supabase
    .from("amazon_orders")
    .select("item_price")
    .gte("purchase_date", start)
    .lte("purchase_date", end);

  channels.push({
    name: "Amazon",
    revenue: (amazonOrders || []).reduce(
      (s, o) => s + (o.item_price || 0),
      0
    ),
  });

  return channels;
}
