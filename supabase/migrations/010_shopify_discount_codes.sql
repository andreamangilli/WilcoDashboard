-- Add discount codes to shopify_orders
ALTER TABLE shopify_orders ADD COLUMN IF NOT EXISTS discount_codes TEXT;
