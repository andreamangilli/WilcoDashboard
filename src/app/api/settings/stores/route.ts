import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stores")
    .select("id, name, slug, shopify_domain, credentials, created_at")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Mask credentials - only show if configured, not the actual values
  const masked = (data || []).map(s => ({
    ...s,
    has_credentials: !!s.credentials,
    credentials: undefined,
  }));

  return NextResponse.json(masked);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();
  const { name, shopify_domain, access_token } = body;

  if (!name || !shopify_domain || !access_token) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const credentials = encrypt({ access_token });

  const { data, error } = await supabase
    .from("stores")
    .insert({ name, slug, shopify_domain, credentials })
    .select("id, name, slug, shopify_domain")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();
  const { id, name, shopify_domain, access_token } = body;

  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (name) updates.name = name;
  if (shopify_domain) updates.shopify_domain = shopify_domain;
  if (access_token) updates.credentials = encrypt({ access_token });

  const { error } = await supabase.from("stores").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { id } = await request.json();

  const { error } = await supabase.from("stores").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
