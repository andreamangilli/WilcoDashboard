import { createClient } from "@/lib/supabase/server";
import { getDateRange } from "./utils";

export async function getShopifyStoreKpis(storeId: string, period: string) {
  const supabase = await createClient();
  const { start, end, prevStart, prevEnd } = getDateRange(period);

  const { data: current } = await supabase
    .from("shopify_orders")
    .select("total, subtotal, customer_email")
    .eq("store_id", storeId)
    .gte("created_at", start)
    .lte("created_at", end)
    .eq("financial_status", "paid");

  const { data: prev } = await supabase
    .from("shopify_orders")
    .select("total")
    .eq("store_id", storeId)
    .gte("created_at", prevStart)
    .lte("created_at", prevEnd)
    .eq("financial_status", "paid");

  const revenue = (current || []).reduce((s, o) => s + (o.total || 0), 0);
  const prevRevenue = (prev || []).reduce((s, o) => s + (o.total || 0), 0);
  const orders = current?.length || 0;
  const prevOrders = prev?.length || 0;
  const aov = orders > 0 ? revenue / orders : 0;

  return {
    revenue: {
      value: revenue,
      change:
        prevRevenue > 0
          ? ((revenue - prevRevenue) / prevRevenue) * 100
          : 0,
    },
    orders: {
      value: orders,
      change:
        prevOrders > 0
          ? ((orders - prevOrders) / prevOrders) * 100
          : 0,
    },
    aov: { value: aov },
  };
}

export async function getShopifyAllStoresKpis(period: string) {
  const supabase = await createClient();
  const { data: stores } = await supabase
    .from("stores")
    .select("id, name, slug");

  const storeKpis = [];
  for (const store of stores || []) {
    const kpis = await getShopifyStoreKpis(store.id, period);
    storeKpis.push({ ...store, ...kpis });
  }
  return storeKpis;
}

export async function getShopifyProducts(storeId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("shopify_products")
    .select("*")
    .eq("store_id", storeId)
    .order("title");
  return data || [];
}

export async function getShopifyCustomers(storeId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("shopify_customers")
    .select("*")
    .eq("store_id", storeId)
    .order("total_spent", { ascending: false });
  return data || [];
}

export async function getStoreBySlug(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("stores")
    .select("*")
    .eq("slug", slug)
    .single();
  return data;
}
