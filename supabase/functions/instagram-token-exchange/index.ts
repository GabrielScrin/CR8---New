/**
 * Edge Function: instagram-token-exchange
 *
 * Converte um short-lived Facebook user token em um long-lived token (~60 dias)
 * usando o app_secret do Meta (mantido server-side) e salva no banco.
 *
 * POST body: { company_id: string, short_lived_token: string }
 * Auth: Bearer <supabase jwt>
 *
 * Env vars necessárias:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   META_APP_ID
 *   META_APP_SECRET
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const corsHeaders: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const SUPABASE_URL             = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const META_APP_ID              = Deno.env.get('META_APP_ID') ?? '';
const META_APP_SECRET          = Deno.env.get('META_APP_SECRET') ?? '';
const META_GRAPH_VERSION       = Deno.env.get('META_GRAPH_VERSION') ?? 'v19.0';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const jsonResponse = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });

const extractBearerToken = (value: string | null): string | null => {
  const source = value?.trim() ?? '';
  if (!source) return null;
  const match = source.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? source;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse(405, { ok: false, error: 'method not allowed' });

  try {
    // Verifica env vars críticas
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(500, { ok: false, error: 'missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' });
    }
    if (!META_APP_ID || !META_APP_SECRET) {
      return jsonResponse(500, { ok: false, error: 'missing META_APP_ID / META_APP_SECRET' });
    }

    // Autentica o usuário pelo Bearer JWT
    const body = await req.json().catch(() => ({}));
    const jwt =
      extractBearerToken(req.headers.get('authorization')) ??
      extractBearerToken(req.headers.get('Authorization')) ??
      extractBearerToken(req.headers.get('x-supabase-auth')) ??
      extractBearerToken(req.headers.get('x-access-token')) ??
      (typeof body?.access_token === 'string' ? body.access_token.trim() : '');
    if (!jwt) return jsonResponse(401, { ok: false, error: 'missing bearer token' });

    const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(jwt);
    if (authError || !userData?.user?.id) {
      return jsonResponse(401, { ok: false, error: `invalid token: ${authError?.message ?? 'unknown auth error'}` });
    }
    const userId = userData.user.id;

    const companyId: string = typeof body?.company_id === 'string' ? body.company_id.trim() : '';
    const shortToken: string = typeof body?.short_lived_token === 'string' ? body.short_lived_token.trim() : '';

    if (!companyId) return jsonResponse(400, { ok: false, error: 'missing company_id' });
    if (!shortToken) return jsonResponse(400, { ok: false, error: 'missing short_lived_token' });

    // Verifica se o usuário é membro da empresa
    const { data: memberRow } = await supabaseAdmin
      .from('company_members')
      .select('member_role')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!memberRow) return jsonResponse(403, { ok: false, error: 'forbidden' });

    // Troca o token curto pelo token de longa duração via Graph API
    const exchangeUrl =
      `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token` +
      `?grant_type=fb_exchange_token` +
      `&client_id=${encodeURIComponent(META_APP_ID)}` +
      `&client_secret=${encodeURIComponent(META_APP_SECRET)}` +
      `&fb_exchange_token=${encodeURIComponent(shortToken)}`;

    const exchangeRes = await fetch(exchangeUrl);
    const exchangeJson = await exchangeRes.json().catch(() => null);

    if (!exchangeRes.ok || !exchangeJson?.access_token) {
      const errMsg = exchangeJson?.error?.message ?? `exchange HTTP ${exchangeRes.status}`;
      return jsonResponse(502, { ok: false, error: `Meta token exchange failed: ${errMsg}` });
    }

    const longToken: string = exchangeJson.access_token;
    // A API retorna expires_in em segundos (geralmente ~5184000 = 60 dias)
    const expiresInSec: number = Number(exchangeJson.expires_in ?? 5_184_000);
    const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();

    // Salva no banco
    const { error: updateError } = await supabaseAdmin
      .from('companies')
      .update({
        instagram_access_token: longToken,
        instagram_token_expires_at: expiresAt,
      })
      .eq('id', companyId);

    if (updateError) {
      return jsonResponse(500, { ok: false, error: `db update failed: ${updateError.message}` });
    }

    return jsonResponse(200, { ok: true, expires_at: expiresAt });

  } catch (e: any) {
    return jsonResponse(500, { ok: false, error: e?.message ?? 'unknown error' });
  }
});
