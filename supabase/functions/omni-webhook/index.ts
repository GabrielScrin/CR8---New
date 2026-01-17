// Supabase Edge Function: omni-webhook
// Inbound omnichannel webhook (WhatsApp/Instagram/etc)
//
// Goals (Phase 3):
// - Receive inbound messages from providers
// - Upsert chat thread in `public.chats`
// - Insert message into `public.chat_messages`
//
// Expected auth:
// - Uses SERVICE_ROLE to bypass RLS
// - Optional shared secret via `x-webhook-secret`
//
// Required env:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
//
// Optional env:
// - OMNI_WEBHOOK_SECRET

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const corsHeaders: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret, x-company-id',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const OMNI_WEBHOOK_SECRET = Deno.env.get('OMNI_WEBHOOK_SECRET') ?? '';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type ParsedInbound = {
  platform: 'whatsapp' | 'instagram' | 'web' | 'meta';
  threadId: string; // external_thread_id
  contactName?: string | null;
  from?: string | null; // phone/user id
  text: string;
  timestamp?: string | null;
};

const jsonResponse = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });

function parseInbound(body: any): ParsedInbound | null {
  if (!body || typeof body !== 'object') return null;

  // Generic format (recommended)
  // { platform, thread_id, from, contact_name, text, timestamp }
  if (typeof body.text === 'string' && (body.thread_id || body.threadId)) {
    const platform = String(body.platform ?? 'whatsapp') as any;
    const threadId = String(body.thread_id ?? body.threadId);
    return {
      platform: platform === 'instagram' ? 'instagram' : platform === 'web' ? 'web' : platform === 'meta' ? 'meta' : 'whatsapp',
      threadId,
      contactName: body.contact_name ?? body.contactName ?? null,
      from: body.from ?? null,
      text: body.text,
      timestamp: body.timestamp ?? null,
    };
  }

  // Evolution API (best-effort)
  // Common shapes vary by version; we attempt a few.
  const evoMessage = body?.data?.message ?? body?.message ?? body?.data;
  const evoText = evoMessage?.conversation ?? evoMessage?.extendedTextMessage?.text ?? body?.text;
  const evoRemote = evoMessage?.key?.remoteJid ?? evoMessage?.remoteJid ?? body?.remoteJid;
  if (typeof evoText === 'string' && typeof evoRemote === 'string') {
    const contactName =
      body?.data?.pushName ?? body?.pushName ?? evoMessage?.pushName ?? body?.data?.senderName ?? body?.senderName ?? null;
    return {
      platform: 'whatsapp',
      threadId: evoRemote,
      contactName,
      from: evoRemote,
      text: evoText,
      timestamp: new Date().toISOString(),
    };
  }

  return null;
}

serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return jsonResponse(405, { ok: false, error: 'method not allowed' });

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(500, { ok: false, error: 'missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' });
    }

    if (OMNI_WEBHOOK_SECRET) {
      const provided = req.headers.get('x-webhook-secret') ?? '';
      if (provided !== OMNI_WEBHOOK_SECRET) {
        return jsonResponse(401, { ok: false, error: 'invalid webhook secret' });
      }
    }

    const companyId = new URL(req.url).searchParams.get('company_id') ?? req.headers.get('x-company-id');
    if (!companyId) return jsonResponse(400, { ok: false, error: 'missing company_id' });

    const body = await req.json().catch(() => null);
    if (!body) return jsonResponse(400, { ok: false, error: 'invalid json' });

    const parsed = parseInbound(body);
    if (!parsed) return jsonResponse(400, { ok: false, error: 'unsupported payload' });

    const lastMessageAt = parsed.timestamp ? new Date(parsed.timestamp).toISOString() : new Date().toISOString();

    // Upsert chat by (company_id + platform + external_thread_id)
    const { data: chat, error: chatError } = await supabaseAdmin
      .from('chats')
      .upsert(
        [
          {
            company_id: companyId,
            platform: parsed.platform,
            external_thread_id: parsed.threadId,
            last_message: parsed.text,
            last_message_at: lastMessageAt,
            raw: {
              inbound: true,
              contact_name: parsed.contactName ?? null,
              from: parsed.from ?? null,
              payload: body,
            },
          },
        ] as any,
        { onConflict: 'company_id,platform,external_thread_id' }
      )
      .select('*')
      .maybeSingle();

    if (chatError) return jsonResponse(500, { ok: false, error: chatError.message });
    if (!chat?.id) return jsonResponse(500, { ok: false, error: 'failed to upsert chat' });

    const { error: msgError } = await supabaseAdmin.from('chat_messages').insert([
      {
        chat_id: chat.id,
        sender: 'user',
        content: parsed.text,
        raw: { payload: body, contact_name: parsed.contactName ?? null, from: parsed.from ?? null },
        created_at: lastMessageAt,
      },
    ] as any);

    if (msgError) return jsonResponse(500, { ok: false, error: msgError.message });

    return jsonResponse(200, { ok: true, chat_id: chat.id });
  } catch (e: any) {
    return jsonResponse(500, { ok: false, error: e?.message ?? 'unknown error' });
  }
});
