# SPEC: Integração com Meta Ads Manager (Insights) + Métricas do Dash/Tráfego

## Objetivo
Conectar a aplicação ao **Meta Ads Manager** via **Meta Graph API (Insights)** para exibir, no **Dashboard** e na **Análise de Tráfego**, as métricas de mídia que já aparecem na UI:

- **Gasto (spend)** e sua variação por período
- **Leads/Resultados** (via `actions`) e **CPL/CPA**
- **Impressões, alcance, cliques, CTR, CPC, CPM, frequência**
- **ROAS** (quando disponível)
- **Métricas de vídeo** para análise de criativo (hook/hold)
- **Ranking e drilldown** por **Campanha / Conjunto / Anúncio**

## Escopo (o que entra / o que não entra)
### Entra
- Autenticação via Facebook/Meta (OAuth) para obter um **access token** com permissões de leitura.
- Listagem de **Ad Accounts** do usuário e seleção da conta usada no app.
- Leitura de **Insights** do nível **account**, **campaign**, **adset**, **ad**.
- Cálculo/mapeamento das métricas para os componentes:
  - `components/DashboardV2.tsx`
  - `components/TrafficAnalytics.tsx`

### Não entra (neste ciclo)
- Criar/editar campanhas, adsets ou ads (ads management).
- Armazenar token Meta em banco (persistência de token).
- ETL/warehouse completo de métricas (armazenamento histórico permanente).

## Arquitetura (como está hoje)
### 1) Auth (Supabase + Facebook Provider)
- Login via `supabase.auth.signInWithOAuth({ provider: 'facebook' })` em `components/Login.tsx`.
- Escopos via `VITE_FACEBOOK_SCOPES` (default: `public_profile ads_read`).
- O **token usado para chamadas na API da Meta** é o `session.provider_token` do Supabase (não é salvo no banco).

### 2) Configuração da conta de anúncios (por empresa)
- A empresa guarda `companies.meta_ad_account_id` (ex: `act_123...`), definido no setup em `components/CompanySetup.tsx` ou diretamente no banco.
- Fallback opcional por env: `VITE_META_AD_ACCOUNT_ID` (útil para demo / setups sem multi-tenant completo).

### 3) Consumo de métricas (client-side, direto no Graph API)
- O frontend chama `https://graph.facebook.com/${VITE_META_GRAPH_VERSION}/...` via `fetch`.
- Nenhuma credencial Meta é armazenada permanentemente; só o `meta_ad_account_id` é persistido na empresa.

## Pré-requisitos de configuração (para funcionar em produção)
1. Supabase:
   - Ativar **Authentication → Providers → Facebook** com App ID/Secret.
   - Configurar **Redirect URLs** (local e Vercel).
2. Variáveis de ambiente:
   - `VITE_META_GRAPH_VERSION` (default `v19.0`)
   - `VITE_FACEBOOK_SCOPES=public_profile ads_read`
   - (opcional) `VITE_META_AD_ACCOUNT_ID=act_...`
3. Base:
   - Preencher `companies.meta_ad_account_id` para cada empresa/cliente.
4. Permissões:
   - O usuário precisa ter acesso à Ad Account no Business Manager; caso contrário a listagem/insights falham.

## Endpoints Meta usados (Insights)
### 1) Listar contas de anúncio do usuário
- `GET /{graphVersion}/me/adaccounts?fields=id,name&limit=50&access_token=...`
- Implementado em `components/TrafficAnalytics.tsx` (`fetchAllAdAccounts`).

### 2) Dashboard: gasto e série temporal
Para período `24h` ou janelas `7d/30d`:
- `GET /{graphVersion}/{act}/insights`
  - `level=account`
  - `fields=spend,actions,date_start` (para série) ou `fields=spend` (comparação período anterior)
  - `date_preset=today|last_7d|last_30d` e `time_increment=1` quando aplicável
- Implementado em `components/DashboardV2.tsx` (`fetchMetaSpend`, `fetchMetaSpendPrevious`).

### 3) Dashboard: top campanhas
- `GET /{graphVersion}/{act}/insights`
  - `level=campaign`
  - `fields=campaign_id,campaign_name,objective,spend,actions`
  - `date_preset` conforme período
- Implementado em `components/DashboardV2.tsx` (`fetchTopCampaigns`).

### 4) Tráfego: tabela por Campanha / Conjunto / Anúncio
- `GET /{graphVersion}/{act}/insights`
  - `level=campaign|adset|ad`
  - `fields` (base) em `components/TrafficAnalytics.tsx`:
    - IDs/nomes do nível + `objective,impressions,reach,clicks,inline_link_clicks,cpm,frequency,spend,cpc,ctr,actions,purchase_roas,video_thruplay_watched_actions`
  - Filtros opcionais:
    - `filtering=[{field:'campaign.id'|'adset.id',operator:'IN',value:[...]}]`
  - Período:
    - `time_range={since,until}` (custom) ou `date_preset=...`
  - Paginação:
    - `limit=50` (hoje; se precisar, expandir para paginação completa)

### 5) Tráfego: status (active/paused) por entidade
- `GET /{graphVersion}/?ids=ID1,ID2,...&fields=effective_status&access_token=...`
- Implementado em `components/TrafficAnalytics.tsx` (`fetchEffectiveStatusesByIds`).

### 6) Tráfego: thumbnails do anúncio (criativo)
- `GET /{graphVersion}/?ids=AD_ID1,AD_ID2,...&fields=creative{thumbnail_url,image_url}&access_token=...`
- Implementado em `components/TrafficAnalytics.tsx` (`fetchAdThumbnails`).

## Mapeamento de métricas (Meta → UI)
### Spend
- `spend` (string/number) → `AdMetric.spend` (number)

### Impressões / Alcance / Cliques
- `impressions` → `AdMetric.impressions`
- `reach` → `AdMetric.reach`
- `clicks` → `AdMetric.clicks`
- `inline_link_clicks` → `AdMetric.inlineLinkClicks`

### Eficiência
- `ctr` → `AdMetric.ctr` (observação: na UI é exibido como `%`; no Graph API costuma vir em “%”, e o código mantém o valor como número)
- `cpc` → `AdMetric.cpc`
- `cpm` → `AdMetric.cpm`
- `frequency` → `AdMetric.frequency`

### Leads / Resultados / CPL/CPA
- Leads “tipo lead” (form/pixel) vem de `actions[*]` quando `action_type`:
  - contém `lead` **OU** é `onsite_conversion.lead_grouped`
- Conversas (WhatsApp/DM) consideradas “lead” vêm de `actions[*]` quando `action_type`:
  - contém `messaging_conversation_started` **OU** contém `onsite_conversion.messaging`
- `TrafficAnalytics` soma: `leads = formLeads + conversations`
- `Dashboard` usa `leadLikeActionTypes` (conjunto fixo) para “Resultados” das campanhas.
- `CPL` (Dashboard) = `spendNow / totalLeadsNoSupabase` (leads do CRM, tabela `public.leads`)
- `CPA` (Tráfego) = `spend / leads` (quando `leads > 0`)

### Compras / ROAS (quando aplicável)
- Compras: `actions[*]` com `action_type` contendo `purchase`
- ROAS: `purchase_roas[*].value` somado → `AdMetric.roas`

### Vídeo (para criativo)
- Views 3s: `actions[*]` com tipos `video_view`, variações de `video_view_3s...`
- Views 15s: `actions[*]` com tipos `video_view_15...` (fallback: soma de `video_thruplay_watched_actions`)
- `hookRate = video3s / impressions`
- `holdRate = video15s / impressions`

### Resultado primário (label + valor)
Regra em `TrafficAnalytics`:
- Escolhe o “resultado” com base no `objective` (LEAD/MESSAGE/VIDEO/TRAFFIC/CONVERSIONS…).
- Fallback por disponibilidade: leads → purchases → conversations → linkClicks → clicks → video3s.

## Dados de tráfego (CRM) usados para compor o Dash
O Dashboard mistura **dados Meta** (spend, campanhas) com **dados internos**:
- `public.leads` (Supabase):
  - contagem de leads por período
  - status (won/lost/…)
  - receita (`value`)
  - canais (`source`)
- A captura pode vir de:
  - Webhook `supabase/functions/lead-webhook` (landing pages)
  - Criação manual (RPC `create_lead_manual`)

## Tratamento de erros e reautorização
- Se `session.provider_token` não existir:
  - mostrar alerta “Reconectar Meta” (Dashboard) ou exigir reauth (Tráfego).
- Se a Meta retornar erro de permissão/token:
  - expor a mensagem na UI e sugerir reautorização.
- Reautorização (Tráfego):
  - `supabase.auth.signInWithOAuth(... queryParams: { auth_type: 'rerequest' })`

## Observabilidade / segurança
- Não persistir tokens Meta em tabela.
- Persistir apenas `companies.meta_ad_account_id`.
- Respeitar RLS para dados internos (leads, empresas, presets, etc).

## Passos de implementação (checklist)
1. Configurar Facebook Provider no Supabase + Redirect URLs.
2. Definir `VITE_FACEBOOK_SCOPES` e `VITE_META_GRAPH_VERSION`.
3. Preencher `companies.meta_ad_account_id` por empresa.
4. Validar:
   - Login Facebook gera `provider_token`
   - `/me/adaccounts` lista contas
   - `/act_x/insights` retorna spend e ações
5. Validar UI:
   - `Dashboard` mostra gasto, variação, CPL e top campanhas
   - `TrafficAnalytics` mostra tabela por nível, filtros, export e thumbnails

## Próximas melhorias (opcional)
- Mover chamadas Meta para **Edge Function** com cache (evita rate limit e expor token ao browser).
- Persistir agregados diários (spend/impressions/results) para consultas rápidas e histórico longo.
- Completar paginação completa no Insights (hoje é `limit=50/60`).

