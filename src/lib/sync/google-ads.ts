import { createServiceClient } from "@/lib/supabase/server";

export interface GoogleAdsCredentials {
  developer_token: string;
  client_id: string;
  client_secret: string;
  refresh_token: string;
  manager_id?: string;
}

async function getGoogleAccessToken(credentials: GoogleAdsCredentials): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: credentials.refresh_token,
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Google auth error: ${JSON.stringify(data)}`);
  return data.access_token;
}

export async function syncGoogleAds(
  adAccountId: string,
  googleAccountId: string,
  credentials: GoogleAdsCredentials
) {
  const supabase = await createServiceClient();
  const accessToken = await getGoogleAccessToken(credentials);

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign_budget.amount_micros,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value,
      segments.date
    FROM campaign
    WHERE segments.date DURING LAST_30_DAYS
    ORDER BY segments.date DESC
  `;

  const res = await fetch(
    `https://googleads.googleapis.com/v17/customers/${googleAccountId}/googleAds:searchStream`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": credentials.developer_token,
        ...(credentials.manager_id ? { "login-customer-id": credentials.manager_id } : {}),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    }
  );

  if (!res.ok) {
    throw new Error(`Google Ads API error: ${res.status} ${await res.text()}`);
  }

  const results = await res.json();
  let synced = 0;

  for (const batch of results) {
    for (const row of batch.results || []) {
      const campaign = row.campaign;
      const metrics = row.metrics;
      const date = row.segments.date;

      await supabase.from("ad_campaigns").upsert(
        {
          ad_account_id: adAccountId,
          campaign_id: campaign.id,
          campaign_name: campaign.name,
          status: campaign.status,
          daily_budget: (campaign.budget?.amountMicros || 0) / 1_000_000,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "ad_account_id,campaign_id" }
      );

      const spend = (metrics.costMicros || 0) / 1_000_000;
      const revenue = metrics.conversionsValue || 0;

      await supabase.from("ad_spend_daily").upsert(
        {
          ad_account_id: adAccountId,
          campaign_id: campaign.id,
          date,
          spend,
          impressions: metrics.impressions || 0,
          clicks: metrics.clicks || 0,
          conversions: metrics.conversions || 0,
          revenue,
          roas: spend > 0 ? revenue / spend : 0,
        },
        { onConflict: "ad_account_id,campaign_id,date" }
      );
      synced++;
    }
  }

  return synced;
}
