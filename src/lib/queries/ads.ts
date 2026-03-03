import { createClient } from "@/lib/supabase/server";
import { getDateRange } from "./utils";

export async function getAdsOverview(period: string, from?: string, to?: string) {
  const supabase = await createClient();
  const { start, end } = getDateRange(period, from, to);
  const startDate = start.split("T")[0];
  const endDate = end.split("T")[0];

  const { data: googleAccounts } = await supabase
    .from("ad_accounts")
    .select("id")
    .eq("platform", "google");

  const { data: metaAccounts } = await supabase
    .from("ad_accounts")
    .select("id")
    .eq("platform", "meta");

  const googleIds = (googleAccounts || []).map((a) => a.id);
  const metaIds = (metaAccounts || []).map((a) => a.id);

  const { data: googleSpend } = await supabase
    .from("ad_spend_daily")
    .select("spend, impressions, clicks, conversions, revenue")
    .in("ad_account_id", googleIds)
    .gte("date", startDate)
    .lte("date", endDate);

  const { data: metaSpend } = await supabase
    .from("ad_spend_daily")
    .select("spend, impressions, clicks, conversions, revenue")
    .in("ad_account_id", metaIds)
    .gte("date", startDate)
    .lte("date", endDate);

  function aggregate(rows: typeof googleSpend) {
    return (rows || []).reduce(
      (acc, r) => ({
        spend: acc.spend + (r.spend || 0),
        impressions: acc.impressions + (r.impressions || 0),
        clicks: acc.clicks + (r.clicks || 0),
        conversions: acc.conversions + (r.conversions || 0),
        revenue: acc.revenue + (r.revenue || 0),
      }),
      { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 }
    );
  }

  const google = aggregate(googleSpend);
  const meta = aggregate(metaSpend);

  return {
    google: {
      ...google,
      roas: google.spend > 0 ? google.revenue / google.spend : 0,
    },
    meta: {
      ...meta,
      roas: meta.spend > 0 ? meta.revenue / meta.spend : 0,
    },
    total: {
      spend: google.spend + meta.spend,
      revenue: google.revenue + meta.revenue,
      roas:
        google.spend + meta.spend > 0
          ? (google.revenue + meta.revenue) / (google.spend + meta.spend)
          : 0,
    },
  };
}

export async function getAdsCampaigns(platform: "google" | "meta") {
  const supabase = await createClient();

  const { data: accounts } = await supabase
    .from("ad_accounts")
    .select("id")
    .eq("platform", platform);

  const accountIds = (accounts || []).map((a) => a.id);

  const { data } = await supabase
    .from("ad_campaigns")
    .select("*")
    .in("ad_account_id", accountIds)
    .order("campaign_name");

  return data || [];
}

export async function getAdsDailySpend(
  platform: "google" | "meta",
  period: string,
  from?: string,
  to?: string
) {
  const supabase = await createClient();
  const { start, end } = getDateRange(period, from, to);

  const { data: accounts } = await supabase
    .from("ad_accounts")
    .select("id")
    .eq("platform", platform);

  const accountIds = (accounts || []).map((a) => a.id);

  const { data } = await supabase
    .from("ad_spend_daily")
    .select("date, spend, impressions, clicks, conversions, revenue")
    .in("ad_account_id", accountIds)
    .gte("date", start.split("T")[0])
    .lte("date", end.split("T")[0])
    .order("date");

  // Aggregate by date (across campaigns)
  const byDate: Record<
    string,
    {
      date: string;
      spend: number;
      impressions: number;
      clicks: number;
      conversions: number;
      revenue: number;
    }
  > = {};
  for (const row of data || []) {
    if (!byDate[row.date]) {
      byDate[row.date] = {
        date: row.date,
        spend: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        revenue: 0,
      };
    }
    byDate[row.date].spend += row.spend || 0;
    byDate[row.date].impressions += row.impressions || 0;
    byDate[row.date].clicks += row.clicks || 0;
    byDate[row.date].conversions += row.conversions || 0;
    byDate[row.date].revenue += row.revenue || 0;
  }

  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
}
