-- OptiMonk campaigns
CREATE TABLE IF NOT EXISTS optimonk_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  optimonk_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  impressions INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  conversion_rate NUMERIC(6,4) DEFAULT 0,
  variants_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE optimonk_campaigns ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_optimonk_campaigns_status ON optimonk_campaigns(status);
