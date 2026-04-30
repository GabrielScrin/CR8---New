-- Adiciona coluna de conta Google Ads em portal_links
ALTER TABLE portal_links
  ADD COLUMN IF NOT EXISTS google_ads_customer_id   text,
  ADD COLUMN IF NOT EXISTS google_ads_customer_name text;
