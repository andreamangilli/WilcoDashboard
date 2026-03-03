# Caching & Performance Design

**Goal:** Ridurre i tempi di caricamento della dashboard tramite cache 30 min sulle query e skeleton loaders per UX fluida.

**Architecture:** `unstable_cache` su tutte le funzioni query (service role client, TTL 1800s) + `loading.tsx` per ogni route + fix query `getTopProducts` via Supabase RPC.

**Tech Stack:** Next.js `unstable_cache`, Supabase service role client, Tailwind `animate-pulse`, Supabase RPC (SQL function)

---

## 1. Cache Layer

Ogni funzione query in `src/lib/queries/` viene wrappata con `unstable_cache`:

- **Client:** `createClient()` (cookie-based) → `createServiceClient()` (service role, chiave costante → cache hit rate massimo)
- **TTL:** 1800 secondi (30 minuti)
- **Tag:** `['dashboard-data']` — predisposto per futura invalidazione on-demand da sync
- **Chiavi cache:** `unstable_cache` include automaticamente gli argomenti chiamati (period, from, to) → ogni combinazione di parametri ha la propria entry

File toccati: `overview.ts`, `shopify.ts`, `amazon.ts`, `ads.ts`, `products.ts`, `orders.ts`

## 2. Skeleton Loaders

Un file `loading.tsx` per ogni route segment del dashboard. Next.js lo mostra immediatamente durante la navigazione (React Suspense built-in), eliminando la pagina bianca durante il fetch.

File da creare:
- `src/app/(dashboard)/loading.tsx` — 5 KPI card + chart + signals card
- `src/app/(dashboard)/ordini/loading.tsx` — filtri + tabella
- `src/app/(dashboard)/prodotti/loading.tsx` — tab + tabella
- `src/app/(dashboard)/shopify/loading.tsx` — store cards
- `src/app/(dashboard)/amazon/loading.tsx` — KPI cards
- `src/app/(dashboard)/ads/loading.tsx` — KPI + 2 piattaforma cards
- `src/app/(dashboard)/ads/google/loading.tsx` — KPI + tabella
- `src/app/(dashboard)/ads/meta/loading.tsx` — KPI + tabella

Tutti usano `animate-pulse` con blocchi grigi che replicano la struttura visiva della pagina reale.

## 3. Fix `getTopProducts`

**Problema attuale:** fetcha tutti i `line_items` JSON di tutti gli ordini del periodo e aggrega in JavaScript → ~10-20MB trasferiti da Supabase per periodi lunghi.

**Fix:** Supabase RPC function `get_top_products` che usa `jsonb_array_elements` in Postgres. Trasferisce solo i 5 risultati (~500 byte).

```sql
CREATE OR REPLACE FUNCTION get_top_products(
  p_start timestamptz, p_end timestamptz, p_limit int DEFAULT 5
)
RETURNS TABLE(title text, units bigint, revenue numeric, store_name text)
LANGUAGE sql STABLE AS $$
  SELECT
    li->>'title'   AS title,
    SUM((li->>'quantity')::int)                            AS units,
    SUM((li->>'quantity')::int * (li->>'price')::numeric)  AS revenue,
    s.name AS store_name
  FROM shopify_orders o
  JOIN stores s ON s.id = o.store_id
  CROSS JOIN LATERAL jsonb_array_elements(o.line_items) AS li
  WHERE o.created_at BETWEEN p_start AND p_end
    AND o.financial_status = 'paid'
  GROUP BY li->>'title', s.name
  ORDER BY revenue DESC
  LIMIT p_limit;
$$;
```

Richiede: 1 migration SQL + modifica `getTopProducts` per chiamare `.rpc('get_top_products', {...})`.

## Ordine di implementazione

1. Fix `getTopProducts` (migration + query) — riduce immediatamente il carico sul primo cache miss
2. Cache layer su tutte le query files
3. Skeleton loaders per ogni route
