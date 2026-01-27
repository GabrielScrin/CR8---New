/**
 * AI Agent Service - Client-side Supabase operations
 * CRUD operations for AI agents configuration and Knowledge Base
 */

import { supabase } from '@/lib/supabase';
import type { AIAgent, AIKnowledgeFile, EmbeddingProvider, RerankProvider } from '@/types';
import { loadLocalAiSettings } from '@/lib/aiLocal';

// ... (Types)

// ... (API Functions)


export interface CreateAIAgentParams {
    name: string;
    system_prompt: string;
    model?: string;
    temperature?: number;
    max_tokens?: number;
    is_active?: boolean;
    is_default?: boolean;
    debounce_ms?: number;
    // RAG: Embedding config
    embedding_provider?: EmbeddingProvider;
    embedding_model?: string;
    embedding_dimensions?: number;
    // RAG: Reranking config
    rerank_enabled?: boolean;
    rerank_provider?: RerankProvider | null;
    rerank_model?: string | null;
    rerank_top_k?: number;
    // RAG: Search config
    rag_similarity_threshold?: number;
    rag_max_results?: number;
    // Handoff config
    handoff_enabled?: boolean;
    handoff_instructions?: string | null;
    // Booking tool config
    booking_tool_enabled?: boolean;
}

export interface UpdateAIAgentParams {
    name?: string;
    system_prompt?: string;
    model?: string;
    temperature?: number;
    max_tokens?: number;
    is_active?: boolean;
    is_default?: boolean;
    debounce_ms?: number;
    // RAG: Embedding config
    embedding_provider?: EmbeddingProvider;
    embedding_model?: string;
    embedding_dimensions?: number;
    // RAG: Reranking config
    rerank_enabled?: boolean;
    rerank_provider?: RerankProvider | null;
    rerank_model?: string | null;
    rerank_top_k?: number;
    // RAG: Search config
    rag_similarity_threshold?: number;
    rag_max_results?: number;
    // Handoff config
    handoff_enabled?: boolean;
    handoff_instructions?: string | null;
    // Booking tool config
    booking_tool_enabled?: boolean;
}

// =============================================================================
// API Functions
// =============================================================================

/**
 * List all AI agents
 */
async function listAgents(): Promise<AIAgent[]> {
    const { data, error } = await supabase
        .from('ai_agents')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
}

/**
 * Get a single AI agent by ID
 */
async function getAgent(id: string): Promise<AIAgent> {
    const { data, error } = await supabase
        .from('ai_agents')
        .select('*')
        .eq('id', id)
        .single();

    if (error) throw new Error(error.message);
    return data;
}

/**
 * Create a new AI agent
 */
async function createAgent(params: CreateAIAgentParams): Promise<AIAgent> {
    const { data, error } = await supabase
        .from('ai_agents')
        .insert([params])
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
}

/**
 * Update an AI agent
 */
async function updateAgent(id: string, params: UpdateAIAgentParams): Promise<AIAgent> {
    const { data, error } = await supabase
        .from('ai_agents')
        .update(params)
        .eq('id', id)
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
}

/**
 * Delete an AI agent
 */
async function deleteAgent(id: string): Promise<{ success: boolean; deleted: string }> {
    const { error } = await supabase
        .from('ai_agents')
        .delete()
        .eq('id', id);

    if (error) throw new Error(error.message);
    return { success: true, deleted: id };
}

/**
 * Set an agent as the default
 */
async function setDefaultAgent(id: string): Promise<AIAgent> {
    // Transaction-like logic needed: unset others, set this one.
    // Ideally this should be an RPC or Edge Function, but doing it clientside for now.

    // 1. Unset all defaults (optimistic, might fail race conditions without backend support)
    await supabase
        .from('ai_agents')
        .update({ is_default: false })
        .neq('id', id); // Update all except target (logic variation: update all to false first)

    // A cleaner way usually: update ALL to false, then target to true.
    // Or if RLS allows, update where is_default=true.
    await supabase.from('ai_agents').update({ is_default: false }).eq('is_default', true);

    // 2. Set target to default
    const { data, error } = await supabase
        .from('ai_agents')
        .update({ is_default: true })
        .eq('id', id)
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
}

/**
 * Toggle agent active status
 */
async function toggleAgentActive(id: string, isActive: boolean): Promise<AIAgent> {
    return updateAgent(id, { is_active: isActive });
}

// =============================================================================
// Knowledge Base Functions
// =============================================================================

async function listKnowledgeFiles(agentId: string): Promise<AIKnowledgeFile[]> {
    const { data, error } = await supabase
        .from('ai_knowledge_files')
        .select('*')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
}

async function uploadKnowledgeFile(agentId: string, file: File, content: string): Promise<AIKnowledgeFile> {
    const path = `${agentId}/${Date.now()}_${file.name}`;
    const { data, error } = await supabase
        .from('ai_knowledge_files')
        .insert([{
            agent_id: agentId,
            name: file.name,
            mime_type: file.type || 'text/plain',
            size_bytes: file.size,
            content: content,
            indexing_status: 'pending',
        }])
        .select()
        .single();

    if (error) throw new Error(error.message);

    try {
        const settings = loadLocalAiSettings();
        const apiKey = settings?.apiKey;
        if (apiKey) {
            await supabase.functions.invoke('ai-knowledge-processor', {
                body: { file_id: data.id, api_key: apiKey }
            });
        } else {
            console.warn('No API Key found in local settings, skipping automatic indexing.');
        }
    } catch (e) {
        console.error('Failed to trigger indexing:', e);
    }
    return data;
}

async function deleteKnowledgeFile(id: string): Promise<void> {
    const { error } = await supabase
        .from('ai_knowledge_files')
        .delete()
        .eq('id', id);

    if (error) throw new Error(error.message);
}

// =============================================================================
// Export Service
// =============================================================================

export const aiAgentService = {
    list: listAgents,
    get: getAgent,
    create: createAgent,
    update: updateAgent,
    delete: deleteAgent,
    setDefault: setDefaultAgent,
    toggleActive: toggleAgentActive,
    // Knowledge Base
    listFiles: listKnowledgeFiles,
    uploadFile: uploadKnowledgeFile,
    deleteFile: deleteKnowledgeFile,
};
