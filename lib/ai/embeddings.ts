/**
 * AI Embeddings - Multi-Provider Factory
 *
 * Gera embeddings vetoriais para RAG usando o Vercel AI SDK.
 * Suporta múltiplos providers: Google, OpenAI, Voyage, Cohere.
 */

// NOTE: Creating placeholder for now since dependencies might be missing in client-side Vite app.
// Real implementation requires @ai-sdk/* packages.

export type EmbeddingProvider = 'google' | 'openai' | 'voyage' | 'cohere';

export interface EmbeddingConfig {
    provider: EmbeddingProvider;
    model: string;
    dimensions: number;
    apiKey: string;
}

export interface EmbeddingProviderInfo {
    id: EmbeddingProvider;
    name: string;
    models: Array<{
        id: string;
        name: string;
        dimensions: number;
        pricePerMillion: number;
    }>;
}

export const EMBEDDING_PROVIDERS: EmbeddingProviderInfo[] = [
    {
        id: 'google',
        name: 'Google (Recomendado)',
        models: [
            { id: 'gemini-embedding-001', name: 'Gemini Embedding 001', dimensions: 768, pricePerMillion: 0.025 },
        ],
    },
    {
        id: 'openai',
        name: 'OpenAI',
        models: [
            { id: 'text-embedding-3-small', name: 'Text Embedding 3 Small', dimensions: 768, pricePerMillion: 0.02 },
            { id: 'text-embedding-3-large', name: 'Text Embedding 3 Large', dimensions: 768, pricePerMillion: 0.13 },
        ],
    },
];

export const DEFAULT_EMBEDDING_CONFIG: Omit<EmbeddingConfig, 'apiKey'> = {
    provider: 'google',
    model: 'gemini-embedding-001',
    dimensions: 768,
};

// ... (Simulated functions to avoid build errors if packages missing)
export async function generateEmbedding(
    text: string,
    config: EmbeddingConfig,
    taskType: 'query' | 'document' = 'query'
): Promise<number[]> {
    console.warn('generateEmbedding called in client - requiring backend implementation or standard Edge Function', config);
    return new Array(config.dimensions).fill(0); // Mock
}
