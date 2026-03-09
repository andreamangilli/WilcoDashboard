import { NextRequest, NextResponse } from "next/server";
import { syncKlaviyo } from "@/lib/sync/klaviyo";
import { logSyncStart, logSyncSuccess, logSyncError } from "@/lib/sync/utils";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.KLAVIYO_API_KEY) {
    return NextResponse.json({ success: true, results: { skipped: "No KLAVIYO_API_KEY configured" } });
  }

  const logId = await logSyncStart("klaviyo");
  try {
    const synced = await syncKlaviyo();
    await logSyncSuccess(logId, synced);
    return NextResponse.json({ success: true, results: { synced } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await logSyncError(logId, message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
