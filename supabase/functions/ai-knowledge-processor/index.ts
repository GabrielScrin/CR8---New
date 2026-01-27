import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const corsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
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

function splitText(text: string, chunkSize = 1000, overlap = 200): string[] {
    if (!text) return [];
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
        const end = Math.min(start + chunkSize, text.length);
        chunks.push(text.slice(start, end));
        start += chunkSize - overlap;
    }
    return chunks;
}

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
            taskType: 'RETRIEVAL_DOCUMENT',
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Google Embedding Error: ${err}`);
    }

    const data = await res.json();
    return data.embedding.values;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
        const body = await req.json().catch(() => ({}));
        const { file_id, api_key } = body;

        if (!file_id) return jsonResponse(400, { error: 'Missing file_id' });
        if (!api_key) return jsonResponse(400, { error: 'Missing api_key' });

        // 1. Fetch File & Agent Config
        const { data: file, error: fileErr } = await supabaseAdmin
            .from('ai_knowledge_files')
            .select('*, ai_agents(*)')
            .eq('id', file_id)
            .single();

        if (fileErr || !file) return jsonResponse(404, { error: 'File not found' });

        await supabaseAdmin
            .from('ai_knowledge_files')
            .update({ indexing_status: 'processing' })
            .eq('id', file_id);

        const agent = file.ai_agents;
        const content = file.content;

        if (!content) {
            await supabaseAdmin.from('ai_knowledge_files').update({ indexing_status: 'failed' }).eq('id', file_id);
            return jsonResponse(400, { error: 'File has no content' });
        }

        // 2. Chunking
        const chunks = splitText(content, 1000, 200);

        // 3. Embedding & Saving
        const provider = agent.embedding_provider || 'openai';
        const model = agent.embedding_model || (provider === 'google' ? 'text-embedding-004' : 'text-embedding-3-small');

        let processedCount = 0;

        // Delete existing chunks just in case this is a re-index
        await supabaseAdmin.from('ai_knowledge_chunks').delete().eq('file_id', file_id);

        for (let i = 0; i < chunks.length; i++) {
            const chunkText = chunks[i];
            let embedding: number[] = [];

            try {
                if (provider === 'google') {
                    embedding = await generateEmbeddingGoogle(chunkText, api_key, model);
                } else {
                    embedding = await generateEmbeddingOpenAI(chunkText, api_key, model);
                }

                await supabaseAdmin.from('ai_knowledge_chunks').insert({
                    file_id: file_id,
                    chunk_index: i,
                    chunk_content: chunkText,
                    embedding: embedding
                });

                processedCount++;
            } catch (e: any) {
                console.error(`Error processing chunk ${i}:`, e);
                // Continue or abort? Let's abort to notify user.
                await supabaseAdmin.from('ai_knowledge_files').update({ indexing_status: 'failed' }).eq('id', file_id);
                return jsonResponse(500, { error: `Failed to embed chunk ${i}`, details: e.message });
            }
        }

        await supabaseAdmin
            .from('ai_knowledge_files')
            .update({
                indexing_status: 'completed',
                chunks_count: processedCount,
                updated_at: new Date().toISOString()
            })
            .eq('id', file_id);

        return jsonResponse(200, { success: true, chunks_processed: processedCount });

    } catch (e: any) {
        return jsonResponse(500, { error: e.message });
    }
});
