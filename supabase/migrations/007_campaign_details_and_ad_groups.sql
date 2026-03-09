-- Add campaign metadata columns
ALTER TABLE ad_campaigns
ADD COLUMN IF NOT EXISTS campaign_type TEXT,
ADD COLUMN IF NOT EXISTS bidding_strategy TEXT,
ADD COLUMN IF NOT EXISTS start_date DATE,
ADD COLUMN IF NOT EXISTS end_date DATE;

-- Ad group level daily metrics
CREATE TABLE IF NOT EXISTS ad_group_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id UUID NOT NULL REFERENCES ad_accounts(id),
  campaign_id TEXT NOT NULL,
  ad_group_id TEXT NOT NULL,
  ad_group_name TEXT,
  ad_group_status TEXT,
  date DATE NOT NULL,
  spend NUMERIC(10,2) DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  conversions NUMERIC(10,2) DEFAULT 0,
  revenue NUMERIC(10,2) DEFAULT 0,
  UNIQUE(ad_account_id, campaign_id, ad_group_id, date)
);

ALTER TABLE ad_group_daily ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ad_group_daily_campaign ON ad_group_daily(campaign_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_ad_group_daily_account ON ad_group_daily(ad_account_id, date DESC);
