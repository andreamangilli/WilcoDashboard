import { NextRequest, NextResponse } from "next/server";
import { syncOptimonk } from "@/lib/sync/optimonk";
import { logSyncStart, logSyncSuccess, logSyncError } from "@/lib/sync/utils";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.OPTIMONK_API_KEY) {
    return NextResponse.json({ success: true, results: { skipped: "No OPTIMONK_API_KEY configured" } });
  }

  const logId = await logSyncStart("optimonk");
  try {
    const synced = await syncOptimonk();
    await logSyncSuccess(logId, synced);
    return NextResponse.json({ success: true, results: { synced } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await logSyncError(logId, message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
