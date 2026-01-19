// Supabase Edge Function: omni-webhook
// Inbound omnichannel webhook (WhatsApp Cloud API / Instagram / etc)
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
// - WHATSAPP_VERIFY_TOKEN (for Meta webhook verification)
// - WHATSAPP_APP_SECRET (optional, to verify X-Hub-Signature-256)
// - WHATSAPP_COMPANY_ID (fallback when webhook can't include company_id)

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
const WHATSAPP_VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? '';
const WHATSAPP_APP_SECRET = Deno.env.get('WHATSAPP_APP_SECRET') ?? '';
const WHATSAPP_COMPANY_ID = Deno.env.get('WHATSAPP_COMPANY_ID') ?? '';

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

  // WhatsApp Cloud API (Meta)
  // https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components
  //
  // Obs: o "Teste" no painel da Meta às vezes envia apenas o `value` (sem `object/entry`),
  // então aceitamos também formatos parciais.
  const tryParseWhatsAppValue = (value: any): ParsedInbound | null => {
    const messages = Array.isArray(value?.messages) ? value.messages : [];
    if (messages.length === 0) return null;

    const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
    const contactName = contacts?.[0]?.profile?.name ?? null;

    const msg = messages[0];
    const from = msg?.from ? String(msg.from) : null;
    const tsSec = msg?.timestamp ? Number(msg.timestamp) : null;
    const timestamp = tsSec ? new Date(tsSec * 1000).toISOString() : new Date().toISOString();

    let text = '';
    if (msg?.type === 'text' && msg?.text?.body) text = String(msg.text.body);
    else if (msg?.type === 'button' && msg?.button?.text) text = String(msg.button.text);
    else if (msg?.type === 'interactive' && msg?.interactive) text = '[interactive]';
    else text = '[mensagem]';

    if (!from || !text) return null;
    return { platform: 'whatsapp', threadId: from, contactName, from, text, timestamp };
  };

  // Full envelope
  if (Array.isArray(body?.entry) && (body?.object === 'whatsapp_business_account' || body?.object == null)) {
    for (const entry of body.entry) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const parsed = tryParseWhatsAppValue(change?.value ?? {});
        if (parsed) return parsed;
      }
    }
  }

  // Test payloads sometimes send `value` directly or nested
  const parsedDirect = tryParseWhatsAppValue(body);
  if (parsedDirect) return parsedDirect;
  const parsedNested = tryParseWhatsAppValue(body?.value);
  if (parsedNested) return parsedNested;

  return null;
}

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

async function verifyMetaSignature(req: Request, rawBody: string): Promise<boolean> {
  if (!WHATSAPP_APP_SECRET) return true;
  const header = req.headers.get('x-hub-signature-256') ?? '';
  const match = header.match(/^sha256=(.+)$/i);
  if (!match) return false;
  const expectedHex = match[1].toLowerCase();

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(WHATSAPP_APP_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const actualHex = toHex(sig).toLowerCase();
  return actualHex === expectedHex;
}

serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    // Meta webhook verification handshake (GET)
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      // Health check (useful to confirm the function is deployed/reachable)
      if (!mode && !token && !challenge) {
        return jsonResponse(200, { ok: true });
      }

      if (mode === 'subscribe' && token && challenge && token === WHATSAPP_VERIFY_TOKEN) {
        return new Response(challenge, { status: 200, headers: corsHeaders });
      }

      return jsonResponse(403, { ok: false, error: 'invalid verification token' });
    }

    if (req.method !== 'POST') return jsonResponse(405, { ok: false, error: 'method not allowed' });

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(500, { ok: false, error: 'missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' });
    }

    // For Meta (WhatsApp Cloud API) webhooks we rely on signature verification, not custom headers.
    const hasMetaSignature = Boolean(req.headers.get('x-hub-signature-256'));

    if (OMNI_WEBHOOK_SECRET && !hasMetaSignature) {
      const provided = req.headers.get('x-webhook-secret') ?? '';
      if (provided !== OMNI_WEBHOOK_SECRET) {
        return jsonResponse(401, { ok: false, error: 'invalid webhook secret' });
      }
    }

    const companyId =
      new URL(req.url).searchParams.get('company_id') ?? req.headers.get('x-company-id') ?? WHATSAPP_COMPANY_ID;
    if (!companyId) return jsonResponse(400, { ok: false, error: 'missing company_id' });

    const rawBody = await req.text().catch(() => '');
    if (!rawBody) return jsonResponse(400, { ok: false, error: 'missing body' });
    if (!(await verifyMetaSignature(req, rawBody))) return jsonResponse(401, { ok: false, error: 'invalid signature' });

    const body = (() => {
      try {
        return JSON.parse(rawBody);
      } catch {
        return null;
      }
    })();
    if (!body) return jsonResponse(400, { ok: false, error: 'invalid json' });

    const parsed = parseInbound(body);
    // WhatsApp status updates have no messages; ignore them.
    if (!parsed) return jsonResponse(200, { ok: true, inserted: 0 });

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
