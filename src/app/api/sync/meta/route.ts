import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { syncMetaAds } from "@/lib/sync/meta-ads";
import { logSyncStart, logSyncSuccess, logSyncError } from "@/lib/sync/utils";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServiceClient();
  const { data: accounts } = await supabase
    .from("ad_accounts")
    .select("id, account_id, account_name")
    .eq("platform", "meta");

  const results: Record<string, unknown> = {};

  for (const account of accounts || []) {
    const logId = await logSyncStart(`meta_${account.account_name}`);
    try {
      const synced = await syncMetaAds(account.id, account.account_id);
      await logSyncSuccess(logId, synced);
      results[account.account_name || account.account_id] = { synced };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await logSyncError(logId, message);
      results[account.account_name || account.account_id] = { error: message };
    }
  }

  return NextResponse.json({ success: true, results });
}
