# Shipping Destination Data — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add shipping destination fields (country, country_code, city, province) to Shopify and Amazon orders across DB, sync, queries, and UI.

**Architecture:** Add 4 nullable TEXT columns to both `shopify_orders` and `amazon_orders` tables. Extract data from Shopify's `order.shipping_address` and Amazon's `order.ShippingAddress` during sync upserts. Expose through query types and display in the orders table.

**Tech Stack:** Supabase Postgres, Next.js App Router, TypeScript, React Server Components

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/006_shipping_destination.sql`

**Step 1: Write the migration**

```sql
-- Add shipping destination columns to shopify_orders
ALTER TABLE shopify_orders
  ADD COLUMN IF NOT EXISTS shipping_country TEXT,
  ADD COLUMN IF NOT EXISTS shipping_country_code TEXT,
  ADD COLUMN IF NOT EXISTS shipping_city TEXT,
  ADD COLUMN IF NOT EXISTS shipping_province TEXT;

-- Add shipping destination columns to amazon_orders
ALTER TABLE amazon_orders
  ADD COLUMN IF NOT EXISTS shipping_country TEXT,
  ADD COLUMN IF NOT EXISTS shipping_country_code TEXT,
  ADD COLUMN IF NOT EXISTS shipping_city TEXT,
  ADD COLUMN IF NOT EXISTS shipping_province TEXT;

-- Indexes for geographic queries
CREATE INDEX IF NOT EXISTS idx_shopify_orders_country ON shopify_orders(shipping_country_code);
CREATE INDEX IF NOT EXISTS idx_amazon_orders_country ON amazon_orders(shipping_country_code);
```

**Step 2: Apply the migration on Supabase**

Run this SQL in the Supabase SQL editor (or via `supabase db push` if using the CLI).

**Step 3: Commit**

```bash
git add supabase/migrations/006_shipping_destination.sql
git commit -m "feat: add shipping destination columns to order tables"
```

---

### Task 2: Update Shopify Sync Worker

**Files:**
- Modify: `src/lib/sync/shopify.ts:93-111`

**Step 1: Add shipping fields to the upsert**

In the `syncShopifyOrders` function, inside the `for (const order of orders)` loop, update the upsert object at line 94-111 to include shipping address fields:

```typescript
await supabase.from("shopify_orders").upsert(
  {
    store_id: config.storeId,
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
```

**Step 2: Verify build**

Run: `npm run build`
Expected: No TypeScript errors

**Step 3: Commit**

```bash
git add src/lib/sync/shopify.ts
git commit -m "feat: extract shipping destination from Shopify orders"
```

---

### Task 3: Update Amazon Sync Worker

**Files:**
- Modify: `src/lib/sync/amazon.ts:109-133`

**Step 1: Add shipping fields to the upsert**

In the `syncAmazonOrders` function, inside the `for (const order of orders)` loop (line 109), add shipping address extraction. The `ShippingAddress` is on the order object (not on individual items). Update the upsert at lines 117-133:

```typescript
for (const item of items) {
  await supabase.from("amazon_orders").upsert(
    {
      account_id: accountId,
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
  synced++;
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: No TypeScript errors

**Step 3: Commit**

```bash
git add src/lib/sync/amazon.ts
git commit -m "feat: extract shipping destination from Amazon orders"
```

---

### Task 4: Update Query Types and SELECT

**Files:**
- Modify: `src/lib/queries/orders.ts:6-30` (types), `src/lib/queries/orders.ts:71-106` (shopify query), `src/lib/queries/orders.ts:120-144` (amazon query)

**Step 1: Add fields to ShopifyOrderRow type (line 6-17)**

```typescript
export type ShopifyOrderRow = {
  id: string;
  source: "shopify";
  storeName: string;
  date: string;
  orderNumber: string;
  customerEmail: string | null;
  lineItems: Array<{ title: string; sku: string | null; quantity: number; price: number }>;
  total: number;
  status: string;
  fulfillmentStatus: string | null;
  shippingCity: string | null;
  shippingProvince: string | null;
  shippingCountry: string | null;
  shippingCountryCode: string | null;
};
```

**Step 2: Add fields to AmazonOrderRow type (line 19-30)**

```typescript
export type AmazonOrderRow = {
  id: string;
  source: "amazon";
  accountName: string;
  date: string;
  orderNumber: string;
  asin: string;
  sku: string | null;
  total: number;
  status: string;
  fulfillmentChannel: string;
  shippingCity: string | null;
  shippingProvince: string | null;
  shippingCountry: string | null;
  shippingCountryCode: string | null;
};
```

**Step 3: Update Shopify SELECT and mapping (lines 76-106)**

Add `shipping_city, shipping_province, shipping_country, shipping_country_code` to the select string and the fetchAll type. Add the 4 fields to the return mapping:

In the `fetchAll` type parameter, add:
```typescript
shipping_city: string | null; shipping_province: string | null;
shipping_country: string | null; shipping_country_code: string | null;
```

In the `.select()` call, append:
```
", shipping_city, shipping_province, shipping_country, shipping_country_code"
```

In the return mapping, add:
```typescript
shippingCity: o.shipping_city,
shippingProvince: o.shipping_province,
shippingCountry: o.shipping_country,
shippingCountryCode: o.shipping_country_code,
```

**Step 4: Update Amazon SELECT and mapping (lines 120-144)**

Same pattern: add to `fetchAll` type, `.select()`, and return mapping.

In the `fetchAll` type parameter, add:
```typescript
shipping_city: string | null; shipping_province: string | null;
shipping_country: string | null; shipping_country_code: string | null;
```

In the `.select()` call, append:
```
", shipping_city, shipping_province, shipping_country, shipping_country_code"
```

In the return mapping, add:
```typescript
shippingCity: o.shipping_city,
shippingProvince: o.shipping_province,
shippingCountry: o.shipping_country,
shippingCountryCode: o.shipping_country_code,
```

**Step 5: Verify build**

Run: `npm run build`
Expected: No TypeScript errors

**Step 6: Commit**

```bash
git add src/lib/queries/orders.ts
git commit -m "feat: include shipping destination in order queries"
```

---

### Task 5: Update Orders Table UI

**Files:**
- Modify: `src/app/(dashboard)/ordini/page.tsx:141-151` (table header)
- Modify: `src/components/order-row.tsx:32-86` (summary row), `src/components/order-row.tsx:88-144` (expanded row)

**Step 1: Add "Destinazione" column header in `ordini/page.tsx`**

After the "Cliente" `<TableHead>` at line 147, add:

```tsx
<TableHead className="text-xs font-semibold uppercase tracking-wider text-gray-500">Destinazione</TableHead>
```

Also update the `colSpan` in the empty state `<td>` at line 158 from `8` to `9`.

**Step 2: Add destination cell in `order-row.tsx` summary row**

After the customer email `<TableCell>` (line 74-76), add a new cell:

```tsx
<TableCell className="text-sm text-gray-500">
  {order.shippingCity && order.shippingCountryCode
    ? `${order.shippingCity}, ${order.shippingCountryCode}`
    : order.shippingCountryCode ?? "—"}
</TableCell>
```

**Step 3: Update expanded row colSpan**

In the expanded `<TableRow>` at line 90, change `colSpan={8}` to `colSpan={9}`.

**Step 4: Verify build**

Run: `npm run build`
Expected: No errors, page renders with new column

**Step 5: Commit**

```bash
git add src/app/\(dashboard\)/ordini/page.tsx src/components/order-row.tsx
git commit -m "feat: display shipping destination in orders table"
```

---

### Task 6: Verify Everything & Final Commit

**Step 1: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 2: Run build**

Run: `npm run build`
Expected: Clean build

**Step 3: Visual check**

Run: `npm run dev` and navigate to `/ordini` to verify the new "Destinazione" column appears. Existing orders will show "—" until next sync populates the data.
