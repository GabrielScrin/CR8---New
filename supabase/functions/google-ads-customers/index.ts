// Supabase Edge Function: google-ads-customers
// Lists Google Ads customer accounts the integration can access.
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

type CustomerRow = {
  id: string;
  resource_name: string;
  descriptive_name: string | null;
  currency_code: string | null;
  time_zone: string | null;
};

function parseCustomerId(resourceName: string): string {
  const match = resourceName.match(/customers\/(\d+)/);
  return match?.[1] ?? '';
}

async function listViaAccessibleCustomers(accessToken: string): Promise<CustomerRow[]> {
  const url = `https://googleads.googleapis.com/v${encodeURIComponent(GOOGLE_ADS_API_VERSION)}/customers:listAccessibleCustomers`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'developer-token': GOOGLE_ADS_DEVELOPER_TOKEN,
    },
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) throw new Error(`Google Ads API error: HTTP ${res.status} ${text}`);
  const json = JSON.parse(text);
  const names: string[] = Array.isArray(json?.resourceNames) ? json.resourceNames : [];
  return names
    .map((rn) => String(rn || '').trim())
    .filter(Boolean)
    .map((rn) => ({
      id: parseCustomerId(rn),
      resource_name: rn,
      descriptive_name: null,
      currency_code: null,
      time_zone: null,
    }))
    .filter((c) => c.id);
}

async function listViaMccCustomerClient(accessToken: string, loginCustomerId: string): Promise<CustomerRow[]> {
  const url = `https://googleads.googleapis.com/v${encodeURIComponent(GOOGLE_ADS_API_VERSION)}/customers/${encodeURIComponent(
    loginCustomerId,
  )}/googleAds:search`;
  const query =
    "SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.time_zone, customer_client.manager, customer_client.level FROM customer_client WHERE customer_client.level = 1 ORDER BY customer_client.descriptive_name";

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
      'developer-token': GOOGLE_ADS_DEVELOPER_TOKEN,
      'login-customer-id': loginCustomerId,
    },
    body: JSON.stringify({ query, page_size: 1000 }),
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) throw new Error(`Google Ads API error: HTTP ${res.status} ${text}`);
  const json = JSON.parse(text);
  const results: any[] = Array.isArray(json?.results) ? json.results : [];

  return results
    .map((r) => r?.customerClient ?? r?.customer_client ?? null)
    .filter(Boolean)
    .filter((c) => c?.manager === false)
    .map((c: any) => ({
      id: String(c?.id ?? '').trim(),
      resource_name: `customers/${String(c?.id ?? '').trim()}`,
      descriptive_name: c?.descriptiveName ? String(c.descriptiveName) : c?.descriptive_name ? String(c.descriptive_name) : null,
      currency_code: c?.currencyCode ? String(c.currencyCode) : c?.currency_code ? String(c.currency_code) : null,
      time_zone: c?.timeZone ? String(c.timeZone) : c?.time_zone ? String(c.time_zone) : null,
    }))
    .filter((c: any) => c.id);
}

serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return jsonResponse(405, { ok: false, error: 'method not allowed' });

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(500, { ok: false, error: 'missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' });
    }
    if (!GOOGLE_ADS_DEVELOPER_TOKEN) return jsonResponse(500, { ok: false, error: 'missing GOOGLE_ADS_DEVELOPER_TOKEN' });

    const body = await req.json().catch(() => ({}));
    const companyId = typeof body?.company_id === 'string' ? body.company_id.trim() : '';
    if (!companyId) return jsonResponse(400, { ok: false, error: 'missing company_id' });

    const auth = await requireUserFromBearer(req);
    if (!auth.ok) {
      return jsonResponse(401, { ok: false, error: 'This endpoint requires a valid Bearer token', details: auth.error });
    }
    const perm = await requireCompanyAdmin(companyId, auth.userId);
    if (!perm.ok) return jsonResponse(perm.status, { ok: false, error: perm.error });

    // Company-level MCC override (optional)
    const { data: companyRow } = await supabaseAdmin
      .from('companies')
      .select('google_ads_login_customer_id')
      .eq('id', companyId)
      .maybeSingle();
    const companyLoginCustomerId = String((companyRow as any)?.google_ads_login_customer_id ?? '').replace(/\D/g, '');

    const accessToken = await getGoogleAccessToken();
    const loginId = companyLoginCustomerId || GOOGLE_ADS_LOGIN_CUSTOMER_ID.replace(/\D/g, '');

    let customers: CustomerRow[] = [];
    try {
      if (loginId) customers = await listViaMccCustomerClient(accessToken, loginId);
    } catch (_e) {
      // fall back
      customers = [];
    }
    if (customers.length === 0) customers = await listViaAccessibleCustomers(accessToken);

    return jsonResponse(200, { ok: true, customers });
  } catch (e: any) {
    return jsonResponse(500, { ok: false, error: e?.message ?? 'unknown error' });
  }
});
