import { NextRequest, NextResponse } from "next/server";
import {
  syncShopifyOrders,
  syncShopifyProducts,
  syncShopifyCustomers,
} from "@/lib/sync/shopify";
import { logSyncStart, logSyncSuccess, logSyncError } from "@/lib/sync/utils";
import { createServiceClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServiceClient();
  const { data: stores } = await supabase
    .from("stores")
    .select("id, slug, shopify_domain, credentials");

  const results: Record<string, unknown> = {};

  for (const store of stores || []) {
    if (!store.credentials || !store.shopify_domain) {
      results[store.slug] = { error: "No credentials configured" };
      continue;
    }

    const creds = decrypt(store.credentials) as { access_token: string };
    if (!creds.access_token) {
      results[store.slug] = { error: "Missing access_token in credentials" };
      continue;
    }

    const config = {
      storeId: store.id,
      domain: store.shopify_domain,
      accessToken: creds.access_token,
    };

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
