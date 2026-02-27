import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  const sources = ["shopify", "amazon", "google", "meta"];
  const results: Record<string, unknown> = {};

  for (const source of sources) {
    try {
      const res = await fetch(`${baseUrl}/api/sync/${source}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      });
      results[source] = await res.json();
    } catch (err) {
      results[source] = {
        error: err instanceof Error ? err.message : "Failed",
      };
    }
  }

  return NextResponse.json({ success: true, results });
}
