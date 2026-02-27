import { NextRequest, NextResponse } from "next/server";
import {
  syncShopifyOrders,
  syncShopifyProducts,
  syncShopifyCustomers,
  getShopifyStoreConfigs,
} from "@/lib/sync/shopify";
import { logSyncStart, logSyncSuccess, logSyncError } from "@/lib/sync/utils";
import { createServiceClient } from "@/lib/supabase/server";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServiceClient();
  const { data: stores } = await supabase
    .from("stores")
    .select("id, slug, shopify_domain");

  const configs = getShopifyStoreConfigs();
  const results: Record<string, unknown> = {};

  for (const store of stores || []) {
    const config = configs.find((c) => c.domain === store.shopify_domain);
    if (!config) continue;

    config.storeId = store.id;
    const logId = await logSyncStart(`shopify_${store.slug}`);

    try {
      const orders = await syncShopifyOrders(config);
      const products = await syncShopifyProducts(config);
      const customers = await syncShopifyCustomers(config);
      const total = orders + products + customers;

      await logSyncSuccess(logId, total);
      results[store.slug] = { orders, products, customers };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await logSyncError(logId, message);
      results[store.slug] = { error: message };
    }
  }

  return NextResponse.json({ success: true, results });
}
