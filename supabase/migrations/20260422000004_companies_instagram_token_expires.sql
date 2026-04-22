-- Add instagram_token_expires_at column referenced by instagram-token-exchange edge function.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS instagram_token_expires_at timestamptz;
