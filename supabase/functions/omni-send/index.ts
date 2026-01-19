// Supabase Edge Function: omni-send
// Outbound messaging helper (Phase 3)
//
// - Inserts the message into `public.chat_messages`
// - Updates `public.chats.last_message(_at)`
// - Sends message via WhatsApp Cloud API (Meta) if configured
//
// Required env:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
//
// Optional env (WhatsApp Cloud API):
// - WHATSAPP_ACCESS_TOKEN
// - WHATSAPP_PHONE_NUMBER_ID
// - WHATSAPP_API_VERSION (default: v20.0)

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

type SendBody = {
  chat_id: string;
  content: string;
  access_token?: string;
};

const normalizeWhatsAppNumber = (value: string): string => value.replace(/\D/g, '');

const extractBearerToken = (authorizationHeader: string | null): string | null => {
  if (!authorizationHeader) return null;
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1]?.trim();
  return token ? token : null;
};

const extractAccessToken = (req: Request, body: SendBody): string | null => {
  const headerToken = extractBearerToken(req.headers.get('authorization')) ?? extractBearerToken(req.headers.get('Authorization'));
  if (headerToken) return headerToken;

  const customHeaderToken =
    extractBearerToken(req.headers.get('x-supabase-auth')) ??
    extractBearerToken(req.headers.get('x-access-token')) ??
    extractBearerToken(req.headers.get('x-token'));
  if (customHeaderToken) return customHeaderToken;

  if (typeof body?.access_token === 'string' && body.access_token.trim()) return body.access_token.trim();
  return null;
};

async function sendViaWhatsAppCloud(phoneNumberId: string, to: string, text: string) {
  if (!WHATSAPP_ACCESS_TOKEN || !phoneNumberId) return { ok: false, skipped: true };

  const number = normalizeWhatsAppNumber(to.replace(/@.*/, ''));
  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${encodeURIComponent(phoneNumberId)}/messages`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: number,
      type: 'text',
      text: { body: text },
    }),
  });

  const payloadText = await res.text().catch(() => '');
  if (!res.ok) return { ok: false, status: res.status, body: payloadText };
  return { ok: true, body: payloadText };
}

serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return jsonResponse(405, { ok: false, error: 'method not allowed' });

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(500, { ok: false, error: 'missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' });
    }

    const body = (await req.json().catch(() => null)) as SendBody | null;
    if (!body?.chat_id || !body?.content) return jsonResponse(400, { ok: false, error: 'missing chat_id/content' });

    // verify_jwt should be enabled for this function; we still check the caller belongs to the chat's company.
    const token = extractAccessToken(req, body);
    if (!token) {
      return jsonResponse(401, {
        ok: false,
        error: 'missing authorization',
        hint: 'envie o access_token do Supabase via header Authorization: Bearer <token> (ou body.access_token)',
      });
    }

    // More robust than decoding JWT locally (and avoids edge runtime differences).
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError) return jsonResponse(401, { ok: false, error: authError.message });
    const userId = authData?.user?.id;
    if (!userId) return jsonResponse(401, { ok: false, error: 'invalid session' });

    const { data: chat, error: chatError } = await supabaseAdmin
      .from('chats')
      .select('id, company_id, platform, external_thread_id, last_message_at')
      .eq('id', body.chat_id)
      .maybeSingle();
    if (chatError) return jsonResponse(500, { ok: false, error: chatError.message });
    if (!chat) return jsonResponse(404, { ok: false, error: 'chat not found' });

    const { data: membership, error: memberError } = await supabaseAdmin
      .from('company_members')
      .select('user_id')
      .eq('company_id', (chat as any).company_id)
      .eq('user_id', userId)
      .maybeSingle();
    if (memberError) return jsonResponse(500, { ok: false, error: memberError.message });
    if (!membership) return jsonResponse(403, { ok: false, error: 'forbidden' });

    const nowIso = new Date().toISOString();

    const { error: msgError } = await supabaseAdmin.from('chat_messages').insert([
      {
        chat_id: chat.id,
        sender: 'agent',
        content: body.content,
        raw: { outbound: true, user_id: userId },
        created_at: nowIso,
      },
    ] as any);
    if (msgError) return jsonResponse(500, { ok: false, error: msgError.message });

    const { error: updError } = await supabaseAdmin
      .from('chats')
      .update({ last_message: body.content, last_message_at: nowIso })
      .eq('id', chat.id);
    if (updError) return jsonResponse(500, { ok: false, error: updError.message });

    let provider: any = { ok: false, skipped: true };
    if (chat.platform === 'whatsapp' && chat.external_thread_id) {
      const { data: company, error: companyError } = await supabaseAdmin
        .from('companies')
        .select('whatsapp_phone_number_id')
        .eq('id', (chat as any).company_id)
        .maybeSingle();
      if (companyError) return jsonResponse(500, { ok: false, error: companyError.message });

      const phoneNumberId = (company as any)?.whatsapp_phone_number_id || WHATSAPP_PHONE_NUMBER_ID;
      if (!phoneNumberId) {
        provider = { ok: false, skipped: true, reason: 'missing WHATSAPP_PHONE_NUMBER_ID (env or companies.whatsapp_phone_number_id)' };
      } else {
        provider = await sendViaWhatsAppCloud(String(phoneNumberId), chat.external_thread_id, body.content);
      }
    }

    return jsonResponse(200, { ok: true, provider });
  } catch (e: any) {
    return jsonResponse(500, { ok: false, error: e?.message ?? 'unknown error' });
  }
});
