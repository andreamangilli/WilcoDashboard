# Ads Pages Enhancement — Design

## Goal

Improve `/ads/meta` and `/ads/google` pages with richer metrics, multi-metric charts, campaign breakdown, interactive table with sorting/filtering, and per-campaign detail pages.

## Approach

Incremental evolution of existing pages. No breaking changes to navigation or architecture.

## Sezione 1: Nuove metriche KPI

### Metriche calcolabili dai dati esistenti

| Metrica | Formula | Dati necessari |
|---------|---------|----------------|
| CTR | clicks / impressions * 100 | ad_spend_daily.clicks, impressions |
| CPM | spend / impressions * 1000 | ad_spend_daily.spend, impressions |
| CPA | spend / conversions | ad_spend_daily.spend, conversions |

Nessuna modifica allo schema o al sync necessaria per queste.

### Metriche nuove (solo Meta)

- **Reach** (INTEGER) e **Frequency** (NUMERIC) richiedono:
  - Nuova migrazione: aggiungere colonne `reach` e `frequency` a `ad_spend_daily`
  - Aggiornare sync Meta per richiedere `reach,frequency` nei fields dell'insights API
  - Visibili solo sulla pagina Meta (non esistono in Google Ads)

### Layout KPI cards

- Prima riga (5): Spesa, Revenue, ROAS, CPA, Conversioni
- Seconda riga: CTR, CPM, CPC (+ Reach, Frequency solo su Meta)
- `getAdsOverview` viene esteso per restituire anche impressions (per calcolare CTR/CPM lato page)

## Sezione 2: Grafici

### Grafico multi-metrica (sostituisce "Spesa Giornaliera")

- Recharts `ComposedChart` con:
  - Asse Y sinistro: Spesa (area) + Revenue (linea)
  - Asse Y destro: ROAS (linea tratteggiata)
  - Tooltip unificato con tutte le metriche
  - Legenda cliccabile per nascondere/mostrare serie
- Dati da `getAdsDailySpend` (gia disponibili: spend, revenue, clicks, conversions, impressions)
- Componente client: `ads-multi-chart.tsx`

### Breakdown per campagna

- Grafico a barre orizzontali: top 10 campagne per spesa
- Ogni barra: spesa (blu) e revenue (verde) affiancati
- Campagne con spesa 0 escluse
- Dati da `getAdsCampaignsWithMetrics` (gia disponibili)
- Componente client: `ads-campaign-breakdown.tsx`

## Sezione 3: Tabella campagne interattiva

### Da RSC statica a componente client

- Componente client: `ads-campaigns-table.tsx`
- Stato locale React (useState) per ordinamento e filtri

### Ordinamento

- Click su header per asc/desc
- Colonne ordinabili: Campagna, Spesa, Revenue, ROAS, CPC, Click, Conversioni
- Indicatore freccia sull'header attivo
- Default: Spesa decrescente

### Filtro per stato

- Dropdown sopra la tabella: Tutte (default), Attive (ACTIVE/ENABLED), In pausa (PAUSED/INACTIVE), Rimosse (REMOVED, solo Google)

### Colonne aggiornate

| Campagna | Stato | Budget/g | Spesa | Revenue | ROAS | CPC | Click | Conversioni |

### Link a dettaglio campagna

- Nome campagna cliccabile, link a `/ads/meta/[campaignId]` o `/ads/google/[campaignId]`

## Sezione 4: Pagina dettaglio campagna

### Nuove route

- `/ads/meta/[campaignId]/page.tsx`
- `/ads/google/[campaignId]/page.tsx`

### Contenuto

- Header: nome campagna + badge stato + DateRangePicker
- 6 KPI cards: Spesa, Revenue, ROAS, CPC, CTR, Conversioni
- Grafico giornaliero (riusa ComposedChart) con spesa + revenue

### Nuova query

- `getCampaignDailySpend(campaignId, period, from, to)` filtra `ad_spend_daily` per `campaign_id` e date range

## Schema changes

### Migrazione: add reach/frequency to ad_spend_daily

```sql
ALTER TABLE ad_spend_daily
ADD COLUMN reach INTEGER DEFAULT 0,
ADD COLUMN frequency NUMERIC(10,4) DEFAULT 0;
```

## File coinvolti

### Nuovi file
- `src/app/(dashboard)/ads/ads-multi-chart.tsx` — grafico multi-metrica
- `src/app/(dashboard)/ads/ads-campaign-breakdown.tsx` — breakdown per campagna
- `src/app/(dashboard)/ads/ads-campaigns-table.tsx` — tabella interattiva
- `src/app/(dashboard)/ads/meta/[campaignId]/page.tsx` — dettaglio campagna Meta
- `src/app/(dashboard)/ads/meta/[campaignId]/loading.tsx` — skeleton
- `src/app/(dashboard)/ads/google/[campaignId]/page.tsx` — dettaglio campagna Google
- `src/app/(dashboard)/ads/google/[campaignId]/loading.tsx` — skeleton
- `supabase/migrations/XXX_add_reach_frequency.sql`

### File modificati
- `src/lib/queries/ads.ts` — nuova query getCampaignDailySpend, estendere getAdsOverview con impressions
- `src/lib/sync/meta-ads.ts` — aggiungere reach, frequency ai fields e all'upsert
- `src/app/(dashboard)/ads/meta/page.tsx` — nuovi KPI, nuovi grafici, tabella interattiva
- `src/app/(dashboard)/ads/google/page.tsx` — stesse modifiche (senza reach/frequency)
- `src/app/(dashboard)/ads/meta/loading.tsx` — aggiornare skeleton
- `src/app/(dashboard)/ads/google/loading.tsx` — aggiornare skeleton
