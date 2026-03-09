/**
 * Sync Google Ads campaigns + ad groups + daily metrics (last 90 days) via gRPC library.
 * Usage: node --env-file=.env.local scripts/sync-google-now.mjs
 */
import { GoogleAdsApi, enums } from "google-ads-api";
import { createClient } from "@supabase/supabase-js";
import { createDecipheriv } from "crypto";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function decrypt(s) {
  const key = Buffer.from(process.env.ENCRYPTION_KEY, "hex");
  const [iv, tag, ct] = s.split(":");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  d.setAuthTag(Buffer.from(tag, "hex"));
  return JSON.parse(d.update(ct, "hex", "utf8") + d.final("utf8"));
}

function formatDate(d) {
  return d.toISOString().split("T")[0];
}

function campaignStatusLabel(status) {
  if (status === 2) return "ENABLED";
  if (status === 3) return "PAUSED";
  return "REMOVED";
}

function channelTypeLabel(type) {
  const map = {
    2: "SEARCH",
    3: "DISPLAY",
    4: "SHOPPING",
    5: "HOTEL",
    6: "VIDEO",
    7: "MULTI_CHANNEL",
    8: "LOCAL",
    9: "SMART",
    10: "PERFORMANCE_MAX",
    11: "LOCAL_SERVICES",
    12: "DISCOVERY",
    13: "TRAVEL",
    14: "DEMAND_GEN",
  };
  return map[type] || `UNKNOWN_${type}`;
}

function biddingStrategyLabel(type) {
  const map = {
    2: "COMMISSION",
    3: "ENHANCED_CPC",
    5: "MANUAL_CPC",
    6: "MANUAL_CPM",
    7: "MANUAL_CPV",
    9: "MAXIMIZE_CONVERSIONS",
    10: "MAXIMIZE_CONVERSION_VALUE",
    11: "TARGET_CPA",
    12: "TARGET_IMPRESSION_SHARE",
    13: "TARGET_ROAS",
    14: "TARGET_SPEND",
    15: "PERCENT_CPC",
    16: "TARGET_CPM",
  };
  return map[type] || `UNKNOWN_${type}`;
}

async function main() {
  const { data: accounts } = await supabase
    .from("ad_accounts")
    .select("id, account_id, account_name, credentials")
    .eq("platform", "google");

  if (!accounts || accounts.length === 0) {
    console.log("Nessun account Google Ads trovato.");
    return;
  }

  for (const account of accounts) {
    console.log(`\n=== ${account.account_name} (${account.account_id}) ===`);

    if (!account.credentials) {
      console.log("  Nessuna credenziale, skip.");
      continue;
    }

    const creds = decrypt(account.credentials);

    const client = new GoogleAdsApi({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      developer_token: creds.developer_token,
    });

    const customer = client.Customer({
      customer_id: account.account_id.replace(/-/g, ""),
      login_customer_id: creds.manager_id ? creds.manager_id.replace(/-/g, "") : undefined,
      refresh_token: creds.refresh_token,
    });

    const today = new Date();
    const since = new Date(today);
    since.setDate(since.getDate() - 90);

    console.log(`  Periodo: ${formatDate(since)} → ${formatDate(today)}`);

    try {
      // --- 1. Campaign metadata ---
      console.log("\n  [1/3] Sync campagne...");
      const campaignRows = await customer.query(`
        SELECT
          campaign.id,
          campaign.name,
          campaign.status,
          campaign.advertising_channel_type,
          campaign.bidding_strategy_type
        FROM campaign
        ORDER BY campaign.name
      `);

      for (const row of campaignRows) {
        const c = row.campaign;
        await supabase.from("ad_campaigns").upsert(
          {
            ad_account_id: account.id,
            campaign_id: String(c.id),
            campaign_name: c.name,
            status: campaignStatusLabel(c.status),
            campaign_type: channelTypeLabel(c.advertising_channel_type),
            bidding_strategy: biddingStrategyLabel(c.bidding_strategy_type),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "ad_account_id,campaign_id" }
        );
      }
      console.log(`  ${campaignRows.length} campagne sincronizzate`);

      // --- 2. Campaign daily metrics ---
      console.log("  [2/3] Sync metriche giornaliere campagne...");
      const dailyRows = await customer.query(`
        SELECT
          campaign.id,
          metrics.cost_micros,
          metrics.impressions,
          metrics.clicks,
          metrics.conversions,
          metrics.conversions_value,
          segments.date
        FROM campaign
        WHERE segments.date BETWEEN '${formatDate(since)}' AND '${formatDate(today)}'
        ORDER BY segments.date DESC
      `);

      let synced = 0;
      for (const row of dailyRows) {
        const spend = (row.metrics.cost_micros || 0) / 1_000_000;
        const revenue = row.metrics.conversions_value || 0;

        await supabase.from("ad_spend_daily").upsert(
          {
            ad_account_id: account.id,
            campaign_id: String(row.campaign.id),
            date: row.segments.date,
            spend,
            impressions: row.metrics.impressions || 0,
            clicks: row.metrics.clicks || 0,
            conversions: row.metrics.conversions || 0,
            revenue,
            roas: spend > 0 ? revenue / spend : 0,
          },
          { onConflict: "ad_account_id,campaign_id,date" }
        );
        synced++;
      }
      console.log(`  ${synced} righe giornaliere`);

      // --- 3. Ad group daily metrics ---
      console.log("  [3/3] Sync gruppi di annunci...");
      const adGroupRows = await customer.query(`
        SELECT
          campaign.id,
          ad_group.id,
          ad_group.name,
          ad_group.status,
          metrics.cost_micros,
          metrics.impressions,
          metrics.clicks,
          metrics.conversions,
          metrics.conversions_value,
          segments.date
        FROM ad_group
        WHERE segments.date BETWEEN '${formatDate(since)}' AND '${formatDate(today)}'
        ORDER BY segments.date DESC
      `);

      let agSynced = 0;
      for (const row of adGroupRows) {
        const spend = (row.metrics.cost_micros || 0) / 1_000_000;
        const revenue = row.metrics.conversions_value || 0;

        await supabase.from("ad_group_daily").upsert(
          {
            ad_account_id: account.id,
            campaign_id: String(row.campaign.id),
            ad_group_id: String(row.ad_group.id),
            ad_group_name: row.ad_group.name,
            ad_group_status: campaignStatusLabel(row.ad_group.status),
            date: row.segments.date,
            spend,
            impressions: row.metrics.impressions || 0,
            clicks: row.metrics.clicks || 0,
            conversions: row.metrics.conversions || 0,
            revenue,
          },
          { onConflict: "ad_account_id,campaign_id,ad_group_id,date" }
        );
        agSynced++;
      }
      console.log(`  ${agSynced} righe gruppi di annunci`);

      // --- 4. Asset groups (Performance Max) ---
      console.log("  [4/4] Sync asset groups (PMax)...");
      try {
        const assetGroupRows = await customer.query(`
          SELECT
            campaign.id,
            asset_group.id,
            asset_group.name,
            asset_group.status,
            metrics.cost_micros,
            metrics.impressions,
            metrics.clicks,
            metrics.conversions,
            metrics.conversions_value,
            segments.date
          FROM asset_group
          WHERE segments.date BETWEEN '${formatDate(since)}' AND '${formatDate(today)}'
          ORDER BY segments.date DESC
        `);

        let agSynced2 = 0;
        for (const row of assetGroupRows) {
          const spend = (row.metrics.cost_micros || 0) / 1_000_000;
          const revenue = row.metrics.conversions_value || 0;

          await supabase.from("ad_group_daily").upsert(
            {
              ad_account_id: account.id,
              campaign_id: String(row.campaign.id),
              ad_group_id: "ag_" + String(row.asset_group.id),
              ad_group_name: row.asset_group.name,
              ad_group_status: campaignStatusLabel(row.asset_group.status),
              date: row.segments.date,
              spend,
              impressions: row.metrics.impressions || 0,
              clicks: row.metrics.clicks || 0,
              conversions: row.metrics.conversions || 0,
              revenue,
            },
            { onConflict: "ad_account_id,campaign_id,ad_group_id,date" }
          );
          agSynced2++;
        }
        console.log(`  ${agSynced2} righe asset groups`);
      } catch (err) {
        console.log(`  Asset groups skip: ${err.message}`);
      }

      // --- Riepilogo ---
      const { data: totals } = await supabase
        .from("ad_spend_daily")
        .select("spend, revenue, clicks, impressions, conversions")
        .eq("ad_account_id", account.id)
        .gte("date", formatDate(since));

      if (totals && totals.length > 0) {
        const t = totals.reduce(
          (acc, r) => ({
            spend: acc.spend + (r.spend || 0),
            revenue: acc.revenue + (r.revenue || 0),
            clicks: acc.clicks + (r.clicks || 0),
            impressions: acc.impressions + (r.impressions || 0),
            conversions: acc.conversions + (r.conversions || 0),
          }),
          { spend: 0, revenue: 0, clicks: 0, impressions: 0, conversions: 0 }
        );

        console.log(`\n  Totali (ultimi 90gg):`);
        console.log(`    Spesa:       €${t.spend.toFixed(2)}`);
        console.log(`    Revenue:     €${t.revenue.toFixed(2)}`);
        console.log(`    ROAS:        ${t.spend > 0 ? (t.revenue / t.spend).toFixed(2) : "N/A"}`);
        console.log(`    Click:       ${t.clicks}`);
        console.log(`    Impressions: ${t.impressions}`);
        console.log(`    Conversioni: ${t.conversions.toFixed(0)}`);
      }
    } catch (err) {
      console.error(`  Errore:`, err.message);
      if (err.errors) {
        for (const e of err.errors) {
          console.error("  Dettaglio:", JSON.stringify(e));
        }
      }
    }
  }

  console.log("\nSync Google Ads completato.");
}

main().catch(console.error);
