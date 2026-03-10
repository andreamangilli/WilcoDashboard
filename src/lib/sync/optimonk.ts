import { createServiceClient } from "@/lib/supabase/server";
import { sleep } from "./utils";

const OPTIMONK_BASE = "https://api.optimonk.com/v1";

interface OptimonkCampaign {
  id: number;
  name: string;
  status: string;
  impressions: number;
  conversions: number;
  conversionRate: number;
  variants: Array<{
    name: string;
    status: string;
    impressions: number;
    conversions: number;
    conversionRate: number;
  }>;
}

interface CampaignsResponse {
  campaigns: OptimonkCampaign[];
  total: number;
  currentPage: number;
  totalPages: number;
}

async function fetchAllCampaigns(apiKey: string): Promise<OptimonkCampaign[]> {
  const campaigns: OptimonkCampaign[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const res = await fetch(`${OPTIMONK_BASE}/campaigns?page=${page}`, {
      headers: { "x-api-key": apiKey },
    });

    if (res.status === 429) {
      await sleep(2000);
      continue;
    }
    if (!res.ok) throw new Error(`OptiMonk campaigns error: ${res.status}`);

    const json: CampaignsResponse = await res.json();
    campaigns.push(...json.campaigns);
    totalPages = json.totalPages;
    page++;

    if (page <= totalPages) await sleep(500);
  }

  return campaigns;
}

export async function syncOptimonk() {
  const apiKey = process.env.OPTIMONK_API_KEY;
  if (!apiKey) throw new Error("OPTIMONK_API_KEY not configured");

  const supabase = await createServiceClient();
  const campaigns = await fetchAllCampaigns(apiKey);

  let synced = 0;

  for (const campaign of campaigns) {
    const activeVariants = campaign.variants.filter(
      (v) => v.status === "active"
    );

    await supabase.from("optimonk_campaigns").upsert(
      {
        optimonk_id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        impressions: campaign.impressions,
        conversions: campaign.conversions,
        conversion_rate: campaign.conversionRate,
        variants_count: activeVariants.length,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "optimonk_id" }
    );
    synced++;
  }

  return synced;
}
