import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  syncAmazonOrders,
  syncAmazonInventory,
  calculateAmazonPnl,
} from "@/lib/sync/amazon";
import { logSyncStart, logSyncSuccess, logSyncError } from "@/lib/sync/utils";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServiceClient();
  const { data: accounts } = await supabase
    .from("amazon_accounts")
    .select("id, name");

  const results: Record<string, unknown> = {};

  for (const account of accounts || []) {
    const logId = await logSyncStart(`amazon_${account.name}`);

    try {
      const orders = await syncAmazonOrders(account.id);
      const inventory = await syncAmazonInventory(account.id);
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
