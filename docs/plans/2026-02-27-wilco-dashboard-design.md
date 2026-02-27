# Wilco Group Dashboard — Design Document

**Data:** 2026-02-27
**Stato:** Approvato

## Obiettivo

Dashboard centralizzata per il Gruppo Wilco che aggrega dati da 3 store Shopify, Amazon (FBA/FBM), Google Ads e Meta Ads. Fornisce una vista unificata di vendite, margini, inventario, clienti e spesa pubblicitaria.

## Contesto

**Store Shopify:**
- Vitaminity (vitaminity.com) — integratori nutraceutici
- KMax (kmax.it) — soluzioni antidiradamento
- HairShopEurope (hairshopeurope.com) — marketplace multi-brand haircare

**Canali aggiuntivi:**
- Amazon (FBA + FBM) — stessi prodotti venduti su marketplace
- Google Ads — campagne per gli store (account mix centralizzati/separati)
- Meta Ads — campagne per gli store (account mix centralizzati/separati)

**Utenti:** 2-3 persone (admin + 1-2 collaboratori view-only)
**Aggiornamento dati:** ogni 2-4 ore

## Stack Tecnologico

| Componente | Tecnologia | Tier |
|------------|-----------|------|
| Frontend + API | Next.js (App Router) | Vercel Hobby (gratuito) |
| Database | PostgreSQL | Supabase Free |
| Autenticazione | Supabase Auth | Supabase Free |
| Cron Jobs | Vercel Cron | Vercel Hobby (2 cron) |
| UI Components | Tailwind CSS + shadcn/ui | — |
| Charts | Recharts | — |

## Architettura

```
┌─────────────────────────────────────────────────┐
│                   VERCEL                         │
│  ┌───────────────────────────────────────────┐   │
│  │         Next.js App (App Router)          │   │
│  │  Dashboard Pages + API Routes             │   │
│  │  Vercel Cron (sync ogni 2-4h)             │   │
│  └───────────────────────────────────────────┘   │
└──────────────────────┬───────────────────────────┘
                       │
            ┌──────────▼──────────┐
            │     SUPABASE        │
            │  PostgreSQL + Auth  │
            └──────────┬──────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
   Shopify API    Amazon SP-API   Google/Meta Ads API
   (3 store)      (Seller Central)
```

## Modello Dati

### Tabelle di configurazione

- **stores** — id, name, platform, shopify_domain, api_key_ref
- **amazon_accounts** — id, marketplace, seller_id, credentials_ref
- **ad_accounts** — id, platform (google|meta), account_id, store_id (nullable)

### Tabelle dati sincronizzati

- **shopify_orders** — id, store_id, order_number, total, subtotal, customer_email, created_at, line_items (jsonb)
- **shopify_products** — id, store_id, title, sku, cost, price, inventory_qty
- **shopify_customers** — id, store_id, email, orders_count, total_spent, first_order_at
- **amazon_orders** — id, account_id, asin, sku, quantity, price, amazon_fees, fba_fees, shipping_cost
- **amazon_inventory** — id, account_id, asin, sku, fulfillment (fba|fbm), qty_available, storage_fees_monthly
- **amazon_pnl** — id, asin, period, revenue, amazon_fees, fba_fees, storage_fees, product_cost, ad_spend, net_profit
- **ad_campaigns** — id, ad_account_id, campaign_name, status, daily_budget, spend_today, impressions, clicks, conversions
- **ad_spend_daily** — id, ad_account_id, campaign_id, date, spend, impressions, clicks, conversions, roas
- **sync_log** — id, source, status, started_at, completed_at, error

### Costo prodotto

Il costo prodotto per il P&L Amazon viene da `shopify_products.cost`, matchando per SKU. Source of truth unica.

## Integrazioni API

| Sorgente | API | Dati | Rate Limit |
|----------|-----|------|------------|
| Shopify (x3) | Admin REST API | Ordini, prodotti, clienti, inventario | 2 req/sec per store |
| Amazon | SP-API | Ordini, fee report, inventory, settlement | Variabile per endpoint |
| Google Ads | Google Ads API v17 | Campagne, spend, metriche | OAuth2 + Developer Token |
| Meta | Marketing API v21 | Campagne, adset, spend, metriche | OAuth2 via Facebook App |

## Struttura Pagine

```
/login                    — Login (Supabase Auth)
/                         — Dashboard Overview (vista gruppo)
/shopify                  — Overview tutti gli store Shopify
/shopify/[store]          — Dettaglio singolo store
/shopify/[store]/products — Prodotti e inventario
/shopify/[store]/customers— Clienti
/amazon                   — Overview Amazon
/amazon/pnl               — P&L per ASIN
/amazon/inventory         — Inventario FBA/FBM
/ads                      — Overview spesa ads (Google + Meta)
/ads/google               — Dettaglio campagne Google
/ads/meta                 — Dettaglio campagne Meta
/settings                 — Gestione connessioni API, utenti
```

## Dashboard Overview (/)

KPI cards in alto: Fatturato Totale, Ordini Totali, Margine Lordo, Ad Spend Totale — tutti con variazione % vs periodo precedente.

Grafici: fatturato per canale (pie/bar), ordini ultimi 30gg (line chart per store + Amazon), top prodotti per revenue, campagne attive con spend.

Filtri: periodo (oggi, 7gg, 30gg, custom range) su tutte le pagine.

## Sync Engine

Vercel Cron trigger ogni 2-4 ore. Un singolo cron job chiama in sequenza:
1. `/api/sync/shopify` — per ogni store: ordini, prodotti, clienti, inventario (sync incrementale con `updated_since`)
2. `/api/sync/amazon` — ordini, fee, settlement, inventario → calcolo P&L
3. `/api/sync/google` — campagne, spend giornaliero
4. `/api/sync/meta` — campagne, spend giornaliero

Ogni sync: upsert in Supabase + log in sync_log. Rate limiting con throttle (Shopify) e exponential backoff (Amazon).

## Error Handling

- Ogni sync indipendente — il fallimento di uno non blocca gli altri
- sync_log con stato, timestamp, errore — visibile in /settings
- Retry automatico al prossimo cron cycle
- Alert visivo in dashboard se dati non aggiornati da >6 ore

## Sicurezza

- API keys in Vercel Environment Variables (encrypted at rest)
- Supabase Auth con email+password
- Row Level Security (RLS) — utenti autenticati vedono tutto
- API routes protette via middleware Next.js (verifica sessione Supabase)

## Limitazioni Free Tier

| Servizio | Limite | Mitigazione |
|----------|--------|-------------|
| Vercel Hobby | 2 cron, 100h compute/mese | 1 cron job sequenziale per tutti i sync |
| Supabase Free | 500MB DB, 50K auth | Sufficiente per il volume attuale |
| Shopify API | 2 req/sec | Sync incrementale, throttling |

## UI Tech

- Tailwind CSS + shadcn/ui per componenti
- Recharts per grafici
- Responsive ma ottimizzato desktop
- Dark mode opzionale
