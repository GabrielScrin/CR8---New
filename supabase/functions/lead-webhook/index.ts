// Supabase Edge Function: lead-webhook
// - Recebe leads (Landing Pages / Facebook Lead Ads)
// - Insere em public.leads (usa SERVICE_ROLE para bypass de RLS)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const corsHeaders: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret, x-company-id',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const LEAD_WEBHOOK_SECRET = Deno.env.get('LEAD_WEBHOOK_SECRET') ?? '';
const FB_VERIFY_TOKEN = Deno.env.get('FB_VERIFY_TOKEN') ?? '';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type DirectLeadPayload = {
  name?: string;
  email?: string;
  phone?: string;
  source?: string;
  value?: number;
  utm_source?: string;
  utm_campaign?: string;
  external_id?: string;
  raw?: unknown;
};

const isFacebookWebhook = (body: any) => body && typeof body === 'object' && Array.isArray(body.entry);

const jsonResponse = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });

serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    // Facebook Webhook verification handshake (GET)
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      if (mode === 'subscribe' && token && challenge && token === FB_VERIFY_TOKEN) {
        return new Response(challenge, { status: 200, headers: corsHeaders });
      }

      return jsonResponse(400, { ok: false, error: 'invalid webhook verification' });
    }

    if (req.method !== 'POST') return jsonResponse(405, { ok: false, error: 'method not allowed' });

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(500, { ok: false, error: 'missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' });
    }

    if (LEAD_WEBHOOK_SECRET) {
      const provided = req.headers.get('x-webhook-secret') ?? '';
      if (provided !== LEAD_WEBHOOK_SECRET) {
        return jsonResponse(401, { ok: false, error: 'invalid webhook secret' });
      }
    }

    const url = new URL(req.url);
    const companyId = url.searchParams.get('company_id') ?? req.headers.get('x-company-id');
    if (!companyId) return jsonResponse(400, { ok: false, error: 'missing company_id' });

    const body = await req.json().catch(() => null);
    if (!body) return jsonResponse(400, { ok: false, error: 'invalid json' });

    const nowIso = new Date().toISOString();

    // Facebook Lead Ads payload: store leadgen_id as external_id (enrichment can be added later)
    if (isFacebookWebhook(body)) {
      const rows: any[] = [];
      for (const entry of body.entry) {
        const changes: any[] = Array.isArray(entry?.changes) ? entry.changes : [];
        for (const change of changes) {
          const value = change?.value ?? {};
          const leadgenId = value?.leadgen_id;
          if (!leadgenId) continue;

          rows.push({
            company_id: companyId,
            external_id: String(leadgenId),
            name: null,
            email: null,
            phone: null,
            status: 'new',
            source: 'Meta Lead Ads',
            last_interaction_at: nowIso,
            raw: body,
          });
        }
      }

      if (rows.length === 0) return jsonResponse(200, { ok: true, inserted: 0 });

      const { error } = await supabaseAdmin.from('leads').upsert(rows, {
        onConflict: 'company_id,external_id',
        ignoreDuplicates: true,
      });
      if (error) return jsonResponse(500, { ok: false, error: error.message });

      return jsonResponse(200, { ok: true, inserted: rows.length });
    }

    // Generic / Landing Page payload
    const payload = body as DirectLeadPayload;
    const row: any = {
      company_id: companyId,
      external_id: payload.external_id ?? null,
      name: payload.name ?? null,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      status: 'new',
      source: payload.source ?? 'Landing Page',
      utm_source: payload.utm_source ?? null,
      utm_campaign: payload.utm_campaign ?? null,
      value: payload.value ?? null,
      last_interaction_at: nowIso,
      raw: payload.raw ?? body,
    };

    if (row.external_id) {
      const { error } = await supabaseAdmin.from('leads').upsert([row], {
        onConflict: 'company_id,external_id',
      });
      if (error) return jsonResponse(500, { ok: false, error: error.message });
      return jsonResponse(200, { ok: true, inserted: 1 });
    }

    const { error } = await supabaseAdmin.from('leads').insert([row]);
    if (error) return jsonResponse(500, { ok: false, error: error.message });

    return jsonResponse(200, { ok: true, inserted: 1 });
  } catch (e: any) {
    return jsonResponse(500, { ok: false, error: e?.message ?? 'unknown error' });
  }
});

