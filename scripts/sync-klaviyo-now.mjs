/**
 * Sync Klaviyo email campaigns + metrics.
 * Usage: node --env-file=.env.local scripts/sync-klaviyo-now.mjs
 */
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const KLAVIYO_API_KEY = process.env.KLAVIYO_API_KEY;
const KLAVIYO_BASE = "https://a.klaviyo.com/api";
const REVISION = "2024-10-15";
// Placed Order (Shopify) metric ID for conversion tracking
const CONVERSION_METRIC_ID = "Refypm";

function headers() {
  return {
    Authorization: `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
    revision: REVISION,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchAllCampaigns() {
  const campaigns = [];
  let url = `${KLAVIYO_BASE}/campaigns/?filter=equals(messages.channel,'email')`;

  while (url) {
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) throw new Error(`Klaviyo campaigns error: ${res.status} ${await res.text()}`);
    const json = await res.json();
    campaigns.push(...(json.data || []));
    url = json.links?.next || null;
    if (url) await sleep(500);
  }

  return campaigns;
}

async function fetchCampaignMetrics() {
  const res = await fetch(`${KLAVIYO_BASE}/campaign-values-reports/`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      data: {
        type: "campaign-values-report",
        attributes: {
          statistics: ["opens", "clicks", "recipients", "unsubscribes", "conversion_value", "conversions"],
          timeframe: { key: "last_365_days" },
          conversion_metric_id: CONVERSION_METRIC_ID,
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`Klaviyo metrics error: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.data?.attributes?.results || [];
}

async function main() {
  if (!KLAVIYO_API_KEY) {
    console.error("KLAVIYO_API_KEY non configurata in .env.local");
    process.exit(1);
  }

  console.log("Fetching campagne Klaviyo...");
  const campaigns = await fetchAllCampaigns();
  console.log(`${campaigns.length} campagne trovate`);

  console.log("Fetching metriche...");
  const metrics = await fetchCampaignMetrics();
  console.log(`${metrics.length} campagne con metriche`);

  // Index metrics by campaign_id
  const metricsMap = new Map();
  for (const m of metrics) {
    metricsMap.set(m.groupings.campaign_id, m.statistics);
  }

  let synced = 0;
  let totalRevenue = 0;
  let totalOpens = 0;
  let totalClicks = 0;

  for (const campaign of campaigns) {
    const a = campaign.attributes;
    const m = metricsMap.get(campaign.id) || {};

    const recipients = m.recipients || 0;
    const opens = m.opens || 0;
    const clicks = m.clicks || 0;
    const conversions = m.conversions || 0;
    const revenue = m.conversion_value || 0;
    const unsubscribes = m.unsubscribes || 0;

    totalRevenue += revenue;
    totalOpens += opens;
    totalClicks += clicks;

    await supabase.from("klaviyo_campaigns").upsert(
      {
        klaviyo_id: campaign.id,
        name: a.name,
        status: a.status,
        channel: "email",
        send_time: a.send_time,
        recipients,
        opens,
        clicks,
        conversions,
        revenue,
        unsubscribes,
        open_rate: recipients > 0 ? opens / recipients : 0,
        click_rate: recipients > 0 ? clicks / recipients : 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "klaviyo_id" }
    );
    synced++;
  }

  console.log(`\n${synced} campagne sincronizzate`);
  console.log(`Totali:`);
  console.log(`  Revenue:     €${totalRevenue.toFixed(2)}`);
  console.log(`  Aperture:    ${totalOpens}`);
  console.log(`  Click:       ${totalClicks}`);

  // Also fetch SMS campaigns
  console.log("\nFetching campagne SMS...");
  let smsUrl = `${KLAVIYO_BASE}/campaigns/?filter=equals(messages.channel,'sms')`;
  let smsCampaigns = [];
  while (smsUrl) {
    const res = await fetch(smsUrl, { headers: headers() });
    if (!res.ok) break;
    const json = await res.json();
    smsCampaigns.push(...(json.data || []));
    smsUrl = json.links?.next || null;
    if (smsUrl) await sleep(500);
  }

  if (smsCampaigns.length > 0) {
    for (const campaign of smsCampaigns) {
      const a = campaign.attributes;
      await supabase.from("klaviyo_campaigns").upsert(
        {
          klaviyo_id: campaign.id,
          name: a.name,
          status: a.status,
          channel: "sms",
          send_time: a.send_time,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "klaviyo_id" }
      );
    }
    console.log(`${smsCampaigns.length} campagne SMS sincronizzate`);
  } else {
    console.log("Nessuna campagna SMS trovata.");
  }

  console.log("\nSync Klaviyo completato.");
}

main().catch(console.error);
