import { createServiceClient } from "@/lib/supabase/server";

const META_API_VERSION = "v21.0";

export interface MetaAdsCredentials {
  access_token: string;
}

export async function syncMetaAds(
  adAccountId: string,
  metaAccountId: string,
  credentials: MetaAdsCredentials
) {
  const supabase = await createServiceClient();
  const accessToken = credentials.access_token;

  const campaignsRes = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/act_${metaAccountId}/campaigns?` +
      new URLSearchParams({
        fields: "id,name,status,daily_budget",
        access_token: accessToken,
        limit: "100",
      })
  );

  if (!campaignsRes.ok) {
    throw new Error(`Meta API error: ${campaignsRes.status} ${await campaignsRes.text()}`);
  }

  const campaignsData = await campaignsRes.json();
  let synced = 0;

  for (const campaign of campaignsData.data || []) {
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

    const insightsRes = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${campaign.id}/insights?` +
        new URLSearchParams({
          fields: "spend,impressions,clicks,actions,action_values",
          time_range: JSON.stringify({
            since: new Date(Date.now() - 30 * 86400000)
              .toISOString()
              .split("T")[0],
            until: new Date().toISOString().split("T")[0],
          }),
          time_increment: "1",
          access_token: accessToken,
        })
    );

    if (!insightsRes.ok) continue;

    const insightsData = await insightsRes.json();

    for (const day of insightsData.data || []) {
      const spend = parseFloat(day.spend || "0");
      const conversions =
        day.actions?.find((a: { action_type: string }) => a.action_type === "purchase")
          ?.value || 0;
      const revenue =
        day.action_values?.find((a: { action_type: string }) => a.action_type === "purchase")
          ?.value || 0;

      await supabase.from("ad_spend_daily").upsert(
        {
          ad_account_id: adAccountId,
          campaign_id: campaign.id,
          date: day.date_start,
          spend,
          impressions: parseInt(day.impressions || "0"),
          clicks: parseInt(day.clicks || "0"),
          conversions: parseFloat(conversions),
          revenue: parseFloat(revenue),
          roas: spend > 0 ? parseFloat(revenue) / spend : 0,
        },
        { onConflict: "ad_account_id,campaign_id,date" }
      );
      synced++;
    }
  }

  return synced;
}
