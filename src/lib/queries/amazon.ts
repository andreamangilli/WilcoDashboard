import { createClient } from "@/lib/supabase/server";
import { getDateRange } from "./utils";

export async function getAmazonKpis(period: string) {
  const supabase = await createClient();
  const { start, end, prevStart, prevEnd } = getDateRange(period);

  const { data: current } = await supabase
    .from("amazon_orders")
    .select("item_price, quantity, amazon_fees, fba_fees")
    .gte("purchase_date", start)
    .lte("purchase_date", end);

  const { data: prev } = await supabase
    .from("amazon_orders")
    .select("item_price")
    .gte("purchase_date", prevStart)
    .lte("purchase_date", prevEnd);

  const revenue = (current || []).reduce(
    (s, o) => s + (o.item_price || 0),
    0
  );
  const prevRevenue = (prev || []).reduce(
    (s, o) => s + (o.item_price || 0),
    0
  );
  const orders = current?.length || 0;
  const totalFees = (current || []).reduce(
    (s, o) => s + Math.abs(o.amazon_fees || 0) + Math.abs(o.fba_fees || 0),
    0
  );

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
        (prev?.length || 0) > 0
          ? ((orders - (prev?.length || 0)) / (prev?.length || 0)) * 100
          : 0,
    },
    fees: { value: totalFees },
  };
}

export async function getAmazonPnl() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("amazon_pnl")
    .select("*")
    .order("revenue", { ascending: false });
  return data || [];
}

export async function getAmazonInventory() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("amazon_inventory")
    .select("*")
    .order("asin");
  return data || [];
}
