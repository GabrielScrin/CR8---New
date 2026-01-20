// Supabase Edge Function: ai-assistant (Phase 4)
// - General "IA Helper" for the UI
// - SDR reply suggestions for LiveChat
// - Creative analysis (image URL) MVP
//
// Required env:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
//
// AI Provider env (choose one):
// - OPENAI_API_KEY (recommended)
//   - OPENAI_MODEL (default: gpt-4o-mini)
//   - OPENAI_VISION_MODEL (default: gpt-4o-mini)
// - GEMINI_API_KEY (optional; not implemented yet)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const corsHeaders: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini';
const OPENAI_VISION_MODEL = Deno.env.get('OPENAI_VISION_MODEL') ?? 'gpt-4o-mini';

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
  const token = match[1]?.trim();
  return token ? token : null;
};

type Mode = 'helper' | 'sdr_reply' | 'creative_analysis' | 'weekly_report';

type Body = {
  mode: Mode;
  company_id?: string;
  chat_id?: string;
  context_view?: string;
  user_message?: string;
  image_url?: string;
  metrics?: Record<string, unknown>;
};

type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: any };

async function openaiChat(messages: ChatMsg[], model: string): Promise<{ text: string; raw: any }> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.4,
      response_format: { type: 'json_object' },
    }),
  });

  const text = await res.text().catch(() => '');
  if (!res.ok) throw new Error(`openai_error_${res.status}: ${text}`);

  const payload = JSON.parse(text);
  const content = payload?.choices?.[0]?.message?.content ?? '';
  return { text: String(content), raw: payload };
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

    const token = extractBearerToken(req.headers.get('authorization')) ?? extractBearerToken(req.headers.get('Authorization'));
    if (!token) return jsonResponse(401, { ok: false, error: 'missing authorization' });

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError) return jsonResponse(401, { ok: false, error: authError.message });
    const userId = authData?.user?.id;
    if (!userId) return jsonResponse(401, { ok: false, error: 'invalid session' });

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body?.mode) return jsonResponse(400, { ok: false, error: 'missing mode' });

    if (!OPENAI_API_KEY) {
      return jsonResponse(501, { ok: false, error: 'AI not configured', hint: 'Configure OPENAI_API_KEY nas secrets do Supabase' });
    }

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
      const { text, raw } = await openaiChat(messages, OPENAI_MODEL);
      rawProvider = raw;
      resultJson = JSON.parse(text);
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
      const { text, raw } = await openaiChat(messages, OPENAI_MODEL);
      rawProvider = raw;
      resultJson = JSON.parse(text);
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
      const { text, raw } = await openaiChat(messages, OPENAI_VISION_MODEL);
      rawProvider = raw;
      resultJson = JSON.parse(text);
    } else if (body.mode === 'weekly_report') {
      const messages: ChatMsg[] = [
        { role: 'system', content: baseSystemPrompt() + '\nRetorne JSON no formato {"summary":"...","highlights":["..."],"risks":["..."],"next_week":["..."]}' },
        { role: 'user', content: JSON.stringify({ company_id: companyId, metrics: body.metrics ?? {} }) },
      ];
      const { text, raw } = await openaiChat(messages, OPENAI_MODEL);
      rawProvider = raw;
      resultJson = JSON.parse(text);
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
      },
      output: resultJson ?? {},
    };
    await supabaseAdmin.from('ai_events').insert([event] as any);

    return jsonResponse(200, { ok: true, result: resultJson });
  } catch (e: any) {
    return jsonResponse(500, { ok: false, error: e?.message ?? 'unknown error' });
  }
});

