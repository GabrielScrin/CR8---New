// Supabase Edge Function: conversions-dispatch
// Dispatches pending conversion events from `public.conversion_events` to ad platforms.
//
// Currently supported:
// - Google Ads: UploadClickConversions (gclid/gbraid/wbraid)
//
// Auth model:
// - Uses SUPABASE_SERVICE_ROLE_KEY (server-side) to read/write conversion_events
// - Client should call this from a trusted scheduler (Vercel Cron, QStash, etc.)
// - Optional shared secret via header `x-cr8-secret`
// - If called from the app (Bearer token), it MUST pass `company_id` and the user must be admin/gestor of that company.
//
// Env required:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
//
// Env optional (Google Ads):
// - GOOGLE_ADS_CLIENT_ID
// - GOOGLE_ADS_CLIENT_SECRET
// - GOOGLE_ADS_REFRESH_TOKEN
// - GOOGLE_ADS_DEVELOPER_TOKEN
// - GOOGLE_ADS_LOGIN_CUSTOMER_ID (optional MCC)
// - GOOGLE_ADS_API_VERSION (default: 20)
//
// Env optional (security):
// - CONVERSIONS_DISPATCH_SECRET

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const corsHeaders: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-cr8-secret',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CONVERSIONS_DISPATCH_SECRET = Deno.env.get('CONVERSIONS_DISPATCH_SECRET') ?? '';

const GOOGLE_ADS_CLIENT_ID = Deno.env.get('GOOGLE_ADS_CLIENT_ID') ?? '';
const GOOGLE_ADS_CLIENT_SECRET = Deno.env.get('GOOGLE_ADS_CLIENT_SECRET') ?? '';
const GOOGLE_ADS_REFRESH_TOKEN = Deno.env.get('GOOGLE_ADS_REFRESH_TOKEN') ?? '';
const GOOGLE_ADS_DEVELOPER_TOKEN = Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN') ?? '';
const GOOGLE_ADS_LOGIN_CUSTOMER_ID = Deno.env.get('GOOGLE_ADS_LOGIN_CUSTOMER_ID') ?? '';
const GOOGLE_ADS_API_VERSION = Deno.env.get('GOOGLE_ADS_API_VERSION') ?? '20';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const jsonResponse = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });

const extractBearerToken = (authorizationHeader: string | null): string | null => {
  if (!authorizationHeader) return null;
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1]?.split(',')[0]?.trim();
  return token ? token : null;
};

const extractAccessToken = (req: Request): string | null =>
  extractBearerToken(req.headers.get('authorization')) ?? extractBearerToken(req.headers.get('Authorization')) ?? null;

type ConversionEventRow = {
  id: string;
  company_id: string;
  lead_id: string;
  provider: string;
  event_key: string;
  dedupe_key: string | null;
  event_time: string;
  payload: any;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
};

async function requireUserFromBearer(req: Request) {
  const token = extractAccessToken(req);
  if (!token) return { ok: false as const, error: 'missing bearer token' };
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user?.id) return { ok: false as const, error: error?.message ?? 'invalid token' };
  return { ok: true as const, userId: data.user.id };
}

async function requireCompanyAdmin(companyId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from('company_members')
    .select('company_id, member_role')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { ok: false as const, status: 500, error: error.message };
  if (!data) return { ok: false as const, status: 403, error: 'forbidden' };
  const role = String((data as any).member_role || '');
  if (role !== 'admin' && role !== 'gestor') return { ok: false as const, status: 403, error: 'forbidden' };
  return { ok: true as const };
}

const toGoogleAdsDateTime = (value: string | Date): string => {
  const iso = (value instanceof Date ? value : new Date(value)).toISOString();
  // iso: 2026-01-24T16:35:17.000Z -> 2026-01-24 16:35:17+00:00
  return iso.replace('T', ' ').replace(/\.\d{3}Z$/, '+00:00');
};

const isResourceName = (value: string) => value.includes('/conversionActions/');

const conversionActionResourceName = (customerId: string, conversionAction: string): string => {
  const raw = String(conversionAction || '').trim();
  if (!raw) return '';
  if (isResourceName(raw)) return raw;
  // Allow "123456789" or "conversionActions/123"
  const idMatch = raw.match(/(\d+)$/);
  const id = idMatch ? idMatch[1] : '';
  return id ? `customers/${customerId}/conversionActions/${id}` : raw;
};

const pickClickId = (payload: any): { field: 'gclid' | 'gbraid' | 'wbraid' | null; value: string | null } => {
  const gclid = typeof payload?.gclid === 'string' ? payload.gclid.trim() : '';
  const gbraid = typeof payload?.gbraid === 'string' ? payload.gbraid.trim() : '';
  const wbraid = typeof payload?.wbraid === 'string' ? payload.wbraid.trim() : '';
  if (gclid) return { field: 'gclid', value: gclid };
  if (gbraid) return { field: 'gbraid', value: gbraid };
  if (wbraid) return { field: 'wbraid', value: wbraid };
  return { field: null, value: null };
};

let cachedGoogleAccessToken: { token: string; expiresAtMs: number } | null = null;

async function getGoogleAccessToken(): Promise<string> {
  if (!GOOGLE_ADS_CLIENT_ID || !GOOGLE_ADS_CLIENT_SECRET || !GOOGLE_ADS_REFRESH_TOKEN) {
    throw new Error('missing GOOGLE_ADS_CLIENT_ID/GOOGLE_ADS_CLIENT_SECRET/GOOGLE_ADS_REFRESH_TOKEN');
  }

  const now = Date.now();
  if (cachedGoogleAccessToken && cachedGoogleAccessToken.expiresAtMs - 60_000 > now) {
    return cachedGoogleAccessToken.token;
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_ADS_CLIENT_ID,
      client_secret: GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: GOOGLE_ADS_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }).toString(),
  });

  const text = await res.text().catch(() => '');
  if (!res.ok) throw new Error(`oauth token error: HTTP ${res.status} ${text}`);

  const json = JSON.parse(text);
  const token = String(json?.access_token ?? '').trim();
  const expiresIn = Number(json?.expires_in ?? 0);
  if (!token) throw new Error('oauth token error: missing access_token');

  cachedGoogleAccessToken = { token, expiresAtMs: now + Math.max(0, expiresIn) * 1000 };
  return token;
}

async function dispatchGoogleAds(event: ConversionEventRow): Promise<{ ok: boolean; error?: string; raw?: any }> {
  if (!GOOGLE_ADS_DEVELOPER_TOKEN) throw new Error('missing GOOGLE_ADS_DEVELOPER_TOKEN');

  const customerId = String(event.payload?.customer_id ?? '').trim();
  const conversionAction = String(event.payload?.conversion_action ?? '').trim();
  if (!customerId) return { ok: false, error: 'missing payload.customer_id (companies.google_ads_customer_id)' };
  if (!conversionAction) return { ok: false, error: 'missing payload.conversion_action' };

  const actionResource = conversionActionResourceName(customerId, conversionAction);
  const click = pickClickId(event.payload);
  if (!click.field || !click.value) return { ok: false, error: 'missing click id (gclid/gbraid/wbraid)' };

  const currencyCode = String(event.payload?.currency_code ?? 'BRL').trim() || 'BRL';
  const rawValue = Number(event.payload?.value ?? 0);
  const conversionValue = Number.isFinite(rawValue) ? rawValue : 0;

  const accessToken = await getGoogleAccessToken();
  const url = `https://googleads.googleapis.com/v${encodeURIComponent(GOOGLE_ADS_API_VERSION)}/customers/${encodeURIComponent(customerId)}:uploadClickConversions`;

  const body = {
    conversions: [
      {
        conversionAction: actionResource,
        conversionValue,
        conversionDateTime: toGoogleAdsDateTime(event.event_time),
        currencyCode,
        [click.field]: click.value,
      },
    ],
    partialFailure: true,
  };

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    authorization: `Bearer ${accessToken}`,
    'developer-token': GOOGLE_ADS_DEVELOPER_TOKEN,
  };
  if (GOOGLE_ADS_LOGIN_CUSTOMER_ID) headers['login-customer-id'] = GOOGLE_ADS_LOGIN_CUSTOMER_ID;

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text().catch(() => '');
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${text}`, raw: { status: res.status, body: text } };

  const json = (() => {
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  })();

  const partialErrorMsg = json?.partialFailureError?.message;
  if (partialErrorMsg) return { ok: false, error: String(partialErrorMsg), raw: json };

  return { ok: true, raw: json };
}

serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return jsonResponse(405, { ok: false, error: 'method not allowed' });

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(500, { ok: false, error: 'missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' });
    }

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body?.limit ?? 50), 1), 200);
    const companyId = typeof body?.company_id === 'string' && body.company_id.trim() ? body.company_id.trim() : null;

    const secretProvided = req.headers.get('x-cr8-secret') ?? '';
    const secretOk = CONVERSIONS_DISPATCH_SECRET ? secretProvided === CONVERSIONS_DISPATCH_SECRET : false;

    // Security rules:
    // - If company_id is provided: allow Bearer token (company admin/gestor) OR secret.
    // - If company_id is NOT provided: require secret (runs across all companies).
    if (!companyId) {
      if (!CONVERSIONS_DISPATCH_SECRET) {
        return jsonResponse(400, { ok: false, error: 'missing company_id (or set CONVERSIONS_DISPATCH_SECRET to allow global dispatch)' });
      }
      if (!secretOk) return jsonResponse(401, { ok: false, error: 'invalid secret' });
    } else if (!secretOk) {
      const auth = await requireUserFromBearer(req);
      if (!auth.ok) return jsonResponse(401, { ok: false, error: 'This endpoint requires a valid Bearer token' });
      const perm = await requireCompanyAdmin(companyId, auth.userId);
      if (!perm.ok) return jsonResponse(perm.status, { ok: false, error: perm.error });
    }

    let q = supabaseAdmin
      .from('conversion_events')
      .select('id, company_id, lead_id, provider, event_key, dedupe_key, event_time, payload, status, attempts')
      .eq('status', 'pending');
    if (companyId) q = q.eq('company_id', companyId);
    const { data: pending, error } = await q.order('created_at', { ascending: true }).limit(limit);
    if (error) return jsonResponse(500, { ok: false, error: error.message });

    const events = (pending ?? []) as ConversionEventRow[];
    if (events.length === 0) return jsonResponse(200, { ok: true, processed: 0 });

    let sent = 0;
    let failed = 0;

    for (const event of events) {
      const attemptAt = new Date().toISOString();
      try {
        if (event.provider !== 'google_ads') {
          await supabaseAdmin
            .from('conversion_events')
            .update({
              status: 'failed',
              attempts: (event.attempts ?? 0) + 1,
              last_error: `unsupported provider: ${event.provider}`,
              last_attempt_at: attemptAt,
              payload: { ...event.payload, dispatch: { ok: false, unsupported: true } },
            })
            .eq('id', event.id);
          failed++;
          continue;
        }

        const result = await dispatchGoogleAds(event);
        if (result.ok) {
          await supabaseAdmin
            .from('conversion_events')
            .update({
              status: 'sent',
              attempts: (event.attempts ?? 0) + 1,
              last_error: null,
              last_attempt_at: attemptAt,
              payload: { ...event.payload, dispatch: { ok: true, provider: 'google_ads', raw: result.raw } },
            })
            .eq('id', event.id);
          sent++;
        } else {
          await supabaseAdmin
            .from('conversion_events')
            .update({
              status: 'failed',
              attempts: (event.attempts ?? 0) + 1,
              last_error: result.error ?? 'dispatch_failed',
              last_attempt_at: attemptAt,
              payload: { ...event.payload, dispatch: { ok: false, provider: 'google_ads', raw: result.raw } },
            })
            .eq('id', event.id);
          failed++;
        }
      } catch (e: any) {
        await supabaseAdmin
          .from('conversion_events')
          .update({
            status: 'failed',
            attempts: (event.attempts ?? 0) + 1,
            last_error: e?.message ?? 'unknown error',
            last_attempt_at: attemptAt,
            payload: { ...event.payload, dispatch: { ok: false, provider: event.provider, error: e?.message ?? 'unknown' } },
          })
          .eq('id', event.id);
        failed++;
      }
    }

    return jsonResponse(200, { ok: true, processed: events.length, sent, failed });
  } catch (e: any) {
    return jsonResponse(500, { ok: false, error: e?.message ?? 'unknown error' });
  }
});
