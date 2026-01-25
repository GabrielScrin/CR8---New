// Supabase Edge Function: whatsapp-templates
// SmartZap-style WhatsApp template sync/catalog for the CR8 WhatsApp module.
//
// Required env:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
//
// WhatsApp Cloud API env:
// - WHATSAPP_ACCESS_TOKEN
// - WHATSAPP_API_VERSION (default: v24.0)
//
// Auth:
// - Requires Authorization: Bearer <supabase_access_token>
// - Enforces company membership; write actions require admin/gestor role

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const corsHeaders: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const WHATSAPP_ACCESS_TOKEN = Deno.env.get('WHATSAPP_ACCESS_TOKEN') ?? '';
const WHATSAPP_API_VERSION = Deno.env.get('WHATSAPP_API_VERSION') ?? 'v24.0';

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

type Action = 'list' | 'sync' | 'create_in_meta';

type Body =
  | { action: 'list'; company_id: string; q?: string }
  | { action: 'sync'; company_id: string }
  | {
      action: 'create_in_meta';
      company_id: string;
      template: {
        name: string;
        language?: string;
        category?: string;
        components: unknown;
      };
    };

async function assertAuth(req: Request) {
  const accessToken = extractAccessToken(req);
  if (!accessToken) throw Object.assign(new Error('missing bearer token'), { status: 401 });

  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data?.user?.id) throw Object.assign(new Error('invalid token'), { status: 401 });

  return { accessToken, userId: data.user.id };
}

async function assertCompanyMember(companyId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from('company_members')
    .select('company_id, member_role')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error('forbidden'), { status: 403 });
  return { memberRole: String((data as any).member_role || 'gestor') };
}

async function getUserRole(userId: string): Promise<string> {
  const { data } = await supabaseAdmin.from('users').select('role').eq('id', userId).maybeSingle();
  return String((data as any)?.role || 'gestor');
}

async function loadCompanyWhatsapp(companyId: string) {
  const { data, error } = await supabaseAdmin
    .from('companies')
    .select('id, whatsapp_waba_id')
    .eq('id', companyId)
    .maybeSingle();
  if (error) throw error;
  return {
    wabaId: (data as any)?.whatsapp_waba_id ? String((data as any).whatsapp_waba_id) : null,
  };
}

async function fetchAllTemplatesFromMeta(wabaId: string) {
  if (!WHATSAPP_ACCESS_TOKEN) throw Object.assign(new Error('missing WHATSAPP_ACCESS_TOKEN (supabase secrets)'), { status: 500 });

  const all: any[] = [];
  let url: string | null = `https://graph.facebook.com/${encodeURIComponent(WHATSAPP_API_VERSION)}/${encodeURIComponent(
    wabaId
  )}/message_templates?fields=name,language,category,status,components,quality_score,parameter_format,last_updated_time&limit=100`;

  for (let i = 0; i < 25 && url; i++) {
    const res = await fetch(url, { headers: { authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` } });
    const text = await res.text().catch(() => '');
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { raw: text };
    }
    if (!res.ok) {
      throw Object.assign(new Error(`meta_error_${res.status}: ${text}`), { status: 502, meta: payload });
    }

    const data = Array.isArray(payload?.data) ? payload.data : [];
    all.push(...data);
    const next = payload?.paging?.next;
    url = typeof next === 'string' && next.trim() ? next.trim() : null;
  }

  return all;
}

serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return jsonResponse(405, { ok: false, error: 'method not allowed' });

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(500, { ok: false, error: 'missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' });
    }

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body || !body.action) return jsonResponse(400, { ok: false, error: 'invalid json' });

    const { userId } = await assertAuth(req);

    const companyId = (body as any).company_id;
    if (!companyId) return jsonResponse(400, { ok: false, error: 'missing company_id' });
    await assertCompanyMember(companyId, userId);

    const userRole = await getUserRole(userId);
    const canManage = userRole === 'admin' || userRole === 'gestor';

    if (body.action === 'list') {
      const q = String((body as any).q || '').trim().toLowerCase();
      let query = supabaseAdmin
        .from('whatsapp_templates')
        .select('id, company_id, waba_id, name, language, category, status, quality_score, parameter_format, components, updated_at, last_synced_at')
        .eq('company_id', companyId)
        .order('name', { ascending: true })
        .limit(500);
      if (q) query = query.ilike('name', `%${q}%`);

      const { data, error } = await query;
      if (error) return jsonResponse(500, { ok: false, error: error.message });
      return jsonResponse(200, { ok: true, items: data ?? [] });
    }

    if (!canManage) return jsonResponse(403, { ok: false, error: 'forbidden' });

    if (body.action === 'sync') {
      const { wabaId } = await loadCompanyWhatsapp(companyId);
      if (!wabaId) return jsonResponse(400, { ok: false, error: 'missing companies.whatsapp_waba_id' });

      const templates = await fetchAllTemplatesFromMeta(wabaId);
      const nowIso = new Date().toISOString();

      const rows = templates
        .filter((t) => t && t.name)
        .map((t) => {
          const pf = String(t.parameter_format || '').toLowerCase() === 'named' ? 'named' : 'positional';
          return {
            company_id: companyId,
            waba_id: wabaId,
            name: String(t.name),
            language: String(t.language || 'pt_BR'),
            category: t.category ? String(t.category) : null,
            status: t.status ? String(t.status) : null,
            quality_score: t.quality_score ? String(t.quality_score) : null,
            parameter_format: pf,
            components: Array.isArray(t.components) ? t.components : [],
            raw: t,
            last_synced_at: nowIso,
          };
        });

      if (rows.length === 0) {
        return jsonResponse(200, { ok: true, synced: 0 });
      }

      const { error } = await supabaseAdmin.from('whatsapp_templates').upsert(rows as any, {
        onConflict: 'company_id,name,language',
      });
      if (error) return jsonResponse(500, { ok: false, error: error.message });

      return jsonResponse(200, { ok: true, synced: rows.length });
    }

    if (body.action === 'create_in_meta') {
      const { wabaId } = await loadCompanyWhatsapp(companyId);
      if (!wabaId) return jsonResponse(400, { ok: false, error: 'missing companies.whatsapp_waba_id' });
      if (!WHATSAPP_ACCESS_TOKEN) return jsonResponse(500, { ok: false, error: 'missing WHATSAPP_ACCESS_TOKEN (supabase secrets)' });

      const tpl = (body as any).template ?? {};
      const name = String(tpl.name || '').trim();
      if (!name) return jsonResponse(400, { ok: false, error: 'missing template.name' });
      const language = String(tpl.language || 'pt_BR').trim() || 'pt_BR';
      const category = String(tpl.category || 'UTILITY').trim() || 'UTILITY';
      const components = tpl.components;
      if (!Array.isArray(components)) return jsonResponse(400, { ok: false, error: 'template.components must be an array' });

      const url = `https://graph.facebook.com/${encodeURIComponent(WHATSAPP_API_VERSION)}/${encodeURIComponent(wabaId)}/message_templates`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` },
        body: JSON.stringify({
          name,
          language,
          category,
          components,
        }),
      });
      const text = await res.text().catch(() => '');
      if (!res.ok) return jsonResponse(502, { ok: false, error: `meta_error_${res.status}`, details: text });

      // Best-effort: trigger a sync so the cache gets updated
      try {
        const templates = await fetchAllTemplatesFromMeta(wabaId);
        const match = templates.find((t) => String(t?.name) === name && String(t?.language || 'pt_BR') === language);
        if (match) {
          const nowIso = new Date().toISOString();
          const pf = String(match.parameter_format || '').toLowerCase() === 'named' ? 'named' : 'positional';
          await supabaseAdmin.from('whatsapp_templates').upsert(
            [
              {
                company_id: companyId,
                waba_id: wabaId,
                name,
                language,
                category: match.category ? String(match.category) : null,
                status: match.status ? String(match.status) : null,
                quality_score: match.quality_score ? String(match.quality_score) : null,
                parameter_format: pf,
                components: Array.isArray(match.components) ? match.components : [],
                raw: match,
                last_synced_at: nowIso,
              },
            ] as any,
            { onConflict: 'company_id,name,language' }
          );
        }
      } catch {
        // ignore
      }

      return jsonResponse(200, { ok: true });
    }

    return jsonResponse(400, { ok: false, error: `unknown action: ${(body as any).action}` });
  } catch (e: any) {
    const status = typeof e?.status === 'number' ? e.status : 500;
    return jsonResponse(status, { ok: false, error: e?.message ?? 'unknown error' });
  }
});

