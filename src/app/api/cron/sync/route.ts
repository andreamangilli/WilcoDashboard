import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { runAllSyncs } from "@/lib/sync/orchestrator";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await runAllSyncs();

  revalidateTag("dashboard-data", "max");

  return NextResponse.json({ success: true, results });
}
