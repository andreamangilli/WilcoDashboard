import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { platform, credentials } = body;

  try {
    switch (platform) {
      case "shopify": {
        const { domain, access_token } = credentials;
        const res = await fetch(
          `https://${domain}/admin/api/2024-10/shop.json`,
          { headers: { "X-Shopify-Access-Token": access_token } }
        );
        if (!res.ok) throw new Error(`Shopify: ${res.status} ${res.statusText}`);
        const data = await res.json();
        return NextResponse.json({ success: true, info: data.shop?.name });
      }

      case "amazon": {
        const { client_id, client_secret, refresh_token } = credentials;
        const res = await fetch("https://api.amazon.com/auth/o2/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token,
            client_id,
            client_secret,
          }),
        });
        if (!res.ok) throw new Error(`Amazon: ${res.status}`);
        return NextResponse.json({ success: true, info: "Token valido" });
      }

      case "google": {
        const { client_id, client_secret, refresh_token } = credentials;
        const res = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token,
            client_id,
            client_secret,
          }),
        });
        if (!res.ok) throw new Error(`Google: ${res.status}`);
        return NextResponse.json({ success: true, info: "Token valido" });
      }

      case "meta": {
        const { access_token } = credentials;
        const res = await fetch(
          `https://graph.facebook.com/v21.0/me?access_token=${access_token}`
        );
        if (!res.ok) throw new Error(`Meta: ${res.status}`);
        const data = await res.json();
        return NextResponse.json({ success: true, info: data.name || "Connesso" });
      }

      default:
        return NextResponse.json({ error: "Unknown platform" }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    return NextResponse.json({ success: false, error: message }, { status: 200 });
  }
}
