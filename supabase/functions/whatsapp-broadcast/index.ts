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

type CancelCampaignBody = {
  action: 'cancel';
  campaign_id: string;
};

type RequestBody = CreateCampaignBody | RunCampaignBody | CancelCampaignBody;

const renderText = (template: string, vars: Record<string, string>) => {
  let out = String(template ?? '');
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{{${k}}}`, v);
  }
  return out;
};

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

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const r of list) {
      const recipientId = String(r.id);
      const phone = normalizePhone(r.phone);
      const name = r.name ? String(r.name) : '';
      if (!phone) continue;

      // Suppressions / opt-out
      const { data: suppression } = await supabaseAdmin
        .from('whatsapp_phone_suppressions')
        .select('id')
        .eq('company_id', companyId)
        .eq('phone', phone)
        .maybeSingle();
      if (suppression?.id) {
        await supabaseAdmin
          .from('whatsapp_campaign_recipients')
          .update({ status: 'skipped' as RecipientStatus, skipped_at: nowIso, error: 'opt-out' })
          .eq('id', recipientId);
        skipped += 1;
        continue;
      }

      await supabaseAdmin
        .from('whatsapp_campaign_recipients')
        .update({ status: 'sending' as RecipientStatus, sending_at: nowIso })
        .eq('id', recipientId);

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
        failed += 1;
        continue;
      }

      const vars = { name: name || 'Cliente', phone };
      const campaignKind = ((campaign as any).message_kind as CampaignMessageKind) || 'text';
      const textBody = campaignKind === 'text' ? renderText(String((campaign as any).text_body ?? ''), vars) : undefined;

      // Insert message row first (keeps inbox consistent even if provider fails)
      const { data: msg, error: msgErr } = await supabaseAdmin
        .from('chat_messages')
        .insert(
          [
            {
              chat_id: chat.id,
              sender: 'agent',
              content: campaignKind === 'template' ? `[Template] ${(campaign as any).template_name ?? ''}` : textBody ?? '',
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
        failed += 1;
        continue;
      }

      const provider = await sendWhatsAppMessage({
        phoneNumberId,
        to: phone,
        kind: campaignKind,
        textBody,
        templateName: (campaign as any).template_name ?? undefined,
        templateLanguage: (campaign as any).template_language ?? undefined,
        templateComponents: (campaign as any).template_components ?? undefined,
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
        sent += 1;
      } else if (provider?.ok === false && provider?.skipped !== true) {
        patchMsg.delivery_status = 'failed';
        patchMsg.failed_at = nowIso;
        patchMsg.failure_reason = provider?.status ? `HTTP ${provider.status}` : 'provider_failed';
        patchRecipient.status = 'failed' as RecipientStatus;
        patchRecipient.failed_at = nowIso;
        patchRecipient.error = provider?.status ? `HTTP ${provider.status}` : 'provider_failed';
        failed += 1;
      } else {
        patchRecipient.status = 'failed' as RecipientStatus;
        patchRecipient.failed_at = nowIso;
        patchRecipient.error = provider?.reason ?? 'provider_skipped';
        patchMsg.delivery_status = 'failed';
        patchMsg.failed_at = nowIso;
        patchMsg.failure_reason = provider?.reason ?? 'provider_skipped';
        failed += 1;
      }

      await supabaseAdmin.from('chat_messages').update(patchMsg).eq('id', msg.id);
      await supabaseAdmin.from('chats').update({ last_message: patchMsg?.content ?? null, last_message_at: nowIso }).eq('id', chat.id);
      await supabaseAdmin.from('whatsapp_campaign_recipients').update(patchRecipient).eq('id', recipientId);

      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    }

    return jsonResponse(200, { ok: true, processed: list.length, sent, skipped, failed });
  } catch (e: any) {
    return jsonResponse(500, { ok: false, error: e?.message ?? 'unknown error' });
  }
});

