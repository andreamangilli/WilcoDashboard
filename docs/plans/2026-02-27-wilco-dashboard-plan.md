# Wilco Group Dashboard — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a centralized dashboard aggregating data from 3 Shopify stores, Amazon (FBA/FBM), Google Ads, and Meta Ads for the Wilco Group.

**Architecture:** Next.js App Router on Vercel with Supabase (PostgreSQL + Auth). Vercel Cron triggers sync every 2-4h via API routes that pull data from external APIs and upsert into Supabase. Frontend uses Tailwind + shadcn/ui + Recharts.

**Tech Stack:** Next.js 15, TypeScript, Supabase (DB + Auth), Tailwind CSS, shadcn/ui, Recharts, Vercel

**Design doc:** `docs/plans/2026-02-27-wilco-dashboard-design.md`

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `.env.local.example`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`

**Step 1: Initialize Next.js project**

```bash
cd /Users/andreamangilli/WilcoDashboard
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

Select defaults when prompted. This creates the full Next.js + Tailwind scaffolding.

**Step 2: Install core dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr recharts date-fns lucide-react
npm install -D @types/node
```

**Step 3: Initialize shadcn/ui**

```bash
npx shadcn@latest init -d
```

Then add needed components:

```bash
npx shadcn@latest add button card input label table tabs select badge separator sheet sidebar dropdown-menu avatar skeleton alert
```

**Step 4: Create environment template**

Create `.env.local.example`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Shopify Stores
SHOPIFY_VITAMINITY_DOMAIN=vitaminity.myshopify.com
SHOPIFY_VITAMINITY_ACCESS_TOKEN=
SHOPIFY_KMAX_DOMAIN=kmax-italia.myshopify.com
SHOPIFY_KMAX_ACCESS_TOKEN=
SHOPIFY_HAIRSHOP_DOMAIN=hairshopeurope.myshopify.com
SHOPIFY_HAIRSHOP_ACCESS_TOKEN=

# Amazon SP-API
AMAZON_CLIENT_ID=
AMAZON_CLIENT_SECRET=
AMAZON_REFRESH_TOKEN=
AMAZON_MARKETPLACE_ID=APJ6JRA9NG5V4

# Google Ads
GOOGLE_ADS_DEVELOPER_TOKEN=
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_REFRESH_TOKEN=
GOOGLE_ADS_MANAGER_ID=

# Meta Ads
META_APP_ID=
META_APP_SECRET=
META_ACCESS_TOKEN=

# Cron Security
CRON_SECRET=your-random-secret-here
```

**Step 5: Verify dev server starts**

```bash
npm run dev
```

Expected: Server starts on localhost:3000, default Next.js page renders.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js project with Tailwind, shadcn/ui, Supabase deps"
```

---

## Task 2: Supabase Setup & Database Schema

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/middleware.ts`
- Create: `supabase/migrations/001_initial_schema.sql`

**Step 1: Create Supabase project**

Go to https://supabase.com/dashboard, create a new project named "wilco-dashboard". Copy the URL, anon key, and service role key into `.env.local`.

**Step 2: Create Supabase client utilities**

Create `src/lib/supabase/client.ts`:

```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

Create `src/lib/supabase/server.ts`:

```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from Server Component — ignore
          }
        },
      },
    }
  );
}

export async function createServiceClient() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
```

Create `src/lib/supabase/middleware.ts`:

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/api/sync")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
```

**Step 3: Write the database migration**

Create `supabase/migrations/001_initial_schema.sql`:

```sql
-- Configuration tables
CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL DEFAULT 'shopify',
  shopify_domain TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE amazon_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  marketplace_id TEXT NOT NULL,
  seller_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE ad_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL CHECK (platform IN ('google', 'meta')),
  account_id TEXT NOT NULL,
  account_name TEXT,
  store_id UUID REFERENCES stores(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Shopify synced data
CREATE TABLE shopify_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  shopify_id BIGINT NOT NULL,
  order_number TEXT,
  total NUMERIC(10,2),
  subtotal NUMERIC(10,2),
  total_tax NUMERIC(10,2) DEFAULT 0,
  total_discounts NUMERIC(10,2) DEFAULT 0,
  customer_email TEXT,
  financial_status TEXT,
  fulfillment_status TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ,
  line_items JSONB,
  UNIQUE(store_id, shopify_id)
);

CREATE TABLE shopify_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  shopify_id BIGINT NOT NULL,
  title TEXT NOT NULL,
  sku TEXT,
  cost NUMERIC(10,2),
  price NUMERIC(10,2),
  inventory_qty INTEGER DEFAULT 0,
  status TEXT,
  updated_at TIMESTAMPTZ,
  UNIQUE(store_id, shopify_id)
);

CREATE TABLE shopify_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  shopify_id BIGINT NOT NULL,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  orders_count INTEGER DEFAULT 0,
  total_spent NUMERIC(10,2) DEFAULT 0,
  first_order_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  UNIQUE(store_id, shopify_id)
);

-- Amazon synced data
CREATE TABLE amazon_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES amazon_accounts(id),
  amazon_order_id TEXT NOT NULL UNIQUE,
  asin TEXT,
  sku TEXT,
  quantity INTEGER DEFAULT 1,
  item_price NUMERIC(10,2),
  amazon_fees NUMERIC(10,2) DEFAULT 0,
  fba_fees NUMERIC(10,2) DEFAULT 0,
  shipping_cost NUMERIC(10,2) DEFAULT 0,
  order_status TEXT,
  fulfillment_channel TEXT,
  purchase_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE amazon_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES amazon_accounts(id),
  asin TEXT NOT NULL,
  sku TEXT,
  fulfillment TEXT CHECK (fulfillment IN ('fba', 'fbm')),
  qty_available INTEGER DEFAULT 0,
  qty_inbound INTEGER DEFAULT 0,
  storage_fees_monthly NUMERIC(10,2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(account_id, asin, fulfillment)
);

CREATE TABLE amazon_pnl (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES amazon_accounts(id),
  asin TEXT NOT NULL,
  sku TEXT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  revenue NUMERIC(10,2) DEFAULT 0,
  units_sold INTEGER DEFAULT 0,
  amazon_fees NUMERIC(10,2) DEFAULT 0,
  fba_fees NUMERIC(10,2) DEFAULT 0,
  storage_fees NUMERIC(10,2) DEFAULT 0,
  product_cost NUMERIC(10,2) DEFAULT 0,
  ad_spend NUMERIC(10,2) DEFAULT 0,
  net_profit NUMERIC(10,2) DEFAULT 0,
  margin_pct NUMERIC(5,2) DEFAULT 0,
  UNIQUE(asin, period_start, period_end)
);

-- Ads synced data
CREATE TABLE ad_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id UUID NOT NULL REFERENCES ad_accounts(id),
  campaign_id TEXT NOT NULL,
  campaign_name TEXT,
  status TEXT,
  daily_budget NUMERIC(10,2),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ad_account_id, campaign_id)
);

CREATE TABLE ad_spend_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id UUID NOT NULL REFERENCES ad_accounts(id),
  campaign_id TEXT,
  date DATE NOT NULL,
  spend NUMERIC(10,2) DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  conversions NUMERIC(10,2) DEFAULT 0,
  revenue NUMERIC(10,2) DEFAULT 0,
  roas NUMERIC(10,2) DEFAULT 0,
  UNIQUE(ad_account_id, campaign_id, date)
);

-- Sync logging
CREATE TABLE sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'error')),
  records_synced INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  error TEXT
);

-- Indexes for common queries
CREATE INDEX idx_shopify_orders_store_date ON shopify_orders(store_id, created_at DESC);
CREATE INDEX idx_shopify_orders_financial ON shopify_orders(store_id, financial_status);
CREATE INDEX idx_shopify_products_sku ON shopify_products(sku);
CREATE INDEX idx_shopify_customers_store ON shopify_customers(store_id);
CREATE INDEX idx_amazon_orders_date ON amazon_orders(purchase_date DESC);
CREATE INDEX idx_amazon_orders_asin ON amazon_orders(asin);
CREATE INDEX idx_amazon_pnl_asin ON amazon_pnl(asin, period_start);
CREATE INDEX idx_ad_spend_date ON ad_spend_daily(date DESC);
CREATE INDEX idx_ad_spend_account ON ad_spend_daily(ad_account_id, date DESC);
CREATE INDEX idx_sync_log_source ON sync_log(source, started_at DESC);

-- Row Level Security: authenticated users see everything
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE amazon_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE amazon_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE amazon_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE amazon_pnl ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_spend_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

-- Policy: any authenticated user can read all data
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'stores','amazon_accounts','ad_accounts',
    'shopify_orders','shopify_products','shopify_customers',
    'amazon_orders','amazon_inventory','amazon_pnl',
    'ad_campaigns','ad_spend_daily','sync_log'
  ])
  LOOP
    EXECUTE format('CREATE POLICY "Authenticated read" ON %I FOR SELECT TO authenticated USING (true)', t);
  END LOOP;
END $$;

-- Seed the 3 Shopify stores
INSERT INTO stores (name, slug, shopify_domain) VALUES
  ('Vitaminity', 'vitaminity', 'vitaminity.myshopify.com'),
  ('KMax', 'kmax', 'kmax-italia.myshopify.com'),
  ('HairShopEurope', 'hairshopeurope', 'hairshopeurope.myshopify.com');
```

**Step 4: Run migration on Supabase**

Go to Supabase Dashboard > SQL Editor, paste and run `001_initial_schema.sql`.

Alternatively, if using Supabase CLI:

```bash
npx supabase db push
```

**Step 5: Create initial user**

In Supabase Dashboard > Authentication > Users, create the admin user with email+password.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Supabase client utils and database schema migration"
```

---

## Task 3: Auth System & Layout

**Files:**
- Create: `src/middleware.ts`
- Create: `src/app/login/page.tsx`
- Create: `src/app/(dashboard)/layout.tsx`
- Create: `src/components/sidebar.tsx`

**Step 1: Create Next.js middleware**

Create `src/middleware.ts`:

```typescript
import { updateSession } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Allow cron sync endpoints with secret
  if (request.nextUrl.pathname.startsWith("/api/sync")) {
    const authHeader = request.headers.get("authorization");
    if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
      return;
    }
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

**Step 2: Create login page**

Create `src/app/login/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center text-2xl">Wilco Group</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Accesso..." : "Accedi"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

**Step 3: Create dashboard layout with sidebar**

Create `src/components/sidebar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  Megaphone,
  Settings,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/shopify", label: "Shopify", icon: ShoppingBag },
  { href: "/amazon", label: "Amazon", icon: Package },
  { href: "/ads", label: "Advertising", icon: Megaphone },
  { href: "/settings", label: "Impostazioni", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-white">
      <div className="flex h-16 items-center border-b px-6">
        <h1 className="text-lg font-bold">Wilco Group</h1>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-4">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          Esci
        </Button>
      </div>
    </aside>
  );
}
```

Create `src/app/(dashboard)/layout.tsx`:

```tsx
import { Sidebar } from "@/components/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-gray-50 p-8">{children}</main>
    </div>
  );
}
```

Move the main page into the dashboard group. Create `src/app/(dashboard)/page.tsx`:

```tsx
export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="mt-2 text-gray-500">Wilco Group — Overview in arrivo.</p>
    </div>
  );
}
```

Delete the original `src/app/page.tsx` (replaced by the dashboard group).

**Step 4: Test login flow**

```bash
npm run dev
```

Visit localhost:3000 — should redirect to /login. Log in with the user created in Supabase. Should redirect to dashboard with sidebar.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add auth system, login page, dashboard layout with sidebar"
```

---

## Task 4: Shared UI Components

**Files:**
- Create: `src/components/kpi-card.tsx`
- Create: `src/components/date-range-picker.tsx`
- Create: `src/components/page-header.tsx`
- Create: `src/lib/format.ts`

**Step 1: Create utility formatters**

Create `src/lib/format.ts`:

```typescript
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("it-IT").format(value);
}

export function formatPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}
```

**Step 2: Write test for formatters**

Create `src/lib/__tests__/format.test.ts`:

```typescript
import { formatCurrency, formatNumber, formatPercent } from "../format";

describe("formatCurrency", () => {
  it("formats EUR currency in Italian locale", () => {
    const result = formatCurrency(1234.56);
    // Italian locale uses comma for decimals
    expect(result).toContain("1.234,56");
    expect(result).toContain("€");
  });
});

describe("formatPercent", () => {
  it("adds + prefix for positive values", () => {
    expect(formatPercent(12.345)).toBe("+12.3%");
  });
  it("keeps - prefix for negative values", () => {
    expect(formatPercent(-5.1)).toBe("-5.1%");
  });
});
```

**Step 3: Install test dependencies and run**

```bash
npm install -D jest @jest/globals ts-jest @types/jest
npx ts-jest config:init
npm test
```

Expected: Tests pass.

**Step 4: Create KPI card component**

Create `src/components/kpi-card.tsx`:

```tsx
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  value: number;
  format: "currency" | "number" | "percent";
  change?: number;
}

export function KpiCard({ title, value, format, change }: KpiCardProps) {
  const formatted =
    format === "currency"
      ? formatCurrency(value)
      : format === "percent"
        ? `${value.toFixed(1)}%`
        : formatNumber(value);

  return (
    <Card>
      <CardContent className="p-6">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <p className="mt-1 text-2xl font-bold">{formatted}</p>
        {change !== undefined && (
          <p
            className={cn(
              "mt-1 text-sm font-medium",
              change >= 0 ? "text-green-600" : "text-red-600"
            )}
          >
            {formatPercent(change)} vs periodo prec.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
```

**Step 5: Create page header component**

Create `src/components/page-header.tsx`:

```tsx
interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
}

export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div className="mb-8 flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
```

**Step 6: Create date range picker**

Create `src/components/date-range-picker.tsx`:

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const periods = [
  { value: "today", label: "Oggi" },
  { value: "7d", label: "Ultimi 7 giorni" },
  { value: "30d", label: "Ultimi 30 giorni" },
  { value: "90d", label: "Ultimi 90 giorni" },
];

export function DateRangePicker() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("period") || "30d";

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", value);
    router.push(`?${params.toString()}`);
  }

  return (
    <Select value={current} onValueChange={handleChange}>
      <SelectTrigger className="w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {periods.map((p) => (
          <SelectItem key={p.value} value={p.value}>
            {p.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: add shared UI components (KPI card, date picker, page header, formatters)"
```

---

## Task 5: Shopify Sync Engine

**Files:**
- Create: `src/lib/sync/shopify.ts`
- Create: `src/lib/sync/utils.ts`
- Create: `src/app/api/sync/shopify/route.ts`
- Test: `src/lib/sync/__tests__/shopify.test.ts`

**Step 1: Create sync utilities**

Create `src/lib/sync/utils.ts`:

```typescript
import { createServiceClient } from "@/lib/supabase/server";

export async function logSyncStart(source: string) {
  const supabase = await createServiceClient();
  const { data } = await supabase
    .from("sync_log")
    .insert({ source, status: "running" })
    .select("id")
    .single();
  return data!.id;
}

export async function logSyncSuccess(id: string, recordsSynced: number) {
  const supabase = await createServiceClient();
  await supabase
    .from("sync_log")
    .update({
      status: "success",
      records_synced: recordsSynced,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id);
}

export async function logSyncError(id: string, error: string) {
  const supabase = await createServiceClient();
  await supabase
    .from("sync_log")
    .update({
      status: "error",
      error,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id);
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

**Step 2: Create Shopify sync module**

Create `src/lib/sync/shopify.ts`:

```typescript
import { createServiceClient } from "@/lib/supabase/server";
import { sleep } from "./utils";

interface ShopifyStoreConfig {
  storeId: string;
  domain: string;
  accessToken: string;
}

const SHOPIFY_API_VERSION = "2024-10";

async function shopifyFetch(
  domain: string,
  accessToken: string,
  endpoint: string,
  params: Record<string, string> = {}
) {
  const url = new URL(
    `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/${endpoint}.json`
  );
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: { "X-Shopify-Access-Token": accessToken },
  });

  if (!res.ok) {
    throw new Error(`Shopify API error: ${res.status} ${res.statusText}`);
  }

  // Rate limiting: respect 2 req/sec
  await sleep(500);

  return res.json();
}

export async function syncShopifyOrders(config: ShopifyStoreConfig) {
  const supabase = await createServiceClient();

  // Get last sync time for incremental sync
  const { data: lastSync } = await supabase
    .from("sync_log")
    .select("completed_at")
    .eq("source", `shopify_orders_${config.storeId}`)
    .eq("status", "success")
    .order("completed_at", { ascending: false })
    .limit(1)
    .single();

  const params: Record<string, string> = {
    status: "any",
    limit: "250",
    order: "updated_at asc",
  };
  if (lastSync?.completed_at) {
    params.updated_at_min = lastSync.completed_at;
  }

  let synced = 0;
  let hasMore = true;
  let pageInfo: string | null = null;

  while (hasMore) {
    const fetchParams = pageInfo
      ? { ...params, page_info: pageInfo }
      : params;

    const data = await shopifyFetch(
      config.domain,
      config.accessToken,
      "orders",
      fetchParams
    );

    const orders = data.orders || [];
    if (orders.length === 0) break;

    for (const order of orders) {
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
        },
        { onConflict: "store_id,shopify_id" }
      );
      synced++;
    }

    // Pagination via Link header (Shopify cursor-based)
    hasMore = orders.length === 250;
    if (hasMore && data.orders?.length) {
      // For simplicity, use since_id pagination
      params.since_id = orders[orders.length - 1].id.toString();
    }
  }

  return synced;
}

export async function syncShopifyProducts(config: ShopifyStoreConfig) {
  const supabase = await createServiceClient();
  let synced = 0;
  let sinceId = "0";
  let hasMore = true;

  while (hasMore) {
    const data = await shopifyFetch(
      config.domain,
      config.accessToken,
      "products",
      { limit: "250", since_id: sinceId }
    );

    const products = data.products || [];
    if (products.length === 0) break;

    for (const product of products) {
      for (const variant of product.variants || []) {
        await supabase.from("shopify_products").upsert(
          {
            store_id: config.storeId,
            shopify_id: variant.id,
            title: `${product.title}${variant.title !== "Default Title" ? ` - ${variant.title}` : ""}`,
            sku: variant.sku,
            cost: variant.cost ? parseFloat(variant.cost) : null,
            price: parseFloat(variant.price || "0"),
            inventory_qty: variant.inventory_quantity || 0,
            status: product.status,
            updated_at: product.updated_at,
          },
          { onConflict: "store_id,shopify_id" }
        );
        synced++;
      }
    }

    hasMore = products.length === 250;
    sinceId = products[products.length - 1].id.toString();
  }

  return synced;
}

export async function syncShopifyCustomers(config: ShopifyStoreConfig) {
  const supabase = await createServiceClient();
  let synced = 0;
  let sinceId = "0";
  let hasMore = true;

  while (hasMore) {
    const data = await shopifyFetch(
      config.domain,
      config.accessToken,
      "customers",
      { limit: "250", since_id: sinceId }
    );

    const customers = data.customers || [];
    if (customers.length === 0) break;

    for (const c of customers) {
      await supabase.from("shopify_customers").upsert(
        {
          store_id: config.storeId,
          shopify_id: c.id,
          email: c.email,
          first_name: c.first_name,
          last_name: c.last_name,
          orders_count: c.orders_count || 0,
          total_spent: parseFloat(c.total_spent || "0"),
          first_order_at: c.orders_count > 0 ? c.created_at : null,
          created_at: c.created_at,
        },
        { onConflict: "store_id,shopify_id" }
      );
      synced++;
    }

    hasMore = customers.length === 250;
    sinceId = customers[customers.length - 1].id.toString();
  }

  return synced;
}

export function getShopifyStoreConfigs(): ShopifyStoreConfig[] {
  // Map env vars to store configs — store IDs will be fetched from DB at runtime
  return [
    {
      storeId: "", // resolved at runtime
      domain: process.env.SHOPIFY_VITAMINITY_DOMAIN!,
      accessToken: process.env.SHOPIFY_VITAMINITY_ACCESS_TOKEN!,
    },
    {
      storeId: "",
      domain: process.env.SHOPIFY_KMAX_DOMAIN!,
      accessToken: process.env.SHOPIFY_KMAX_ACCESS_TOKEN!,
    },
    {
      storeId: "",
      domain: process.env.SHOPIFY_HAIRSHOP_DOMAIN!,
      accessToken: process.env.SHOPIFY_HAIRSHOP_ACCESS_TOKEN!,
    },
  ];
}
```

**Step 3: Create API route**

Create `src/app/api/sync/shopify/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  syncShopifyOrders,
  syncShopifyProducts,
  syncShopifyCustomers,
  getShopifyStoreConfigs,
} from "@/lib/sync/shopify";
import { logSyncStart, logSyncSuccess, logSyncError } from "@/lib/sync/utils";

export const maxDuration = 300; // 5 min max for Vercel

export async function POST(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServiceClient();
  const { data: stores } = await supabase
    .from("stores")
    .select("id, slug, shopify_domain");

  const configs = getShopifyStoreConfigs();
  const results: Record<string, unknown> = {};

  for (const store of stores || []) {
    const config = configs.find((c) => c.domain === store.shopify_domain);
    if (!config) continue;

    config.storeId = store.id;
    const logId = await logSyncStart(`shopify_${store.slug}`);

    try {
      const orders = await syncShopifyOrders(config);
      const products = await syncShopifyProducts(config);
      const customers = await syncShopifyCustomers(config);
      const total = orders + products + customers;

      await logSyncSuccess(logId, total);
      results[store.slug] = { orders, products, customers };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await logSyncError(logId, message);
      results[store.slug] = { error: message };
    }
  }

  return NextResponse.json({ success: true, results });
}
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add Shopify sync engine with orders, products, customers"
```

---

## Task 6: Amazon Sync Engine & P&L

**Files:**
- Create: `src/lib/sync/amazon.ts`
- Create: `src/app/api/sync/amazon/route.ts`

**Step 1: Create Amazon sync module**

Create `src/lib/sync/amazon.ts`:

```typescript
import { createServiceClient } from "@/lib/supabase/server";
import { sleep } from "./utils";

const AMAZON_SP_API_BASE = "https://sellingpartnerapi-eu.amazon.com";

async function getAmazonAccessToken(): Promise<string> {
  const res = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: process.env.AMAZON_REFRESH_TOKEN!,
      client_id: process.env.AMAZON_CLIENT_ID!,
      client_secret: process.env.AMAZON_CLIENT_SECRET!,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Amazon auth error: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function amazonFetch(accessToken: string, path: string, params: Record<string, string> = {}) {
  const url = new URL(`${AMAZON_SP_API_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "x-amz-access-token": accessToken,
    },
  });

  if (res.status === 429) {
    // Rate limited — exponential backoff
    await sleep(2000);
    return amazonFetch(accessToken, path, params);
  }

  if (!res.ok) {
    throw new Error(`Amazon SP-API error: ${res.status} ${await res.text()}`);
  }

  await sleep(500);
  return res.json();
}

export async function syncAmazonOrders(accountId: string) {
  const supabase = await createServiceClient();
  const accessToken = await getAmazonAccessToken();
  const marketplaceId = process.env.AMAZON_MARKETPLACE_ID!;

  // Fetch orders from last 30 days (incremental would use last sync time)
  const createdAfter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const data = await amazonFetch(accessToken, "/orders/v0/orders", {
    MarketplaceIds: marketplaceId,
    CreatedAfter: createdAfter,
    OrderStatuses: "Shipped,Unshipped",
  });

  let synced = 0;
  const orders = data.payload?.Orders || [];

  for (const order of orders) {
    // Fetch order items for fee details
    const itemsData = await amazonFetch(
      accessToken,
      `/orders/v0/orders/${order.AmazonOrderId}/orderItems`
    );
    const items = itemsData.payload?.OrderItems || [];

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
        },
        { onConflict: "amazon_order_id" }
      );
      synced++;
    }
  }

  return synced;
}

export async function syncAmazonInventory(accountId: string) {
  const supabase = await createServiceClient();
  const accessToken = await getAmazonAccessToken();

  const data = await amazonFetch(
    accessToken,
    "/fba/inventory/v1/summaries",
    {
      granularityType: "Marketplace",
      granularityId: process.env.AMAZON_MARKETPLACE_ID!,
      marketplaceIds: process.env.AMAZON_MARKETPLACE_ID!,
    }
  );

  let synced = 0;
  const summaries = data.payload?.inventorySummaries || [];

  for (const inv of summaries) {
    await supabase.from("amazon_inventory").upsert(
      {
        account_id: accountId,
        asin: inv.asin,
        sku: inv.sellerSku,
        fulfillment: inv.condition === "FBA" ? "fba" : "fbm",
        qty_available: inv.inventoryDetails?.fulfillableQuantity || 0,
        qty_inbound: inv.inventoryDetails?.inboundWorkingQuantity || 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id,asin,fulfillment" }
    );
    synced++;
  }

  return synced;
}

export async function calculateAmazonPnl(accountId: string) {
  const supabase = await createServiceClient();

  // Get current month boundaries
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split("T")[0];
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .split("T")[0];

  // Aggregate orders by ASIN for current month
  const { data: orderAgg } = await supabase.rpc("aggregate_amazon_orders", {
    p_account_id: accountId,
    p_start: periodStart,
    p_end: periodEnd,
  });

  // If RPC not available, fallback to query
  if (!orderAgg) {
    const { data: orders } = await supabase
      .from("amazon_orders")
      .select("asin, sku, quantity, item_price, amazon_fees, fba_fees, shipping_cost")
      .eq("account_id", accountId)
      .gte("purchase_date", periodStart)
      .lte("purchase_date", `${periodEnd}T23:59:59`);

    // Group by ASIN
    const byAsin: Record<string, {
      sku: string;
      revenue: number;
      units: number;
      amazonFees: number;
      fbaFees: number;
    }> = {};

    for (const o of orders || []) {
      if (!byAsin[o.asin]) {
        byAsin[o.asin] = { sku: o.sku, revenue: 0, units: 0, amazonFees: 0, fbaFees: 0 };
      }
      byAsin[o.asin].revenue += o.item_price || 0;
      byAsin[o.asin].units += o.quantity || 1;
      byAsin[o.asin].amazonFees += Math.abs(o.amazon_fees || 0);
      byAsin[o.asin].fbaFees += Math.abs(o.fba_fees || 0);
    }

    // Get product costs from Shopify (by SKU)
    for (const [asin, agg] of Object.entries(byAsin)) {
      let productCost = 0;
      if (agg.sku) {
        const { data: product } = await supabase
          .from("shopify_products")
          .select("cost")
          .eq("sku", agg.sku)
          .limit(1)
          .single();
        productCost = (product?.cost || 0) * agg.units;
      }

      // Get storage fees
      const { data: inv } = await supabase
        .from("amazon_inventory")
        .select("storage_fees_monthly")
        .eq("asin", asin)
        .limit(1)
        .single();
      const storageFees = inv?.storage_fees_monthly || 0;

      const netProfit =
        agg.revenue - agg.amazonFees - agg.fbaFees - storageFees - productCost;
      const marginPct = agg.revenue > 0 ? (netProfit / agg.revenue) * 100 : 0;

      await supabase.from("amazon_pnl").upsert(
        {
          account_id: accountId,
          asin,
          sku: agg.sku,
          period_start: periodStart,
          period_end: periodEnd,
          revenue: agg.revenue,
          units_sold: agg.units,
          amazon_fees: agg.amazonFees,
          fba_fees: agg.fbaFees,
          storage_fees: storageFees,
          product_cost: productCost,
          net_profit: netProfit,
          margin_pct: marginPct,
        },
        { onConflict: "asin,period_start,period_end" }
      );
    }
  }
}
```

**Step 2: Create API route**

Create `src/app/api/sync/amazon/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  syncAmazonOrders,
  syncAmazonInventory,
  calculateAmazonPnl,
} from "@/lib/sync/amazon";
import { logSyncStart, logSyncSuccess, logSyncError } from "@/lib/sync/utils";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServiceClient();
  const { data: accounts } = await supabase
    .from("amazon_accounts")
    .select("id, name");

  const results: Record<string, unknown> = {};

  for (const account of accounts || []) {
    const logId = await logSyncStart(`amazon_${account.name}`);

    try {
      const orders = await syncAmazonOrders(account.id);
      const inventory = await syncAmazonInventory(account.id);
      await calculateAmazonPnl(account.id);

      await logSyncSuccess(logId, orders + inventory);
      results[account.name] = { orders, inventory, pnl: "calculated" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await logSyncError(logId, message);
      results[account.name] = { error: message };
    }
  }

  return NextResponse.json({ success: true, results });
}
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add Amazon sync engine with orders, inventory, P&L calculation"
```

---

## Task 7: Google Ads & Meta Ads Sync

**Files:**
- Create: `src/lib/sync/google-ads.ts`
- Create: `src/lib/sync/meta-ads.ts`
- Create: `src/app/api/sync/google/route.ts`
- Create: `src/app/api/sync/meta/route.ts`

**Step 1: Create Google Ads sync**

Create `src/lib/sync/google-ads.ts`:

```typescript
import { createServiceClient } from "@/lib/supabase/server";

async function getGoogleAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
      client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Google auth error: ${JSON.stringify(data)}`);
  return data.access_token;
}

export async function syncGoogleAds(adAccountId: string, googleAccountId: string) {
  const supabase = await createServiceClient();
  const accessToken = await getGoogleAccessToken();
  const managerId = process.env.GOOGLE_ADS_MANAGER_ID;

  // Google Ads API uses GAQL (Google Ads Query Language)
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign_budget.amount_micros,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value,
      segments.date
    FROM campaign
    WHERE segments.date DURING LAST_30_DAYS
    ORDER BY segments.date DESC
  `;

  const res = await fetch(
    `https://googleads.googleapis.com/v17/customers/${googleAccountId}/googleAds:searchStream`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
        ...(managerId ? { "login-customer-id": managerId } : {}),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    }
  );

  if (!res.ok) {
    throw new Error(`Google Ads API error: ${res.status} ${await res.text()}`);
  }

  const results = await res.json();
  let synced = 0;

  for (const batch of results) {
    for (const row of batch.results || []) {
      const campaign = row.campaign;
      const metrics = row.metrics;
      const date = row.segments.date;

      // Upsert campaign
      await supabase.from("ad_campaigns").upsert(
        {
          ad_account_id: adAccountId,
          campaign_id: campaign.id,
          campaign_name: campaign.name,
          status: campaign.status,
          daily_budget: (campaign.budget?.amountMicros || 0) / 1_000_000,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "ad_account_id,campaign_id" }
      );

      // Upsert daily spend
      const spend = (metrics.costMicros || 0) / 1_000_000;
      const revenue = (metrics.conversionsValue || 0);

      await supabase.from("ad_spend_daily").upsert(
        {
          ad_account_id: adAccountId,
          campaign_id: campaign.id,
          date,
          spend,
          impressions: metrics.impressions || 0,
          clicks: metrics.clicks || 0,
          conversions: metrics.conversions || 0,
          revenue,
          roas: spend > 0 ? revenue / spend : 0,
        },
        { onConflict: "ad_account_id,campaign_id,date" }
      );
      synced++;
    }
  }

  return synced;
}
```

**Step 2: Create Meta Ads sync**

Create `src/lib/sync/meta-ads.ts`:

```typescript
import { createServiceClient } from "@/lib/supabase/server";

const META_API_VERSION = "v21.0";

export async function syncMetaAds(adAccountId: string, metaAccountId: string) {
  const supabase = await createServiceClient();
  const accessToken = process.env.META_ACCESS_TOKEN!;

  // Fetch campaigns with insights for last 30 days
  const campaignsRes = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/act_${metaAccountId}/campaigns?` +
      new URLSearchParams({
        fields: "id,name,status,daily_budget",
        access_token: accessToken,
        limit: "100",
      })
  );

  if (!campaignsRes.ok) {
    throw new Error(`Meta API error: ${campaignsRes.status} ${await campaignsRes.text()}`);
  }

  const campaignsData = await campaignsRes.json();
  let synced = 0;

  for (const campaign of campaignsData.data || []) {
    // Upsert campaign
    await supabase.from("ad_campaigns").upsert(
      {
        ad_account_id: adAccountId,
        campaign_id: campaign.id,
        campaign_name: campaign.name,
        status: campaign.status,
        daily_budget: campaign.daily_budget
          ? parseFloat(campaign.daily_budget) / 100
          : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "ad_account_id,campaign_id" }
    );

    // Fetch daily insights
    const insightsRes = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${campaign.id}/insights?` +
        new URLSearchParams({
          fields: "spend,impressions,clicks,actions,action_values",
          time_range: JSON.stringify({
            since: new Date(Date.now() - 30 * 86400000)
              .toISOString()
              .split("T")[0],
            until: new Date().toISOString().split("T")[0],
          }),
          time_increment: "1",
          access_token: accessToken,
        })
    );

    if (!insightsRes.ok) continue;

    const insightsData = await insightsRes.json();

    for (const day of insightsData.data || []) {
      const spend = parseFloat(day.spend || "0");
      const conversions =
        day.actions?.find((a: { action_type: string }) => a.action_type === "purchase")
          ?.value || 0;
      const revenue =
        day.action_values?.find((a: { action_type: string }) => a.action_type === "purchase")
          ?.value || 0;

      await supabase.from("ad_spend_daily").upsert(
        {
          ad_account_id: adAccountId,
          campaign_id: campaign.id,
          date: day.date_start,
          spend,
          impressions: parseInt(day.impressions || "0"),
          clicks: parseInt(day.clicks || "0"),
          conversions: parseFloat(conversions),
          revenue: parseFloat(revenue),
          roas: spend > 0 ? parseFloat(revenue) / spend : 0,
        },
        { onConflict: "ad_account_id,campaign_id,date" }
      );
      synced++;
    }
  }

  return synced;
}
```

**Step 3: Create API routes**

Create `src/app/api/sync/google/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { syncGoogleAds } from "@/lib/sync/google-ads";
import { logSyncStart, logSyncSuccess, logSyncError } from "@/lib/sync/utils";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServiceClient();
  const { data: accounts } = await supabase
    .from("ad_accounts")
    .select("id, account_id, account_name")
    .eq("platform", "google");

  const results: Record<string, unknown> = {};

  for (const account of accounts || []) {
    const logId = await logSyncStart(`google_${account.account_name}`);
    try {
      const synced = await syncGoogleAds(account.id, account.account_id);
      await logSyncSuccess(logId, synced);
      results[account.account_name || account.account_id] = { synced };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await logSyncError(logId, message);
      results[account.account_name || account.account_id] = { error: message };
    }
  }

  return NextResponse.json({ success: true, results });
}
```

Create `src/app/api/sync/meta/route.ts` — same pattern, using `syncMetaAds`. (Follow the exact same structure as the Google route above, replacing `google` with `meta` and using `syncMetaAds`.)

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add Google Ads and Meta Ads sync engines"
```

---

## Task 8: Cron Orchestrator

**Files:**
- Create: `vercel.json`
- Create: `src/app/api/cron/sync/route.ts`

**Step 1: Create cron orchestrator**

Create `src/app/api/cron/sync/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  const sources = ["shopify", "amazon", "google", "meta"];
  const results: Record<string, unknown> = {};

  for (const source of sources) {
    try {
      const res = await fetch(`${baseUrl}/api/sync/${source}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      });
      results[source] = await res.json();
    } catch (err) {
      results[source] = {
        error: err instanceof Error ? err.message : "Failed",
      };
    }
  }

  return NextResponse.json({ success: true, results });
}
```

**Step 2: Create vercel.json**

Create `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/sync",
      "schedule": "0 */3 * * *"
    }
  ]
}
```

This runs every 3 hours.

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add Vercel cron orchestrator for sync every 3 hours"
```

---

## Task 9: Data Query Layer

**Files:**
- Create: `src/lib/queries/shopify.ts`
- Create: `src/lib/queries/amazon.ts`
- Create: `src/lib/queries/ads.ts`
- Create: `src/lib/queries/overview.ts`
- Create: `src/lib/queries/utils.ts`

**Step 1: Create query utilities**

Create `src/lib/queries/utils.ts`:

```typescript
import { subDays, startOfDay, endOfDay } from "date-fns";

export function getDateRange(period: string) {
  const now = new Date();
  let start: Date;

  switch (period) {
    case "today":
      start = startOfDay(now);
      break;
    case "7d":
      start = startOfDay(subDays(now, 7));
      break;
    case "90d":
      start = startOfDay(subDays(now, 90));
      break;
    case "30d":
    default:
      start = startOfDay(subDays(now, 30));
  }

  return {
    start: start.toISOString(),
    end: endOfDay(now).toISOString(),
    prevStart: startOfDay(
      subDays(start, Math.ceil((now.getTime() - start.getTime()) / 86400000))
    ).toISOString(),
    prevEnd: start.toISOString(),
  };
}
```

**Step 2: Create overview queries**

Create `src/lib/queries/overview.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { getDateRange } from "./utils";

export async function getOverviewKpis(period: string) {
  const supabase = await createClient();
  const { start, end, prevStart, prevEnd } = getDateRange(period);

  // Current period - Shopify revenue
  const { data: currentShopify } = await supabase
    .from("shopify_orders")
    .select("total, subtotal")
    .gte("created_at", start)
    .lte("created_at", end)
    .eq("financial_status", "paid");

  // Previous period
  const { data: prevShopify } = await supabase
    .from("shopify_orders")
    .select("total")
    .gte("created_at", prevStart)
    .lte("created_at", prevEnd)
    .eq("financial_status", "paid");

  // Amazon revenue
  const { data: currentAmazon } = await supabase
    .from("amazon_orders")
    .select("item_price, quantity")
    .gte("purchase_date", start)
    .lte("purchase_date", end);

  const { data: prevAmazon } = await supabase
    .from("amazon_orders")
    .select("item_price")
    .gte("purchase_date", prevStart)
    .lte("purchase_date", prevEnd);

  // Ad spend
  const { data: currentAds } = await supabase
    .from("ad_spend_daily")
    .select("spend")
    .gte("date", start.split("T")[0])
    .lte("date", end.split("T")[0]);

  const { data: prevAds } = await supabase
    .from("ad_spend_daily")
    .select("spend")
    .gte("date", prevStart.split("T")[0])
    .lte("date", prevEnd.split("T")[0]);

  const shopifyRevenue = (currentShopify || []).reduce((s, o) => s + (o.total || 0), 0);
  const prevShopifyRevenue = (prevShopify || []).reduce((s, o) => s + (o.total || 0), 0);
  const amazonRevenue = (currentAmazon || []).reduce((s, o) => s + (o.item_price || 0), 0);
  const prevAmazonRevenue = (prevAmazon || []).reduce((s, o) => s + (o.item_price || 0), 0);

  const totalRevenue = shopifyRevenue + amazonRevenue;
  const prevTotalRevenue = prevShopifyRevenue + prevAmazonRevenue;
  const revenueChange = prevTotalRevenue > 0
    ? ((totalRevenue - prevTotalRevenue) / prevTotalRevenue) * 100
    : 0;

  const totalOrders = (currentShopify?.length || 0) + (currentAmazon?.length || 0);
  const prevTotalOrders = (prevShopify?.length || 0) + (prevAmazon?.length || 0);
  const ordersChange = prevTotalOrders > 0
    ? ((totalOrders - prevTotalOrders) / prevTotalOrders) * 100
    : 0;

  const adSpend = (currentAds || []).reduce((s, a) => s + (a.spend || 0), 0);
  const prevAdSpend = (prevAds || []).reduce((s, a) => s + (a.spend || 0), 0);
  const adSpendChange = prevAdSpend > 0
    ? ((adSpend - prevAdSpend) / prevAdSpend) * 100
    : 0;

  return {
    revenue: { value: totalRevenue, change: revenueChange },
    orders: { value: totalOrders, change: ordersChange },
    adSpend: { value: adSpend, change: adSpendChange },
    shopifyRevenue,
    amazonRevenue,
  };
}

export async function getRevenueByChannel(period: string) {
  const supabase = await createClient();
  const { start, end } = getDateRange(period);

  const { data: stores } = await supabase.from("stores").select("id, name, slug");

  const channels: { name: string; revenue: number }[] = [];

  for (const store of stores || []) {
    const { data: orders } = await supabase
      .from("shopify_orders")
      .select("total")
      .eq("store_id", store.id)
      .gte("created_at", start)
      .lte("created_at", end)
      .eq("financial_status", "paid");

    channels.push({
      name: store.name,
      revenue: (orders || []).reduce((s, o) => s + (o.total || 0), 0),
    });
  }

  // Amazon
  const { data: amazonOrders } = await supabase
    .from("amazon_orders")
    .select("item_price")
    .gte("purchase_date", start)
    .lte("purchase_date", end);

  channels.push({
    name: "Amazon",
    revenue: (amazonOrders || []).reduce((s, o) => s + (o.item_price || 0), 0),
  });

  return channels;
}
```

**Step 3: Create Shopify queries** (`src/lib/queries/shopify.ts`), **Amazon queries** (`src/lib/queries/amazon.ts`), **Ads queries** (`src/lib/queries/ads.ts`) — each follows the same pattern: accept `period` param, query Supabase with date range, return structured data for the UI. Follow the overview.ts pattern.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add data query layer for dashboard pages"
```

---

## Task 10: Dashboard Pages — Overview

**Files:**
- Modify: `src/app/(dashboard)/page.tsx`

**Step 1: Build the overview dashboard page**

Replace `src/app/(dashboard)/page.tsx`:

```tsx
import { Suspense } from "react";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { DateRangePicker } from "@/components/date-range-picker";
import { getOverviewKpis, getRevenueByChannel } from "@/lib/queries/overview";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RevenueChart } from "./revenue-chart";

interface Props {
  searchParams: Promise<{ period?: string }>;
}

export default async function DashboardPage({ searchParams }: Props) {
  const { period = "30d" } = await searchParams;
  const [kpis, channels] = await Promise.all([
    getOverviewKpis(period),
    getRevenueByChannel(period),
  ]);

  return (
    <div>
      <PageHeader title="Dashboard" description="Panoramica Gruppo Wilco">
        <DateRangePicker />
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
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
          value={kpis.orders.value > 0 ? kpis.revenue.value / kpis.orders.value : 0}
          format="currency"
        />
        <KpiCard
          title="Spesa Ads"
          value={kpis.adSpend.value}
          format="currency"
          change={kpis.adSpend.change}
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Fatturato per Canale</CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-64" />}>
              <RevenueChart data={channels} />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

Create `src/app/(dashboard)/revenue-chart.tsx`:

```tsx
"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface Props {
  data: { name: string; revenue: number }[];
}

export function RevenueChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip
          formatter={(value: number) =>
            new Intl.NumberFormat("it-IT", {
              style: "currency",
              currency: "EUR",
            }).format(value)
          }
        />
        <Bar dataKey="revenue" fill="#2563eb" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: add dashboard overview page with KPIs and revenue chart"
```

---

## Task 11: Shopify Pages

**Files:**
- Create: `src/app/(dashboard)/shopify/page.tsx`
- Create: `src/app/(dashboard)/shopify/[store]/page.tsx`
- Create: `src/app/(dashboard)/shopify/[store]/products/page.tsx`
- Create: `src/app/(dashboard)/shopify/[store]/customers/page.tsx`

Build each page following the overview pattern: server component, query Supabase, render with KPI cards + tables + charts. Use `shadcn/ui Table` for product/customer lists. Use the store slug from URL params to filter data.

**Commit:**

```bash
git add -A
git commit -m "feat: add Shopify detail pages (overview, products, customers per store)"
```

---

## Task 12: Amazon Pages

**Files:**
- Create: `src/app/(dashboard)/amazon/page.tsx`
- Create: `src/app/(dashboard)/amazon/pnl/page.tsx`
- Create: `src/app/(dashboard)/amazon/inventory/page.tsx`

Build the Amazon P&L page showing a table with columns: ASIN, SKU, Revenue, Amazon Fees, FBA Fees, Storage Fees, Product Cost, Ad Spend, Net Profit, Margin %. Use `shadcn/ui Table` with sortable columns.

**Commit:**

```bash
git add -A
git commit -m "feat: add Amazon pages (overview, P&L per ASIN, inventory)"
```

---

## Task 13: Ads Pages

**Files:**
- Create: `src/app/(dashboard)/ads/page.tsx`
- Create: `src/app/(dashboard)/ads/google/page.tsx`
- Create: `src/app/(dashboard)/ads/meta/page.tsx`

Overview page: total spend Google + Meta, ROAS, active campaigns count. Detail pages: campaign table with spend, impressions, clicks, conversions, ROAS. Daily spend line chart.

**Commit:**

```bash
git add -A
git commit -m "feat: add Ads pages (overview, Google detail, Meta detail)"
```

---

## Task 14: Settings Page

**Files:**
- Create: `src/app/(dashboard)/settings/page.tsx`

Show: sync log table (last 20 entries with source, status, records synced, time). Button to trigger manual sync. Store/account connection status.

**Commit:**

```bash
git add -A
git commit -m "feat: add settings page with sync log and manual sync trigger"
```

---

## Task 15: Deploy to Vercel

**Step 1: Push to GitHub**

```bash
cd /Users/andreamangilli/WilcoDashboard
gh repo create WilcoDashboard --private --source=. --push
```

**Step 2: Connect to Vercel**

```bash
npx vercel --prod
```

Or go to vercel.com/new, import the GitHub repo.

**Step 3: Set environment variables**

In Vercel Dashboard > Project Settings > Environment Variables, add all variables from `.env.local`.

**Step 4: Verify deployment**

Visit the Vercel URL. Login should work. Dashboard should show (empty data until first sync).

**Step 5: Trigger first sync**

```bash
curl -X POST https://your-app.vercel.app/api/cron/sync \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

**Step 6: Commit any final adjustments**

```bash
git add -A
git commit -m "chore: finalize deployment configuration"
```
