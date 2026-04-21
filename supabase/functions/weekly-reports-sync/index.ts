import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import {
  corsHeaders,
  createSupabaseAdmin,
  jsonResponse,
  lastCompletedWeekRange,
  listCompaniesForWeeklySync,
  upsertWeeklyReport,
} from '../_shared/clientPortalAnalytics.ts';

const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';

const extractBearerToken = (authorizationHeader: string | null): string | null => {
  if (!authorizationHeader) return null;
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1]?.split(',')[0]?.trim();
  return token ? token : null;
};

const parseDateInput = (value: unknown) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
};

serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return jsonResponse(405, { ok: false, error: 'method not allowed' });

    const suppliedSecret = req.headers.get('x-cron-secret') ?? '';
    const hasCronAccess = Boolean(CRON_SECRET) && suppliedSecret === CRON_SECRET;
    const supabaseAdmin = createSupabaseAdmin();
    const body = await req.json().catch(() => ({}));

    const requestedCompanyId = typeof body?.company_id === 'string' ? body.company_id.trim() : '';
    const periodStart = parseDateInput(body?.period_start);
    const periodEnd = parseDateInput(body?.period_end);
    const range = periodStart && periodEnd ? { periodStart, periodEnd } : lastCompletedWeekRange();

    if (requestedCompanyId) {
      if (!hasCronAccess) {
        const bearer = extractBearerToken(req.headers.get('authorization')) ?? extractBearerToken(req.headers.get('Authorization'));
        if (!bearer) return jsonResponse(401, { ok: false, error: 'missing auth' });

        const userResult = await supabaseAdmin.auth.getUser(bearer);
        const userId = userResult.data.user?.id;
        if (userResult.error || !userId) return jsonResponse(401, { ok: false, error: 'invalid auth' });

        const { data: membership, error: membershipError } = await supabaseAdmin
          .from('company_members')
          .select('member_role')
          .eq('company_id', requestedCompanyId)
          .eq('user_id', userId)
          .maybeSingle();

        if (membershipError) return jsonResponse(500, { ok: false, error: membershipError.message });
        const role = String((membership as any)?.member_role ?? '');
        if (role !== 'admin' && role !== 'gestor') {
          return jsonResponse(403, { ok: false, error: 'forbidden' });
        }
      }

      const report = await upsertWeeklyReport(supabaseAdmin, requestedCompanyId, range.periodStart, range.periodEnd);
      return jsonResponse(200, {
        ok: true,
        mode: 'single',
        company_id: requestedCompanyId,
        period_start: range.periodStart,
        period_end: range.periodEnd,
        report_id: report.id,
      });
    }

    if (!hasCronAccess) {
      return jsonResponse(401, { ok: false, error: 'cron secret required for run_all' });
    }

    const companies = await listCompaniesForWeeklySync(supabaseAdmin);
    const results: Array<{ company_id: string; ok: boolean; report_id?: string; error?: string }> = [];

    for (const companyId of companies) {
      try {
        const report = await upsertWeeklyReport(supabaseAdmin, companyId, range.periodStart, range.periodEnd);
        results.push({ company_id: companyId, ok: true, report_id: report.id });
      } catch (error: any) {
        results.push({ company_id: companyId, ok: false, error: error?.message ?? 'unknown error' });
      }
    }

    return jsonResponse(200, {
      ok: true,
      mode: 'all',
      period_start: range.periodStart,
      period_end: range.periodEnd,
      results,
    });
  } catch (error: any) {
    return jsonResponse(500, { ok: false, error: error?.message ?? 'unknown error' });
  }
});
