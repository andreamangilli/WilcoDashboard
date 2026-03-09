import { GoogleAdsApi } from "google-ads-api";
import { createServiceClient } from "@/lib/supabase/server";

const GOOGLE_ADS_LOOKBACK_DAYS = 90;

export interface GoogleAdsCredentials {
  developer_token: string;
  client_id: string;
  client_secret: string;
  refresh_token: string;
  manager_id?: string;
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function statusLabel(status: number): string {
  if (status === 2) return "ENABLED";
  if (status === 3) return "PAUSED";
  return "REMOVED";
}

function channelTypeLabel(type: number): string {
  const map: Record<number, string> = {
    2: "SEARCH", 3: "DISPLAY", 4: "SHOPPING", 6: "VIDEO",
    10: "PERFORMANCE_MAX", 12: "DISCOVERY", 14: "DEMAND_GEN",
  };
  return map[type] || "OTHER";
}

function biddingStrategyLabel(type: number): string {
  const map: Record<number, string> = {
    3: "ENHANCED_CPC", 5: "MANUAL_CPC", 9: "MAXIMIZE_CONVERSIONS",
    10: "MAXIMIZE_CONVERSION_VALUE", 11: "TARGET_CPA", 13: "TARGET_ROAS",
    14: "TARGET_SPEND",
  };
  return map[type] || "OTHER";
}

export async function syncGoogleAds(
  adAccountId: string,
  googleAccountId: string,
  credentials: GoogleAdsCredentials
) {
  const supabase = await createServiceClient();

  const client = new GoogleAdsApi({
    client_id: credentials.client_id,
    client_secret: credentials.client_secret,
    developer_token: credentials.developer_token,
  });

  const customer = client.Customer({
    customer_id: googleAccountId.replace(/-/g, ""),
    login_customer_id: credentials.manager_id
      ? credentials.manager_id.replace(/-/g, "")
      : undefined,
    refresh_token: credentials.refresh_token,
  });

  const today = new Date();
  const since = new Date(today);
  since.setDate(since.getDate() - GOOGLE_ADS_LOOKBACK_DAYS);

  // 1. Campaign metadata
  const campaignRows = await customer.query(`
    SELECT
      campaign.id, campaign.name, campaign.status,
      campaign.advertising_channel_type, campaign.bidding_strategy_type
    FROM campaign ORDER BY campaign.name
  `);

  for (const row of campaignRows) {
    const c = row.campaign!;
    await supabase.from("ad_campaigns").upsert(
      {
        ad_account_id: adAccountId,
        campaign_id: String(c.id),
        campaign_name: c.name,
        status: statusLabel(c.status as number),
        campaign_type: channelTypeLabel(c.advertising_channel_type as number),
        bidding_strategy: biddingStrategyLabel(c.bidding_strategy_type as number),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "ad_account_id,campaign_id" }
    );
  }

  // 2. Campaign daily metrics
  const dailyRows = await customer.query(`
    SELECT
      campaign.id,
      metrics.cost_micros, metrics.impressions, metrics.clicks,
      metrics.conversions, metrics.conversions_value,
      segments.date
    FROM campaign
    WHERE segments.date BETWEEN '${formatDate(since)}' AND '${formatDate(today)}'
    ORDER BY segments.date DESC
  `);

  let synced = 0;
  for (const row of dailyRows) {
    const spend = (row.metrics!.cost_micros || 0) / 1_000_000;
    const revenue = row.metrics!.conversions_value || 0;

    await supabase.from("ad_spend_daily").upsert(
      {
        ad_account_id: adAccountId,
        campaign_id: String(row.campaign!.id),
        date: row.segments!.date,
        spend,
        impressions: row.metrics!.impressions || 0,
        clicks: row.metrics!.clicks || 0,
        conversions: row.metrics!.conversions || 0,
        revenue,
        roas: spend > 0 ? revenue / spend : 0,
      },
      { onConflict: "ad_account_id,campaign_id,date" }
    );
    synced++;
  }

  // 3. Ad group daily metrics
  const adGroupRows = await customer.query(`
    SELECT
      campaign.id,
      ad_group.id, ad_group.name, ad_group.status,
      metrics.cost_micros, metrics.impressions, metrics.clicks,
      metrics.conversions, metrics.conversions_value,
      segments.date
    FROM ad_group
    WHERE segments.date BETWEEN '${formatDate(since)}' AND '${formatDate(today)}'
    ORDER BY segments.date DESC
  `);

  for (const row of adGroupRows) {
    const spend = (row.metrics!.cost_micros || 0) / 1_000_000;
    const revenue = row.metrics!.conversions_value || 0;

    await supabase.from("ad_group_daily").upsert(
      {
        ad_account_id: adAccountId,
        campaign_id: String(row.campaign!.id),
        ad_group_id: String(row.ad_group!.id),
        ad_group_name: row.ad_group!.name,
        ad_group_status: statusLabel(row.ad_group!.status as number),
        date: row.segments!.date,
        spend,
        impressions: row.metrics!.impressions || 0,
        clicks: row.metrics!.clicks || 0,
        conversions: row.metrics!.conversions || 0,
        revenue,
      },
      { onConflict: "ad_account_id,campaign_id,ad_group_id,date" }
    );
  }

  // 4. Asset groups (Performance Max)
  try {
    const assetGroupRows = await customer.query(`
      SELECT
        campaign.id,
        asset_group.id, asset_group.name, asset_group.status,
        metrics.cost_micros, metrics.impressions, metrics.clicks,
        metrics.conversions, metrics.conversions_value,
        segments.date
      FROM asset_group
      WHERE segments.date BETWEEN '${formatDate(since)}' AND '${formatDate(today)}'
      ORDER BY segments.date DESC
    `);

    for (const row of assetGroupRows) {
      const spend = (row.metrics!.cost_micros || 0) / 1_000_000;
      const revenue = row.metrics!.conversions_value || 0;

      await supabase.from("ad_group_daily").upsert(
        {
          ad_account_id: adAccountId,
          campaign_id: String(row.campaign!.id),
          ad_group_id: "ag_" + String(row.asset_group!.id),
          ad_group_name: row.asset_group!.name,
          ad_group_status: statusLabel(row.asset_group!.status as number),
          date: row.segments!.date,
          spend,
          impressions: row.metrics!.impressions || 0,
          clicks: row.metrics!.clicks || 0,
          conversions: row.metrics!.conversions || 0,
          revenue,
        },
        { onConflict: "ad_account_id,campaign_id,ad_group_id,date" }
      );
    }
  } catch {
    // asset_group query may fail for non-PMax accounts
  }

  return synced;
}
