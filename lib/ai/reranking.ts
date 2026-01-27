/**
 * AI Reranking Configuration
 */

export type RerankProvider = 'cohere' | 'together';

export interface RerankConfig {
    provider: RerankProvider;
    model: string;
    apiKey: string;
    topK?: number;
}

export interface RerankProviderInfo {
    id: RerankProvider;
    name: string;
    models: Array<{
        id: string;
        name: string;
        description: string;
        pricePerMillion: number;
    }>;
    requiresPackage: string;
}

export const RERANK_PROVIDERS: RerankProviderInfo[] = [
    {
        id: 'cohere',
        name: 'Cohere',
        requiresPackage: '@ai-sdk/cohere',
        models: [
            {
                id: 'rerank-v3.5',
                name: 'Rerank v3.5',
                description: 'Melhor qualidade, suporte multilíngue',
                pricePerMillion: 0.05,
            },
            {
                id: 'rerank-english-v3.0',
                name: 'Rerank English v3',
                description: 'Otimizado para inglês',
                pricePerMillion: 0.05,
            },
            {
                id: 'rerank-multilingual-v3.0',
                name: 'Rerank Multilingual v3',
                description: 'Suporte a múltiplos idiomas',
                pricePerMillion: 0.05,
            },
        ],
    },
    {
        id: 'together',
        name: 'Together.ai',
        requiresPackage: '@ai-sdk/togetherai',
        models: [
            {
                id: 'Salesforce/Llama-Rank-v1',
                name: 'Llama Rank v1',
                description: 'Baseado no Llama, bom custo-benefício',
                pricePerMillion: 0.1,
            },
        ],
    },
];
