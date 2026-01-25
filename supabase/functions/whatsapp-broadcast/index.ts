// Supabase Edge Function: whatsapp-broadcast
// SmartZap-style bulk sends for WhatsApp Cloud API (Meta).
//
// Features:
// - Create campaigns + recipients
// - Run batches (throttled) server-side
// - Writes to chats/chat_messages so LiveChat can display it
// - Updates whatsapp_campaign_recipients with provider ids/status
//
// Required env:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
//
// WhatsApp Cloud API env:
// - WHATSAPP_ACCESS_TOKEN
// - WHATSAPP_API_VERSION (default: v20.0)
// - WHATSAPP_PHONE_NUMBER_ID (fallback if companies.whatsapp_phone_number_id is null)
//
// Auth:
// - Requires a valid Supabase user session (Authorization: Bearer <access_token>)
// - User must be member of the company (company_members)

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
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '';
const WHATSAPP_API_VERSION = Deno.env.get('WHATSAPP_API_VERSION') ?? 'v20.0';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const jsonResponse = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });

const normalizePhone = (value: string): string => String(value || '').replace(/\D/g, '');

const isProbablyValidE164Digits = (digitsOnly: string): boolean => {
  const v = normalizePhone(digitsOnly);
  // Best-effort: accept 10-15 digits (E.164 max is 15). Reject empty/short values.
  return v.length >= 10 && v.length <= 15;
};

const extractBearerToken = (authorizationHeader: string | null): string | null => {
  if (!authorizationHeader) return null;
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1]?.split(',')[0]?.trim();
  return token ? token : null;
};

const extractAccessToken = (req: Request): string | null => {
  return (
    extractBearerToken(req.headers.get('authorization')) ??
    extractBearerToken(req.headers.get('Authorization')) ??
    null
  );
};

type CampaignMessageKind = 'text' | 'template';
type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'paused' | 'completed' | 'failed' | 'cancelled';
type RecipientStatus = 'pending' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'skipped';

type CreateCampaignBody = {
  action: 'create';
  company_id: string;
  name: string;
  message_kind?: CampaignMessageKind;
  text_body?: string;
  template_name?: string;
  template_language?: string;
  template_components?: unknown;
  recipients?: Array<{ phone: string; name?: string | null; lead_id?: string | null }>;
};

type RunCampaignBody = {
  action: 'run';
  campaign_id: string;
  batch_size?: number;
  delay_ms?: number;
};

type PrecheckCampaignBody = {
  action: 'precheck';
  campaign_id: string;
};

type RequeueCampaignBody = {
  action: 'requeue';
  campaign_id: string;
  statuses?: RecipientStatus[];
};

type CancelCampaignBody = {
  action: 'cancel';
  campaign_id: string;
};

type RequestBody = CreateCampaignBody | RunCampaignBody | PrecheckCampaignBody | RequeueCampaignBody | CancelCampaignBody;

const renderText = (template: string, vars: Record<string, string>) => {
  let out = String(template ?? '');
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{{${k}}}`, v);
  }
  return out;
};

const deepRender = (value: unknown, vars: Record<string, string>): unknown => {
  if (typeof value === 'string') return renderText(value, vars);
  if (Array.isArray(value)) return value.map((v) => deepRender(v, vars));
  if (value && typeof value === 'object') {
    const out: any = Array.isArray(value) ? [] : {};
    for (const [k, v] of Object.entries(value as any)) {
      out[k] = deepRender(v, vars);
    }
    return out;
  }
  return value;
};

const renderTemplateComponents = (components: unknown, vars: Record<string, string>): unknown => {
  if (!Array.isArray(components)) return components;
  // SmartZap parity: allow {{name}}/{{phone}} replacements not only for text parameters,
  // but also nested template fields (document.filename, media links, button params, etc).
  return (components as any[]).map((c) => deepRender(c, vars));
};

const canManageRole = (memberRole: string) => memberRole === 'admin' || memberRole === 'gestor';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sendWhatsAppMessage(params: {
  phoneNumberId: string;
  to: string;
  kind: CampaignMessageKind;
  textBody?: string;
  templateName?: string;
  templateLanguage?: string;
  templateComponents?: unknown;
}) {
  if (!WHATSAPP_ACCESS_TOKEN || !params.phoneNumberId) return { ok: false, skipped: true, reason: 'missing WHATSAPP_ACCESS_TOKEN/phone_number_id' };

  const to = normalizePhone(params.to);
  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${encodeURIComponent(params.phoneNumberId)}/messages`;

  let body: any;
  if (params.kind === 'template') {
    if (!params.templateName || !params.templateLanguage) {
      return { ok: false, status: 400, body: 'missing template_name/template_language' };
    }
    body = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: params.templateName,
        language: { code: params.templateLanguage },
        components: Array.isArray(params.templateComponents) ? params.templateComponents : undefined,
      },
    };
  } else {
    body = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: String(params.textBody ?? '') },
    };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` },
    body: JSON.stringify(body),
  });

  const payloadText = await res.text().catch(() => '');
  if (!res.ok) return { ok: false, status: res.status, body: payloadText };
  return { ok: true, body: payloadText };
}

const extractWhatsAppMessageId = (providerBodyText: string): string | null => {
  const raw = String(providerBodyText || '').trim();
  if (!raw) return null;
  try {
    const json = JSON.parse(raw);
    const id = json?.messages?.[0]?.id;
    return typeof id === 'string' && id.trim() ? id.trim() : null;
  } catch {
    return null;
  }
};

async function requireUser(req: Request) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  const token = extractAccessToken(req);
  if (!token) return { ok: false as const, status: 401, payload: { ok: false, error: 'missing authorization' } };
  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError) return { ok: false as const, status: 401, payload: { ok: false, error: authError.message } };
  const userId = authData?.user?.id;
  if (!userId) return { ok: false as const, status: 401, payload: { ok: false, error: 'invalid session' } };
  return { ok: true as const, userId, token };
}

async function requireMembership(companyId: string, userId: string) {
  const { data: membership, error } = await supabaseAdmin
    .from('company_members')
    .select('user_id,member_role')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { ok: false as const, status: 500, payload: { ok: false, error: error.message } };
  if (!membership) return { ok: false as const, status: 403, payload: { ok: false, error: 'forbidden' } };
  return { ok: true as const, memberRole: String((membership as any).member_role || '') };
}

async function insertTraceEvent(params: {
  campaignId: string;
  companyId: string;
  userId: string;
  step: string;
  ok: boolean;
  recipientId?: string;
  chatId?: string;
  httpStatus?: number | null;
  message?: string | null;
  raw?: unknown;
}) {
  try {
    await supabaseAdmin.from('whatsapp_campaign_trace_events').insert([
      {
        campaign_id: params.campaignId,
        company_id: params.companyId,
        recipient_id: params.recipientId ?? null,
        chat_id: params.chatId ?? null,
        step: params.step,
        ok: params.ok,
        http_status: params.httpStatus ?? null,
        message: params.message ?? null,
        raw: params.raw ?? null,
        created_by: params.userId,
      },
    ] as any);
  } catch {
    // best-effort
  }
}

serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return jsonResponse(405, { ok: false, error: 'method not allowed' });

    const auth = await requireUser(req);
    if (!auth.ok) return jsonResponse(auth.status, auth.payload);

    const body = (await req.json().catch(() => null)) as RequestBody | null;
    if (!body?.action) return jsonResponse(400, { ok: false, error: 'missing action' });

    const nowIso = new Date().toISOString();

    if (body.action === 'create') {
      const companyId = String(body.company_id || '').trim();
      if (!companyId) return jsonResponse(400, { ok: false, error: 'missing company_id' });
      if (!String(body.name || '').trim()) return jsonResponse(400, { ok: false, error: 'missing name' });

      const member = await requireMembership(companyId, auth.userId);
      if (!member.ok) return jsonResponse(member.status, member.payload);
      if (!canManageRole(member.memberRole)) return jsonResponse(403, { ok: false, error: 'forbidden' });

      const messageKind: CampaignMessageKind = (body.message_kind as any) === 'template' ? 'template' : 'text';
      const insertCampaign: any = {
        company_id: companyId,
        name: String(body.name).trim(),
        status: 'draft' as CampaignStatus,
        message_kind: messageKind,
        text_body: body.text_body ?? null,
        template_name: body.template_name ?? null,
        template_language: body.template_language ?? null,
        template_components: body.template_components ?? null,
        created_by: auth.userId,
        created_at: nowIso,
        updated_at: nowIso,
      };

      const { data: campaign, error: campaignErr } = await supabaseAdmin
        .from('whatsapp_campaigns')
        .insert([insertCampaign])
        .select('id,company_id,name,status,message_kind')
        .maybeSingle();
      if (campaignErr) return jsonResponse(500, { ok: false, error: campaignErr.message });
      if (!campaign?.id) return jsonResponse(500, { ok: false, error: 'failed to create campaign' });

      const recipients = Array.isArray(body.recipients) ? body.recipients : [];
      if (recipients.length > 0) {
        const rows = recipients
          .map((r) => ({
            campaign_id: campaign.id,
            company_id: companyId,
            lead_id: r.lead_id ?? null,
            phone: normalizePhone(r.phone),
            name: r.name ?? null,
            status: 'pending' as RecipientStatus,
            raw: { source: 'manual' },
          }))
          .filter((r) => Boolean(r.phone));

        if (rows.length > 0) {
          const { error: recErr } = await supabaseAdmin.from('whatsapp_campaign_recipients').upsert(rows as any, {
            onConflict: 'campaign_id,phone',
          });
          if (recErr) return jsonResponse(500, { ok: false, error: recErr.message });
        }
      }

      return jsonResponse(200, { ok: true, campaign_id: campaign.id });
    }

    if (body.action === 'precheck') {
      const campaignId = String((body as PrecheckCampaignBody).campaign_id || '').trim();
      if (!campaignId) return jsonResponse(400, { ok: false, error: 'missing campaign_id' });

      const { data: campaign, error: campaignErr } = await supabaseAdmin
        .from('whatsapp_campaigns')
        .select('id,company_id,message_kind')
        .eq('id', campaignId)
        .maybeSingle();
      if (campaignErr) return jsonResponse(500, { ok: false, error: campaignErr.message });
      if (!campaign) return jsonResponse(404, { ok: false, error: 'campaign not found' });

      const companyId = String((campaign as any).company_id);
      const member = await requireMembership(companyId, auth.userId);
      if (!member.ok) return jsonResponse(member.status, member.payload);

      const { count: pendingCount } = await supabaseAdmin
        .from('whatsapp_campaign_recipients')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .eq('company_id', companyId)
        .eq('status', 'pending');

      const { count: failedCount } = await supabaseAdmin
        .from('whatsapp_campaign_recipients')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .eq('company_id', companyId)
        .eq('status', 'failed');

      const { count: skippedCount } = await supabaseAdmin
        .from('whatsapp_campaign_recipients')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .eq('company_id', companyId)
        .eq('status', 'skipped');

      // Best-effort opt-out check over a limited sample of pending recipients (keeps payload small).
      const sampleLimit = 1000;
      const { data: sample, error: sampleErr } = await supabaseAdmin
        .from('whatsapp_campaign_recipients')
        .select('phone')
        .eq('campaign_id', campaignId)
        .eq('company_id', companyId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(sampleLimit);
      if (sampleErr) return jsonResponse(500, { ok: false, error: sampleErr.message });

      const phones = (sample ?? []).map((r: any) => normalizePhone(String(r?.phone ?? ''))).filter(Boolean);
      let optOutHits = 0;
      if (phones.length > 0) {
        const { data: suppressions, error: supErr } = await supabaseAdmin
          .from('whatsapp_phone_suppressions')
          .select('phone')
          .eq('company_id', companyId)
          .in('phone', phones);
        if (supErr) return jsonResponse(500, { ok: false, error: supErr.message });
        optOutHits = (suppressions ?? []).length;
      }

      return jsonResponse(200, {
        ok: true,
        campaign_id: campaignId,
        message_kind: (campaign as any).message_kind,
        totals: {
          pending: Number(pendingCount ?? 0),
          failed: Number(failedCount ?? 0),
          skipped: Number(skippedCount ?? 0),
        },
        opt_out: {
          checked: phones.length,
          hits: optOutHits,
          limit: sampleLimit,
        },
      });
    }

    if (body.action === 'requeue') {
      const campaignId = String((body as RequeueCampaignBody).campaign_id || '').trim();
      if (!campaignId) return jsonResponse(400, { ok: false, error: 'missing campaign_id' });

      const { data: campaign, error: campErr } = await supabaseAdmin
        .from('whatsapp_campaigns')
        .select('id,company_id')
        .eq('id', campaignId)
        .maybeSingle();
      if (campErr) return jsonResponse(500, { ok: false, error: campErr.message });
      if (!campaign) return jsonResponse(404, { ok: false, error: 'campaign not found' });

      const companyId = String((campaign as any).company_id);
      const member = await requireMembership(companyId, auth.userId);
      if (!member.ok) return jsonResponse(member.status, member.payload);
      if (!canManageRole(member.memberRole)) return jsonResponse(403, { ok: false, error: 'forbidden' });

      const statuses = Array.isArray((body as RequeueCampaignBody).statuses) && (body as RequeueCampaignBody).statuses!.length > 0
        ? (body as RequeueCampaignBody).statuses!
        : (['failed', 'skipped'] as RecipientStatus[]);

      const { data: updated, error: updErr } = await supabaseAdmin
        .from('whatsapp_campaign_recipients')
        .update({
          status: 'pending' as RecipientStatus,
          error: null,
          external_message_id: null,
          sending_at: null,
          updated_at: nowIso,
        })
        .eq('campaign_id', campaignId)
        .eq('company_id', companyId)
        .in('status', statuses as any)
        .select('id');
      if (updErr) return jsonResponse(500, { ok: false, error: updErr.message });

      return jsonResponse(200, { ok: true, requeued: (updated ?? []).length });
    }

    if (body.action === 'cancel') {
      const campaignId = String((body as CancelCampaignBody).campaign_id || '').trim();
      if (!campaignId) return jsonResponse(400, { ok: false, error: 'missing campaign_id' });

      const { data: campaign, error: campErr } = await supabaseAdmin
        .from('whatsapp_campaigns')
        .select('id,company_id,status')
        .eq('id', campaignId)
        .maybeSingle();
      if (campErr) return jsonResponse(500, { ok: false, error: campErr.message });
      if (!campaign) return jsonResponse(404, { ok: false, error: 'campaign not found' });

      const member = await requireMembership(String((campaign as any).company_id), auth.userId);
      if (!member.ok) return jsonResponse(member.status, member.payload);
      if (!canManageRole(member.memberRole)) return jsonResponse(403, { ok: false, error: 'forbidden' });

      const { error: updErr } = await supabaseAdmin
        .from('whatsapp_campaigns')
        .update({ status: 'cancelled' as CampaignStatus, cancelled_at: nowIso })
        .eq('id', campaignId);
      if (updErr) return jsonResponse(500, { ok: false, error: updErr.message });
      return jsonResponse(200, { ok: true });
    }

    // run
    const runBody = body as RunCampaignBody;
    const campaignId = String(runBody.campaign_id || '').trim();
    if (!campaignId) return jsonResponse(400, { ok: false, error: 'missing campaign_id' });

    const batchSize = Math.min(200, Math.max(1, Number(runBody.batch_size ?? 25)));
    const delayMs = Math.min(1500, Math.max(0, Number(runBody.delay_ms ?? 150)));

    const { data: campaign, error: campaignErr } = await supabaseAdmin
      .from('whatsapp_campaigns')
      .select('id,company_id,name,status,message_kind,text_body,template_name,template_language,template_components,started_at,completed_at')
      .eq('id', campaignId)
      .maybeSingle();
    if (campaignErr) return jsonResponse(500, { ok: false, error: campaignErr.message });
    if (!campaign) return jsonResponse(404, { ok: false, error: 'campaign not found' });

    const companyId = String((campaign as any).company_id);
    const member = await requireMembership(companyId, auth.userId);
    if (!member.ok) return jsonResponse(member.status, member.payload);
    if (!canManageRole(member.memberRole)) return jsonResponse(403, { ok: false, error: 'forbidden' });

    if ((campaign as any).status === 'cancelled') return jsonResponse(400, { ok: false, error: 'campaign cancelled' });

    // Ensure started_at / status=sending on first run
    if (!campaign.started_at || (campaign as any).status === 'draft' || (campaign as any).status === 'scheduled' || (campaign as any).status === 'paused') {
      await supabaseAdmin
        .from('whatsapp_campaigns')
        .update({ status: 'sending' as CampaignStatus, started_at: campaign.started_at ?? nowIso })
        .eq('id', campaignId);
    }

    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .select('whatsapp_phone_number_id')
      .eq('id', companyId)
      .maybeSingle();
    if (companyError) return jsonResponse(500, { ok: false, error: companyError.message });

    const phoneNumberId = String((company as any)?.whatsapp_phone_number_id || WHATSAPP_PHONE_NUMBER_ID || '');
    if (!phoneNumberId) {
      return jsonResponse(500, { ok: false, error: 'missing companies.whatsapp_phone_number_id (or WHATSAPP_PHONE_NUMBER_ID env)' });
    }

    const { data: recipients, error: recErr } = await supabaseAdmin
      .from('whatsapp_campaign_recipients')
      .select('id,phone,name,lead_id,chat_id,status')
      .eq('campaign_id', campaignId)
      .eq('company_id', companyId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(batchSize);
    if (recErr) return jsonResponse(500, { ok: false, error: recErr.message });

    const list = (recipients ?? []) as any[];
    if (list.length === 0) {
      // Mark completed if no more pending and not already completed.
      const { data: pendingLeft } = await supabaseAdmin
        .from('whatsapp_campaign_recipients')
        .select('id')
        .eq('campaign_id', campaignId)
        .eq('company_id', companyId)
        .in('status', ['pending', 'sending'])
        .limit(1);

      if (!pendingLeft || pendingLeft.length === 0) {
        await supabaseAdmin
          .from('whatsapp_campaigns')
          .update({ status: 'completed' as CampaignStatus, completed_at: (campaign as any).completed_at ?? nowIso })
          .eq('id', campaignId);
      }
      return jsonResponse(200, { ok: true, processed: 0, done: true });
    }

    // Suppressions / opt-out: fetch all phones for this batch in a single query (SmartZap-style)
    const phonesInBatch = Array.from(
      new Set(list.map((r) => normalizePhone(String(r?.phone ?? ''))).filter(Boolean))
    );
    let suppressedPhones = new Set<string>();
    if (phonesInBatch.length > 0) {
      const { data: suppressions, error: supErr } = await supabaseAdmin
        .from('whatsapp_phone_suppressions')
        .select('phone')
        .eq('company_id', companyId)
        .in('phone', phonesInBatch);
      if (supErr) return jsonResponse(500, { ok: false, error: supErr.message });
      suppressedPhones = new Set((suppressions ?? []).map((s: any) => normalizePhone(String(s?.phone ?? ''))).filter(Boolean));
    }

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const r of list) {
      const recipientId = String(r.id);
      const phone = normalizePhone(r.phone);
      const name = r.name ? String(r.name) : '';
      if (!phone || !isProbablyValidE164Digits(phone)) {
        await supabaseAdmin
          .from('whatsapp_campaign_recipients')
          .update({ status: 'skipped' as RecipientStatus, skipped_at: nowIso, error: 'invalid_phone' })
          .eq('id', recipientId);
        await insertTraceEvent({
          campaignId,
          companyId,
          userId: auth.userId,
          recipientId,
          step: 'skip_invalid_phone',
          ok: false,
          message: 'invalid_phone',
          raw: { phone },
        });
        skipped += 1;
        continue;
      }

      if (suppressedPhones.has(phone)) {
        await supabaseAdmin
          .from('whatsapp_campaign_recipients')
          .update({ status: 'skipped' as RecipientStatus, skipped_at: nowIso, error: 'opt_out' })
          .eq('id', recipientId);
        await insertTraceEvent({
          campaignId,
          companyId,
          userId: auth.userId,
          recipientId,
          step: 'skip_opt_out',
          ok: false,
          message: 'opt_out',
          raw: { phone },
        });
        skipped += 1;
        continue;
      }

      await supabaseAdmin
        .from('whatsapp_campaign_recipients')
        .update({ status: 'sending' as RecipientStatus, sending_at: nowIso })
        .eq('id', recipientId);

      await insertTraceEvent({
        campaignId,
        companyId,
        userId: auth.userId,
        recipientId,
        step: 'recipient_sending',
        ok: true,
      });

      // Upsert chat for this phone
      const { data: chat, error: chatErr } = await supabaseAdmin
        .from('chats')
        .upsert(
          [
            {
              company_id: companyId,
              platform: 'whatsapp',
              external_thread_id: phone,
              last_message: null,
              last_message_at: null,
              raw: { contact_name: name || null, from: phone },
            },
          ] as any,
          { onConflict: 'company_id,platform,external_thread_id' }
        )
        .select('id')
        .maybeSingle();
      if (chatErr || !chat?.id) {
        await supabaseAdmin
          .from('whatsapp_campaign_recipients')
          .update({ status: 'failed' as RecipientStatus, failed_at: nowIso, error: chatErr?.message ?? 'failed to upsert chat' })
          .eq('id', recipientId);
        await insertTraceEvent({
          campaignId,
          companyId,
          userId: auth.userId,
          recipientId,
          step: 'chat_upsert_failed',
          ok: false,
          message: chatErr?.message ?? 'failed_to_upsert_chat',
        });
        failed += 1;
        continue;
      }

      const vars = { name: name || 'Cliente', phone };
      const campaignKind = ((campaign as any).message_kind as CampaignMessageKind) || 'text';
      const textBody = campaignKind === 'text' ? renderText(String((campaign as any).text_body ?? ''), vars) : undefined;
      const renderedTemplateComponents =
        campaignKind === 'template' ? renderTemplateComponents((campaign as any).template_components ?? undefined, vars) : undefined;

      const messageContent =
        campaignKind === 'template'
          ? `[Template] ${(campaign as any).template_name ?? ''}`
          : String(textBody ?? '');

      // Insert message row first (keeps inbox consistent even if provider fails)
      const { data: msg, error: msgErr } = await supabaseAdmin
        .from('chat_messages')
        .insert(
          [
            {
              chat_id: chat.id,
              sender: 'agent',
              content: messageContent,
              delivery_status: 'pending',
              raw: { outbound: true, user_id: auth.userId, campaign_id: campaignId, campaign_recipient_id: recipientId },
              created_at: nowIso,
            },
          ] as any
        )
        .select('id')
        .maybeSingle();
      if (msgErr || !msg?.id) {
        await supabaseAdmin
          .from('whatsapp_campaign_recipients')
          .update({ status: 'failed' as RecipientStatus, failed_at: nowIso, chat_id: chat.id, error: msgErr?.message ?? 'failed to insert message' })
          .eq('id', recipientId);
        await insertTraceEvent({
          campaignId,
          companyId,
          userId: auth.userId,
          recipientId,
          chatId: chat.id,
          step: 'insert_message_failed',
          ok: false,
          message: msgErr?.message ?? 'failed_to_insert_message',
        });
        failed += 1;
        continue;
      }

      // Update chat preview immediately (even if provider fails)
      await supabaseAdmin
        .from('chats')
        .update({ last_message: messageContent, last_message_at: nowIso })
        .eq('id', chat.id);

      await insertTraceEvent({
        campaignId,
        companyId,
        userId: auth.userId,
        recipientId,
        chatId: chat.id,
        step: 'provider_send_start',
        ok: true,
        raw: { kind: campaignKind },
      });

      const provider = await sendWhatsAppMessage({
        phoneNumberId,
        to: phone,
        kind: campaignKind,
        textBody,
        templateName: (campaign as any).template_name ?? undefined,
        templateLanguage: (campaign as any).template_language ?? undefined,
        templateComponents: renderedTemplateComponents,
      });

      const patchMsg: any = { raw: { outbound: true, user_id: auth.userId, campaign_id: campaignId, campaign_recipient_id: recipientId, provider } };
      const patchRecipient: any = { chat_id: chat.id, raw: { provider } };

      if (provider?.ok === true) {
        const messageId = extractWhatsAppMessageId(provider?.body ?? '');
        patchMsg.delivery_status = 'sent';
        patchRecipient.status = 'sent' as RecipientStatus;
        patchRecipient.sent_at = nowIso;
        if (messageId) {
          patchMsg.external_message_id = messageId;
          patchRecipient.external_message_id = messageId;
        }
        await insertTraceEvent({
          campaignId,
          companyId,
          userId: auth.userId,
          recipientId,
          chatId: chat.id,
          step: 'provider_send_ok',
          ok: true,
          raw: { messageId },
        });
        sent += 1;
      } else if (provider?.ok === false && provider?.skipped !== true) {
        patchMsg.delivery_status = 'failed';
        patchMsg.failed_at = nowIso;
        patchMsg.failure_reason = provider?.status ? `HTTP ${provider.status}` : 'provider_failed';
        patchRecipient.status = 'failed' as RecipientStatus;
        patchRecipient.failed_at = nowIso;
        patchRecipient.error = provider?.status ? `HTTP ${provider.status}` : 'provider_failed';
        await insertTraceEvent({
          campaignId,
          companyId,
          userId: auth.userId,
          recipientId,
          chatId: chat.id,
          step: 'provider_send_failed',
          ok: false,
          httpStatus: provider?.status ?? null,
          message: patchMsg.failure_reason,
          raw: provider,
        });
        failed += 1;
      } else {
        patchRecipient.status = 'failed' as RecipientStatus;
        patchRecipient.failed_at = nowIso;
        patchRecipient.error = provider?.reason ?? 'provider_skipped';
        patchMsg.delivery_status = 'failed';
        patchMsg.failed_at = nowIso;
        patchMsg.failure_reason = provider?.reason ?? 'provider_skipped';
        await insertTraceEvent({
          campaignId,
          companyId,
          userId: auth.userId,
          recipientId,
          chatId: chat.id,
          step: 'provider_send_skipped',
          ok: false,
          message: patchMsg.failure_reason,
          raw: provider,
        });
        failed += 1;
      }

      await supabaseAdmin.from('chat_messages').update(patchMsg).eq('id', msg.id);
      await supabaseAdmin.from('whatsapp_campaign_recipients').update(patchRecipient).eq('id', recipientId);

      if (delayMs > 0) await sleep(delayMs);
    }

    return jsonResponse(200, { ok: true, processed: list.length, sent, skipped, failed });
  } catch (e: any) {
    return jsonResponse(500, { ok: false, error: e?.message ?? 'unknown error' });
  }
});
