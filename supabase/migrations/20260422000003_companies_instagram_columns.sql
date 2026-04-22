-- Add missing Instagram + Meta integration columns to companies table.
-- These are referenced in portal analytics edge functions but were never migrated.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS instagram_business_account_id text,
  ADD COLUMN IF NOT EXISTS instagram_username             text,
  ADD COLUMN IF NOT EXISTS instagram_access_token         text;
