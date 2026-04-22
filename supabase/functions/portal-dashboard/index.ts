import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import {
  corsHeaders,
  createSupabaseAdmin,
  jsonResponse,
  loadDashboardBootstrap,
  loadDashboardData,
  loadDashboardWeekly,
} from '../_shared/clientPortalAnalytics.ts';

serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return jsonResponse(405, { ok: false, error: 'method not allowed' });

    const body = await req.json().catch(() => ({}));
    const section = typeof body?.section === 'string' ? body.section.trim() : 'bootstrap';
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    if (!token) return jsonResponse(400, { ok: false, error: 'token ausente' });

    const supabaseAdmin = createSupabaseAdmin();

    if (section === 'bootstrap') {
      const data = await loadDashboardBootstrap(supabaseAdmin, token);
      return jsonResponse(200, { ok: true, ...data });
    }

    if (section === 'data') {
      const data = await loadDashboardData(
        supabaseAdmin,
        token,
        typeof body?.date_from === 'string' ? body.date_from : undefined,
        typeof body?.date_to === 'string' ? body.date_to : undefined,
        Array.isArray(body?.campaign_ids) ? body.campaign_ids.map((x: unknown) => String(x)) : [],
      );
      return jsonResponse(200, { ok: true, ...data });
    }

    if (section === 'weekly') {
      const data = await loadDashboardWeekly(supabaseAdmin, token);
      return jsonResponse(200, { ok: true, ...data });
    }

    return jsonResponse(400, { ok: false, error: 'section inválida' });
  } catch (err: any) {
    return jsonResponse(400, { ok: false, error: err?.message ?? 'erro interno' });
  }
});
