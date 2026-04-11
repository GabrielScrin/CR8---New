alter table public.companies
  add column if not exists meta_access_token text,
  add column if not exists meta_token_expires_at timestamptz;
