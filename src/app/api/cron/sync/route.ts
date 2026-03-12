import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

export const maxDuration = 300;

const SYNC_ROUTES = [
  "shopify",
  "amazon",
  "google",
  "meta",
  "klaviyo",
  "optimonk",
  "textyess",
];

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseUrl = request.nextUrl.origin;
  const headers = {
    Authorization: `Bearer ${process.env.CRON_SECRET}`,
    "Content-Type": "application/json",
  };

  // Fire all sync routes in parallel — each runs in its own
  // serverless function invocation with its own 5-min timeout
  const results: Record<string, unknown> = {};

  await Promise.all(
    SYNC_ROUTES.map(async (name) => {
      try {
        const res = await fetch(`${baseUrl}/api/sync/${name}`, {
          method: "POST",
          headers,
        });
        const data = await res.json();
        results[name] = { ok: res.ok, ...data };
      } catch (err) {
        results[name] = {
          ok: false,
          error: err instanceof Error ? err.message : "Failed",
        };
      }
    })
  );

  revalidateTag("dashboard-data", "max");

  return NextResponse.json({ success: true, results });
}
