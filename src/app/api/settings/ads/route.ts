import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ad_accounts")
    .select("id, platform, account_id, account_name, store_id, credentials, created_at")
    .order("platform, account_name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const masked = (data || []).map(a => ({
    ...a,
    has_credentials: !!a.credentials,
    credentials: undefined,
  }));

  return NextResponse.json(masked);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();
  const { platform, account_id, account_name, ...creds } = body;

  if (!platform || !account_id || !account_name) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // For Google: { developer_token, client_id, client_secret, refresh_token, manager_id }
  // For Meta: { access_token }
  const credentials = encrypt(creds);

  const { data, error } = await supabase
    .from("ad_accounts")
    .insert({ platform, account_id, account_name, credentials })
    .select("id, platform, account_id, account_name")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();
  const { id, platform, account_id, account_name, ...creds } = body;

  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (account_id) updates.account_id = account_id;
  if (account_name) updates.account_name = account_name;
  if (Object.keys(creds).length > 0) {
    updates.credentials = encrypt(creds);
  }

  const { error } = await supabase.from("ad_accounts").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { id } = await request.json();
  const { error } = await supabase.from("ad_accounts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
