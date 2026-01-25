// Supabase Edge Function: lead-webhook
// - Recebe leads (Landing Pages / Facebook Lead Ads)
// - Enriquece dados (DDD via BrasilAPI + normalização de telefone)
// - Distribui automaticamente (roleta) via RPC
// - Insere em public.leads (usa SERVICE_ROLE para bypass de RLS)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

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

type LeadPayload = {
  company_id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string;
  value?: number | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  landing_page_url?: string | null;
  referrer_url?: string | null;
  gclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
  fbclid?: string | null;
  fbc?: string | null;
  fbp?: string | null;
  external_id?: string | null;
  raw?: any;
  status?: 'new' | 'contacted' | 'proposal' | 'won' | 'lost';
  last_interaction_at?: string;
  assigned_to?: string | null;
};

const onlyDigits = (value: string) => value.replace(/\D/g, '');

const toE164BR = (digits: string): string | null => {
  const d = onlyDigits(digits);
  if (!d) return null;
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return `+${d}`;
  if (d.length === 10 || d.length === 11) return `+55${d}`;
  return null;
};

const dddFromDigits = (digits: string): string | null => {
  const d = onlyDigits(digits);
  if (d.startsWith('55') && d.length >= 4) return d.slice(2, 4);
  if (d.length >= 2) return d.slice(0, 2);
  return null;
};

async function enrichLead(lead: LeadPayload): Promise<void> {
  const phone = lead.phone ? String(lead.phone) : '';
  const digits = phone ? onlyDigits(phone) : '';
  const e164 = digits ? toE164BR(digits) : null;

  if (!lead.raw) lead.raw = {};
  lead.raw.phone_meta = {
    digits: digits || null,
    e164,
    valid: digits ? e164 != null : null,
    whatsapp_possible: digits ? e164 != null : null,
  };

  // Padroniza o campo phone para facilitar uso no CRM/WhatsApp futuro
  if (e164) lead.phone = e164;
  else if (digits) lead.phone = digits;

  const ddd = digits ? dddFromDigits(digits) : null;
  if (!ddd) return;

  try {
    const res = await fetch(`https://brasilapi.com.br/api/ddd/v1/${ddd}`);
    if (!res.ok) return;
    const dddInfo: any = await res.json();
    lead.raw.ddd_info = {
      state: dddInfo?.state ?? null,
      cities: Array.isArray(dddInfo?.cities) ? dddInfo.cities.slice(0, 10) : [],
    };
  } catch (error) {
    console.error(`Falha ao enriquecer DDD ${ddd}:`, (error as any)?.message ?? error);
  }
}

async function assignLead(supabase: SupabaseClient, lead: LeadPayload): Promise<void> {
  try {
    const { data: targetSeller, error } = await supabase.rpc('get_salesperson_with_fewest_leads', {
      p_company_id: lead.company_id,
    });
    if (error) throw error;
    if (!targetSeller) return;
    lead.assigned_to = String(targetSeller);
    if (!lead.raw) lead.raw = {};
    lead.raw.assignment_log = `Assigned to ${lead.assigned_to} via round-robin.`;
  } catch (error) {
    console.error(`Falha na distribuição de leads para a empresa ${lead.company_id}:`, (error as any)?.message ?? error);
  }
}

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

    const companyId = new URL(req.url).searchParams.get('company_id') ?? req.headers.get('x-company-id');
    if (!companyId) return jsonResponse(400, { ok: false, error: 'missing company_id' });

    const body = await req.json().catch(() => null);
    if (!body) return jsonResponse(400, { ok: false, error: 'invalid json' });

    const nowIso = new Date().toISOString();
    const leadsToInsert: LeadPayload[] = [];

    // Facebook Lead Ads payload: store leadgen_id as external_id
    if (isFacebookWebhook(body)) {
      for (const entry of body.entry) {
        const changes: any[] = Array.isArray(entry?.changes) ? entry.changes : [];
        for (const change of changes) {
          const value = change?.value ?? {};
          const leadgenId = value?.leadgen_id;
          if (!leadgenId) continue;

          leadsToInsert.push({
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
    } else {
      leadsToInsert.push({
        company_id: companyId,
        external_id: body.external_id ?? null,
        name: body.name ?? null,
        email: body.email ?? null,
        phone: body.phone ?? null,
        status: 'new',
        source: body.source ?? 'Landing Page',
        utm_source: body.utm_source ?? null,
        utm_medium: body.utm_medium ?? null,
        utm_campaign: body.utm_campaign ?? null,
        utm_content: body.utm_content ?? null,
        utm_term: body.utm_term ?? null,
        landing_page_url: body.landing_page_url ?? body.page_url ?? null,
        referrer_url: body.referrer_url ?? null,
        gclid: body.gclid ?? null,
        gbraid: body.gbraid ?? null,
        wbraid: body.wbraid ?? null,
        fbclid: body.fbclid ?? null,
        fbc: body.fbc ?? null,
        fbp: body.fbp ?? null,
        value: body.value ?? null,
        last_interaction_at: nowIso,
        raw: body.raw ?? body,
      });
    }

    if (leadsToInsert.length === 0) return jsonResponse(200, { ok: true, inserted: 0 });

    for (const lead of leadsToInsert) {
      await enrichLead(lead);
      await assignLead(supabaseAdmin, lead);
    }

    const { error } = await supabaseAdmin.from('leads').upsert(leadsToInsert, {
      onConflict: 'company_id,external_id',
      ignoreDuplicates: false,
    });

    if (error) return jsonResponse(500, { ok: false, error: error.message });

    return jsonResponse(200, { ok: true, inserted: leadsToInsert.length });
  } catch (e: any) {
    console.error('Unhandled error:', e);
    return jsonResponse(500, { ok: false, error: e?.message ?? 'unknown error' });
  }
});
