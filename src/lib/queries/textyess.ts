import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";

export type TextyessCampaign = {
  id: string;
  textyess_id: string;
  name: string;
  campaign_type: string;
  status: number;
  recipients: number;
  total_messages: number;
  open_rate: number;
  conversion_rate: number;
  orders_count: number;
  revenue: number;
  cost: number;
  roas: number;
  average_cart: number;
  scheduled_at: string | null;
  started_at: string | null;
};

export type TextyessOrder = {
  id: string;
  textyess_id: string;
  order_number: number | null;
  total: number;
  items_number: number;
  paid: boolean;
  asset_type: string | null;
  winning_source: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  created_at: string;
};

export const getTextyessCampaigns = unstable_cache(
  async (): Promise<TextyessCampaign[]> => {
    const supabase = await createServiceClient();
    const { data } = await supabase
      .from("textyess_campaigns")
      .select("*")
      .order("updated_at", { ascending: false });

    return (data || []).map((row) => ({
      id: row.id,
      textyess_id: row.textyess_id,
      name: row.name || "",
      campaign_type: row.campaign_type || "campaign",
      status: row.status || 0,
      recipients: row.recipients || 0,
      total_messages: row.total_messages || 0,
      open_rate: row.open_rate || 0,
      conversion_rate: row.conversion_rate || 0,
      orders_count: row.orders_count || 0,
      revenue: row.revenue || 0,
      cost: row.cost || 0,
      roas: row.roas || 0,
      average_cart: row.average_cart || 0,
      scheduled_at: row.scheduled_at,
      started_at: row.started_at,
    }));
  },
  ["textyess-campaigns-v1"],
  { revalidate: 1800, tags: ["dashboard-data"] }
);

export const getTextyessOrders = unstable_cache(
  async (): Promise<TextyessOrder[]> => {
    const supabase = await createServiceClient();
    const { data } = await supabase
      .from("textyess_orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    return (data || []).map((row) => ({
      id: row.id,
      textyess_id: row.textyess_id,
      order_number: row.order_number,
      total: row.total || 0,
      items_number: row.items_number || 0,
      paid: row.paid ?? false,
      asset_type: row.asset_type,
      winning_source: row.winning_source,
      customer_first_name: row.customer_first_name,
      customer_last_name: row.customer_last_name,
      created_at: row.created_at,
    }));
  },
  ["textyess-orders-v1"],
  { revalidate: 1800, tags: ["dashboard-data"] }
);

export const getTextyessOverview = unstable_cache(
  async () => {
    const supabase = await createServiceClient();

    const { data: campaigns } = await supabase
      .from("textyess_campaigns")
      .select("campaign_type, orders_count, revenue, cost, roas, recipients, total_messages");

    const { data: orders } = await supabase
      .from("textyess_orders")
      .select("total, paid");

    let totalCampaigns = 0;
    let totalAutomations = 0;
    let totalRecipients = 0;
    let totalMessages = 0;
    let campaignRevenue = 0;
    let campaignCost = 0;

    for (const row of campaigns || []) {
      if (row.campaign_type === "campaign") {
        totalCampaigns++;
        totalRecipients += row.recipients || 0;
      } else {
        totalAutomations++;
        totalMessages += row.total_messages || 0;
      }
      campaignRevenue += row.revenue || 0;
      campaignCost += row.cost || 0;
    }

    let totalOrders = 0;
    let totalRevenue = 0;
    for (const row of orders || []) {
      totalOrders++;
      totalRevenue += row.total || 0;
    }

    const avgRoas = campaignCost > 0 ? campaignRevenue / campaignCost : 0;

    return {
      totalCampaigns,
      totalAutomations,
      totalOrders,
      totalRevenue,
      totalRecipients,
      totalMessages,
      avgRoas,
    };
  },
  ["textyess-overview-v1"],
  { revalidate: 1800, tags: ["dashboard-data"] }
);
