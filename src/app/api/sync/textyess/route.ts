import { NextRequest, NextResponse } from "next/server";
import { syncTextyess } from "@/lib/sync/textyess";
import { logSyncStart, logSyncSuccess, logSyncError } from "@/lib/sync/utils";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.TEXTYESS_TOKEN) {
    return NextResponse.json({ success: true, results: { skipped: "No TEXTYESS_TOKEN configured" } });
  }

  const logId = await logSyncStart("textyess");
  try {
    const synced = await syncTextyess();
    await logSyncSuccess(logId, synced);
    return NextResponse.json({ success: true, results: { synced } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await logSyncError(logId, message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
