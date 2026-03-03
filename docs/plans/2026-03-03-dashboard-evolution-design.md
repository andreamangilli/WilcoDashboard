# Dashboard Evolution — Design Document
**Data:** 2026-03-03
**Autore:** Andrea Mangilli
**Obiettivo:** Trasformare il Wilco Dashboard in un centro di controllo decisionale per il titolare

---

## Contesto

Il dashboard attuale mostra KPI aggregati (fatturato totale, ordini, AOV, spesa ads) ma manca di:
- Lista ordini navigabile con dettaglio prodotti
- Ranking prodotti per performance (ricavo, margine, unità)
- Metriche pubblicitarie per campagna (ROAS, CPC, conversioni)
- Overview "command center" che mostri lo stato del business in 30 secondi

Le decisioni chiave del titolare sono: allocazione budget pubblicitario, gestione assortimento prodotti, confronto performance per canale.

---

## Approccio scelto: B + C

Nuove sezioni dedicate (`/ordini`, `/prodotti`) **più** redesign dell'Overview come vero Command Center. Le sezioni esistenti (Shopify, Amazon, Ads) restano ma vengono arricchite.

---

## 1. Overview — Command Center

### KPI Header (5 carte)
| Metrica | Calcolo | Confronto |
|---------|---------|-----------|
| Fatturato Totale | Shopify + Amazon `item_price` | vs periodo precedente (%) |
| Margine Lordo stimato | Ricavo - fees Amazon - costi prodotto (dove disponibile) | vs periodo precedente (%) |
| Ordini Totali | Shopify + Amazon | vs periodo precedente (%) |
| AOV | Fatturato / Ordini | vs periodo precedente (%) |
| Spesa Ads + ROAS | `ad_spend_daily.spend` + ROAS medio | vs periodo precedente (%) |

### Grafico Ricavi per Canale
- Bar chart esistente **potenziato** con linea overlay "Anno Precedente" (stesso periodo -12 mesi)
- Legenda: ogni store Shopify + Amazon + linea YoY

### Top 5 Prodotti (periodo corrente)
- Tabella compatta: Prodotto | Canale | Unità | Ricavo
- Cross-canale: ordini Shopify (da `line_items` JSONB) + ordini Amazon (`amazon_orders`)
- Link a `/prodotti` per la lista completa

### Segnali Operativi
- ⚠ SKU con stock < 5 unità (da `shopify_products.inventory_qty` e `amazon_inventory.qty_available`)
- 📉 Campagne con ROAS < 2x nell'ultimo periodo (da `ad_spend_daily`)
- 📈 Canali con variazione ricavo > ±20% vs periodo precedente

---

## 2. Nuova Pagina `/ordini`

### Scopo
Lista unificata di tutti gli ordini (Shopify + Amazon) con espansione inline dei prodotti per ordine.

### Filtri
- **Canale:** Tutti / Shopify (con selezione store) / Amazon
- **Stato:** Tutti / Pagato / Spedito / Rimborsato
- **Periodo:** DateRangePicker (identico a tutte le altre pagine)

### Tabella (paginazione 50 righe)
| Colonna | Fonte |
|---------|-------|
| Data | `shopify_orders.created_at` / `amazon_orders.purchase_date` |
| N° Ordine | `shopify_orders.order_number` / `amazon_orders.amazon_order_id` |
| Canale | Badge: nome store Shopify (colore per store) / Amazon IT (arancione) |
| Cliente | `shopify_orders.customer_email` / `—` per Amazon |
| Prodotti | Conteggio line items |
| Totale | `shopify_orders.total` / `amazon_orders.item_price` |
| Stato | `financial_status` + `fulfillment_status` / `order_status` |

### Espansione riga
Click su riga → espande lista prodotti:
- **Shopify:** `line_items` JSONB → nome prodotto, SKU, quantità, prezzo unitario
- **Amazon:** ASIN, SKU, quantità, prezzo unitario

### Implementazione tecnica
- Query: `shopify_orders` LEFT JOIN su `line_items` JSONB + `amazon_orders`
- Unione lato server in query function `getUnifiedOrders(period, from, to, channel, status)`
- Paginazione con offset/limit (URL param `?page=1`)
- Componente client `OrderRow` per gestire l'espansione inline

---

## 3. Nuova Pagina `/prodotti`

### Scopo
Ranking prodotti per performance nel periodo selezionato, distinto per canale.

### Tab Shopify
Query: aggrega `line_items` JSONB di `shopify_orders` nel periodo.

| Colonna | Calcolo |
|---------|---------|
| Prodotto | `line_items[].title` |
| Store | Nome store |
| Unità vendute | `SUM(line_items[].quantity)` |
| Ricavo | `SUM(line_items[].price * quantity)` |
| AOV | Ricavo / Ordini distinti |
| Stock residuo | `shopify_products.inventory_qty` (match per SKU/title) |

Avviso stock: badge ⚠ se `inventory_qty < 10`.

### Tab Amazon
Query: aggrega `amazon_orders` per ASIN nel periodo.

| Colonna | Calcolo |
|---------|---------|
| ASIN / SKU | da `amazon_orders` |
| Unità | `SUM(quantity)` |
| Ricavo | `SUM(item_price)` |
| Fee % | `(SUM(amazon_fees + fba_fees) / SUM(item_price)) * 100` |
| Margine netto | `SUM(item_price - amazon_fees - fba_fees)` |
| FBA Stock | `amazon_inventory.qty_available` |

### Ordinamento
Tutte le colonne cliccabili; default: Ricavo decrescente.

---

## 4. Ads — Potenziamento Campagne

### KPI Header (aggiunta a Google e Meta page)
Alle KPI esistenti (Spesa) si aggiungono: ROAS, CPC medio, Conversioni totali, Ricavo attribuito.

**Calcoli:**
- CPC = `SUM(spend) / SUM(clicks)`
- ROAS = `SUM(revenue) / SUM(spend)` (da `ad_spend_daily`)
- Conversioni = `SUM(conversions)`

### Tabella Campagne (potenziata)
Aggiunta di colonne calcolate dal periodo selezionato (join `ad_spend_daily` per campagna):

| Colonna aggiunta | Calcolo |
|-----------------|---------|
| Spesa (periodo) | `SUM(ad_spend_daily.spend)` per quel `campaign_id` |
| ROAS (periodo) | `SUM(revenue) / SUM(spend)` |
| Conversioni | `SUM(conversions)` |
| Badge ROAS | 🔴 se ROAS < 2x, 🟡 se 2-3x, 🟢 se > 3x |

---

## Struttura file da creare/modificare

### Nuovi file
```
src/app/(dashboard)/ordini/page.tsx
src/app/(dashboard)/prodotti/page.tsx
src/lib/queries/orders.ts          — getUnifiedOrders()
src/lib/queries/products.ts        — getShopifyProductPerf(), getAmazonProductPerf()
src/components/order-row.tsx       — espansione inline ordine (client component)
```

### File modificati
```
src/app/(dashboard)/page.tsx                    — nuovi KPI, YoY chart, top prodotti, segnali
src/app/(dashboard)/ads/google/page.tsx         — nuovi KPI + campagne arricchite
src/app/(dashboard)/ads/meta/page.tsx           — nuovi KPI + campagne arricchite
src/app/(dashboard)/ads/revenue-chart.tsx       — linea YoY overlay
src/components/sidebar.tsx                      — voci menu Ordini, Prodotti
src/lib/queries/overview.ts                     — aggiungi top prodotti + segnali operativi
src/lib/queries/ads.ts                          — aggiungi metriche per campagna
```

---

## Dati disponibili nel DB

| Feature | Disponibile | Note |
|---------|-------------|------|
| Ordini Shopify con line_items | ✅ | JSONB `line_items` in `shopify_orders` |
| Ordini Amazon | ✅ | `amazon_orders` con ASIN, fees, quantity |
| Stock Shopify | ✅ | `shopify_products.inventory_qty` |
| Stock Amazon FBA | ✅ | `amazon_inventory.qty_available` |
| Margine Amazon | ✅ | Calcolabile da `item_price - amazon_fees - fba_fees` |
| Margine Shopify | ⚠️ | Solo se `shopify_products.cost` è valorizzato |
| ROAS per campagna | ✅ | `ad_spend_daily` con `revenue` e `spend` per `campaign_id` |
| CPC per campagna | ✅ | `spend / clicks` da `ad_spend_daily` |
| Confronto YoY | ✅ | `getDateRange` già calcola `prevStart/prevEnd` |

---

## Priorità di implementazione

1. **Alta** — `/ordini` (richiesta esplicita dell'utente, dato già disponibile)
2. **Alta** — `/prodotti` con tab Shopify + Amazon
3. **Alta** — Ads campagne con ROAS/CPC/conversioni
4. **Media** — Overview Command Center (KPI aggiuntivi + top prodotti + segnali)
5. **Media** — Grafico YoY overlay nell'overview

---

## Vincoli tecnici

- Vercel Hobby plan: max 300s per function, no cron < 24h
- Next.js 15 async `searchParams`
- Client components limitati: solo sidebar, form, chart, date picker
- Tutte le query sono Server Components
- Formattazione `it-IT` per tutti i numeri/valute
