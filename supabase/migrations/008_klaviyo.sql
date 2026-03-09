-- Klaviyo email campaigns
CREATE TABLE IF NOT EXISTS klaviyo_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  klaviyo_id TEXT NOT NULL UNIQUE,
  name TEXT,
  status TEXT,
  channel TEXT DEFAULT 'email',
  send_time TIMESTAMPTZ,
  recipients INTEGER DEFAULT 0,
  opens INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  conversions NUMERIC(10,2) DEFAULT 0,
  revenue NUMERIC(10,2) DEFAULT 0,
  unsubscribes INTEGER DEFAULT 0,
  open_rate NUMERIC(6,4) DEFAULT 0,
  click_rate NUMERIC(6,4) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE klaviyo_campaigns ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_klaviyo_campaigns_send ON klaviyo_campaigns(send_time DESC);
