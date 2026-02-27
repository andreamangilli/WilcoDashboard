import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("amazon_accounts")
    .select("id, name, marketplace_id, seller_id, credentials, created_at")
    .order("name");

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
  const { name, marketplace_id, seller_id, client_id, client_secret, refresh_token } = body;

  if (!name || !marketplace_id) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const credentials = encrypt({ client_id, client_secret, refresh_token });

  const { data, error } = await supabase
    .from("amazon_accounts")
    .insert({ name, marketplace_id, seller_id, credentials })
    .select("id, name, marketplace_id, seller_id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();
  const { id, name, marketplace_id, seller_id, client_id, client_secret, refresh_token } = body;

  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (name) updates.name = name;
  if (marketplace_id) updates.marketplace_id = marketplace_id;
  if (seller_id) updates.seller_id = seller_id;
  if (client_id || client_secret || refresh_token) {
    updates.credentials = encrypt({ client_id, client_secret, refresh_token });
  }

  const { error } = await supabase.from("amazon_accounts").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { id } = await request.json();
  const { error } = await supabase.from("amazon_accounts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
