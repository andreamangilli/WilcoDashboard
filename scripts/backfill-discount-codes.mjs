/**
 * Backfill discount_codes for all Shopify orders from January 2025.
 *
 * Usage: node scripts/backfill-discount-codes.mjs
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const SUPABASE_URL = "https://cgsvyrtcycguxoqubgzu.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const SHOPIFY_API_VERSION = "2024-10";
const SINCE = "2025-01-01T00:00:00Z";

if (!SUPABASE_KEY) { console.error("Set SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
if (!ENCRYPTION_KEY) { console.error("Set ENCRYPTION_KEY"); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function decrypt(encryptedString) {
  const [ivHex, authTagHex, ciphertext] = encryptedString.split(":");
  const key = Buffer.from(ENCRYPTION_KEY, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return JSON.parse(decrypted);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchOrders(domain, accessToken, params) {
  const url = new URL(`https://${domain}/admin/api/${SHOPIFY_API_VERSION}/orders.json`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { "X-Shopify-Access-Token": accessToken },
  });
  if (!res.ok) throw new Error(`Shopify error: ${res.status} ${res.statusText}`);
  await sleep(500);
  return res.json();
}

async function run() {
  const { data: stores } = await supabase.from("stores").select("id, slug, shopify_domain, credentials");

  for (const store of stores || []) {
    if (!store.credentials || !store.shopify_domain) {
      console.log(`${store.slug}: no credentials, skip`);
      continue;
    }

    const creds = decrypt(store.credentials);
    if (!creds.access_token) {
      console.log(`${store.slug}: no access_token, skip`);
      continue;
    }

    console.log(`\n=== ${store.slug} ===`);

    const params = {
      status: "any",
      limit: "250",
      order: "created_at asc",
      created_at_min: SINCE,
    };

    let updated = 0;
    let total = 0;
    let hasMore = true;

    while (hasMore) {
      const data = await fetchOrders(store.shopify_domain, creds.access_token, params);
      const orders = data.orders || [];
      if (orders.length === 0) break;

      for (const order of orders) {
        total++;
        const codes = order.discount_codes?.length
          ? order.discount_codes.map(d => d.code).join(", ")
          : null;

        const { error } = await supabase
          .from("shopify_orders")
          .update({ discount_codes: codes })
          .eq("store_id", store.id)
          .eq("shopify_id", order.id);

        if (error) {
          // Order might not be in DB yet, skip
        } else if (codes) {
          updated++;
        }
      }

      console.log(`  Processed ${total} orders, ${updated} with discount codes so far...`);

      hasMore = orders.length === 250;
      if (hasMore) {
        params.since_id = orders[orders.length - 1].id.toString();
        delete params.order;
      }
    }

    console.log(`  Done: ${total} orders checked, ${updated} with discount codes`);
  }
}

run().catch(console.error);
