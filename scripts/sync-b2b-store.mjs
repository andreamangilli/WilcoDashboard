/**
 * One-time script to sync the WILCO B2B store from Jan 1, 2025.
 * Seeds a sync_log entry to set the start date, then triggers the sync API.
 * Usage: node scripts/sync-b2b-store.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { createDecipheriv } from "crypto";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || !ENCRYPTION_KEY) {
  console.error("Missing env vars");
  process.exit(1);
}

function decrypt(encryptedString) {
  const key = Buffer.from(ENCRYPTION_KEY, "hex");
  const [ivHex, authTagHex, ciphertext] = encryptedString.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return JSON.parse(decrypted);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const SHOPIFY_API_VERSION = "2024-10";
const SYNC_START = "2025-01-01T00:00:00Z";
const SLUG = "wilco-b2b";
const SLEEP_MS = 500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shopifyFetch(domain, accessToken, endpoint, params = {}) {
  const url = new URL(`https://${domain}/admin/api/${SHOPIFY_API_VERSION}/${endpoint}.json`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { "X-Shopify-Access-Token": accessToken },
  });
  if (!res.ok) throw new Error(`Shopify API error: ${res.status} ${res.statusText}`);
  await sleep(SLEEP_MS);
  return res.json();
}

async function main() {
  // Get store config
  const { data: store, error: storeErr } = await supabase
    .from("stores")
    .select("id, slug, shopify_domain, credentials")
    .eq("slug", SLUG)
    .single();

  if (storeErr || !store) {
    console.error("Store not found:", storeErr?.message);
    process.exit(1);
  }

  const { access_token } = decrypt(store.credentials);
  console.log(`Store: ${store.slug} (${store.shopify_domain})`);
  console.log(`Sync start: ${SYNC_START}\n`);

  // --- ORDERS ---
  console.log("Syncing orders...");
  const orderParams = {
    status: "any",
    limit: "250",
    order: "updated_at asc",
    updated_at_min: SYNC_START,
  };
  let ordersSynced = 0;
  const customerIds = new Set();
  let hasMore = true;

  while (hasMore) {
    const data = await shopifyFetch(store.shopify_domain, access_token, "orders", orderParams);
    const orders = data.orders || [];
    if (orders.length === 0) break;

    for (const order of orders) {
      const { error } = await supabase.from("shopify_orders").upsert(
        {
          store_id: store.id,
          shopify_id: order.id,
          order_number: order.name,
          total: parseFloat(order.total_price || "0"),
          subtotal: parseFloat(order.subtotal_price || "0"),
          total_tax: parseFloat(order.total_tax || "0"),
          total_discounts: parseFloat(order.total_discounts || "0"),
          customer_email: order.email,
          financial_status: order.financial_status,
          fulfillment_status: order.fulfillment_status,
          created_at: order.created_at,
          updated_at: order.updated_at,
          line_items: order.line_items,
          shipping_country: order.shipping_address?.country || null,
          shipping_country_code: order.shipping_address?.country_code || null,
          shipping_city: order.shipping_address?.city || null,
          shipping_province: order.shipping_address?.province || null,
        },
        { onConflict: "store_id,shopify_id" }
      );
      if (error) console.error(`Order ${order.name}: ${error.message}`);
      ordersSynced++;
      if (order.customer?.id) customerIds.add(order.customer.id);
    }

    process.stdout.write(`\r  Orders: ${ordersSynced}`);
    hasMore = orders.length === 250;
    if (hasMore) {
      orderParams.since_id = orders[orders.length - 1].id.toString();
      delete orderParams.order;
    }
  }
  console.log(`\n  Orders synced: ${ordersSynced}`);

  // --- PRODUCTS ---
  console.log("Syncing products...");
  let productsSynced = 0;
  let sinceId = "0";
  hasMore = true;

  while (hasMore) {
    const data = await shopifyFetch(store.shopify_domain, access_token, "products", {
      limit: "250",
      since_id: sinceId,
    });
    const products = data.products || [];
    if (products.length === 0) break;

    for (const product of products) {
      for (const variant of product.variants || []) {
        const { error } = await supabase.from("shopify_products").upsert(
          {
            store_id: store.id,
            shopify_id: variant.id,
            title: `${product.title}${variant.title !== "Default Title" ? ` - ${variant.title}` : ""}`,
            sku: variant.sku,
            cost: variant.cost ? parseFloat(variant.cost) : null,
            price: parseFloat(variant.price || "0"),
            inventory_qty: variant.inventory_quantity || 0,
            status: product.status,
            updated_at: product.updated_at,
          },
          { onConflict: "store_id,shopify_id" }
        );
        if (error) console.error(`Product ${variant.sku}: ${error.message}`);
        productsSynced++;
      }
    }

    process.stdout.write(`\r  Products: ${productsSynced}`);
    hasMore = products.length === 250;
    sinceId = products[products.length - 1].id.toString();
  }
  console.log(`\n  Products synced: ${productsSynced}`);

  // --- CUSTOMERS ---
  console.log(`Syncing customers (${customerIds.size} from orders)...`);
  let customersSynced = 0;
  const idArray = Array.from(customerIds);

  for (let i = 0; i < idArray.length; i += 100) {
    const batch = idArray.slice(i, i + 100);
    const idsParam = batch.join(",");
    const data = await shopifyFetch(store.shopify_domain, access_token, "customers", {
      ids: idsParam,
      limit: "100",
    });

    for (const c of data.customers || []) {
      const { error } = await supabase.from("shopify_customers").upsert(
        {
          store_id: store.id,
          shopify_id: c.id,
          email: c.email,
          first_name: c.first_name,
          last_name: c.last_name,
          orders_count: c.orders_count || 0,
          total_spent: parseFloat(c.total_spent || "0"),
          first_order_at: c.orders_count > 0 ? c.created_at : null,
          created_at: c.created_at,
        },
        { onConflict: "store_id,shopify_id" }
      );
      if (error) console.error(`Customer ${c.email}: ${error.message}`);
      customersSynced++;
    }
    process.stdout.write(`\r  Customers: ${customersSynced}/${customerIds.size}`);
  }
  console.log(`\n  Customers synced: ${customersSynced}`);

  // Insert sync_log so future cron syncs continue from now
  await supabase.from("sync_log").insert([
    { source: `shopify_orders_${SLUG}`, status: "success", records_synced: ordersSynced, completed_at: new Date().toISOString() },
    { source: `shopify_products_${SLUG}`, status: "success", records_synced: productsSynced, completed_at: new Date().toISOString() },
    { source: `shopify_customers_${SLUG}`, status: "success", records_synced: customersSynced, completed_at: new Date().toISOString() },
  ]);

  console.log("\nDone! Sync log entries created for future incremental syncs.");
}

main().catch(console.error);
