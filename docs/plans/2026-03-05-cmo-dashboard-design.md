# CMO Dashboard Redesign

**Goal:** Trasformare la dashboard overview in uno strumento da CMO: trend multi-serie interattivi, KPI evolute con sparkline, confronto piattaforme ads, e insight rule-based automatici.

**Architecture:** Server Components per data fetching + Client Components per grafici interattivi (Recharts). Nuove query cached con `unstable_cache`. Insight calcolati server-side.

**Tech Stack:** Next.js 16 App Router, Recharts `ComposedChart`, `unstable_cache`, Supabase queries.

---

## Sezione 1: KPI Cards Evolute

7 KPI cards in griglia responsive (7 col desktop, 2 col mobile).

| Card | Calcolo | Fonte |
|------|---------|-------|
| Fatturato Totale | Shopify (paid) + Amazon item_price | `shopify_orders` + `amazon_orders` |
| Ordini Totali | Count Shopify + Amazon | `shopify_orders` + `amazon_orders` |
| AOV | Fatturato / Ordini | Calcolato |
| Spesa Ads | Sum ad_spend_daily.spend | `ad_spend_daily` |
| ROAS | Revenue ads / Spend ads | `ad_spend_daily` |
| Margine Netto | Fatturato totale - Spesa ads totale | Calcolato |
| Nuovi Clienti | Ordini Shopify da clienti con orders_count=1 | `shopify_customers` join |

Ogni card mostra:
- Valore principale formattato
- Delta % vs periodo precedente (tutte e 7, incluse AOV e ROAS che prima non lo avevano)
- Sparkline: mini line chart 60x24px con valori giornalieri ultimi 7 giorni, senza assi

Nuova query: `getOverviewKpisDaily()` — ritorna array di 7 oggetti `{ date, revenue, orders, adSpend, adsRevenue }` per alimentare le sparkline.

---

## Sezione 2: Revenue & Ads Trend (Grafico Principale)

Line chart multi-serie con doppio asse Y. Larghezza 100%, altezza 350px.

**Serie (toggle on/off via bottoni pill):**
- Fatturato (asse sx, linea blu, area gradient) — default ON
- Fatturato periodo prev. (asse sx, linea blu tratteggiata) — default OFF
- Spesa Ads (asse dx, linea arancione) — default ON
- ROAS (asse dx, linea verde) — default OFF

**Toggle:** Bottoni pill sopra il grafico. Stato gestito con `useState`.

**Tooltip:** Mostra data + tutte le metriche attive, formattate.

**Componente:** `DailyTrendChart` — client component con Recharts `ComposedChart`, `Line`, `Area`, `YAxis` (left + right).

**Query:** Nuova `getDailyTrend(period, from, to)` che aggrega per giorno:
- Fatturato: sum shopify_orders.total (paid) + amazon_orders.item_price
- Spesa ads: sum ad_spend_daily.spend (all platforms)
- Revenue ads: sum ad_spend_daily.revenue
- ROAS: revenue/spend
- Periodo precedente: stesse metriche shiftate

Ritorna: `{ current: DayData[], previous: DayData[] }` dove `DayData = { date, revenue, adSpend, adsRevenue, roas }`.

---

## Sezione 3: Channel Performance

Layout 2 colonne (desktop), 1 (mobile).

**Colonna sinistra (2/3) — Revenue per Canale**
Bar chart esistente (current vs previous) — invariato.

**Colonna destra (1/3) — Google vs Meta Ads**
Bar chart verticale con barre affiancate Google (blu) vs Meta (viola):
- Spesa
- Revenue
- ROAS
- CPC
- CTR %

Dati da `getAdsOverview` esistente (gia' ha spend, impressions, clicks, conversions, revenue per piattaforma). CPC = spend/clicks, CTR = clicks/impressions.

**Componente:** `AdsPlatformComparison` — client component.

---

## Sezione 4: Insight & Segnali Dinamici

Card a tutta larghezza con lista di max 6 insight ordinati per severita'.

**Tipi di insight:**

| Tipo | Severita' | Logica |
|------|-----------|--------|
| Anomalia negativa | high (rosso) | Metrica giornaliera cala >20% vs media 7gg precedenti |
| Anomalia positiva | medium (verde) | Metrica giornaliera sale >20% vs media 7gg precedenti |
| Trend negativo | high (arancione) | Metrica in calo per 3+ giorni consecutivi |
| Confronto piattaforme | low (blu) | Differenza CPC o ROAS >30% tra Google e Meta |
| Stock alert | high (rosso) | SKU con inventory < 5 (esistente) |
| ROAS alert | medium (arancione) | Campagne con ROAS < 2.0 ultimi 7gg (esistente) |

**Query:** Nuova `getSmartInsights(period)` — calcola server-side, ritorna array `{ type, severity, message, metric, delta }`.

**Logica:**
1. Calcola media 7gg corrente vs 7gg precedenti per: fatturato per store, fatturato Amazon, spend Google, spend Meta, ROAS Google, ROAS Meta
2. Se delta > 20% o < -20% → genera anomalia
3. Prendi ultimi 7 giorni, cerca sequenze di 3+ giorni in calo → genera trend
4. Confronta CPC e ROAS tra Google e Meta → genera confronto se delta > 30%
5. Mantieni stock e ROAS alert esistenti
6. Ordina per severita' (high → medium → low), limita a 6
7. Se nessun insight: "Tutto nella norma"

**Rendering:** Badge colorato con icona + testo. Rosso in cima, poi arancione, poi verde/blu.

---

## Sezione 5: Top 5 Prodotti

Invariata rispetto a oggi. Tabella con rank, prodotto, canale, unita', ricavo.

---

## Layout Finale

```
┌─────────────────────────────────────────────────────────┐
│ Dashboard — Panoramica Gruppo Wilco    [DateRangePicker] │
├───────┬───────┬───────┬───────┬───────┬───────┬─────────┤
│Fattur.│Ordini │ AOV   │Sp.Ads │ ROAS  │Margine│Nuovi Cl.│
│€XX.XXX│ X.XXX │€XX,XX │€X.XXX │ X.XX  │€XX.XXX│  XXX    │
│+X.X%  │+X.X%  │+X.X%  │+X.X%  │+X.X%  │+X.X%  │+X.X%   │
│~spark~│~spark~│~spark~│~spark~│~spark~│~spark~│~spark~  │
├─────────────────────────────────────────────────────────┤
│ Revenue & Ads Trend                                     │
│ [Fatturato] [Sp.Ads] [Fatturato prev] [ROAS]  ← toggle │
│ ┌─────────────────────────────────────────────────┐     │
│ │  📈 Multi-line chart con doppio asse Y          │     │
│ │     350px height, area gradient                 │     │
│ └─────────────────────────────────────────────────┘     │
├──────────────────────────────┬──────────────────────────┤
│ Revenue per Canale           │ Google vs Meta Ads       │
│ ┌──────────────────────────┐ │ ┌──────────────────────┐ │
│ │ Bar chart (invariato)    │ │ │ Spesa  [G██ M██]     │ │
│ │ current vs previous      │ │ │ Rev    [G██ M██]     │ │
│ │                          │ │ │ ROAS   [G██ M██]     │ │
│ │                          │ │ │ CPC    [G██ M██]     │ │
│ └──────────────────────────┘ │ │ CTR    [G██ M██]     │ │
│                              │ └──────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│ 💡 Insight & Segnali                                    │
│ 🔴 Fatturato KMAX -28% vs media settimanale            │
│ 🟠 ROAS Meta in calo da 3gg (2.8→2.3→1.9)             │
│ 🟢 Ordini Amazon +35% vs media settimanale             │
│ 🔵 Google CPC €0.45 vs Meta €0.28                      │
├─────────────────────────────────────────────────────────┤
│ Top 5 Prodotti (invariato)                              │
└─────────────────────────────────────────────────────────┘
```

---

## Nuove Query

| Funzione | File | Cached | Scopo |
|----------|------|--------|-------|
| `getOverviewKpisDaily()` | `overview.ts` | Si, 1800s | 7gg di dati giornalieri per sparkline |
| `getDailyTrend()` | `overview.ts` | Si, 1800s | Serie giornaliere fatturato + ads per periodo |
| `getSmartInsights()` | Nuovo `insights.ts` | Si, 1800s | Insight rule-based |

## Nuovi Componenti Client

| Componente | File | Scopo |
|-----------|------|-------|
| `SparklineChart` | `components/sparkline-chart.tsx` | Mini line chart 60x24px per KPI cards |
| `DailyTrendChart` | `app/(dashboard)/daily-trend-chart.tsx` | Grafico principale multi-serie con toggle |
| `AdsPlatformComparison` | `app/(dashboard)/ads-platform-comparison.tsx` | Bar chart Google vs Meta |
| `InsightsPanel` | `app/(dashboard)/insights-panel.tsx` | Lista insight colorati |
