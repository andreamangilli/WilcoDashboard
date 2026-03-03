# Dashboard Evolution Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add unified /ordini page with inline order detail, /prodotti product-performance ranking, enhanced Ads pages with per-campaign ROAS/CPC, and a Command Center overview.

**Architecture:** All new pages are React Server Components. New query functions live in `src/lib/queries/`. The only new client component is `OrderRow` (manages expand/collapse state). Product aggregation (Shopify line_items JSONB) is done in JS after fetching raw rows. All data is filtered by the existing DateRangePicker URL params (`?period=`, `?from=`, `?to=`).

**Tech Stack:** Next.js 16 App Router · Supabase PostgreSQL · TypeScript strict · shadcn/ui · Tailwind CSS v4 · Recharts 3 · date-fns · Jest (unit tests for pure functions only)

---

## Task 1: Add Ordini + Prodotti to sidebar

**Files:**
- Modify: `src/components/sidebar.tsx`

**Step 1: Add two nav items**

Open `src/components/sidebar.tsx`. The current `navItems` array is:
```typescript
const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/shopify", label: "Shopify", icon: ShoppingBag },
  { href: "/amazon", label: "Amazon", icon: Package },
  { href: "/ads", label: "Advertising", icon: Megaphone },
  { href: "/settings", label: "Impostazioni", icon: Settings },
];
```

Add `ClipboardList` and `BarChart2` to the lucide-react import, then insert two items after Dashboard:

```typescript
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  Megaphone,
  Settings,
  LogOut,
  ClipboardList,
  BarChart2,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/ordini", label: "Ordini", icon: ClipboardList },
  { href: "/prodotti", label: "Prodotti", icon: BarChart2 },
  { href: "/shopify", label: "Shopify", icon: ShoppingBag },
  { href: "/amazon", label: "Amazon", icon: Package },
  { href: "/ads", label: "Advertising", icon: Megaphone },
  { href: "/settings", label: "Impostazioni", icon: Settings },
];
```

**Step 2: Build and verify**
```bash
npm run build
```
Expected: build passes with no errors.

**Step 3: Commit**
```bash
git add src/components/sidebar.tsx
git commit -m "feat: add Ordini and Prodotti to sidebar navigation"
```

---

## Task 2: Create unified orders query

**Files:**
- Create: `src/lib/queries/orders.ts`
- Create: `src/lib/__tests__/orders.test.ts`

### Step 1: Write the failing test

Create `src/lib/__tests__/orders.test.ts`:

```typescript
import { mergeAndSortOrders } from "../queries/orders";

describe("mergeAndSortOrders", () => {
  it("merges shopify and amazon orders sorted by date descending", () => {
    const shopify = [
      {
        id: "s1",
        source: "shopify" as const,
        storeName: "Vitaminity",
        date: "2025-03-02T10:00:00Z",
        orderNumber: "1001",
        customerEmail: "a@b.com",
        lineItems: [],
        total: 50,
        status: "paid",
        fulfillmentStatus: "fulfilled",
      },
    ];
    const amazon = [
      {
        id: "a1",
        source: "amazon" as const,
        accountName: "Amazon IT",
        date: "2025-03-03T08:00:00Z",
        orderNumber: "AMZ-001",
        asin: "B08XXX",
        sku: "SKU1",
        total: 30,
        status: "Shipped",
        fulfillmentChannel: "AFN",
      },
    ];
    const result = mergeAndSortOrders(shopify, amazon);
    expect(result).toHaveLength(2);
    expect(result[0].source).toBe("amazon"); // newer date first
    expect(result[1].source).toBe("shopify");
  });

  it("returns empty array when both inputs are empty", () => {
    expect(mergeAndSortOrders([], [])).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**
```bash
npx jest src/lib/__tests__/orders.test.ts --no-coverage
```
Expected: FAIL — "Cannot find module"

**Step 3: Create the query file**

Create `src/lib/queries/orders.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { getDateRange } from "./utils";

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
};

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
};

export type UnifiedOrder = ShopifyOrderRow | AmazonOrderRow;

export function mergeAndSortOrders(
  shopify: ShopifyOrderRow[],
  amazon: AmazonOrderRow[]
): UnifiedOrder[] {
  return [...shopify, ...amazon].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export async function getUnifiedOrders(
  period: string,
  from?: string,
  to?: string,
  channel: "all" | "shopify" | "amazon" = "all",
  status = "all",
  page = 1
) {
  const supabase = await createClient();
  const { start, end } = getDateRange(period, from, to);
  const PAGE_SIZE = 50;
  const offset = (page - 1) * PAGE_SIZE;

  let shopifyRows: ShopifyOrderRow[] = [];
  let amazonRows: AmazonOrderRow[] = [];

  if (channel === "all" || channel === "shopify") {
    const { data: stores } = await supabase
      .from("stores")
      .select("id, name");

    for (const store of stores || []) {
      let query = supabase
        .from("shopify_orders")
        .select("id, order_number, total, customer_email, financial_status, fulfillment_status, created_at, line_items")
        .eq("store_id", store.id)
        .gte("created_at", start)
        .lte("created_at", end);

      if (status !== "all") query = query.eq("financial_status", status);

      const { data: orders } = await query;
      for (const o of orders || []) {
        const rawItems = (o.line_items as Array<{
          title?: string;
          sku?: string;
          quantity?: number;
          price?: string | number;
        }>) || [];
        shopifyRows.push({
          id: o.id,
          source: "shopify",
          storeName: store.name,
          date: o.created_at,
          orderNumber: o.order_number,
          customerEmail: o.customer_email,
          lineItems: rawItems.map((li) => ({
            title: li.title || "—",
            sku: li.sku || null,
            quantity: li.quantity || 1,
            price: parseFloat(String(li.price || "0")),
          })),
          total: o.total || 0,
          status: o.financial_status,
          fulfillmentStatus: o.fulfillment_status,
        });
      }
    }
  }

  if (channel === "all" || channel === "amazon") {
    const { data: accounts } = await supabase
      .from("amazon_accounts")
      .select("id, name");

    for (const account of accounts || []) {
      let query = supabase
        .from("amazon_orders")
        .select("id, amazon_order_id, asin, sku, item_price, order_status, fulfillment_channel, purchase_date")
        .eq("account_id", account.id)
        .gte("purchase_date", start)
        .lte("purchase_date", end);

      if (status !== "all") query = query.eq("order_status", status);

      const { data: orders } = await query;
      for (const o of orders || []) {
        amazonRows.push({
          id: o.id,
          source: "amazon",
          accountName: account.name,
          date: o.purchase_date,
          orderNumber: o.amazon_order_id,
          asin: o.asin,
          sku: o.sku,
          total: o.item_price || 0,
          status: o.order_status,
          fulfillmentChannel: o.fulfillment_channel,
        });
      }
    }
  }

  const all = mergeAndSortOrders(shopifyRows, amazonRows);
  const total = all.length;
  const paginated = all.slice(offset, offset + PAGE_SIZE);

  return { orders: paginated, total, page, pageSize: PAGE_SIZE };
}
```

**Step 4: Run test to verify it passes**
```bash
npx jest src/lib/__tests__/orders.test.ts --no-coverage
```
Expected: PASS

**Step 5: Commit**
```bash
git add src/lib/queries/orders.ts src/lib/__tests__/orders.test.ts
git commit -m "feat: add getUnifiedOrders query with mergeAndSortOrders"
```

---

## Task 3: Create OrderRow client component

**Files:**
- Create: `src/components/order-row.tsx`

**Step 1: Create the component**

This is a `"use client"` component that handles the expand/collapse toggle for a single order row.

Create `src/components/order-row.tsx`:

```typescript
"use client";

import { useState } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UnifiedOrder } from "@/lib/queries/orders";

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  const s = status.toLowerCase();
  if (s === "paid" || s === "shipped" || s === "unshipped") return "default";
  if (s === "refunded" || s === "cancelled") return "destructive";
  return "secondary";
}

function channelColor(source: string, name: string) {
  if (source === "amazon") return "bg-orange-100 text-orange-800";
  const colors: Record<string, string> = {
    Vitaminity: "bg-green-100 text-green-800",
    KMax: "bg-blue-100 text-blue-800",
    HairShopEurope: "bg-purple-100 text-purple-800",
  };
  return colors[name] ?? "bg-gray-100 text-gray-800";
}

export function OrderRow({ order }: { order: UnifiedOrder }) {
  const [expanded, setExpanded] = useState(false);

  const channelName = order.source === "shopify" ? order.storeName : order.accountName;
  const itemCount = order.source === "shopify" ? order.lineItems.length : 1;
  const dateStr = new Date(order.date).toLocaleDateString("it-IT");

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-gray-50"
        onClick={() => setExpanded((v) => !v)}
      >
        <TableCell className="w-6">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400" />
          )}
        </TableCell>
        <TableCell className="text-sm text-gray-500">{dateStr}</TableCell>
        <TableCell className="font-mono text-xs">{order.orderNumber}</TableCell>
        <TableCell>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
              channelColor(order.source, channelName)
            )}
          >
            {channelName}
          </span>
        </TableCell>
        <TableCell className="text-sm text-gray-500">
          {order.source === "shopify" ? order.customerEmail ?? "—" : "—"}
        </TableCell>
        <TableCell className="text-sm">{itemCount} {itemCount === 1 ? "item" : "items"}</TableCell>
        <TableCell className="text-right font-medium">{formatCurrency(order.total)}</TableCell>
        <TableCell>
          <Badge variant={statusVariant(order.status)} className="text-xs">
            {order.status}
          </Badge>
        </TableCell>
      </TableRow>

      {expanded && (
        <TableRow className="bg-gray-50">
          <TableCell colSpan={8} className="py-0">
            <div className="pl-8 py-3">
              {order.source === "shopify" ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500">
                      <th className="text-left pb-1">Prodotto</th>
                      <th className="text-left pb-1">SKU</th>
                      <th className="text-right pb-1">Qty</th>
                      <th className="text-right pb-1">Prezzo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.lineItems.map((li, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="py-1">{li.title}</td>
                        <td className="py-1 text-gray-500">{li.sku ?? "—"}</td>
                        <td className="py-1 text-right">{li.quantity}</td>
                        <td className="py-1 text-right">{formatCurrency(li.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500">
                      <th className="text-left pb-1">ASIN</th>
                      <th className="text-left pb-1">SKU</th>
                      <th className="text-left pb-1">Fulfillment</th>
                      <th className="text-right pb-1">Importo</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-gray-100">
                      <td className="py-1 font-mono text-xs">{order.asin}</td>
                      <td className="py-1 text-gray-500">{order.sku ?? "—"}</td>
                      <td className="py-1">{order.fulfillmentChannel}</td>
                      <td className="py-1 text-right">{formatCurrency(order.total)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
```

**Step 2: Build check**
```bash
npm run build
```
Expected: PASS

**Step 3: Commit**
```bash
git add src/components/order-row.tsx
git commit -m "feat: add OrderRow client component with inline expand/collapse"
```

---

## Task 4: Create /ordini page

**Files:**
- Create: `src/app/(dashboard)/ordini/page.tsx`

**Step 1: Create the page**

```typescript
import { PageHeader } from "@/components/page-header";
import { DateRangePicker } from "@/components/date-range-picker";
import { getUnifiedOrders } from "@/lib/queries/orders";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OrderRow } from "@/components/order-row";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  searchParams: Promise<{
    period?: string;
    from?: string;
    to?: string;
    channel?: string;
    status?: string;
    page?: string;
  }>;
}

export default async function OrdiniPage({ searchParams }: Props) {
  const {
    period = "30d",
    from,
    to,
    channel = "all",
    status = "all",
    page = "1",
  } = await searchParams;

  const { orders, total, pageSize } = await getUnifiedOrders(
    period,
    from,
    to,
    channel as "all" | "shopify" | "amazon",
    status,
    parseInt(page)
  );

  const currentPage = parseInt(page);
  const totalPages = Math.ceil(total / pageSize);

  function buildUrl(overrides: Record<string, string>) {
    const params = new URLSearchParams({
      ...(period !== "30d" ? { period } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(channel !== "all" ? { channel } : {}),
      ...(status !== "all" ? { status } : {}),
      page: "1",
      ...overrides,
    });
    return `?${params.toString()}`;
  }

  return (
    <div>
      <PageHeader title="Ordini" description={`${total} ordini trovati`}>
        <DateRangePicker />
      </PageHeader>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Select
          value={channel}
          onValueChange={(v) => {
            // Client-side nav handled via Link below — render as links
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i canali</SelectItem>
            <SelectItem value="shopify">Shopify</SelectItem>
            <SelectItem value="amazon">Amazon</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex gap-2 text-sm">
          {["all", "shopify", "amazon"].map((c) => (
            <Link
              key={c}
              href={buildUrl({ channel: c })}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                channel === c
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {c === "all" ? "Tutti" : c === "shopify" ? "Shopify" : "Amazon"}
            </Link>
          ))}
        </div>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-6" />
            <TableHead>Data</TableHead>
            <TableHead>N° Ordine</TableHead>
            <TableHead>Canale</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Prodotti</TableHead>
            <TableHead className="text-right">Totale</TableHead>
            <TableHead>Stato</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.length === 0 ? (
            <TableRow>
              <td colSpan={8} className="py-8 text-center text-sm text-gray-500">
                Nessun ordine trovato per il periodo selezionato.
              </td>
            </TableRow>
          ) : (
            orders.map((order) => <OrderRow key={order.id} order={order} />)
          )}
        </TableBody>
      </Table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>
            Pagina {currentPage} di {totalPages} ({total} ordini totali)
          </span>
          <div className="flex gap-2">
            {currentPage > 1 && (
              <Link href={buildUrl({ page: String(currentPage - 1) })}>
                <Button variant="outline" size="sm">Precedente</Button>
              </Link>
            )}
            {currentPage < totalPages && (
              <Link href={buildUrl({ page: String(currentPage + 1) })}>
                <Button variant="outline" size="sm">Successiva</Button>
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

**Note on the Select filter:** The Select component above needs to be client-side to trigger navigation. Since the page is a Server Component, use the filter link buttons instead (already rendered above). Remove the `<Select>` block and keep only the link-based filter buttons. The `<Select>` block is a placeholder — delete it and keep only the `<div className="flex gap-2 text-sm">` filter.

**Step 2: Build check**
```bash
npm run build
```
Expected: PASS

**Step 3: Commit**
```bash
git add src/app/(dashboard)/ordini/page.tsx
git commit -m "feat: add /ordini unified orders page with channel filter and pagination"
```

---

## Task 5: Create product performance queries

**Files:**
- Create: `src/lib/queries/products.ts`
- Create: `src/lib/__tests__/products.test.ts`

**Step 1: Write the failing test**

Create `src/lib/__tests__/products.test.ts`:

```typescript
import { aggregateLineItems, aggregateAmazonProducts } from "../queries/products";

describe("aggregateLineItems", () => {
  it("aggregates line items from multiple orders by title", () => {
    const orders = [
      {
        line_items: [
          { title: "Shampoo", sku: "SH1", quantity: 2, price: "15.00" },
          { title: "Conditioner", sku: "CO1", quantity: 1, price: "12.00" },
        ],
        total: "42.00",
      },
      {
        line_items: [
          { title: "Shampoo", sku: "SH1", quantity: 1, price: "15.00" },
        ],
        total: "15.00",
      },
    ];
    const result = aggregateLineItems(orders, "Vitaminity");
    const shampoo = result.find((r) => r.title === "Shampoo");
    expect(shampoo).toBeDefined();
    expect(shampoo!.units).toBe(3);
    expect(shampoo!.revenue).toBeCloseTo(45, 1);
    expect(result).toHaveLength(2);
  });
});

describe("aggregateAmazonProducts", () => {
  it("groups orders by asin", () => {
    const orders = [
      { asin: "B08A", sku: "SKU1", quantity: 2, item_price: 30, amazon_fees: 3, fba_fees: 2 },
      { asin: "B08A", sku: "SKU1", quantity: 1, item_price: 15, amazon_fees: 1.5, fba_fees: 1 },
      { asin: "B09B", sku: "SKU2", quantity: 1, item_price: 20, amazon_fees: 2, fba_fees: 1.5 },
    ];
    const result = aggregateAmazonProducts(orders);
    expect(result).toHaveLength(2);
    const b08a = result.find((r) => r.asin === "B08A")!;
    expect(b08a.units).toBe(3);
    expect(b08a.revenue).toBeCloseTo(45, 1);
    expect(b08a.totalFees).toBeCloseTo(7.5, 1);
    expect(b08a.netMargin).toBeCloseTo(37.5, 1);
  });
});
```

**Step 2: Run test to verify it fails**
```bash
npx jest src/lib/__tests__/products.test.ts --no-coverage
```
Expected: FAIL — "Cannot find module"

**Step 3: Create the query file**

Create `src/lib/queries/products.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { getDateRange } from "./utils";

export type ShopifyProductPerf = {
  title: string;
  storeName: string;
  sku: string | null;
  units: number;
  revenue: number;
  ordersCount: number;
  inventoryQty: number | null;
};

export type AmazonProductPerf = {
  asin: string;
  sku: string | null;
  units: number;
  revenue: number;
  totalFees: number;
  feePercent: number;
  netMargin: number;
  netMarginPct: number;
  qtyAvailable: number | null;
};

type RawLineItem = {
  title?: string;
  sku?: string;
  quantity?: number;
  price?: string | number;
};

export function aggregateLineItems(
  orders: Array<{ line_items: unknown; total: unknown }>,
  storeName: string
): ShopifyProductPerf[] {
  const map = new Map<string, ShopifyProductPerf>();

  for (const order of orders) {
    const items = (order.line_items as RawLineItem[]) || [];
    const orderIds = new Set<string>();

    for (const li of items) {
      const title = li.title || "—";
      const key = `${storeName}::${title}`;
      const qty = li.quantity || 1;
      const price = parseFloat(String(li.price || "0"));
      const lineRevenue = qty * price;

      if (!map.has(key)) {
        map.set(key, {
          title,
          storeName,
          sku: li.sku || null,
          units: 0,
          revenue: 0,
          ordersCount: 0,
          inventoryQty: null,
        });
      }
      const entry = map.get(key)!;
      entry.units += qty;
      entry.revenue += lineRevenue;
      if (!orderIds.has(key)) {
        entry.ordersCount += 1;
        orderIds.add(key);
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
}

export function aggregateAmazonProducts(
  orders: Array<{
    asin: string;
    sku: string | null;
    quantity: number;
    item_price: number;
    amazon_fees: number;
    fba_fees: number;
  }>
): AmazonProductPerf[] {
  const map = new Map<string, AmazonProductPerf>();

  for (const o of orders) {
    if (!map.has(o.asin)) {
      map.set(o.asin, {
        asin: o.asin,
        sku: o.sku,
        units: 0,
        revenue: 0,
        totalFees: 0,
        feePercent: 0,
        netMargin: 0,
        netMarginPct: 0,
        qtyAvailable: null,
      });
    }
    const entry = map.get(o.asin)!;
    entry.units += o.quantity || 1;
    entry.revenue += o.item_price || 0;
    entry.totalFees += (o.amazon_fees || 0) + (o.fba_fees || 0);
  }

  for (const entry of map.values()) {
    entry.netMargin = entry.revenue - entry.totalFees;
    entry.feePercent = entry.revenue > 0 ? (entry.totalFees / entry.revenue) * 100 : 0;
    entry.netMarginPct = entry.revenue > 0 ? (entry.netMargin / entry.revenue) * 100 : 0;
  }

  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
}

export async function getShopifyProductPerf(period: string, from?: string, to?: string) {
  const supabase = await createClient();
  const { start, end } = getDateRange(period, from, to);

  const { data: stores } = await supabase.from("stores").select("id, name");
  const results: ShopifyProductPerf[] = [];

  for (const store of stores || []) {
    const { data: orders } = await supabase
      .from("shopify_orders")
      .select("line_items, total")
      .eq("store_id", store.id)
      .eq("financial_status", "paid")
      .gte("created_at", start)
      .lte("created_at", end);

    const aggregated = aggregateLineItems(orders || [], store.name);

    // Enrich with current inventory
    const { data: products } = await supabase
      .from("shopify_products")
      .select("title, sku, inventory_qty")
      .eq("store_id", store.id);

    const inventoryMap = new Map(
      (products || []).map((p) => [p.title, p.inventory_qty])
    );

    for (const row of aggregated) {
      row.inventoryQty = inventoryMap.get(row.title) ?? null;
      results.push(row);
    }
  }

  return results.sort((a, b) => b.revenue - a.revenue);
}

export async function getAmazonProductPerf(period: string, from?: string, to?: string) {
  const supabase = await createClient();
  const { start, end } = getDateRange(period, from, to);

  const { data: orders } = await supabase
    .from("amazon_orders")
    .select("asin, sku, quantity, item_price, amazon_fees, fba_fees")
    .gte("purchase_date", start)
    .lte("purchase_date", end);

  const results = aggregateAmazonProducts(
    (orders || []).map((o) => ({
      ...o,
      quantity: o.quantity || 1,
      item_price: o.item_price || 0,
      amazon_fees: o.amazon_fees || 0,
      fba_fees: o.fba_fees || 0,
    }))
  );

  // Enrich with FBA inventory
  const { data: inventory } = await supabase
    .from("amazon_inventory")
    .select("asin, qty_available")
    .eq("fulfillment", "fba");

  const invMap = new Map(
    (inventory || []).map((i) => [i.asin, i.qty_available])
  );

  for (const row of results) {
    row.qtyAvailable = invMap.get(row.asin) ?? null;
  }

  return results;
}
```

**Step 4: Run test to verify it passes**
```bash
npx jest src/lib/__tests__/products.test.ts --no-coverage
```
Expected: PASS (2 test suites, 2 tests)

**Step 5: Commit**
```bash
git add src/lib/queries/products.ts src/lib/__tests__/products.test.ts
git commit -m "feat: add getShopifyProductPerf and getAmazonProductPerf queries"
```

---

## Task 6: Create /prodotti page

**Files:**
- Create: `src/app/(dashboard)/prodotti/page.tsx`

**Step 1: Create the page**

```typescript
import { PageHeader } from "@/components/page-header";
import { DateRangePicker } from "@/components/date-range-picker";
import { getShopifyProductPerf, getAmazonProductPerf } from "@/lib/queries/products";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber } from "@/lib/format";
import Link from "next/link";

interface Props {
  searchParams: Promise<{
    period?: string;
    from?: string;
    to?: string;
    tab?: string;
  }>;
}

export default async function ProdottiPage({ searchParams }: Props) {
  const { period = "30d", from, to, tab = "shopify" } = await searchParams;

  const [shopifyData, amazonData] = await Promise.all([
    getShopifyProductPerf(period, from, to),
    getAmazonProductPerf(period, from, to),
  ]);

  const params = new URLSearchParams({
    ...(period !== "30d" ? { period } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  });

  const tabLink = (t: string) =>
    `?${new URLSearchParams({ ...Object.fromEntries(params), tab: t })}`;

  return (
    <div>
      <PageHeader title="Prodotti" description="Performance prodotti per periodo">
        <DateRangePicker />
      </PageHeader>

      {/* Tab navigation */}
      <div className="mb-6 flex gap-2">
        {(["shopify", "amazon"] as const).map((t) => (
          <Link
            key={t}
            href={tabLink(t)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t === "shopify" ? "Shopify" : "Amazon"}
          </Link>
        ))}
      </div>

      {tab === "shopify" && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Prodotto</TableHead>
              <TableHead>Store</TableHead>
              <TableHead className="text-right">Unità</TableHead>
              <TableHead className="text-right">Ricavo</TableHead>
              <TableHead className="text-right">AOV</TableHead>
              <TableHead className="text-right">Stock</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shopifyData.length === 0 ? (
              <TableRow>
                <td colSpan={6} className="py-8 text-center text-sm text-gray-500">
                  Nessun dato per il periodo selezionato.
                </td>
              </TableRow>
            ) : (
              shopifyData.map((p, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{p.title}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{p.storeName}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{formatNumber(p.units)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(p.revenue)}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(p.ordersCount > 0 ? p.revenue / p.ordersCount : 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    {p.inventoryQty !== null ? (
                      <span
                        className={
                          p.inventoryQty < 10
                            ? "font-semibold text-red-600"
                            : "text-gray-700"
                        }
                      >
                        {formatNumber(p.inventoryQty)}
                        {p.inventoryQty < 10 && " ⚠"}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      {tab === "amazon" && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ASIN</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Unità</TableHead>
              <TableHead className="text-right">Ricavo</TableHead>
              <TableHead className="text-right">Fee %</TableHead>
              <TableHead className="text-right">Margine Netto</TableHead>
              <TableHead className="text-right">FBA Stock</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {amazonData.length === 0 ? (
              <TableRow>
                <td colSpan={7} className="py-8 text-center text-sm text-gray-500">
                  Nessun dato per il periodo selezionato.
                </td>
              </TableRow>
            ) : (
              amazonData.map((p, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-xs">{p.asin}</TableCell>
                  <TableCell className="text-sm text-gray-500">{p.sku ?? "—"}</TableCell>
                  <TableCell className="text-right">{formatNumber(p.units)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(p.revenue)}</TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant={p.feePercent > 35 ? "destructive" : "secondary"}
                    >
                      {p.feePercent.toFixed(1)}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={p.netMargin >= 0 ? "text-green-700 font-medium" : "text-red-600 font-medium"}>
                      {formatCurrency(p.netMargin)}{" "}
                      <span className="text-xs">({p.netMarginPct.toFixed(1)}%)</span>
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {p.qtyAvailable !== null ? (
                      <span className={p.qtyAvailable < 5 ? "font-semibold text-red-600" : "text-gray-700"}>
                        {formatNumber(p.qtyAvailable)}
                        {p.qtyAvailable < 5 && " ⚠"}
                      </span>
                    ) : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

**Step 2: Build check**
```bash
npm run build
```
Expected: PASS

**Step 3: Commit**
```bash
git add src/app/(dashboard)/prodotti/page.tsx
git commit -m "feat: add /prodotti product performance page with Shopify and Amazon tabs"
```

---

## Task 7: Enhance ads queries with per-campaign metrics

**Files:**
- Modify: `src/lib/queries/ads.ts`

**Step 1: Add `getAdsCampaignsWithMetrics` function**

Add this new function to the END of `src/lib/queries/ads.ts`:

```typescript
export type CampaignWithMetrics = {
  id: string;
  campaign_id: string;
  campaign_name: string;
  status: string;
  daily_budget: number | null;
  spend: number;
  revenue: number;
  roas: number;
  cpc: number;
  conversions: number;
  clicks: number;
};

export async function getAdsCampaignsWithMetrics(
  platform: "google" | "meta",
  period: string,
  from?: string,
  to?: string
): Promise<CampaignWithMetrics[]> {
  const supabase = await createClient();
  const { start, end } = getDateRange(period, from, to);
  const startDate = start.split("T")[0];
  const endDate = end.split("T")[0];

  const { data: accounts } = await supabase
    .from("ad_accounts")
    .select("id")
    .eq("platform", platform);

  const accountIds = (accounts || []).map((a) => a.id);

  const { data: campaigns } = await supabase
    .from("ad_campaigns")
    .select("*")
    .in("ad_account_id", accountIds)
    .order("campaign_name");

  const { data: spendData } = await supabase
    .from("ad_spend_daily")
    .select("campaign_id, spend, revenue, clicks, conversions")
    .in("ad_account_id", accountIds)
    .gte("date", startDate)
    .lte("date", endDate);

  // Aggregate spend by campaign_id
  const spendByCampaign = new Map<
    string,
    { spend: number; revenue: number; clicks: number; conversions: number }
  >();

  for (const row of spendData || []) {
    const existing = spendByCampaign.get(row.campaign_id) ?? {
      spend: 0,
      revenue: 0,
      clicks: 0,
      conversions: 0,
    };
    existing.spend += row.spend || 0;
    existing.revenue += row.revenue || 0;
    existing.clicks += row.clicks || 0;
    existing.conversions += row.conversions || 0;
    spendByCampaign.set(row.campaign_id, existing);
  }

  return (campaigns || []).map((c) => {
    const metrics = spendByCampaign.get(c.campaign_id) ?? {
      spend: 0,
      revenue: 0,
      clicks: 0,
      conversions: 0,
    };
    return {
      id: c.id,
      campaign_id: c.campaign_id,
      campaign_name: c.campaign_name,
      status: c.status,
      daily_budget: c.daily_budget,
      spend: metrics.spend,
      revenue: metrics.revenue,
      roas: metrics.spend > 0 ? metrics.revenue / metrics.spend : 0,
      cpc: metrics.clicks > 0 ? metrics.spend / metrics.clicks : 0,
      conversions: metrics.conversions,
      clicks: metrics.clicks,
    };
  });
}
```

**Step 2: Build check**
```bash
npm run build
```
Expected: PASS

**Step 3: Commit**
```bash
git add src/lib/queries/ads.ts
git commit -m "feat: add getAdsCampaignsWithMetrics with ROAS, CPC and conversions per campaign"
```

---

## Task 8: Update Google Ads and Meta Ads pages

**Files:**
- Modify: `src/app/(dashboard)/ads/google/page.tsx`
- Modify: `src/app/(dashboard)/ads/meta/page.tsx`

**Step 1: Replace google/page.tsx**

Replace the entire content of `src/app/(dashboard)/ads/google/page.tsx`:

```typescript
import { PageHeader } from "@/components/page-header";
import { DateRangePicker } from "@/components/date-range-picker";
import { KpiCard } from "@/components/kpi-card";
import {
  getAdsOverview,
  getAdsCampaignsWithMetrics,
  getAdsDailySpend,
} from "@/lib/queries/ads";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber } from "@/lib/format";
import { SpendChart } from "../spend-chart";

interface Props {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}

export default async function GoogleAdsPage({ searchParams }: Props) {
  const { period = "30d", from, to } = await searchParams;
  const [overview, campaigns, dailySpend] = await Promise.all([
    getAdsOverview(period, from, to),
    getAdsCampaignsWithMetrics("google", period, from, to),
    getAdsDailySpend("google", period, from, to),
  ]);

  const g = overview.google;
  const cpc = g.clicks > 0 ? g.spend / g.clicks : 0;

  return (
    <div>
      <PageHeader title="Google Ads" description="Campagne e performance">
        <DateRangePicker />
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        <KpiCard title="Spesa" value={g.spend} format="currency" />
        <KpiCard title="ROAS" value={g.roas} format="number" />
        <KpiCard title="CPC Medio" value={cpc} format="currency" />
        <KpiCard title="Conversioni" value={g.conversions} format="number" />
        <KpiCard title="Ricavo Ads" value={g.revenue} format="currency" />
      </div>

      <div className="mb-8">
        <SpendChart data={dailySpend} />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Campagna</TableHead>
            <TableHead>Stato</TableHead>
            <TableHead className="text-right">Budget/g</TableHead>
            <TableHead className="text-right">Spesa</TableHead>
            <TableHead className="text-right">ROAS</TableHead>
            <TableHead className="text-right">Conversioni</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {campaigns.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">{c.campaign_name}</TableCell>
              <TableCell>
                <Badge variant={c.status === "ENABLED" ? "default" : "secondary"}>
                  {c.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                {c.daily_budget ? formatCurrency(c.daily_budget) : "—"}
              </TableCell>
              <TableCell className="text-right">{formatCurrency(c.spend)}</TableCell>
              <TableCell className="text-right">
                {c.spend > 0 ? (
                  <Badge
                    variant={
                      c.roas < 2 ? "destructive" : c.roas < 3 ? "outline" : "default"
                    }
                  >
                    {c.roas.toFixed(1)}x
                  </Badge>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="text-right">{formatNumber(c.conversions)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

**Step 2: Replace meta/page.tsx**

Same structure as Google, but with `"meta"` platform and `"ACTIVE"` status check:

```typescript
import { PageHeader } from "@/components/page-header";
import { DateRangePicker } from "@/components/date-range-picker";
import { KpiCard } from "@/components/kpi-card";
import {
  getAdsOverview,
  getAdsCampaignsWithMetrics,
  getAdsDailySpend,
} from "@/lib/queries/ads";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber } from "@/lib/format";
import { SpendChart } from "../spend-chart";

interface Props {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}

export default async function MetaAdsPage({ searchParams }: Props) {
  const { period = "30d", from, to } = await searchParams;
  const [overview, campaigns, dailySpend] = await Promise.all([
    getAdsOverview(period, from, to),
    getAdsCampaignsWithMetrics("meta", period, from, to),
    getAdsDailySpend("meta", period, from, to),
  ]);

  const m = overview.meta;
  const cpc = m.clicks > 0 ? m.spend / m.clicks : 0;

  return (
    <div>
      <PageHeader title="Meta Ads" description="Campagne e performance">
        <DateRangePicker />
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        <KpiCard title="Spesa" value={m.spend} format="currency" />
        <KpiCard title="ROAS" value={m.roas} format="number" />
        <KpiCard title="CPC Medio" value={cpc} format="currency" />
        <KpiCard title="Conversioni" value={m.conversions} format="number" />
        <KpiCard title="Ricavo Ads" value={m.revenue} format="currency" />
      </div>

      <div className="mb-8">
        <SpendChart data={dailySpend} />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Campagna</TableHead>
            <TableHead>Stato</TableHead>
            <TableHead className="text-right">Budget/g</TableHead>
            <TableHead className="text-right">Spesa</TableHead>
            <TableHead className="text-right">ROAS</TableHead>
            <TableHead className="text-right">Conversioni</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {campaigns.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">{c.campaign_name}</TableCell>
              <TableCell>
                <Badge variant={c.status === "ACTIVE" ? "default" : "secondary"}>
                  {c.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                {c.daily_budget ? formatCurrency(c.daily_budget) : "—"}
              </TableCell>
              <TableCell className="text-right">{formatCurrency(c.spend)}</TableCell>
              <TableCell className="text-right">
                {c.spend > 0 ? (
                  <Badge
                    variant={
                      c.roas < 2 ? "destructive" : c.roas < 3 ? "outline" : "default"
                    }
                  >
                    {c.roas.toFixed(1)}x
                  </Badge>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="text-right">{formatNumber(c.conversions)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

**Step 3: Build check**
```bash
npm run build
```
Expected: PASS

**Step 4: Commit**
```bash
git add src/app/(dashboard)/ads/google/page.tsx src/app/(dashboard)/ads/meta/page.tsx
git commit -m "feat: enhance Google and Meta Ads pages with ROAS, CPC and conversions per campaign"
```

---

## Task 9: Add top products and operational signals to overview queries

**Files:**
- Modify: `src/lib/queries/overview.ts`

**Step 1: Add `getTopProducts` and `getOperationalSignals`**

Add these two functions to the END of `src/lib/queries/overview.ts`:

```typescript
export async function getTopProducts(period: string, from?: string, to?: string) {
  const supabase = await createClient();
  const { start, end } = getDateRange(period, from, to);

  // Shopify top products (aggregate line_items in JS)
  const { data: stores } = await supabase.from("stores").select("id, name");
  const shopifyMap = new Map<string, { title: string; channel: string; units: number; revenue: number }>();

  for (const store of stores || []) {
    const { data: orders } = await supabase
      .from("shopify_orders")
      .select("line_items")
      .eq("store_id", store.id)
      .eq("financial_status", "paid")
      .gte("created_at", start)
      .lte("created_at", end);

    for (const order of orders || []) {
      const items = (order.line_items as Array<{ title?: string; quantity?: number; price?: string | number }>) || [];
      for (const li of items) {
        const key = `shopify::${li.title}`;
        const existing = shopifyMap.get(key) ?? { title: li.title || "—", channel: store.name, units: 0, revenue: 0 };
        existing.units += li.quantity || 1;
        existing.revenue += (li.quantity || 1) * parseFloat(String(li.price || "0"));
        shopifyMap.set(key, existing);
      }
    }
  }

  // Amazon top products
  const { data: amazonOrders } = await supabase
    .from("amazon_orders")
    .select("asin, sku, quantity, item_price")
    .gte("purchase_date", start)
    .lte("purchase_date", end);

  const amazonMap = new Map<string, { title: string; channel: string; units: number; revenue: number }>();
  for (const o of amazonOrders || []) {
    const key = `amazon::${o.asin}`;
    const existing = amazonMap.get(key) ?? { title: o.sku || o.asin, channel: "Amazon", units: 0, revenue: 0 };
    existing.units += o.quantity || 1;
    existing.revenue += o.item_price || 0;
    amazonMap.set(key, existing);
  }

  const all = [...shopifyMap.values(), ...amazonMap.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  return all;
}

export async function getOperationalSignals() {
  const supabase = await createClient();

  // Low stock Shopify (< 5 units)
  const { data: lowStockShopify } = await supabase
    .from("shopify_products")
    .select("title, inventory_qty")
    .lt("inventory_qty", 5)
    .eq("status", "active");

  // Low stock Amazon FBA (< 5 units)
  const { data: lowStockAmazon } = await supabase
    .from("amazon_inventory")
    .select("sku, qty_available")
    .lt("qty_available", 5)
    .eq("fulfillment", "fba");

  // Low ROAS campaigns (< 2x) — last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const dateStr = sevenDaysAgo.toISOString().split("T")[0];

  const { data: campaigns } = await supabase
    .from("ad_campaigns")
    .select("campaign_name, ad_account_id");

  const { data: recentSpend } = await supabase
    .from("ad_spend_daily")
    .select("campaign_id, spend, revenue")
    .gte("date", dateStr);

  const spendMap = new Map<string, { spend: number; revenue: number }>();
  for (const r of recentSpend || []) {
    const e = spendMap.get(r.campaign_id) ?? { spend: 0, revenue: 0 };
    e.spend += r.spend || 0;
    e.revenue += r.revenue || 0;
    spendMap.set(r.campaign_id, e);
  }

  const lowRoasCampaigns = (campaigns || []).filter((c) => {
    const metrics = spendMap.get(c.ad_account_id);
    if (!metrics || metrics.spend === 0) return false;
    return metrics.revenue / metrics.spend < 2;
  });

  return {
    lowStockSkus: [
      ...(lowStockShopify || []).map((p) => ({ name: p.title, qty: p.inventory_qty, channel: "Shopify" })),
      ...(lowStockAmazon || []).map((p) => ({ name: p.sku, qty: p.qty_available, channel: "Amazon FBA" })),
    ],
    lowRoasCampaigns: lowRoasCampaigns.map((c) => ({ name: c.campaign_name })),
  };
}
```

**Step 2: Build check**
```bash
npm run build
```
Expected: PASS

**Step 3: Commit**
```bash
git add src/lib/queries/overview.ts
git commit -m "feat: add getTopProducts and getOperationalSignals to overview queries"
```

---

## Task 10: Add YoY series to revenue chart

**Files:**
- Modify: `src/lib/queries/overview.ts`
- Modify: `src/app/(dashboard)/revenue-chart.tsx`

**Step 1: Update `getRevenueByChannel` to include previous-period data**

Find the existing `getRevenueByChannel` function in `src/lib/queries/overview.ts`. Replace it with:

```typescript
export async function getRevenueByChannel(period: string, from?: string, to?: string) {
  const supabase = await createClient();
  const { start, end, prevStart, prevEnd } = getDateRange(period, from, to);

  const { data: stores } = await supabase
    .from("stores")
    .select("id, name, slug");

  const channels: { name: string; revenue: number; prevRevenue: number }[] = [];

  for (const store of stores || []) {
    const [{ data: orders }, { data: prevOrders }] = await Promise.all([
      supabase
        .from("shopify_orders")
        .select("total")
        .eq("store_id", store.id)
        .gte("created_at", start)
        .lte("created_at", end)
        .eq("financial_status", "paid"),
      supabase
        .from("shopify_orders")
        .select("total")
        .eq("store_id", store.id)
        .gte("created_at", prevStart)
        .lte("created_at", prevEnd)
        .eq("financial_status", "paid"),
    ]);

    channels.push({
      name: store.name,
      revenue: (orders || []).reduce((s, o) => s + (o.total || 0), 0),
      prevRevenue: (prevOrders || []).reduce((s, o) => s + (o.total || 0), 0),
    });
  }

  const [{ data: amazonOrders }, { data: prevAmazonOrders }] = await Promise.all([
    supabase
      .from("amazon_orders")
      .select("item_price")
      .gte("purchase_date", start)
      .lte("purchase_date", end),
    supabase
      .from("amazon_orders")
      .select("item_price")
      .gte("purchase_date", prevStart)
      .lte("purchase_date", prevEnd),
  ]);

  channels.push({
    name: "Amazon",
    revenue: (amazonOrders || []).reduce((s, o) => s + (o.item_price || 0), 0),
    prevRevenue: (prevAmazonOrders || []).reduce((s, o) => s + (o.item_price || 0), 0),
  });

  return channels;
}
```

**Step 2: Update RevenueChart to show two bars**

Replace the entire content of `src/app/(dashboard)/revenue-chart.tsx`:

```typescript
"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface Props {
  data: { name: string; revenue: number; prevRevenue: number }[];
}

const fmt = (value: number | undefined) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value ?? 0);

export function RevenueChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} barGap={4}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
        <Tooltip formatter={fmt} />
        <Legend />
        <Bar dataKey="revenue" name="Periodo corrente" fill="#2563eb" radius={[4, 4, 0, 0]} />
        <Bar dataKey="prevRevenue" name="Periodo precedente" fill="#93c5fd" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

**Step 3: Build check**
```bash
npm run build
```
Expected: PASS (TypeScript will enforce the new `prevRevenue` prop is passed from `page.tsx`)

**Step 4: Commit**
```bash
git add src/lib/queries/overview.ts src/app/(dashboard)/revenue-chart.tsx
git commit -m "feat: add YoY comparison bars to revenue by channel chart"
```

---

## Task 11: Update Overview page to Command Center

**Files:**
- Modify: `src/app/(dashboard)/page.tsx`

**Step 1: Replace the entire page**

```typescript
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { DateRangePicker } from "@/components/date-range-picker";
import {
  getOverviewKpis,
  getRevenueByChannel,
  getTopProducts,
  getOperationalSignals,
} from "@/lib/queries/overview";
import { getAdsOverview } from "@/lib/queries/ads";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RevenueChart } from "./revenue-chart";
import { formatCurrency, formatNumber } from "@/lib/format";

interface Props {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}

export default async function DashboardPage({ searchParams }: Props) {
  const { period = "30d", from, to } = await searchParams;

  const [kpis, channels, adsOverview, topProducts, signals] = await Promise.all([
    getOverviewKpis(period, from, to),
    getRevenueByChannel(period, from, to),
    getAdsOverview(period, from, to),
    getTopProducts(period, from, to),
    getOperationalSignals(),
  ]);

  const totalOrders = kpis.orders.value;
  const aov = totalOrders > 0 ? kpis.revenue.value / totalOrders : 0;
  const prevAov = kpis.orders.value > 0 ? 0 : 0; // simplified — no prev AOV change

  const totalAdSpend = adsOverview.total.spend;
  const totalAdRoas = adsOverview.total.roas;

  return (
    <div>
      <PageHeader title="Dashboard" description="Panoramica Gruppo Wilco">
        <DateRangePicker />
      </PageHeader>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard
          title="Fatturato Totale"
          value={kpis.revenue.value}
          format="currency"
          change={kpis.revenue.change}
        />
        <KpiCard
          title="Ordini Totali"
          value={kpis.orders.value}
          format="number"
          change={kpis.orders.change}
        />
        <KpiCard
          title="AOV"
          value={aov}
          format="currency"
        />
        <KpiCard
          title="Spesa Ads"
          value={totalAdSpend}
          format="currency"
          change={kpis.adSpend.change}
        />
        <KpiCard
          title="ROAS Complessivo"
          value={totalAdRoas}
          format="number"
        />
      </div>

      {/* Revenue chart + signals */}
      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Fatturato per Canale</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueChart data={channels} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Segnali Operativi</CardTitle>
          </CardHeader>
          <CardContent>
            {signals.lowStockSkus.length === 0 && signals.lowRoasCampaigns.length === 0 ? (
              <p className="text-sm text-green-600">Nessun segnale critico</p>
            ) : (
              <div className="space-y-3">
                {signals.lowStockSkus.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase text-red-600">
                      ⚠ Stock Basso
                    </p>
                    <ul className="space-y-1">
                      {signals.lowStockSkus.slice(0, 5).map((s, i) => (
                        <li key={i} className="text-sm text-gray-700">
                          {s.name}{" "}
                          <span className="text-red-600 font-medium">
                            ({s.qty} pz — {s.channel})
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {signals.lowRoasCampaigns.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase text-orange-600">
                      📉 ROAS Basso (7gg)
                    </p>
                    <ul className="space-y-1">
                      {signals.lowRoasCampaigns.slice(0, 3).map((c, i) => (
                        <li key={i} className="text-sm text-gray-700">
                          {c.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Products */}
      <div className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Top 5 Prodotti</CardTitle>
          </CardHeader>
          <CardContent>
            {topProducts.length === 0 ? (
              <p className="text-sm text-gray-500">Nessun dato nel periodo selezionato.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b">
                    <th className="text-left pb-2">#</th>
                    <th className="text-left pb-2">Prodotto</th>
                    <th className="text-left pb-2">Canale</th>
                    <th className="text-right pb-2">Unità</th>
                    <th className="text-right pb-2">Ricavo</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((p, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 text-gray-400">{i + 1}</td>
                      <td className="py-2 font-medium">{p.title}</td>
                      <td className="py-2 text-gray-500">{p.channel}</td>
                      <td className="py-2 text-right">{formatNumber(p.units)}</td>
                      <td className="py-2 text-right font-medium">{formatCurrency(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

**Step 2: Build and run full test suite**
```bash
npm run build && npm run test
```
Expected: build PASS, all tests PASS

**Step 3: Commit**
```bash
git add src/app/(dashboard)/page.tsx
git commit -m "feat: redesign overview as Command Center with ROAS, top products and operational signals"
```

---

## Task 12: Push to production

**Step 1: Push to Vercel**
```bash
git push origin main
```

Vercel will auto-deploy. Check deployment status at the Vercel dashboard or:
```bash
gh run list --limit 5
```

**Step 2: Verify on production**

Open the production URL and check:
- [ ] Sidebar shows "Ordini" and "Prodotti" links
- [ ] `/ordini` loads with order list, expand works
- [ ] `/prodotti` shows Shopify and Amazon tabs with data
- [ ] `/ads/google` and `/ads/meta` show ROAS/CPC/conversioni per campagna
- [ ] Overview shows 5 KPI cards, YoY chart, top products, segnali
- [ ] DateRangePicker works on all pages
- [ ] "Anno 2025" filter shows Amazon data

---

## Summary

| Task | Files Changed | Commit |
|------|--------------|--------|
| 1 | `sidebar.tsx` | `feat: add Ordini and Prodotti to sidebar` |
| 2 | `queries/orders.ts`, `__tests__/orders.test.ts` | `feat: add getUnifiedOrders query` |
| 3 | `components/order-row.tsx` | `feat: add OrderRow client component` |
| 4 | `(dashboard)/ordini/page.tsx` | `feat: add /ordini page` |
| 5 | `queries/products.ts`, `__tests__/products.test.ts` | `feat: add product perf queries` |
| 6 | `(dashboard)/prodotti/page.tsx` | `feat: add /prodotti page` |
| 7 | `queries/ads.ts` | `feat: add getAdsCampaignsWithMetrics` |
| 8 | `ads/google/page.tsx`, `ads/meta/page.tsx` | `feat: enhance Ads pages` |
| 9 | `queries/overview.ts` | `feat: add getTopProducts and signals` |
| 10 | `queries/overview.ts`, `revenue-chart.tsx` | `feat: add YoY chart` |
| 11 | `(dashboard)/page.tsx` | `feat: Command Center overview` |
| 12 | — | push to production |
