# Settings Integrations — Design Document

**Data:** 2026-02-27
**Stato:** Approvato

## Obiettivo

Permettere la configurazione di tutte le integrazioni (Shopify, Amazon, Google Ads, Meta Ads) direttamente dalla pagina Impostazioni della dashboard, senza dover modificare env vars o rideplorare.

## Architettura

### Cifratura Credenziali

Le credenziali API vengono salvate nel DB (Supabase PostgreSQL) come JSONB criptato con AES-256-GCM. Una sola env var `ENCRYPTION_KEY` sul server.

- `encrypt(plaintext)` → ciphertext con IV e auth tag
- `decrypt(ciphertext)` → plaintext
- Solo i sync engines (server-side) possono decriptare

### Modifiche Schema DB

```sql
ALTER TABLE stores ADD COLUMN credentials JSONB;
ALTER TABLE amazon_accounts ADD COLUMN credentials JSONB;
ALTER TABLE ad_accounts ADD COLUMN credentials JSONB;
```

RLS aggiornata: policy INSERT/UPDATE/DELETE per utenti autenticati su stores, amazon_accounts, ad_accounts.

### Struttura Credenziali per Piattaforma

- **Shopify:** `{ access_token }`
- **Amazon:** `{ client_id, client_secret, refresh_token }`
- **Google Ads:** `{ developer_token, client_id, client_secret, refresh_token, manager_id? }`
- **Meta Ads:** `{ access_token }`

## UI Impostazioni

Pagina `/settings` ristrutturata con tab:

| Tab | Contenuto |
|-----|-----------|
| Shopify | Lista store + form aggiungi/modifica (nome, dominio, access token) |
| Amazon | Lista account + form (nome, marketplace, seller ID, credenziali OAuth) |
| Google Ads | Lista account + form (nome, account ID, credenziali OAuth, developer token) |
| Meta Ads | Lista account + form (nome, account ID, access token) |
| Log Sync | Tabella log sincronizzazione (esistente) |

Ogni account ha: badge stato connessione, pulsante Test, pulsante Modifica, pulsante Elimina.

Form di aggiunta/modifica: dialog modale con campi specifici per piattaforma.

## Refactor Sync Engines

I sync engines passano da `process.env` a credenziali dal DB:

### Prima
```
ENV vars → hardcoded configs → sync functions
```

### Dopo
```
DB (credentials JSONB) → decrypt() → sync functions
```

### Modifiche ai file sync

- `shopify.ts` — Rimuovere `getShopifyStoreConfigs()`. Ricevere credenziali come parametro.
- `amazon.ts` — `getAmazonAccessToken()` riceve credenziali come parametro (non da env).
- `google-ads.ts` — `getGoogleAccessToken()` riceve credenziali come parametro.
- `meta-ads.ts` — `syncMetaAds()` riceve access token come parametro.

### Nuovi Endpoint API

- `POST /api/settings/stores` — CRUD store Shopify
- `POST /api/settings/amazon` — CRUD account Amazon
- `POST /api/settings/google` — CRUD account Google Ads
- `POST /api/settings/meta` — CRUD account Meta Ads
- `POST /api/settings/test` — Test connessione (tutte le piattaforme)

### Env Vars Rimanenti

Solo queste env vars restano necessarie:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ENCRYPTION_KEY` (nuova, per cifratura credenziali)
- `CRON_SECRET`
