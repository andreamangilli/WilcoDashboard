import { createServiceClient } from "@/lib/supabase/server";
import { sleep } from "./utils";

const META_API_VERSION = "v21.0";
const META_LOOKBACK_DAYS = 90;

export interface MetaAdsCredentials {
  access_token: string;
}

/**
 * Fetch all pages from a Meta Graph API endpoint.
 * Follows `paging.next` until no more pages remain.
 */
async function fetchAllPages<T>(url: string): Promise<T[]> {
  const results: T[] = [];
  let nextUrl: string | null = url;

  while (nextUrl) {
    const res: Response = await fetch(nextUrl);
    if (!res.ok) {
      throw new Error(`Meta API error: ${res.status} ${await res.text()}`);
    }
    await sleep(300);
    const json = await res.json();
    results.push(...(json.data || []));
    nextUrl = json.paging?.next || null;
  }

  return results;
}

export async function syncMetaAds(
  adAccountId: string,
  metaAccountId: string,
  credentials: MetaAdsCredentials
) {
  const supabase = await createServiceClient();
  const accessToken = credentials.access_token;

  // ── 1. Sync all campaigns (paginated) ──────────────────────────
  const campaignsUrl =
    `https://graph.facebook.com/${META_API_VERSION}/act_${metaAccountId}/campaigns?` +
    new URLSearchParams({
      fields: "id,name,status,daily_budget",
      access_token: accessToken,
      limit: "500",
    });

  const campaigns = await fetchAllPages<{
    id: string;
    name: string;
    status: string;
    daily_budget?: string;
  }>(campaignsUrl);

  for (const campaign of campaigns) {
    await supabase.from("ad_campaigns").upsert(
      {
        ad_account_id: adAccountId,
        campaign_id: campaign.id,
        campaign_name: campaign.name,
        status: campaign.status,
        daily_budget: campaign.daily_budget
          ? parseFloat(campaign.daily_budget) / 100
          : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "ad_account_id,campaign_id" }
    );
  }

  // ── 2. Fetch account-level insights with campaign breakdown ────
  // Uses `level=campaign` so ONE call returns ALL campaigns' daily data.
  // Attribution: 7-day click + 1-day view (Meta Ads Manager default).
  const since = new Date(Date.now() - META_LOOKBACK_DAYS * 86400000)
    .toISOString()
    .split("T")[0];
  const until = new Date().toISOString().split("T")[0];

  const insightsUrl =
    `https://graph.facebook.com/${META_API_VERSION}/act_${metaAccountId}/insights?` +
    new URLSearchParams({
      fields:
        "campaign_id,campaign_name,spend,impressions,clicks,actions,action_values,reach,frequency",
      time_range: JSON.stringify({ since, until }),
      time_increment: "1",
      level: "campaign",
      action_attribution_windows: JSON.stringify(["7d_click", "1d_view"]),
      access_token: accessToken,
      limit: "500",
    });

  const insights = await fetchAllPages<{
    campaign_id: string;
    campaign_name: string;
    date_start: string;
    spend: string;
    impressions: string;
    clicks: string;
    reach: string;
    frequency: string;
    actions?: Array<{ action_type: string; value: string }>;
    action_values?: Array<{ action_type: string; value: string }>;
  }>(insightsUrl);

  let synced = 0;

  for (const day of insights) {
    const spend = parseFloat(day.spend || "0");
    const conversions = parseFloat(
      day.actions?.find((a) => a.action_type === "purchase")?.value || "0"
    );
    const revenue = parseFloat(
      day.action_values?.find((a) => a.action_type === "purchase")?.value ||
        "0"
    );

    await supabase.from("ad_spend_daily").upsert(
      {
        ad_account_id: adAccountId,
        campaign_id: day.campaign_id,
        date: day.date_start,
        spend,
        impressions: parseInt(day.impressions || "0"),
        clicks: parseInt(day.clicks || "0"),
        conversions,
        revenue,
        reach: parseInt(day.reach || "0"),
        frequency: parseFloat(day.frequency || "0"),
        roas: spend > 0 ? revenue / spend : 0,
      },
      { onConflict: "ad_account_id,campaign_id,date" }
    );
    synced++;
  }

  return synced;
}
