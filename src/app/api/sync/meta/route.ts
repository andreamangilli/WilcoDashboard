import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { syncMetaAds, MetaAdsCredentials } from "@/lib/sync/meta-ads";
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
    .from("ad_accounts")
    .select("id, account_id, account_name, credentials")
    .eq("platform", "meta");

  const results: Record<string, unknown> = {};

  for (const account of accounts || []) {
    if (!account.credentials) {
      results[account.account_name || account.account_id] = { error: "No credentials configured" };
      continue;
    }

    const creds = decrypt(account.credentials) as unknown as MetaAdsCredentials;
    if (!creds.access_token) {
      results[account.account_name || account.account_id] = { error: "Missing access_token" };
      continue;
    }

    const logId = await logSyncStart(`meta_${account.account_name}`);
    try {
      const synced = await syncMetaAds(account.id, account.account_id, creds);
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
