/**
 * Backfill script: re-syncs all Shopify and Amazon orders
 * to populate shipping destination fields.
 *
 * Usage: node --env-file=.env.local scripts/backfill-shipping.mjs
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SHOPIFY_API_VERSION = "2024-10";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Shopify ──────────────────────────────────────────────────────

async function shopifyFetch(domain, accessToken, endpoint, params = {}, retries = 3) {
  const url = new URL(
    `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/${endpoint}.json`
  );
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        headers: { "X-Shopify-Access-Token": accessToken },
      });

      if (!res.ok) {
        throw new Error(`Shopify API error: ${res.status} ${res.statusText}`);
      }

      await sleep(500);
      return res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      console.log(`    ⏳ Retry ${attempt}/${retries} after error: ${err.message}`);
      await sleep(2000 * attempt);
    }
  }
}

async function decryptCredentials(encryptedString) {
  const crypto = await import("crypto");
  const key = Buffer.from(process.env.ENCRYPTION_KEY, "hex");
  const [ivHex, authTagHex, ciphertext] = encryptedString.split(":");

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return JSON.parse(decrypted);
}

async function backfillShopify() {
  const { data: stores } = await supabase
    .from("stores")
    .select("id, slug, shopify_domain, credentials");

  for (const store of stores || []) {
    if (!store.credentials || !store.shopify_domain) {
      console.log(`  ⚠ ${store.slug}: no credentials, skipping`);
      continue;
    }

    const creds = await decryptCredentials(store.credentials);
    console.log(`  ▸ ${store.slug} (${store.shopify_domain})`);

    let synced = 0;
    let hasMore = true;
    const params = {
      status: "any",
      limit: "250",
      order: "updated_at asc",
      updated_at_min: "2024-01-01T00:00:00Z",
    };

    while (hasMore) {
      const data = await shopifyFetch(
        store.shopify_domain,
        creds.access_token,
        "orders",
        params
      );

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
        if (error) console.error(`    ✗ order ${order.name}: ${error.message}`);
        synced++;
      }

      console.log(`    ${synced} ordini processati...`);

      hasMore = orders.length === 250;
      if (hasMore) {
        params.since_id = orders[orders.length - 1].id.toString();
        delete params.order;
      }
    }

    console.log(`  ✓ ${store.slug}: ${synced} ordini aggiornati`);
  }
}

// ── Amazon ───────────────────────────────────────────────────────

const AMAZON_SP_API_BASE = "https://sellingpartnerapi-eu.amazon.com";

async function getAmazonAccessToken(credentials) {
  const res = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: credentials.refresh_token,
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Amazon auth error: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function amazonFetch(accessToken, path, params = {}, retries = 3) {
  const url = new URL(`${AMAZON_SP_API_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "x-amz-access-token": accessToken,
        },
      });

      if (res.status === 429) {
        console.log("    ⏳ Rate limited, waiting 2s...");
        await sleep(2000);
        return amazonFetch(accessToken, path, params);
      }

      if (!res.ok) {
        throw new Error(`Amazon SP-API error: ${res.status} ${await res.text()}`);
      }

      await sleep(500);
      return res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      console.log(`    ⏳ Retry ${attempt}/${retries} after error: ${err.message}`);
      await sleep(2000 * attempt);
    }
  }
}

async function backfillAmazon() {
  const { data: accounts } = await supabase
    .from("amazon_accounts")
    .select("id, name, marketplace_id, credentials");

  for (const account of accounts || []) {
    if (!account.credentials) {
      console.log(`  ⚠ ${account.name}: no credentials, skipping`);
      continue;
    }

    const creds = await decryptCredentials(account.credentials);
    console.log(`  ▸ ${account.name}`);

    const accessToken = await getAmazonAccessToken(creds);
    let synced = 0;
    let nextToken;

    do {
      const params = nextToken
        ? { NextToken: nextToken }
        : {
            MarketplaceIds: account.marketplace_id,
            CreatedAfter: "2025-01-01T00:00:00Z",
            CreatedBefore: new Date().toISOString(),
            OrderStatuses: "Shipped,Unshipped,Pending",
          };

      const data = await amazonFetch(accessToken, "/orders/v0/orders", params);
      const orders = data.payload?.Orders || [];
      nextToken = data.payload?.NextToken;

      for (const order of orders) {
        const itemsData = await amazonFetch(
          accessToken,
          `/orders/v0/orders/${order.AmazonOrderId}/orderItems`
        );
        const items = itemsData.payload?.OrderItems || [];

        for (const item of items) {
          const { error } = await supabase.from("amazon_orders").upsert(
            {
              account_id: account.id,
              amazon_order_id: `${order.AmazonOrderId}_${item.ASIN}`,
              asin: item.ASIN,
              sku: item.SellerSKU,
              quantity: item.QuantityOrdered || 1,
              item_price: parseFloat(item.ItemPrice?.Amount || "0"),
              amazon_fees: parseFloat(item.ItemFee?.Amount || "0"),
              fba_fees: parseFloat(item.FBAFees?.Amount || "0"),
              shipping_cost: parseFloat(item.ShippingPrice?.Amount || "0"),
              order_status: order.OrderStatus,
              fulfillment_channel: order.FulfillmentChannel,
              purchase_date: order.PurchaseDate,
              shipping_country: order.ShippingAddress?.Country || null,
              shipping_country_code: order.ShippingAddress?.CountryCode || null,
              shipping_city: order.ShippingAddress?.City || null,
              shipping_province: order.ShippingAddress?.StateOrRegion || null,
            },
            { onConflict: "amazon_order_id" }
          );
          if (error) console.error(`    ✗ ${order.AmazonOrderId}: ${error.message}`);
          synced++;
        }
      }

      console.log(`    ${synced} righe processate...`);
    } while (nextToken);

    console.log(`  ✓ ${account.name}: ${synced} righe aggiornate`);
  }
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log("═══ Backfill Shipping Destination Data ═══\n");

  console.log("▶ Shopify orders...");
  await backfillShopify();

  console.log("\n▶ Amazon orders...");
  await backfillAmazon();

  console.log("\n═══ Backfill completato! ═══");
}

main().catch((err) => {
  console.error("Errore:", err);
  process.exit(1);
});
