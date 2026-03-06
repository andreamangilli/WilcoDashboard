/**
 * One-time script to add the WILCO B2B store and trigger initial sync.
 * Usage: node scripts/add-b2b-store.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { createCipheriv, randomBytes } from "crypto";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || !ENCRYPTION_KEY) {
  console.error("Missing env vars. Ensure .env.local has SUPABASE_URL, SERVICE_ROLE_KEY, ENCRYPTION_KEY");
  process.exit(1);
}

function encrypt(data) {
  const key = Buffer.from(ENCRYPTION_KEY, "hex");
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(JSON.stringify(data), "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const STORE_NAME = "WILCO B2B";
const STORE_SLUG = "wilco-b2b";
const SHOPIFY_DOMAIN = "kmax-international-b2b.myshopify.com";
const ACCESS_TOKEN = process.env.B2B_SHOPIFY_TOKEN;

if (!ACCESS_TOKEN) {
  console.error("Set B2B_SHOPIFY_TOKEN env var before running this script");
  process.exit(1);
}

async function main() {
  // Check if store already exists
  const { data: existing } = await supabase
    .from("stores")
    .select("id")
    .eq("slug", STORE_SLUG)
    .maybeSingle();

  if (existing) {
    console.log(`Store "${STORE_NAME}" already exists (id: ${existing.id}). Skipping insert.`);
    return;
  }

  const credentials = encrypt({ access_token: ACCESS_TOKEN });

  const { data, error } = await supabase
    .from("stores")
    .insert({
      name: STORE_NAME,
      slug: STORE_SLUG,
      platform: "shopify",
      shopify_domain: SHOPIFY_DOMAIN,
      credentials,
    })
    .select("id, name, slug, shopify_domain")
    .single();

  if (error) {
    console.error("Insert error:", error.message);
    process.exit(1);
  }

  console.log("Store added successfully:");
  console.log(data);

  // Verify token works by calling Shopify API
  console.log("\nVerifying Shopify API access...");
  const testUrl = `https://${SHOPIFY_DOMAIN}/admin/api/2024-10/shop.json`;
  const res = await fetch(testUrl, {
    headers: { "X-Shopify-Access-Token": ACCESS_TOKEN },
  });

  if (res.ok) {
    const { shop } = await res.json();
    console.log(`Connected to: ${shop.name} (${shop.myshopify_domain})`);
  } else {
    console.error(`API test failed: ${res.status} ${res.statusText}`);
    const body = await res.text();
    console.error(body);
  }
}

main().catch(console.error);
