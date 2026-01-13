// Supabase Edge Function: lead-webhook
// - Recebe leads (Landing Pages / Facebook Lead Ads)
// - Enriquece dados (DDD, Roleta de Leads)
// - Insere em public.leads (usa SERVICE_ROLE para bypass de RLS)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const corsHeaders: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret, x-company-id',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
};

// --- Configuração ---
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const LEAD_WEBHOOK_SECRET = Deno.env.get('LEAD_WEBHOOK_SECRET') ?? '';
const FB_VERIFY_TOKEN = Deno.env.get('FB_VERIFY_TOKEN') ?? '';

// --- Cliente Supabase Admin ---
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// --- Tipos ---
type LeadPayload = {
  company_id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string;
  value?: number | null;
  utm_source?: string | null;
  utm_campaign?: string | null;
  external_id?: string | null;
  raw?: any;
  status?: 'new' | 'contacted' | 'proposal' | 'won' | 'lost';
  last_interaction_at?: string;
  assigned_to?: string | null;
};

// --- Funções de Negócio (Fase 2) ---

/**
 * Enriquecimento de Dados: Busca o estado/cidade pelo DDD do telefone.
 * @param lead - O payload do lead.
 */
async function enrichLead(lead: LeadPayload): Promise<void> {
  if (!lead.phone) return;

  const phone = lead.phone.replace(/\D/g, '');
  if (phone.length < 10) return; // Precisa de pelo menos DDD + numero

  const ddd = phone.substring(0, 2);
  try {
    const res = await fetch(`https://brasilapi.com.br/api/ddd/v1/${ddd}`);
    if (res.ok) {
      const dddInfo = await res.json();
      if (!lead.raw) lead.raw = {};
      lead.raw.ddd_info = {
        state: dddInfo.state,
        cities: dddInfo.cities.slice(0, 5), // Limita para não poluir o JSON
      };
    }
  } catch (error) {
    console.error(`Falha ao enriquecer DDD ${ddd}:`, error.message);
  }
}

/**
 * Distribuição de Leads (Roleta): Associa o lead a um vendedor.
 * A estratégia é pegar o vendedor com menos leads na empresa.
 * @param supabase - Cliente Supabase.
 * @param lead - O payload do lead.
 */
async function assignLead(supabase: SupabaseClient, lead: LeadPayload): Promise<void> {
  try {
    // 1. Buscar vendedores da empresa
    const { data: sellers, error: sellerError } = await supabase
      .from('company_members')
      .select('user_id')
      .eq('company_id', lead.company_id)
      .eq('member_role', 'vendedor');

    if (sellerError) throw sellerError;
    if (!sellers || sellers.length === 0) {
      console.log(`Sem vendedores para a empresa ${lead.company_id}.`);
      return;
    }

    // 2. Encontrar o vendedor com menos leads associados
    // Usamos um RPC para essa lógica ser reusável e eficiente no DB
    const { data: targetSeller, error: rpcError } = await supabase.rpc(
      'get_salesperson_with_fewest_leads',
      { p_company_id: lead.company_id }
    );

    if (rpcError) throw rpcError;

    if (targetSeller) {
      lead.assigned_to = targetSeller;
      if (!lead.raw) lead.raw = {};
      lead.raw.assignment_log = `Assigned to ${targetSeller} via round-robin.`;
    }
  } catch (error) {
    console.error(`Falha na distribuição de leads para a empresa ${lead.company_id}:`, error.message);
  }
}

// --- Helpers ---
const isFacebookWebhook = (body: any) => body && typeof body === 'object' && Array.isArray(body.entry);

const jsonResponse = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });

// --- Handler Principal da Edge Function ---
serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    // Verificação do Facebook (GET)
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

    // A partir daqui, apenas POST
    if (req.method !== 'POST') return jsonResponse(405, { ok: false, error: 'method not allowed' });

    // Validações de Segurança e Configuração
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(500, { ok: false, error: 'missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' });
    }
    if (LEAD_WEBHOOK_SECRET && req.headers.get('x-webhook-secret') !== LEAD_WEBHOOK_SECRET) {
      return jsonResponse(401, { ok: false, error: 'invalid webhook secret' });
    }

    const companyId = new URL(req.url).searchParams.get('company_id') ?? req.headers.get('x-company-id');
    if (!companyId) return jsonResponse(400, { ok: false, error: 'missing company_id' });

    const body = await req.json().catch(() => null);
    if (!body) return jsonResponse(400, { ok: false, error: 'invalid json' });

    const leadsToInsert: LeadPayload[] = [];
    const nowIso = new Date().toISOString();

    // Processa payload do Facebook Lead Ads
    if (isFacebookWebhook(body)) {
      for (const entry of body.entry) {
        for (const change of entry?.changes ?? []) {
          const value = change?.value ?? {};
          const leadgenId = value?.leadgen_id;
          if (!leadgenId) continue;

          // NOTA: O payload real do FB com nome/email/telefone vem via API da Graph.
          // Aqui, apenas registramos o ID. A proxima fase seria buscar os dados completos.
          // Para a Fase 2, vamos simular dados para permitir o fluxo de roleta.
          const lead: LeadPayload = {
            company_id: companyId,
            external_id: String(leadgenId),
            name: `Lead ${String(leadgenId).substring(0, 5)}`,
            email: `lead_${String(leadgenId).substring(0, 5)}@fb.com`,
            phone: `119${Math.floor(Math.random() * 90000000) + 10000000}`,
            status: 'new',
            source: 'Meta Lead Ads',
            last_interaction_at: nowIso,
            raw: body,
          };
          leadsToInsert.push(lead);
        }
      }
    }
    // Processa payload genérico (ex: Landing Page)
    else {
      const lead: LeadPayload = {
        company_id: companyId,
        external_id: body.external_id ?? null,
        name: body.name ?? null,
        email: body.email ?? null,
        phone: body.phone ?? null,
        status: 'new',
        source: body.source ?? 'Landing Page',
        utm_source: body.utm_source ?? null,
        utm_campaign: body.utm_campaign ?? null,
        value: body.value ?? null,
        last_interaction_at: nowIso,
        raw: body.raw ?? body,
      };
      leadsToInsert.push(lead);
    }

    if (leadsToInsert.length === 0) {
      return jsonResponse(200, { ok: true, inserted: 0, message: 'No valid leads found in payload' });
    }

    // --- Executa a lógica da Fase 2 para cada lead ---
    for (const lead of leadsToInsert) {
      await enrichLead(lead);
      await assignLead(supabaseAdmin, lead);
    }

    // --- Insere os leads no banco de dados ---
    const { error } = await supabaseAdmin.from('leads').upsert(leadsToInsert, {
      onConflict: 'company_id, external_id',
      ignoreDuplicates: false, // `false` para garantir que a atualização (roleta) ocorra se o lead já existir
    });

    if (error) {
      console.error('Supabase error:', error);
      return jsonResponse(500, { ok: false, error: error.message });
    }

    return jsonResponse(200, { ok: true, inserted: leadsToInsert.length });
  } catch (e: any) {
    console.error('Unhandled error:', e);
    return jsonResponse(500, { ok: false, error: e?.message ?? 'unknown error' });
  }
});

