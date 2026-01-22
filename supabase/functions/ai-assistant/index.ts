// Supabase Edge Function: ai-assistant (Phase 4)
// - General "IA Helper" for the UI
// - SDR reply suggestions for LiveChat
// - Creative analysis (image URL) MVP
//
// Required env:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
//
// IMPORTANT (per user request):
// - The app must NOT store LLM API keys in the backend.
// - The client sends the API key per request and we do NOT persist it.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const corsHeaders: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

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
  const token = match[1]
    ?.split(',')[0]
    ?.trim();
  return token ? token : null;
};

type Mode = 'helper' | 'sdr_reply' | 'creative_analysis' | 'weekly_report';

type Provider = 'openai' | 'google' | 'anthropic' | 'deepseek';

type Body = {
  mode: Mode;
  company_id?: string;
  chat_id?: string;
  context_view?: string;
  user_message?: string;
  image_url?: string;
  metrics?: Record<string, unknown>;
  provider?: Provider;
  api_key?: string;
  model?: string;
  access_token?: string;
};

type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: any };

function safeJsonParse(text: string): any {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const slice = trimmed.slice(start, end + 1);
      try {
        return JSON.parse(slice);
      } catch {
        // ignore
      }
    }
    return { reply: trimmed };
  }
}

const defaultModelForProvider = (provider: Provider): string => {
  if (provider === 'google') return 'gemini-2.5-flash';
  if (provider === 'anthropic') return 'claude-3-5-sonnet-20241022';
  if (provider === 'deepseek') return 'deepseek-chat';
  return 'gpt-4o-mini';
};

async function openaiCompatibleChat(args: {
  apiKey: string;
  baseUrl: string;
  model: string;
  messages: ChatMsg[];
}): Promise<{ text: string; raw: any }> {
  const res = await fetch(`${args.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${args.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: args.model,
      messages: args.messages,
      temperature: 0.4,
      response_format: { type: 'json_object' },
    }),
  });

  const text = await res.text().catch(() => '');
  if (!res.ok) throw new Error(`llm_error_${res.status}: ${text}`);

  const payload = JSON.parse(text);
  const content = payload?.choices?.[0]?.message?.content ?? '';
  return { text: String(content), raw: payload };
}

async function geminiChat(args: {
  apiKey: string;
  model: string;
  messages: ChatMsg[];
}): Promise<{ text: string; raw: any }> {
  // Gemini expects "contents" with role user/model and parts.
  // We merge system + user prompts into a single user message to keep it simple/consistent.
  const system = args.messages.find((m) => m.role === 'system')?.content ?? '';
  const user = args.messages.find((m) => m.role === 'user')?.content ?? '';
  const merged = [system, typeof user === 'string' ? user : JSON.stringify(user)].filter(Boolean).join('\n\n');
  const contents = [{ role: 'user', parts: [{ text: merged }] }];

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(args.model)}:generateContent?key=${encodeURIComponent(
    args.apiKey
  )}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: { temperature: 0.4, response_mime_type: 'application/json' },
    }),
  });

  const text = await res.text().catch(() => '');
  if (!res.ok) throw new Error(`llm_error_${res.status}: ${text}`);

  const payload = JSON.parse(text);
  const out = payload?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join('') ?? '';
  return { text: String(out), raw: payload };
}

async function anthropicChat(args: {
  apiKey: string;
  model: string;
  messages: ChatMsg[];
}): Promise<{ text: string; raw: any }> {
  // Anthropic uses a separate "system" field + messages (user/assistant).
  const system = args.messages.find((m) => m.role === 'system')?.content;
  const user = args.messages.find((m) => m.role === 'user')?.content;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': args.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: args.model,
      max_tokens: 600,
      temperature: 0.4,
      system: typeof system === 'string' ? system : JSON.stringify(system ?? ''),
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: typeof user === 'string' ? user : JSON.stringify(user ?? '') }],
        },
      ],
    }),
  });

  const text = await res.text().catch(() => '');
  if (!res.ok) throw new Error(`llm_error_${res.status}: ${text}`);

  const payload = JSON.parse(text);
  const out = payload?.content?.map((c: any) => c?.text).filter(Boolean).join('') ?? '';
  return { text: String(out), raw: payload };
}

const guessMimeType = (url: string, contentTypeHeader: string | null): string => {
  const header = (contentTypeHeader ?? '').split(';')[0].trim().toLowerCase();
  if (header.startsWith('image/')) return header;

  const lower = url.toLowerCase();
  if (lower.includes('.png')) return 'image/png';
  if (lower.includes('.webp')) return 'image/webp';
  if (lower.includes('.gif')) return 'image/gif';
  if (lower.includes('.bmp')) return 'image/bmp';
  if (lower.includes('.svg')) return 'image/svg+xml';
  if (lower.includes('.jpg') || lower.includes('.jpeg')) return 'image/jpeg';
  return 'image/jpeg';
};

const extractImageUrlFromMessages = (messages: ChatMsg[]): string | null => {
  const user = messages.find((m) => m.role === 'user')?.content;
  if (!Array.isArray(user)) return null;
  for (const part of user) {
    const url = part?.image_url?.url;
    if (typeof url === 'string' && url.trim()) return url.trim();
  }
  return null;
};

const extractTextFromMessages = (messages: ChatMsg[]): { system: string; user: string } => {
  const system = messages.find((m) => m.role === 'system')?.content;
  const user = messages.find((m) => m.role === 'user')?.content;

  const systemText = typeof system === 'string' ? system : JSON.stringify(system ?? '');
  if (typeof user === 'string') return { system: systemText, user };
  if (Array.isArray(user)) {
    const texts = user
      .map((p) => p?.text)
      .filter((t) => typeof t === 'string' && t.trim())
      .map((t) => t.trim());
    return { system: systemText, user: texts.join('\n\n') };
  }
  return { system: systemText, user: JSON.stringify(user ?? '') };
};

async function geminiVisionChat(args: {
  apiKey: string;
  model: string;
  messages: ChatMsg[];
}): Promise<{ text: string; raw: any }> {
  const imageUrl = extractImageUrlFromMessages(args.messages);
  if (!imageUrl) throw new Error('missing image_url for google vision');

  const { system, user } = extractTextFromMessages(args.messages);
  const merged = [system, user].filter(Boolean).join('\n\n');

  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`image_fetch_failed_${imgRes.status}`);
  const buf = new Uint8Array(await imgRes.arrayBuffer());
  const mimeType = guessMimeType(imageUrl, imgRes.headers.get('content-type'));
  const base64 = encodeBase64(buf);

  const contents = [
    {
      role: 'user',
      parts: [
        { text: merged },
        { inline_data: { mime_type: mimeType, data: base64 } },
      ],
    },
  ];

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(args.model)}:generateContent?key=${encodeURIComponent(
    args.apiKey
  )}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: { temperature: 0.4, response_mime_type: 'application/json' },
    }),
  });

  const text = await res.text().catch(() => '');
  if (!res.ok) throw new Error(`llm_error_${res.status}: ${text}`);

  const payload = JSON.parse(text);
  const out = payload?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join('') ?? '';
  return { text: String(out), raw: payload };
}

async function llmChat(provider: Provider, apiKey: string, model: string, messages: ChatMsg[], isVision: boolean) {
  if (!apiKey) throw new Error('missing api_key');

  if (provider === 'openai') {
    // vision supported via OpenAI compatible endpoint too (image_url payload)
    return openaiCompatibleChat({ apiKey, baseUrl: 'https://api.openai.com/v1', model, messages });
  }

  if (provider === 'deepseek') {
    if (isVision) throw new Error('vision_not_supported_for_provider_deepseek');
    // DeepSeek is OpenAI-compatible (text only here).
    return openaiCompatibleChat({ apiKey, baseUrl: 'https://api.deepseek.com/v1', model, messages });
  }

  if (provider === 'google') {
    if (isVision) return geminiVisionChat({ apiKey, model, messages });
    return geminiChat({ apiKey, model, messages });
  }

  if (provider === 'anthropic') {
    if (isVision) throw new Error('vision_not_supported_for_provider_anthropic');
    return anthropicChat({ apiKey, model, messages });
  }

  throw new Error('unsupported_provider');
}

async function getCompanyPrompt(companyId: string): Promise<{ helper: string | null; sdr: string | null }> {
  const { data, error } = await supabaseAdmin
    .from('company_ai_settings')
    .select('helper_prompt, sdr_prompt')
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) return { helper: null, sdr: null };
  return { helper: (data as any)?.helper_prompt ?? null, sdr: (data as any)?.sdr_prompt ?? null };
}

async function assertCompanyAccess(userId: string, companyId: string) {
  const { data, error } = await supabaseAdmin
    .from('company_members')
    .select('user_id')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('forbidden');
}

async function resolveCompanyIdForChat(chatId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.from('chats').select('company_id').eq('id', chatId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as any)?.company_id ?? null;
}

async function loadChatHistory(chatId: string, limit = 20): Promise<Array<{ sender: string; content: string }>> {
  const { data, error } = await supabaseAdmin
    .from('chat_messages')
    .select('sender, content, created_at')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).reverse().map((r: any) => ({ sender: r.sender, content: String(r.content ?? '') }));
}

function baseSystemPrompt() {
  return [
    'Você é o CR8 Assistant (Traffic OS) para agências e gestores de tráfego.',
    'Responda sempre em pt-BR, de forma objetiva.',
    'Quando retornar JSON, siga exatamente o schema pedido.',
  ].join('\n');
}

function helperPrompt(contextView: string | null, custom: string | null) {
  const ctx = contextView ? `Contexto atual do usuário no app: ${contextView}` : 'Contexto atual do usuário: desconhecido';
  return [
    baseSystemPrompt(),
    ctx,
    custom ? `Instruções adicionais do cliente:\n${custom}` : '',
    'Tarefa: ajudar o usuário a executar a ação pedida dentro do CR8, com passos claros.',
    'Retorne JSON no formato: {"reply":"...","bullets":["..."],"next_actions":["..."]}',
  ]
    .filter(Boolean)
    .join('\n');
}

function sdrPrompt(custom: string | null) {
  return [
    baseSystemPrompt(),
    custom ? `Instruções adicionais do cliente:\n${custom}` : '',
    'Você é um SDR IA. Objetivo: qualificar o lead rapidamente e encaminhar para o humano.',
    'Você deve: entender necessidade, urgência, orçamento e melhor canal/horário.',
    'Se o lead for de campanha de mensagens, considere "lead" como conversa/mensagem.',
    'Retorne JSON no formato:',
    '{"reply":"...","qualification":{"need":null,"urgency":null,"budget":null,"city":null,"preferred_contact":null},"handoff_ready":false,"handoff_reason":null}',
  ].join('\n');
}

function creativePrompt(metrics: Record<string, unknown> | undefined) {
  return [
    baseSystemPrompt(),
    'Você é um analista de criativos (Meta Ads).',
    metrics ? `Métricas (podem estar incompletas): ${JSON.stringify(metrics)}` : 'Métricas: não fornecidas.',
    'Retorne JSON no formato:',
    '{"summary":"...","hypotheses":["..."],"recommendations":["..."],"classification":"winner|neutral|loser"}',
  ].join('\n');
}

serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return jsonResponse(405, { ok: false, error: 'method not allowed' });

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(500, { ok: false, error: 'missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' });
    }

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body?.mode) return jsonResponse(400, { ok: false, error: 'missing mode' });

    const token =
      extractBearerToken(req.headers.get('authorization')) ??
      extractBearerToken(req.headers.get('Authorization')) ??
      (body.access_token ? String(body.access_token) : null);
    if (!token) return jsonResponse(401, { ok: false, error: 'missing authorization' });

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError) return jsonResponse(401, { ok: false, error: authError.message });
    const userId = authData?.user?.id;
    if (!userId) return jsonResponse(401, { ok: false, error: 'invalid session' });
    const provider = body.provider ?? 'openai';
    const apiKey = body.api_key ?? '';

    let companyId = body.company_id ?? null;
    if (!companyId && body.chat_id) companyId = await resolveCompanyIdForChat(body.chat_id);
    if (!companyId) return jsonResponse(400, { ok: false, error: 'missing company_id' });

    await assertCompanyAccess(userId, companyId);

    const prompts = await getCompanyPrompt(companyId);

    let resultJson: any = null;
    let rawProvider: any = null;

    if (body.mode === 'helper') {
      const messages: ChatMsg[] = [
        { role: 'system', content: helperPrompt(body.context_view ?? null, prompts.helper) },
        { role: 'user', content: body.user_message ?? '' },
      ];
      const model = body.model ?? defaultModelForProvider(provider);
      const { text, raw } = await llmChat(provider, apiKey, model, messages, false);
      rawProvider = raw;
      resultJson = safeJsonParse(text);
    } else if (body.mode === 'sdr_reply') {
      if (!body.chat_id) return jsonResponse(400, { ok: false, error: 'missing chat_id' });
      const history = await loadChatHistory(body.chat_id, 25);
      const messages: ChatMsg[] = [
        { role: 'system', content: sdrPrompt(prompts.sdr) },
        {
          role: 'user',
          content:
            'Histórico:\n' +
            history
              .map((m) => `${m.sender === 'agent' ? 'AGENTE' : m.sender === 'system' ? 'SISTEMA' : 'LEAD'}: ${m.content}`)
              .join('\n'),
        },
      ];
      const model = body.model ?? defaultModelForProvider(provider);
      const { text, raw } = await llmChat(provider, apiKey, model, messages, false);
      rawProvider = raw;
      resultJson = safeJsonParse(text);
    } else if (body.mode === 'creative_analysis') {
      if (!body.image_url) return jsonResponse(400, { ok: false, error: 'missing image_url' });
      const messages: ChatMsg[] = [
        { role: 'system', content: creativePrompt(body.metrics) },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analise o criativo desta imagem e explique o que pode estar influenciando performance.' },
            { type: 'image_url', image_url: { url: body.image_url } },
          ],
        },
      ];
      const model = body.model ?? defaultModelForProvider(provider);
      const { text, raw } = await llmChat(provider, apiKey, model, messages, true);
      rawProvider = raw;
      resultJson = safeJsonParse(text);
    } else if (body.mode === 'weekly_report') {
      const messages: ChatMsg[] = [
        { role: 'system', content: baseSystemPrompt() + '\nRetorne JSON no formato {"summary":"...","highlights":["..."],"risks":["..."],"next_week":["..."]}' },
        { role: 'user', content: JSON.stringify({ company_id: companyId, metrics: body.metrics ?? {} }) },
      ];
      const model = body.model ?? defaultModelForProvider(provider);
      const { text, raw } = await llmChat(provider, apiKey, model, messages, false);
      rawProvider = raw;
      resultJson = safeJsonParse(text);
    }

    const event = {
      company_id: companyId,
      user_id: userId,
      chat_id: body.chat_id ?? null,
      lead_id: null,
      event_type: body.mode,
      input: {
        mode: body.mode,
        context_view: body.context_view ?? null,
        has_image_url: Boolean(body.image_url),
        metrics: body.metrics ?? null,
        provider,
        model: body.model ?? null,
      },
      output: resultJson ?? {},
    };
    await supabaseAdmin.from('ai_events').insert([event] as any);

    return jsonResponse(200, { ok: true, result: resultJson });
  } catch (e: any) {
    return jsonResponse(500, { ok: false, error: e?.message ?? 'unknown error' });
  }
});
