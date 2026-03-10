-- TextYess WhatsApp campaigns and analytics
CREATE TABLE IF NOT EXISTS textyess_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  textyess_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  campaign_type TEXT NOT NULL DEFAULT 'campaign',
  status INTEGER DEFAULT 0,
  recipients INTEGER DEFAULT 0,
  total_messages INTEGER DEFAULT 0,
  open_rate NUMERIC(8,4) DEFAULT 0,
  conversion_rate NUMERIC(8,4) DEFAULT 0,
  orders_count INTEGER DEFAULT 0,
  revenue NUMERIC(12,2) DEFAULT 0,
  cost NUMERIC(12,2) DEFAULT 0,
  roas NUMERIC(10,4) DEFAULT 0,
  average_cart NUMERIC(12,2) DEFAULT 0,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE textyess_campaigns ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_textyess_campaigns_type ON textyess_campaigns(campaign_type);

-- TextYess attributed orders
CREATE TABLE IF NOT EXISTS textyess_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  textyess_id TEXT NOT NULL UNIQUE,
  cms_id TEXT,
  order_number INTEGER,
  total NUMERIC(12,2) DEFAULT 0,
  items_number INTEGER DEFAULT 0,
  paid BOOLEAN DEFAULT false,
  asset_type TEXT,
  winning_source TEXT,
  customer_first_name TEXT,
  customer_last_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE textyess_orders ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_textyess_orders_created ON textyess_orders(created_at);
