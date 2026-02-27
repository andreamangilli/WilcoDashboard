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
