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

// Helper: Response wrapper
const jsonResponse = (status: number, data: unknown) =>
    new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, 'content-type': 'application/json' },
    });

// Helper: Text Splitter (Simple Recursive-like)
function splitText(text: string, chunkSize = 1000, overlap = 100): string[] {
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

// Helper: OpenAI Embedding
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

// Helper: Google Gemini Embedding
async function generateEmbeddingGoogle(text: string, apiKey: string, model = 'text-embedding-004'): Promise<number[]> {
    // Google requires 'models/' prefix usually
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
        const { file_id } = await req.json();
        if (!file_id) return jsonResponse(400, { error: 'Missing file_id' });

        // 1. Fetch File & Agent Config
        const { data: file, error: fileErr } = await supabaseAdmin
            .from('ai_knowledge_files')
            .select('*, ai_agents(*)')
            .eq('id', file_id)
            .single();

        if (fileErr || !file) return jsonResponse(404, { error: 'File not found' });

        // Update status to processing
        await supabaseAdmin
            .from('ai_knowledge_files')
            .update({ indexing_status: 'processing' })
            .eq('id', file_id);

        const agent = file.ai_agents;
        const content = file.content;

        if (!content) {
            // Empty content? Mark failed.
            await supabaseAdmin.from('ai_knowledge_files').update({ indexing_status: 'failed' }).eq('id', file_id);
            return jsonResponse(400, { error: 'File has no content' });
        }

        // 2. Determine Provider & Key
        // NOTE: In a real app, keys should come from headers or a secure vault.
        // Here we rely on the client sending the key OR the backend having simple env vars fallback?
        // The previous implementation (LiveChat) sent keys from localStorage per request.
        // Since this is a background job triggered by the user upload usually, we enter a dilemma.
        //
        // SOLUTION: For now, we expect the frontend to call this function immediately after upload 
        // AND pass the API Key in the body. If not provided, we fail (unless we have a compiled-in key, which we avoid).
        //
        // Wait, the req.json() only read file_id. We need api_key from body too.

        const reqBody = await req.json().catch(() => ({})); // Re-read body? NO, can't read stream twice.
        // Actually `req.json()` consumes the stream. I should have read it once. 
        // Let's refactor to read full body first.
    } catch (e) {
        // ...
    }
});
