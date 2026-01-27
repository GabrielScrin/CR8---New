// Supabase Edge Function: ai-assistant (Phase 4 + RAG)
// - General "IA Helper" for the UI
// - SDR reply suggestions for LiveChat
// - Retrieval-Augmented Generation (RAG) using ai_knowledge_chunks mechanism
//
// Required env:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY

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
  const token = match[1]?.split(',')[0]?.trim();
  return token ? token : null;
};

type Mode = 'helper' | 'sdr_reply' | 'creative_analysis' | 'weekly_report' | 'wa_template';
type Provider = 'openai' | 'google' | 'anthropic' | 'deepseek';

type Body = {
  mode: Mode;
  company_id?: string;
  chat_id?: string;
  context_view?: string;
  user_message?: string;
  image_url?: string;
  metrics?: Record<string, unknown>;
  template_prompt?: string;
  template_language?: string;
  template_category?: string;
  template_name_hint?: string;
  provider?: Provider;
  api_key?: string;
  model?: string;
  access_token?: string;
  agent_id?: string; // NEW for RAG
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

const waTemplatePrompt = (args: { language: string; category: string; nameHint?: string | null }) => {
  const language = String(args.language || 'pt_BR');
  const category = String(args.category || 'UTILITY');
  const hint = String(args.nameHint || '').trim();

  return (
    baseSystemPrompt() +
    '\n\n' +
    [
      'Você vai gerar um TEMPLATE do WhatsApp (Meta Cloud API) para ser criado via Graph API /{WABA_ID}/message_templates.',
      'Regras importantes:',
      '- Responda SOMENTE com JSON válido (um único objeto).',
      '- Use category em MAIÚSCULO (ex: UTILITY, MARKETING, AUTHENTICATION). Categoria solicitada: ' + category,
      '- Use language no padrão WhatsApp (ex: pt_BR). Idioma solicitado: ' + language,
      '- O "name" deve ser válido para template: letras minúsculas, números e underscore, sem espaços, começando com letra.',
      hint ? `- Dica de nome (opcional): ${hint}` : '- Se não houver dica de nome, gere um nome simples baseado no conteúdo.',
      '- Use parameter_format "positional" (padrão). Logo, use placeholders {{1}}, {{2}}, ... sem buracos.',
      '- Sempre inclua components com pelo menos BODY.',
      '- Se o BODY tiver placeholders, inclua example.body_text com uma linha de exemplos.',
      '- Se incluir HEADER de texto com placeholder, inclua example.header_text (máx 1 variável).',
      '- Não use HEADER de mídia (IMAGE/VIDEO/DOCUMENT) neste modo (exigiria header_handle).',
      '',
      'Formato de saída obrigatório:',
      '{',
      '  "name": "exemplo_template",',
      '  "language": "pt_BR",',
      '  "category": "UTILITY",',
      '  "parameter_format": "positional",',
      '  "components": [ ... componentes no formato da Meta ... ]',
      '}',
    ].join('\n')
  );
};

// --- EMBEDDING HELPERS (Duplicated from knowledge-processor to remain self-contained) ---

async function generateEmbeddingOpenAI(text: string, apiKey: string, model = 'text-embedding-3-small'): Promise<number[]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ input: text, model }),
  });

  if (!res.ok) {
    /* Silently fail or log? Throw to catch in main flow */
    const err = await res.text();
    throw new Error(`OpenAI Embedding Error: ${err}`);
  }

  const data = await res.json();
  return data.data[0].embedding;
}

async function generateEmbeddingGoogle(text: string, apiKey: string, model = 'text-embedding-004'): Promise<number[]> {
  const modelId = model.startsWith('models/') ? model : `models/${model}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/${modelId}:embedContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: { parts: [{ text }] },
      taskType: 'RETRIEVAL_QUERY',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Embedding Error: ${err}`);
  }

  const data = await res.json();
  return data.embedding.values;
}

// --- LLM HELPERS ---

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
    return openaiCompatibleChat({ apiKey, baseUrl: 'https://api.openai.com/v1', model, messages });
  }

  if (provider === 'deepseek') {
    if (isVision) throw new Error('vision_not_supported_for_provider_deepseek');
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

function normalizeWaTemplateResult(result: any, defaults: { language: string; category: string }) {
  const src = result?.template && typeof result.template === 'object' ? result.template : result;

  const name = String(src?.name ?? '').trim();
  const language = String(src?.language ?? defaults.language ?? 'pt_BR').trim() || 'pt_BR';
  const category = String(src?.category ?? defaults.category ?? 'UTILITY').trim() || 'UTILITY';
  const components = src?.components;

  return {
    name,
    language,
    category,
    components: Array.isArray(components) ? components : [],
  };
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

    // ==================================================================================
    // RAG RETRIEVAL (Phase 4)
    // ==================================================================================
    let contextText = '';

    if (body.agent_id) {
      // Fetch Agent
      const { data: agent } = await supabaseAdmin.from('ai_agents').select('*').eq('id', body.agent_id).single();
      if (agent) {
        let searchQuery = body.user_message;

        // For SDR mode auto-reply, user_message might be empty in body, need to use history.
        if (!searchQuery && body.mode === 'sdr_reply' && body.chat_id) {
          const history = await loadChatHistory(body.chat_id, 3);
          // Try to find the last user message
          const lastUserMsg = history.find(m => m.sender !== 'agent' && m.sender !== 'system');
          if (lastUserMsg) searchQuery = lastUserMsg.content;
        }

        if (searchQuery && apiKey) {
          try {
            const provider = agent.embedding_provider || 'openai';
            const model = agent.embedding_model || (provider === 'google' ? 'text-embedding-004' : 'text-embedding-3-small');
            let embedding: number[] = [];

            if (provider === 'google') {
              embedding = await generateEmbeddingGoogle(searchQuery, apiKey, model);
            } else {
              embedding = await generateEmbeddingOpenAI(searchQuery, apiKey, model);
            }

            if (embedding && embedding.length > 0) {
              const { data: chunks, error: rpcError } = await supabaseAdmin.rpc('match_knowledge', {
                query_embedding: embedding,
                match_threshold: agent.rag_similarity_threshold || 0.5,
                match_count: agent.rag_max_results || 5,
                filter_agent_id: agent.id
              });

              if (!rpcError && chunks && chunks.length > 0) {
                // Deduplicate or format?
                contextText = chunks.map((c: any) => c.chunk_content).join('\n---\n');
              }
            }
          } catch (e) {
            console.warn('RAG Retrieval failed', e);
          }
        }
      }
    }
    // ==================================================================================

    let resultJson: any = null;
    let rawProvider: any = null;

    if (body.mode === 'helper') {
      const messages: ChatMsg[] = [
        { role: 'system', content: helperPrompt(body.context_view ?? null, prompts.helper) + (contextText ? `\n\nContexto da Base de Conhecimento:\n${contextText}` : '') },
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
        { role: 'system', content: sdrPrompt(prompts.sdr) + (contextText ? `\n\nContexto da Base de Conhecimento (Use estas informações para responder se relevante):\n${contextText}` : '') },
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
    } else if (body.mode === 'wa_template') {
      const templatePrompt = String(body.template_prompt ?? body.user_message ?? '').trim();
      if (!templatePrompt) return jsonResponse(400, { ok: false, error: 'missing template_prompt' });

      const language = String(body.template_language ?? 'pt_BR').trim() || 'pt_BR';
      const category = String(body.template_category ?? 'UTILITY').trim() || 'UTILITY';
      const nameHint = body.template_name_hint ? String(body.template_name_hint) : null;

      const messages: ChatMsg[] = [
        { role: 'system', content: waTemplatePrompt({ language, category, nameHint }) },
        { role: 'user', content: templatePrompt },
      ];

      const model = body.model ?? defaultModelForProvider(provider);
      const { text, raw } = await llmChat(provider, apiKey, model, messages, false);
      rawProvider = raw;

      const parsed = safeJsonParse(text);
      const normalized = normalizeWaTemplateResult(parsed, { language, category });
      if (!normalized.name) return jsonResponse(502, { ok: false, error: 'invalid template: missing name', raw: parsed });
      if (!Array.isArray(normalized.components) || normalized.components.length === 0) {
        return jsonResponse(502, { ok: false, error: 'invalid template: missing components', raw: parsed });
      }
      resultJson = normalized;
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
        template_language: body.template_language ?? null,
        template_category: body.template_category ?? null,
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
