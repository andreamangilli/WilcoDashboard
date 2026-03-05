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
