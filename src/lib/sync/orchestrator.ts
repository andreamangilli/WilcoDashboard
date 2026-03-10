import { createServiceClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { logSyncStart, logSyncSuccess, logSyncError } from "./utils";
import {
  syncShopifyOrders,
  syncShopifyProducts,
  syncShopifyCustomers,
} from "./shopify";
import {
  syncAmazonOrders,
  syncAmazonInventory,
  calculateAmazonPnl,
  AmazonCredentials,
} from "./amazon";
import { syncGoogleAds, GoogleAdsCredentials } from "./google-ads";
import { syncMetaAds, MetaAdsCredentials } from "./meta-ads";
import { syncKlaviyo } from "./klaviyo";

export async function runAllSyncs() {
  const results: Record<string, unknown> = {};

  // --- Shopify ---
  try {
    const supabase = await createServiceClient();
    const { data: stores } = await supabase
      .from("stores")
      .select("id, slug, shopify_domain, credentials");

    const shopifyResults: Record<string, unknown> = {};
    for (const store of stores || []) {
      if (!store.credentials || !store.shopify_domain) {
        shopifyResults[store.slug] = { error: "No credentials configured" };
        continue;
      }
      const creds = decrypt(store.credentials) as { access_token: string };
      if (!creds.access_token) {
        shopifyResults[store.slug] = { error: "Missing access_token" };
        continue;
      }
      const config = {
        storeId: store.id,
        slug: store.slug,
        domain: store.shopify_domain,
        accessToken: creds.access_token,
      };
      try {
        const { synced: orders, customerIds } = await syncShopifyOrders(config);
        const products = await syncShopifyProducts(config);
        const customers = await syncShopifyCustomers(config, customerIds);
        shopifyResults[store.slug] = { orders, products, customers };
      } catch (err) {
        shopifyResults[store.slug] = {
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    }
    results.shopify = { success: true, results: shopifyResults };
  } catch (err) {
    results.shopify = { error: err instanceof Error ? err.message : "Failed" };
  }

  // --- Amazon ---
  try {
    const supabase = await createServiceClient();
    const { data: accounts } = await supabase
      .from("amazon_accounts")
      .select("id, name, marketplace_id, credentials");

    const amazonResults: Record<string, unknown> = {};
    for (const account of accounts || []) {
      if (!account.credentials) {
        amazonResults[account.name] = { error: "No credentials configured" };
        continue;
      }
      const creds = decrypt(account.credentials) as unknown as AmazonCredentials;
      if (!creds.client_id || !creds.client_secret || !creds.refresh_token) {
        amazonResults[account.name] = { error: "Incomplete credentials" };
        continue;
      }
      try {
        const orders = await syncAmazonOrders(account.id, account.marketplace_id, creds);
        const inventory = await syncAmazonInventory(account.id, account.marketplace_id, creds);
        await calculateAmazonPnl(account.id);
        amazonResults[account.name] = { orders, inventory, pnl: "calculated" };
      } catch (err) {
        amazonResults[account.name] = {
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    }
    results.amazon = { success: true, results: amazonResults };
  } catch (err) {
    results.amazon = { error: err instanceof Error ? err.message : "Failed" };
  }

  // --- Google Ads ---
  try {
    const supabase = await createServiceClient();
    const { data: accounts } = await supabase
      .from("ad_accounts")
      .select("id, account_id, account_name, credentials")
      .eq("platform", "google");

    const googleResults: Record<string, unknown> = {};
    for (const account of accounts || []) {
      if (!account.credentials) {
        googleResults[account.account_name || account.account_id] = { error: "No credentials configured" };
        continue;
      }
      const creds = decrypt(account.credentials) as unknown as GoogleAdsCredentials;
      if (!creds.developer_token || !creds.client_id || !creds.client_secret || !creds.refresh_token) {
        googleResults[account.account_name || account.account_id] = { error: "Incomplete credentials" };
        continue;
      }
      const logId = await logSyncStart(`google_${account.account_name}`);
      try {
        const synced = await syncGoogleAds(account.id, account.account_id, creds);
        await logSyncSuccess(logId, synced);
        googleResults[account.account_name || account.account_id] = { synced };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        await logSyncError(logId, message);
        googleResults[account.account_name || account.account_id] = { error: message };
      }
    }
    results.google = { success: true, results: googleResults };
  } catch (err) {
    results.google = { error: err instanceof Error ? err.message : "Failed" };
  }

  // --- Meta Ads ---
  try {
    const supabase = await createServiceClient();
    const { data: accounts } = await supabase
      .from("ad_accounts")
      .select("id, account_id, account_name, credentials")
      .eq("platform", "meta");

    const metaResults: Record<string, unknown> = {};
    for (const account of accounts || []) {
      if (!account.credentials) {
        metaResults[account.account_name || account.account_id] = { error: "No credentials configured" };
        continue;
      }
      const creds = decrypt(account.credentials) as unknown as MetaAdsCredentials;
      if (!creds.access_token) {
        metaResults[account.account_name || account.account_id] = { error: "Missing access_token" };
        continue;
      }
      const logId = await logSyncStart(`meta_${account.account_name}`);
      try {
        const synced = await syncMetaAds(account.id, account.account_id, creds);
        await logSyncSuccess(logId, synced);
        metaResults[account.account_name || account.account_id] = { synced };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        await logSyncError(logId, message);
        metaResults[account.account_name || account.account_id] = { error: message };
      }
    }
    results.meta = { success: true, results: metaResults };
  } catch (err) {
    results.meta = { error: err instanceof Error ? err.message : "Failed" };
  }

  // --- Klaviyo ---
  if (process.env.KLAVIYO_API_KEY) {
    const logId = await logSyncStart("klaviyo");
    try {
      const synced = await syncKlaviyo();
      await logSyncSuccess(logId, synced);
      results.klaviyo = { success: true, results: { synced } };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await logSyncError(logId, message);
      results.klaviyo = { error: message };
    }
  } else {
    results.klaviyo = { skipped: "No KLAVIYO_API_KEY configured" };
  }

  return results;
}
