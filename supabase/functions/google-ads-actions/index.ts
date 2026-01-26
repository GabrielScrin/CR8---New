// Supabase Edge Function: google-ads-actions
// Lists Google Ads Conversion Actions for a given customer_id so the UI can offer a dropdown.
//
// Auth:
// - Requires Bearer token + company_id (admin/gestor of the company)
//
// Env required:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - GOOGLE_ADS_CLIENT_ID
// - GOOGLE_ADS_CLIENT_SECRET
// - GOOGLE_ADS_REFRESH_TOKEN
// - GOOGLE_ADS_DEVELOPER_TOKEN
//
// Env optional:
// - GOOGLE_ADS_LOGIN_CUSTOMER_ID (MCC)
// - GOOGLE_ADS_API_VERSION (default: 20)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const corsHeaders: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

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

let cachedGoogleAccessToken: { token: string; expiresAtMs: number } | null = null;

async function getGoogleAccessToken(): Promise<string> {
  if (!GOOGLE_ADS_CLIENT_ID || !GOOGLE_ADS_CLIENT_SECRET || !GOOGLE_ADS_REFRESH_TOKEN) {
    throw new Error('missing GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET / GOOGLE_ADS_REFRESH_TOKEN');
  }
  const now = Date.now();
  if (cachedGoogleAccessToken && cachedGoogleAccessToken.expiresAtMs - 30_000 > now) return cachedGoogleAccessToken.token;

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

type ActionRow = {
  id: string;
  resource_name: string;
  name: string | null;
  status: string | null;
  type: string | null;
  category: string | null;
};

function tryParseJson(text: string): any | null {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return jsonResponse(405, { ok: false, error: 'method not allowed' });

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(500, { ok: false, error: 'missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' });
    }
    if (!GOOGLE_ADS_DEVELOPER_TOKEN) {
      return jsonResponse(500, { ok: false, error: 'missing GOOGLE_ADS_DEVELOPER_TOKEN' });
    }

    const body = await req.json().catch(() => ({}));
    const companyId = typeof body?.company_id === 'string' ? body.company_id.trim() : '';
    const customerIdRaw = typeof body?.customer_id === 'string' ? body.customer_id.trim() : '';
    const customerId = customerIdRaw.replace(/\\D/g, '');
    if (!companyId) return jsonResponse(400, { ok: false, error: 'missing company_id' });
    if (!customerId) return jsonResponse(400, { ok: false, error: 'missing customer_id' });

    const auth = await requireUserFromBearer(req);
    if (!auth.ok) {
      return jsonResponse(401, {
        ok: false,
        error: 'This endpoint requires a valid Bearer token',
        details: auth.error,
      });
    }
    const perm = await requireCompanyAdmin(companyId, auth.userId);
    if (!perm.ok) return jsonResponse(perm.status, { ok: false, error: perm.error });

    // Company-level MCC override (optional)
    const { data: companyRow } = await supabaseAdmin
      .from('companies')
      .select('google_ads_login_customer_id')
      .eq('id', companyId)
      .maybeSingle();
    const loginCustomerId = String((companyRow as any)?.google_ads_login_customer_id ?? '').replace(/\\D/g, '');

    const accessToken = await getGoogleAccessToken();
    const url = `https://googleads.googleapis.com/v${encodeURIComponent(GOOGLE_ADS_API_VERSION)}/customers/${encodeURIComponent(
      customerId,
    )}/googleAds:search`;

    const query =
      "SELECT conversion_action.id, conversion_action.resource_name, conversion_action.name, conversion_action.status, conversion_action.type, conversion_action.category FROM conversion_action WHERE conversion_action.status != 'REMOVED' ORDER BY conversion_action.name";

    const loginId = loginCustomerId || GOOGLE_ADS_LOGIN_CUSTOMER_ID;

    const callAdsApi = async (withLoginCustomer: boolean) => {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        authorization: `Bearer ${accessToken}`,
        'developer-token': GOOGLE_ADS_DEVELOPER_TOKEN,
      };
      if (withLoginCustomer && loginId) headers['login-customer-id'] = String(loginId).replace(/\\D/g, '');
      const res = await fetch(url, {
        method: 'POST',
        headers,
        // NOTE: pageSize is deprecated and errors on recent Google Ads API versions.
        // Use query LIMIT / pageToken paging if needed.
        body: JSON.stringify({ query }),
      });
      const text = await res.text().catch(() => '');
      return { res, text };
    };

    let attempt = await callAdsApi(true);
    if (!attempt.res.ok && loginId && (attempt.res.status === 400 || attempt.res.status === 403)) {
      // Some accounts fail when a wrong MCC is forced; retry without login-customer-id.
      attempt = await callAdsApi(false);
    }

    if (!attempt.res.ok) {
      const parsed = tryParseJson(attempt.text);
      const message =
        parsed?.error?.message ||
        parsed?.error?.details?.[0]?.message ||
        parsed?.error?.details?.[0]?.description ||
        attempt.text;
      return jsonResponse(502, {
        ok: false,
        error: `Google Ads API error: HTTP ${attempt.res.status}`,
        details: typeof message === 'string' ? message : attempt.text,
        raw: attempt.text,
      });
    }

    const json = JSON.parse(attempt.text);
    const results: any[] = Array.isArray(json?.results) ? json.results : [];
    const actions: ActionRow[] = results
      .map((r) => r?.conversionAction ?? r?.conversion_action ?? null)
      .filter(Boolean)
      .map((a: any) => ({
        id: String(a?.id ?? '').trim(),
        resource_name: String(a?.resourceName ?? a?.resource_name ?? '').trim(),
        name: a?.name ? String(a.name) : null,
        status: a?.status ? String(a.status) : null,
        type: a?.type ? String(a.type) : null,
        category: a?.category ? String(a.category) : null,
      }))
      .filter((a) => a.id && a.resource_name);

    return jsonResponse(200, { ok: true, customer_id: customerId, actions });
  } catch (e: any) {
    return jsonResponse(500, { ok: false, error: e?.message ?? 'unknown error' });
  }
});
