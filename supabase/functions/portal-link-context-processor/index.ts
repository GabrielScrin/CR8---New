import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';
import mammoth from 'npm:mammoth@1.9.1';
import * as pdfjsLib from 'npm:pdfjs-dist@4.4.168/legacy/build/pdf.mjs';

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const EMBEDDING_MODEL = 'text-embedding-3-small';
const STORAGE_BUCKET = 'portal-link-context';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const jsonResponse = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });

const asString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const normalizeText = (text: string) =>
  text
    .replace(/\u0000/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

const splitText = (text: string, chunkSize = 1200, overlap = 180) => {
  const clean = normalizeText(text);
  if (!clean) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + chunkSize, clean.length);
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start += chunkSize - overlap;
  }
  return chunks.filter(Boolean);
};

const toArrayBuffer = (bytes: Uint8Array) =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

const generateEmbedding = async (text: string) => {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String((payload as any)?.error?.message ?? `Embedding failed (${response.status})`));
  }

  const embedding = (payload as any)?.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) throw new Error('Empty embedding');
  return embedding as number[];
};

const extractPdfText = async (bytes: Uint8Array) => {
  const loadingTask = pdfjsLib.getDocument({
    data: bytes,
    useSystemFonts: true,
    isEvalSupported: false,
  });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const lines = (textContent.items ?? [])
      .map((item: any) => ('str' in item ? String(item.str ?? '') : ''))
      .join(' ');
    pages.push(lines);
  }
  return normalizeText(pages.join('\n\n'));
};

const extractDocxText = async (bytes: Uint8Array) => {
  const result = await mammoth.extractRawText({ arrayBuffer: toArrayBuffer(bytes) });
  return normalizeText(result.value ?? '');
};

const extractTextFromBytes = async (bytes: Uint8Array, mimeType: string, fileName: string) => {
  const normalizedMime = mimeType.toLowerCase();
  const lowerName = fileName.toLowerCase();
  if (normalizedMime === 'text/plain' || lowerName.endsWith('.txt')) {
    return normalizeText(new TextDecoder().decode(bytes));
  }
  if (normalizedMime === 'application/pdf' || lowerName.endsWith('.pdf')) {
    return await extractPdfText(bytes);
  }
  if (
    normalizedMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lowerName.endsWith('.docx')
  ) {
    return await extractDocxText(bytes);
  }
  throw new Error('Formato nao suportado. Use PDF, DOCX ou TXT.');
};

const replaceManualChunks = async (portalLinkId: string, text: string) => {
  await supabaseAdmin
    .from('portal_link_context_chunks')
    .delete()
    .eq('portal_link_id', portalLinkId)
    .eq('source_type', 'manual');

  const chunks = splitText(text);
  for (let index = 0; index < chunks.length; index += 1) {
    const chunkContent = chunks[index];
    const embedding = await generateEmbedding(chunkContent);
    const { error } = await supabaseAdmin.from('portal_link_context_chunks').insert({
      portal_link_id: portalLinkId,
      file_id: null,
      source_type: 'manual',
      chunk_index: index,
      chunk_content: chunkContent,
      embedding,
    });
    if (error) throw error;
  }
  return chunks.length;
};

const indexManualContext = async (portalLinkId: string) => {
  const { data, error } = await supabaseAdmin
    .from('portal_links')
    .select('project_context_text')
    .eq('id', portalLinkId)
    .maybeSingle();

  if (error) throw error;
  const text = normalizeText(asString((data as any)?.project_context_text));
  return await replaceManualChunks(portalLinkId, text);
};

const indexFileContext = async (contextFileId: string) => {
  const { data, error } = await supabaseAdmin
    .from('portal_link_context_files')
    .select('id,portal_link_id,name,mime_type,storage_path')
    .eq('id', contextFileId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Arquivo de contexto nao encontrado.');

  await supabaseAdmin
    .from('portal_link_context_files')
    .update({ indexing_status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', contextFileId);

  const fileRow = data as {
    id: string;
    portal_link_id: string;
    name: string;
    mime_type: string;
    storage_path: string;
  };

  const { data: downloaded, error: downloadError } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .download(fileRow.storage_path);

  if (downloadError || !downloaded) throw downloadError ?? new Error('Falha ao baixar arquivo do storage.');

  const bytes = new Uint8Array(await downloaded.arrayBuffer());
  const extractedText = await extractTextFromBytes(bytes, fileRow.mime_type, fileRow.name);

  await supabaseAdmin
    .from('portal_link_context_chunks')
    .delete()
    .eq('file_id', contextFileId);

  const chunks = splitText(extractedText);
  for (let index = 0; index < chunks.length; index += 1) {
    const chunkContent = chunks[index];
    const embedding = await generateEmbedding(chunkContent);
    const { error: insertError } = await supabaseAdmin.from('portal_link_context_chunks').insert({
      portal_link_id: fileRow.portal_link_id,
      file_id: contextFileId,
      source_type: 'file',
      chunk_index: index,
      chunk_content: chunkContent,
      embedding,
    });
    if (insertError) throw insertError;
  }

  const { error: updateError } = await supabaseAdmin
    .from('portal_link_context_files')
    .update({
      extracted_text: extractedText,
      indexing_status: 'completed',
      chunks_count: chunks.length,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contextFileId);

  if (updateError) throw updateError;
  return chunks.length;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse(405, { ok: false, error: 'method not allowed' });

  const body = await req.json().catch(() => ({}));
  const mode = asString((body as any)?.mode);
  const contextFileId = asString((body as any)?.context_file_id);

  try {
    if (mode === 'reindex_manual_context') {
      const portalLinkId = asString((body as any)?.portal_link_id);
      if (!portalLinkId) return jsonResponse(400, { ok: false, error: 'portal_link_id ausente' });
      const chunks = await indexManualContext(portalLinkId);
      return jsonResponse(200, { ok: true, chunks });
    }

    if (mode === 'index_file') {
      const contextFileId = asString((body as any)?.context_file_id);
      if (!contextFileId) return jsonResponse(400, { ok: false, error: 'context_file_id ausente' });
      const chunks = await indexFileContext(contextFileId);
      return jsonResponse(200, { ok: true, chunks });
    }

    return jsonResponse(400, { ok: false, error: 'modo invalido' });
  } catch (error: any) {
    if (contextFileId) {
      await supabaseAdmin
        .from('portal_link_context_files')
        .update({ indexing_status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', contextFileId);
    }
    return jsonResponse(500, { ok: false, error: error?.message ?? 'erro interno' });
  }
});
