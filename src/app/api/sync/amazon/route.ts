import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  syncAmazonOrders,
  syncAmazonInventory,
  calculateAmazonPnl,
  AmazonCredentials,
} from "@/lib/sync/amazon";
import { logSyncStart, logSyncSuccess, logSyncError } from "@/lib/sync/utils";
import { decrypt } from "@/lib/crypto";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServiceClient();
  const { data: accounts } = await supabase
    .from("amazon_accounts")
    .select("id, name, marketplace_id, credentials");

  const results: Record<string, unknown> = {};

  for (const account of accounts || []) {
    if (!account.credentials) {
      results[account.name] = { error: "No credentials configured" };
      continue;
    }

    const creds = decrypt(account.credentials) as unknown as AmazonCredentials;
    if (!creds.client_id || !creds.client_secret || !creds.refresh_token) {
      results[account.name] = { error: "Incomplete credentials" };
      continue;
    }

    const logId = await logSyncStart(`amazon_${account.name}`);

    try {
      const orders = await syncAmazonOrders(account.id, account.marketplace_id, creds);
      const inventory = await syncAmazonInventory(account.id, account.marketplace_id, creds);
      await calculateAmazonPnl(account.id);

      await logSyncSuccess(logId, orders + inventory);
      results[account.name] = { orders, inventory, pnl: "calculated" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await logSyncError(logId, message);
      results[account.name] = { error: message };
    }
  }

  return NextResponse.json({ success: true, results });
}
