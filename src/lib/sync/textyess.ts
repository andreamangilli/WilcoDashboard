import { createServiceClient } from "@/lib/supabase/server";
import { sleep } from "./utils";

const TEXTYESS_BASE = "https://api-ai.textyess.com";

interface TextyessCampaign {
  _id: string;
  name: string;
  status: number;
  open_rate?: number;
  conversion_rate?: number;
  orders?: number;
  resolved_recipient_count?: number;
  scheduled_at?: string;
  started_at?: string;
  createdAt: string;
}

interface AnalyticsCampaign {
  _id: string;
  campaign: { _id: string; title: string };
  total_messages: number;
  cost: number;
  revenue: number;
  orders_number: number;
  campaign_conversion_rate: number;
  average_cart: number;
  roas: number;
  campaign_type: string;
}

interface TextyessOrder {
  _id: string;
  cms_id?: string;
  order_number?: number;
  total: number;
  items_number?: number;
  paid?: boolean;
  asset_type?: string;
  winning_source?: string;
  customer_first_name?: string;
  customer_last_name?: string;
  createdAt: string;
}

async function textyessFetch<T>(
  path: string,
  token: string,
  params: Record<string, string> = {}
): Promise<T> {
  const url = new URL(`${TEXTYESS_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: { "x-auth-token": token },
  });

  if (res.status === 429) {
    await sleep(2000);
    return textyessFetch(path, token, params);
  }
  if (!res.ok) throw new Error(`TextYess API error: ${res.status}`);

  await sleep(500);
  const json = await res.json();
  return json;
}

async function syncCampaigns(token: string, supabase: Awaited<ReturnType<typeof createServiceClient>>) {
  let page = 0;
  let synced = 0;
  let hasMore = true;

  while (hasMore) {
    const json = await textyessFetch<{
      data: TextyessCampaign[];
      pagination: { total: number; perPage: number; page: number };
    }>("/campaigns", token, { page: page.toString(), perPage: "50" });

    const campaigns = json.data || [];
    if (campaigns.length === 0) break;

    for (const c of campaigns) {
      await supabase.from("textyess_campaigns").upsert(
        {
          textyess_id: c._id,
          name: c.name,
          campaign_type: "campaign",
          status: c.status,
          recipients: c.resolved_recipient_count || 0,
          open_rate: c.open_rate || 0,
          conversion_rate: c.conversion_rate || 0,
          orders_count: c.orders || 0,
          scheduled_at: c.scheduled_at || null,
          started_at: c.started_at || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "textyess_id" }
      );
      synced++;
    }

    hasMore = (page + 1) * 50 < json.pagination.total;
    page++;
  }

  return synced;
}

async function syncAnalyticsCampaigns(token: string, supabase: Awaited<ReturnType<typeof createServiceClient>>) {
  let page = 0;
  let synced = 0;
  let hasMore = true;

  while (hasMore) {
    const json = await textyessFetch<{
      data: AnalyticsCampaign[];
      pagination: { total: number; perPage: number; page: number };
    }>("/analytics/campaigns", token, {
      page: page.toString(),
      perPage: "50",
      from: "2024-01-01T00:00:00.000Z",
    });

    const items = json.data || [];
    if (items.length === 0) break;

    for (const c of items) {
      await supabase.from("textyess_campaigns").upsert(
        {
          textyess_id: c._id,
          name: c.campaign?.title || "Automation",
          campaign_type: c.campaign_type || "outbound-automations",
          total_messages: c.total_messages || 0,
          cost: (c.cost || 0) / 100,
          revenue: (c.revenue || 0) / 100,
          orders_count: c.orders_number || 0,
          conversion_rate: c.campaign_conversion_rate || 0,
          average_cart: (c.average_cart || 0) / 100,
          roas: c.roas || 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "textyess_id" }
      );
      synced++;
    }

    hasMore = (page + 1) * 50 < json.pagination.total;
    page++;
  }

  return synced;
}

async function syncOrders(token: string, supabase: Awaited<ReturnType<typeof createServiceClient>>) {
  let page = 0;
  let synced = 0;
  let hasMore = true;

  while (hasMore) {
    const json = await textyessFetch<{
      data: TextyessOrder[];
      pagination: { total: number; perPage: number; page: number };
    }>("/analytics/orders", token, {
      page: page.toString(),
      perPage: "100",
      from: "2024-01-01T00:00:00.000Z",
      sortDirection: "-1",
      sortKey: "createdAt",
    });

    const orders = json.data || [];
    if (orders.length === 0) break;

    for (const o of orders) {
      await supabase.from("textyess_orders").upsert(
        {
          textyess_id: o._id,
          cms_id: o.cms_id?.toString() || null,
          order_number: o.order_number || null,
          total: (o.total || 0) / 100,
          items_number: o.items_number || 0,
          paid: o.paid ?? false,
          asset_type: o.asset_type || null,
          winning_source: o.winning_source || null,
          customer_first_name: o.customer_first_name || null,
          customer_last_name: o.customer_last_name || null,
          created_at: o.createdAt,
        },
        { onConflict: "textyess_id" }
      );
      synced++;
    }

    hasMore = (page + 1) * 100 < json.pagination.total;
    page++;
  }

  return synced;
}

export async function syncTextyess() {
  const token = process.env.TEXTYESS_TOKEN;
  if (!token) throw new Error("TEXTYESS_TOKEN not configured");

  const supabase = await createServiceClient();

  const campaignsSynced = await syncCampaigns(token, supabase);
  const analyticsSynced = await syncAnalyticsCampaigns(token, supabase);
  const ordersSynced = await syncOrders(token, supabase);

  return campaignsSynced + analyticsSynced + ordersSynced;
}
