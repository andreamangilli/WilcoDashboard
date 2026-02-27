-- Add encrypted credentials column to all account tables
ALTER TABLE stores ADD COLUMN IF NOT EXISTS credentials JSONB;
ALTER TABLE amazon_accounts ADD COLUMN IF NOT EXISTS credentials JSONB;
ALTER TABLE ad_accounts ADD COLUMN IF NOT EXISTS credentials JSONB;

-- Add write policies for authenticated users (currently only SELECT exists)
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['stores','amazon_accounts','ad_accounts'])
  LOOP
    EXECUTE format('CREATE POLICY "Authenticated insert" ON %I FOR INSERT TO authenticated WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "Authenticated update" ON %I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "Authenticated delete" ON %I FOR DELETE TO authenticated USING (true)', t);
  END LOOP;
END $$;
