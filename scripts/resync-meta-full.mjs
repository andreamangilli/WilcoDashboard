/**
 * Full re-sync of Meta Ads using the new account-level insights approach.
 * Syncs last 90 days of data with proper pagination and attribution.
 * Usage: node --env-file=.env.local scripts/resync-meta-full.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { createDecipheriv } from "crypto";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function decrypt(enc) {
  const key = Buffer.from(process.env.ENCRYPTION_KEY, "hex");
  const [iv, tag, data] = enc.split(":");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  d.setAuthTag(Buffer.from(tag, "hex"));
  let r = d.update(data, "hex", "utf8");
  r += d.final("utf8");
  return JSON.parse(r);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchAllPages(url) {
  const results = [];
  let nextUrl = url;
  while (nextUrl) {
    const res = await fetch(nextUrl);
    const json = await res.json();
    if (json.error) { console.error("API Error:", json.error); return results; }
    results.push(...(json.data || []));
    nextUrl = json.paging?.next || null;
    await sleep(300);
  }
  return results;
}

const { data: accounts } = await supabase
  .from("ad_accounts")
  .select("id, account_id, account_name, credentials")
  .eq("platform", "meta");

for (const account of accounts || []) {
  if (!account.credentials) continue;
  const creds = decrypt(account.credentials);
  console.log(`▶ ${account.account_name} (${account.account_id})`);

  // Fetch campaign-level daily insights for last 90 days
  const since = new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];
  const until = new Date().toISOString().split("T")[0];

  console.log(`  Fetching insights (${since} → ${until})...`);
  const url =
    `https://graph.facebook.com/v21.0/act_${account.account_id}/insights?` +
    new URLSearchParams({
      fields: "campaign_id,campaign_name,spend,impressions,clicks,actions,action_values,reach,frequency",
      time_range: JSON.stringify({ since, until }),
      time_increment: "1",
      level: "campaign",
      action_attribution_windows: JSON.stringify(["7d_click", "1d_view"]),
      access_token: creds.access_token,
      limit: "500",
    });

  const insights = await fetchAllPages(url);
  console.log(`  ${insights.length} righe da API`);

  let synced = 0;
  for (const day of insights) {
    const spend = parseFloat(day.spend || "0");
    const conversions = parseFloat(
      day.actions?.find((a) => a.action_type === "purchase")?.value || "0"
    );
    const revenue = parseFloat(
      day.action_values?.find((a) => a.action_type === "purchase")?.value || "0"
    );

    await supabase.from("ad_spend_daily").upsert(
      {
        ad_account_id: account.id,
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

  console.log(`  ✓ ${synced} righe sincronizzate`);

  // Verify Feb numbers
  const { data: febData } = await supabase
    .from("ad_spend_daily")
    .select("spend, revenue, conversions")
    .eq("ad_account_id", account.id)
    .gte("date", "2026-02-01")
    .lte("date", "2026-02-28");

  const totals = (febData || []).reduce(
    (acc, r) => ({
      spend: acc.spend + (r.spend || 0),
      revenue: acc.revenue + (r.revenue || 0),
      conversions: acc.conversions + (r.conversions || 0),
    }),
    { spend: 0, revenue: 0, conversions: 0 }
  );

  console.log(`\n  ── Verifica Feb 2026 ──`);
  console.log(`  Dashboard: €${totals.spend.toFixed(2)} spesa | €${totals.revenue.toFixed(2)} revenue`);
  console.log(`  Meta BM:   €20,557.23 spesa | €37,077.77 revenue`);
  console.log(`  Match:     ${Math.abs(totals.spend - 20557.23) < 1 ? '✅' : '❌'} spesa | ${Math.abs(totals.revenue - 37077.77) < 1 ? '✅' : '❌'} revenue`);
}
