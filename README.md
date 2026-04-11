# CR8 (Traffic OS) - Supabase + Vercel

## Rodar local

1. `npm install`
2. Copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
3. `npm run dev`

## Supabase (Fase 1)

### 1) Banco + RLS

- No Supabase -> SQL Editor: rode `supabase/schema.sql`

### 2) Auth (Facebook + ads_read)

- Supabase -> Authentication -> Providers -> Facebook: configure App ID/Secret
- Redirect URLs:
  - Local: `http://localhost:5173`
  - Vercel: `https://SEU-PROJETO.vercel.app`
- Se o popup do Facebook mostrar `Invalid Scopes: email`, ajuste `VITE_FACEBOOK_SCOPES` (ex: `public_profile ads_read`)

### 3) Empresa/cliente

- Faca login e crie a primeira empresa no fluxo de "Primeiro Setup" (usa a RPC `create_company`)
- Preencha `meta_ad_account_id` (ex: `act_123...`) para o modulo de Trafego puxar insights reais

### 4) Token longo da Meta

- Rode a migration `supabase/migrations/20260411000002_meta_long_lived_tokens.sql`
- Configure os secrets do Supabase:
  - `META_APP_ID`
  - `META_APP_SECRET`
  - `META_GRAPH_VERSION` (opcional)
- Deploy da funcao:
  - `supabase functions deploy meta-token-exchange`
- Depois do primeiro login ou relogin com Facebook, o app troca o token curto por um token de longa duracao (~60 dias) e reutiliza esse token no Dashboard e em Trafego

**Erro comum:** `violates foreign key constraint companies_created_by_fkey`
- Rode novamente a parte do `supabase/schema.sql` que recria `create_company()` (ele faz backfill/cria o profile em `public.users`)

## Webhook de Leads (Supabase Edge Function)

Arquivo: `supabase/functions/lead-webhook/index.ts`

1. Configure secrets no Supabase:
   - `LEAD_WEBHOOK_SECRET` (recomendado)
   - `FB_VERIFY_TOKEN` (para verificacao do webhook do Facebook, se usar)
2. Deploy da funcao (Supabase CLI):
   - `supabase functions deploy lead-webhook`

**Exemplo (Landing Page):**

`POST https://<PROJECT>.functions.supabase.co/lead-webhook?company_id=<UUID>`

Headers:
- `x-webhook-secret: <LEAD_WEBHOOK_SECRET>`

Body:
```json
{ "name": "Joao", "email": "joao@email.com", "phone": "11999999999", "utm_source": "ig", "utm_campaign": "campanha-x" }
```

## Deploy (Vercel)

1. Importar o repositorio na Vercel
2. Setar env vars (Project Settings -> Environment Variables):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - (opcional) `VITE_META_AD_ACCOUNT_ID`
3. Build: `npm run build` (output padrao: `dist`)
