import { createServiceClient } from "@/lib/supabase/server";
import { sleep } from "./utils";

const KLAVIYO_BASE = "https://a.klaviyo.com/api";
const REVISION = "2024-10-15";
const CONVERSION_METRIC_ID = "Refypm"; // Placed Order (Shopify)

function headers(apiKey: string) {
  return {
    Authorization: `Klaviyo-API-Key ${apiKey}`,
    revision: REVISION,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function fetchAllCampaigns(apiKey: string, channel: "email" | "sms") {
  const campaigns: Array<{ id: string; attributes: Record<string, unknown> }> = [];
  let url: string | null =
    `${KLAVIYO_BASE}/campaigns/?` +
    new URLSearchParams({ filter: `equals(messages.channel,'${channel}')` });

  while (url) {
    const res: Response = await fetch(url, { headers: headers(apiKey) });
    if (!res.ok) throw new Error(`Klaviyo campaigns error: ${res.status}`);
    const json = await res.json();
    campaigns.push(...(json.data || []));
    url = json.links?.next || null;
    if (url) await sleep(500);
  }

  return campaigns;
}

async function fetchCampaignMetrics(apiKey: string) {
  const res = await fetch(`${KLAVIYO_BASE}/campaign-values-reports/`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({
      data: {
        type: "campaign-values-report",
        attributes: {
          statistics: [
            "opens",
            "clicks",
            "recipients",
            "unsubscribes",
            "conversion_value",
            "conversions",
          ],
          timeframe: { key: "last_365_days" },
          conversion_metric_id: CONVERSION_METRIC_ID,
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`Klaviyo metrics error: ${res.status}`);
  const json = await res.json();
  return json.data?.attributes?.results || [];
}

export async function syncKlaviyo() {
  const apiKey = process.env.KLAVIYO_API_KEY;
  if (!apiKey) throw new Error("KLAVIYO_API_KEY not configured");

  const supabase = await createServiceClient();

  // Fetch email + SMS campaigns
  const [emailCampaigns, smsCampaigns] = await Promise.all([
    fetchAllCampaigns(apiKey, "email"),
    fetchAllCampaigns(apiKey, "sms"),
  ]);

  // Fetch metrics for all campaigns
  const metrics = await fetchCampaignMetrics(apiKey);
  const metricsMap = new Map<string, Record<string, number>>();
  for (const m of metrics) {
    metricsMap.set(m.groupings.campaign_id, m.statistics);
  }

  let synced = 0;

  // Upsert email campaigns with metrics
  for (const campaign of emailCampaigns) {
    const a = campaign.attributes;
    const m = metricsMap.get(campaign.id) || {};
    const recipients = (m.recipients as number) || 0;
    const opens = (m.opens as number) || 0;
    const clicks = (m.clicks as number) || 0;

    await supabase.from("klaviyo_campaigns").upsert(
      {
        klaviyo_id: campaign.id,
        name: a.name as string,
        status: a.status as string,
        channel: "email",
        send_time: (a.send_time as string) || null,
        recipients,
        opens,
        clicks,
        conversions: (m.conversions as number) || 0,
        revenue: (m.conversion_value as number) || 0,
        unsubscribes: (m.unsubscribes as number) || 0,
        open_rate: recipients > 0 ? opens / recipients : 0,
        click_rate: recipients > 0 ? clicks / recipients : 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "klaviyo_id" }
    );
    synced++;
  }

  // Upsert SMS campaigns
  for (const campaign of smsCampaigns) {
    const a = campaign.attributes;
    await supabase.from("klaviyo_campaigns").upsert(
      {
        klaviyo_id: campaign.id,
        name: a.name as string,
        status: a.status as string,
        channel: "sms",
        send_time: (a.send_time as string) || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "klaviyo_id" }
    );
    synced++;
  }

  return synced;
}
