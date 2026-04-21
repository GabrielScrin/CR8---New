import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import {
  corsHeaders,
  createSupabaseAdmin,
  jsonResponse,
  loadPortalBootstrap,
  loadPortalOverview,
  loadPortalWeeklyDetail,
  loadPortalWeeklyList,
} from '../_shared/clientPortalAnalytics.ts';

serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return jsonResponse(405, { ok: false, error: 'method not allowed' });

    const body = await req.json().catch(() => ({}));
    const section = typeof body?.section === 'string' ? body.section.trim() : 'bootstrap';
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    if (!token) return jsonResponse(400, { ok: false, error: 'missing token' });

    const supabaseAdmin = createSupabaseAdmin();

    if (section === 'bootstrap') {
      const payload = await loadPortalBootstrap(
        supabaseAdmin,
        token,
        typeof body?.company_id === 'string' ? body.company_id.trim() : null,
      );
      return jsonResponse(200, { ok: true, ...payload });
    }

    if (section === 'overview') {
      const companyId = typeof body?.company_id === 'string' ? body.company_id.trim() : '';
      if (!companyId) return jsonResponse(400, { ok: false, error: 'missing company_id' });

      const payload = await loadPortalOverview(supabaseAdmin, {
        token,
        companyId,
        dateFrom: typeof body?.date_from === 'string' ? body.date_from.trim() : undefined,
        dateTo: typeof body?.date_to === 'string' ? body.date_to.trim() : undefined,
        campaignIds: Array.isArray(body?.campaign_ids) ? body.campaign_ids.map((item: unknown) => String(item)) : [],
      });

      return jsonResponse(200, { ok: true, ...payload });
    }

    if (section === 'weekly_list') {
      const companyId = typeof body?.company_id === 'string' ? body.company_id.trim() : '';
      if (!companyId) return jsonResponse(400, { ok: false, error: 'missing company_id' });
      const payload = await loadPortalWeeklyList(supabaseAdmin, token, companyId);
      return jsonResponse(200, { ok: true, ...payload });
    }

    if (section === 'weekly_detail') {
      const companyId = typeof body?.company_id === 'string' ? body.company_id.trim() : '';
      const reportId = typeof body?.report_id === 'string' ? body.report_id.trim() : '';
      if (!companyId) return jsonResponse(400, { ok: false, error: 'missing company_id' });
      if (!reportId) return jsonResponse(400, { ok: false, error: 'missing report_id' });

      const report = await loadPortalWeeklyDetail(supabaseAdmin, token, companyId, reportId);
      return jsonResponse(200, { ok: true, report });
    }

    return jsonResponse(400, { ok: false, error: 'unknown section' });
  } catch (error: any) {
    return jsonResponse(400, { ok: false, error: error?.message ?? 'unknown error' });
  }
});
