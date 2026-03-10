import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";

export type OptimonkCampaign = {
  id: string;
  optimonk_id: number;
  name: string;
  status: string;
  impressions: number;
  conversions: number;
  conversion_rate: number;
  variants_count: number;
};

export const getOptimonkCampaigns = unstable_cache(
  async (): Promise<OptimonkCampaign[]> => {
    const supabase = await createServiceClient();
    const { data } = await supabase
      .from("optimonk_campaigns")
      .select("*")
      .order("impressions", { ascending: false });

    return (data || []).map((row) => ({
      id: row.id,
      optimonk_id: row.optimonk_id,
      name: row.name || "",
      status: row.status || "active",
      impressions: row.impressions || 0,
      conversions: row.conversions || 0,
      conversion_rate: row.conversion_rate || 0,
      variants_count: row.variants_count || 0,
    }));
  },
  ["optimonk-campaigns-v1"],
  { revalidate: 1800, tags: ["dashboard-data"] }
);

export const getOptimonkOverview = unstable_cache(
  async () => {
    const supabase = await createServiceClient();
    const { data } = await supabase
      .from("optimonk_campaigns")
      .select("status, impressions, conversions, conversion_rate");

    let totalCampaigns = 0;
    let activeCampaigns = 0;
    let totalImpressions = 0;
    let totalConversions = 0;

    for (const row of data || []) {
      totalCampaigns++;
      if (row.status === "active") activeCampaigns++;
      totalImpressions += row.impressions || 0;
      totalConversions += row.conversions || 0;
    }

    const avgConversionRate =
      totalImpressions > 0 ? totalConversions / totalImpressions : 0;

    return {
      totalCampaigns,
      activeCampaigns,
      totalImpressions,
      totalConversions,
      avgConversionRate,
    };
  },
  ["optimonk-overview-v1"],
  { revalidate: 1800, tags: ["dashboard-data"] }
);
