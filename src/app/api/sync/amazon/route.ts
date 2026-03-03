import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  syncAmazonOrders,
  syncAmazonInventory,
  calculateAmazonPnl,
  AmazonCredentials,
} from "@/lib/sync/amazon";
import { decrypt } from "@/lib/crypto";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Optional backfill date range in request body
  let fromDate: string | undefined;
  let toDate: string | undefined;
  try {
    const body = await request.json().catch(() => ({}));
    fromDate = body.from_date;
    toDate = body.to_date;
  } catch {
    // no body, normal sync
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

    try {
      const orders = await syncAmazonOrders(
        account.id,
        account.marketplace_id,
        creds,
        fromDate,
        toDate
      );
      const inventory = await syncAmazonInventory(account.id, account.marketplace_id, creds);
      await calculateAmazonPnl(account.id);

      results[account.name] = { orders, inventory, pnl: "calculated" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      results[account.name] = { error: message };
    }
  }

  return NextResponse.json({ success: true, results });
}
