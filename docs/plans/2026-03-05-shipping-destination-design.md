# Shipping Destination Data — Design

## Goal

Add shipping destination data (country, country_code, city, province) to Shopify and Amazon orders throughout the entire stack: database, sync, queries, and UI.

## Database Changes

Add 4 columns to both `shopify_orders` and `amazon_orders`:

| Column | Type | Description |
|--------|------|-------------|
| `shipping_country` | TEXT | Country name (e.g. "Italy") |
| `shipping_country_code` | TEXT | ISO code (e.g. "IT") |
| `shipping_city` | TEXT | City name |
| `shipping_province` | TEXT | Province/region |

Add index on `shipping_country_code` for both tables.

## Sync Workers

### Shopify (`src/lib/sync/shopify.ts`)

Extract from `order.shipping_address`:
- `.country` → `shipping_country`
- `.country_code` → `shipping_country_code`
- `.city` → `shipping_city`
- `.province` → `shipping_province`

Use optional chaining since `shipping_address` may be null (e.g. digital orders).

### Amazon (`src/lib/sync/amazon.ts`)

Extract from `order.ShippingAddress`:
- `.CountryCode` → `shipping_country_code`
- `.City` → `shipping_city`
- `.StateOrRegion` → `shipping_province`

Amazon API doesn't always provide a full country name — map from country code if needed, or store code only.

## Queries (`src/lib/queries/orders.ts`)

- Add `shippingCountry`, `shippingCountryCode`, `shippingCity`, `shippingProvince` to `ShopifyOrderRow` and `AmazonOrderRow` types
- Include the new columns in SELECT statements

## UI Changes

### Orders table (`ordini/page.tsx` + `order-row.tsx`)

- Add "Destinazione" column to table header
- Display as `City, Country Code` (e.g. "Milano, IT") in the summary row
- Show full destination in expanded details row

## Out of Scope

- Billing address data
- Separate geographic analytics pages
- Full address (street, zip, phone)
- Separate address table
