'use client'

/**
 * AIAgentForm - Create/Edit form for AI agents
 * Form with all agent configuration options
 */

import React, { useState, useEffect } from 'react'
import { Bot, Sparkles, SlidersHorizontal, Database, Search, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible'
import type { AIAgent, EmbeddingProvider, RerankProvider } from '@/types'
import type { CreateAIAgentParams, UpdateAIAgentParams } from '@/services/aiAgentService'
import { DEFAULT_MODEL_ID, AI_PROVIDERS, type AIProvider } from '@/lib/ai/model'
import { EMBEDDING_PROVIDERS, DEFAULT_EMBEDDING_CONFIG } from '@/lib/ai/embeddings'
import { RERANK_PROVIDERS } from '@/lib/ai/reranking'

// Default handoff instructions
const DEFAULT_HANDOFF_INSTRUCTIONS = `Só transfira para humano quando o cliente PEDIR EXPLICITAMENTE para falar com uma pessoa, humano ou atendente.

Se o cliente estiver frustrado ou insatisfeito:
1. Primeiro peça desculpas e tente resolver
2. Ofereça a OPÇÃO de falar com humano
3. Só transfira se ele aceitar`

// Default system prompt template (minimalista - baseado em padrões do Google)
const DEFAULT_SYSTEM_PROMPT = `Você é a [nome], assistente virtual da [empresa].

Você ajuda clientes com dúvidas sobre produtos e pedidos.

Seja amigável e objetivo. Se não souber algo, diga que vai verificar.`

export interface AIAgentFormProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    agent?: AIAgent | null
    onSubmit: (params: CreateAIAgentParams | UpdateAIAgentParams) => Promise<void>
    isSubmitting?: boolean
}

export function AIAgentForm({
    open,
    onOpenChange,
    agent,
    onSubmit,
    isSubmitting,
}: AIAgentFormProps) {
    const isEditing = !!agent

    // Form state
    const [name, setName] = useState('')
    const [systemPrompt, setSystemPrompt] = useState('')
    const [model, setModel] = useState(DEFAULT_MODEL_ID)
    const [temperature, setTemperature] = useState(0.7)
    const [maxTokens, setMaxTokens] = useState(1024)
    const [debounceMs, setDebounceMs] = useState(5000)
    const [isActive, setIsActive] = useState(true)
    const [isDefault, setIsDefault] = useState(false)
    const [handoffEnabled, setHandoffEnabled] = useState(true)
    const [handoffInstructions, setHandoffInstructions] = useState('')
    const [bookingToolEnabled, setBookingToolEnabled] = useState(false)

    // RAG: Embedding config
    // Cast handling for potential nulls from DB
    const [embeddingProvider, setEmbeddingProvider] = useState<EmbeddingProvider>(
        (agent?.embedding_provider as EmbeddingProvider) || DEFAULT_EMBEDDING_CONFIG.provider
    )
    const [embeddingModel, setEmbeddingModel] = useState(agent?.embedding_model || DEFAULT_EMBEDDING_CONFIG.model)
    const [embeddingDimensions, setEmbeddingDimensions] = useState(agent?.embedding_dimensions || DEFAULT_EMBEDDING_CONFIG.dimensions)

    // RAG: Search config
    const [ragSimilarityThreshold, setRagSimilarityThreshold] = useState(agent?.rag_similarity_threshold || 0.5)
    const [ragMaxResults, setRagMaxResults] = useState(agent?.rag_max_results || 5)

    // RAG: Reranking config
    const [rerankEnabled, setRerankEnabled] = useState(agent?.rerank_enabled || false)
    const [rerankProvider, setRerankProvider] = useState<RerankProvider | null>(
        (agent?.rerank_provider as RerankProvider) || null
    )
    const [rerankModel, setRerankModel] = useState<string | null>(agent?.rerank_model || null)
    const [rerankTopK, setRerankTopK] = useState(agent?.rerank_top_k || 5)

    // RAG config expanded state
    const [ragConfigOpen, setRagConfigOpen] = useState(false)

    // Reset form when agent changes
    useEffect(() => {
        if (agent) {
            setName(agent.name)
            setSystemPrompt(agent.system_prompt)
            setModel(agent.model)
            setTemperature(agent.temperature)
            setMaxTokens(agent.max_tokens)
            setDebounceMs(agent.debounce_ms)
            setIsActive(agent.is_active)
            setIsDefault(agent.is_default)
            setHandoffEnabled(agent.handoff_enabled ?? true)
            setHandoffInstructions(agent.handoff_instructions || DEFAULT_HANDOFF_INSTRUCTIONS)
            setBookingToolEnabled(agent.booking_tool_enabled ?? false)
            // RAG config
            setEmbeddingProvider((agent.embedding_provider as EmbeddingProvider) || DEFAULT_EMBEDDING_CONFIG.provider)
            setEmbeddingModel(agent.embedding_model || DEFAULT_EMBEDDING_CONFIG.model)
            setEmbeddingDimensions(agent.embedding_dimensions || DEFAULT_EMBEDDING_CONFIG.dimensions)
            setRagSimilarityThreshold(agent.rag_similarity_threshold || 0.5)
            setRagMaxResults(agent.rag_max_results || 5)
            // Reranking config
            setRerankEnabled(agent.rerank_enabled || false)
            setRerankProvider((agent.rerank_provider as RerankProvider) || null)
            setRerankModel(agent.rerank_model || null)
            setRerankTopK(agent.rerank_top_k || 5)
        } else {
            // Reset to defaults for new agent
            setName('')
            setSystemPrompt(DEFAULT_SYSTEM_PROMPT)
            setModel(DEFAULT_MODEL_ID)
            setTemperature(0.7)
            setMaxTokens(1024)
            setDebounceMs(5000)
            setIsActive(true)
            setIsDefault(false)
            setHandoffEnabled(true)
            setHandoffInstructions(DEFAULT_HANDOFF_INSTRUCTIONS)
            setBookingToolEnabled(false)
            // RAG config defaults
            setEmbeddingProvider(DEFAULT_EMBEDDING_CONFIG.provider)
            setEmbeddingModel(DEFAULT_EMBEDDING_CONFIG.model)
            setEmbeddingDimensions(DEFAULT_EMBEDDING_CONFIG.dimensions)
            setRagSimilarityThreshold(0.5)
            setRagMaxResults(5)
            // Reranking defaults
            setRerankEnabled(false)
            setRerankProvider(null)
            setRerankModel(null)
            setRerankTopK(5)
        }
    }, [agent, open])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        const params: CreateAIAgentParams = {
            name,
            system_prompt: systemPrompt,
            model,
            temperature,
            max_tokens: maxTokens,
            debounce_ms: debounceMs,
            is_active: isActive,
            is_default: isDefault,
            handoff_enabled: handoffEnabled,
            handoff_instructions: handoffEnabled ? handoffInstructions : null,
            booking_tool_enabled: bookingToolEnabled,
            // RAG config
            embedding_provider: embeddingProvider,
            embedding_model: embeddingModel,
            embedding_dimensions: embeddingDimensions,
            rag_similarity_threshold: ragSimilarityThreshold,
            rag_max_results: ragMaxResults,
            // Reranking config
            rerank_enabled: rerankEnabled,
            rerank_provider: rerankEnabled ? rerankProvider : null,
            rerank_model: rerankEnabled ? rerankModel : null,
            rerank_top_k: rerankTopK,
        }

        await onSubmit(params)
    }

    // Get models for selected embedding provider
    const availableEmbeddingModels = EMBEDDING_PROVIDERS.find(p => p.id === embeddingProvider)?.models || []

    // Handle provider change - auto-select first model and update dimensions
    const handleEmbeddingProviderChange = (provider: EmbeddingProvider) => {
        setEmbeddingProvider(provider)
        const providerInfo = EMBEDDING_PROVIDERS.find(p => p.id === provider)
        if (providerInfo && providerInfo.models.length > 0) {
            setEmbeddingModel(providerInfo.models[0].id)
            setEmbeddingDimensions(providerInfo.models[0].dimensions)
        }
    }

    // Handle model change - auto-update dimensions
    const handleEmbeddingModelChange = (modelId: string) => {
        setEmbeddingModel(modelId)
        const modelInfo = availableEmbeddingModels.find(m => m.id === modelId)
        if (modelInfo) {
            setEmbeddingDimensions(modelInfo.dimensions)
        }
    }

    // Get models for selected reranking provider
    const availableRerankModels = rerankProvider
        ? RERANK_PROVIDERS.find(p => p.id === rerankProvider)?.models || []
        : []

    // Handle rerank provider change - auto-select first model
    const handleRerankProviderChange = (provider: RerankProvider) => {
        setRerankProvider(provider)
        const providerInfo = RERANK_PROVIDERS.find(p => p.id === provider)
        if (providerInfo && providerInfo.models.length > 0) {
            setRerankModel(providerInfo.models[0].id)
        }
    }

    // Handle rerank toggle
    const handleRerankToggle = (enabled: boolean) => {
        setRerankEnabled(enabled)
        if (enabled && !rerankProvider) {
            // Auto-select Cohere as default provider
            handleRerankProviderChange('cohere')
        }
    }

    // Get selected model info
    const selectedModel = AI_PROVIDERS.flatMap(p => p.models).find((m) => m.id === model)

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-lg">
                {/* Header fixo */}
                <SheetHeader className="border-b border-[var(--ds-border-default)] px-6 py-4">
                    <SheetTitle className="flex items-center gap-2 text-lg">
                        <Bot className="h-5 w-5 text-primary-400" />
                        {isEditing ? 'Editar Agente' : 'Novo Agente IA'}
                    </SheetTitle>
                    <SheetDescription>
                        Configure o comportamento do agente de atendimento automático
                    </SheetDescription>
                </SheetHeader>

                {/* Conteúdo com scroll */}
                <form
                    id="agent-form"
                    onSubmit={handleSubmit}
                    className="flex-1 overflow-y-auto"
                >
                    <div className="space-y-6 px-6 py-6">
                        {/* ═══════════════════════════════════════════════════════════════
                SEÇÃO: Identificação
            ═══════════════════════════════════════════════════════════════ */}
                        <div className="space-y-4">
                            {/* Name */}
                            <div className="space-y-2">
                                <Label htmlFor="name">Nome do Agente</Label>
                                <Input
                                    id="name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Ex: Atendente Virtual"
                                    required
                                />
                            </div>

                            {/* Model */}
                            <div className="space-y-2">
                                <Label htmlFor="model">Modelo IA</Label>
                                <Select value={model} onValueChange={setModel}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecione um modelo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {AI_PROVIDERS.map((provider) => (
                                            <SelectGroup key={provider.id}>
                                                <SelectLabel className="flex items-center gap-2 text-xs font-semibold text-zinc-400">
                                                    <span>{provider.icon}</span>
                                                    <span>{provider.name}</span>
                                                </SelectLabel>
                                                {provider.models.map((m, index) => (
                                                    <SelectItem key={m.id} value={m.id}>
                                                        <div className="flex items-center gap-2">
                                                            <span>{m.name}</span>
                                                            {index === 0 && provider.id === 'google' && (
                                                                <span className="rounded bg-primary-500/20 px-1.5 py-0.5 text-[10px] font-medium text-primary-400">
                                                                    Recomendado
                                                                </span>
                                                            )}
                                                        </div>
                                                    </SelectItem>
                                                ))}
                                            </SelectGroup>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {selectedModel && (
                                    <p className="text-xs text-[var(--ds-text-muted)]">{selectedModel.description}</p>
                                )}
                            </div>
                        </div>

                        {/* ═══════════════════════════════════════════════════════════════
                SEÇÃO: System Prompt
            ═══════════════════════════════════════════════════════════════ */}
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-primary-400" />
                                <Label htmlFor="systemPrompt">System Prompt</Label>
                            </div>
                            <Textarea
                                id="systemPrompt"
                                value={systemPrompt}
                                onChange={(e) => setSystemPrompt(e.target.value)}
                                placeholder="Descreva como o agente deve se comportar..."
                                className="min-h-[180px] resize-none font-mono text-sm"
                                required
                            />
                            <p className="text-xs text-[var(--ds-text-muted)]">
                                Dica: Defina quem é o agente, o que ele faz e como deve se comportar. Quanto mais claro, melhor.
                            </p>
                        </div>

                        {/* ═══════════════════════════════════════════════════════════════
                SEÇÃO: Parâmetros Avançados
            ═══════════════════════════════════════════════════════════════ */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 border-b border-[var(--ds-border-default)] pb-2">
                                <SlidersHorizontal className="h-4 w-4 text-[var(--ds-text-muted)]" />
                                <span className="text-sm font-medium text-[var(--ds-text-secondary)]">
                                    Parâmetros Avançados
                                </span>
                            </div>

                            {/* Temperature */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-sm">Temperature</Label>
                                    <span className="rounded bg-[var(--ds-bg-surface)] px-2 py-0.5 text-xs font-mono text-[var(--ds-text-secondary)]">
                                        {temperature.toFixed(1)}
                                    </span>
                                </div>
                                <Slider
                                    value={[temperature]}
                                    onValueChange={([v]) => setTemperature(v)}
                                    min={0}
                                    max={2}
                                    step={0.1}
                                    className="w-full"
                                />
                                <div className="flex justify-between text-[10px] text-[var(--ds-text-muted)]">
                                    <span>Focado</span>
                                    <span>Criativo</span>
                                </div>
                            </div>

                            {/* Max Tokens */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-sm">Max Tokens</Label>
                                    <span className="rounded bg-[var(--ds-bg-surface)] px-2 py-0.5 text-xs font-mono text-[var(--ds-text-secondary)]">
                                        {maxTokens}
                                    </span>
                                </div>
                                <Slider
                                    value={[maxTokens]}
                                    onValueChange={([v]) => setMaxTokens(v)}
                                    min={256}
                                    max={4096}
                                    step={128}
                                    className="w-full"
                                />
                                <div className="flex justify-between text-[10px] text-[var(--ds-text-muted)]">
                                    <span>Curto (256)</span>
                                    <span>Longo (4096)</span>
                                </div>
                            </div>

                            {/* Debounce */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-sm">Debounce</Label>
                                    <span className="rounded bg-[var(--ds-bg-surface)] px-2 py-0.5 text-xs font-mono text-[var(--ds-text-secondary)]">
                                        {debounceMs / 1000}s
                                    </span>
                                </div>
                                <Slider
                                    value={[debounceMs]}
                                    onValueChange={([v]) => setDebounceMs(v)}
                                    min={1000}
                                    max={15000}
                                    step={1000}
                                    className="w-full"
                                />
                                <p className="text-[10px] text-[var(--ds-text-muted)]">
                                    Aguarda mensagens consecutivas antes de responder
                                </p>
                            </div>
                        </div>

                        {/* ═══════════════════════════════════════════════════════════════
                SEÇÃO: Configuração RAG (Knowledge Base)
            ═══════════════════════════════════════════════════════════════ */}
                        <Collapsible open={ragConfigOpen} onOpenChange={setRagConfigOpen}>
                            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-4 py-3 text-left transition-colors hover:bg-[var(--ds-bg-surface)]" type="button">
                                <div className="flex items-center gap-2">
                                    <Database className="h-4 w-4 text-primary-400" />
                                    <div>
                                        <span className="text-sm font-medium">Configuração RAG</span>
                                        <p className="text-xs text-[var(--ds-text-muted)]">
                                            {embeddingProvider === 'google' ? 'Google Gemini' : 'OpenAI'} • {embeddingDimensions} dimensões
                                        </p>
                                    </div>
                                </div>
                                <Search className={`h-4 w-4 text-[var(--ds-text-muted)] transition-transform ${ragConfigOpen ? 'rotate-90' : ''}`} />
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-3 space-y-4 rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4">
                                {/* Embedding Provider */}
                                <div className="space-y-2">
                                    <Label htmlFor="embeddingProvider" className="text-sm">
                                        Provider de Embedding
                                    </Label>
                                    <Select
                                        value={embeddingProvider}
                                        onValueChange={(v) => handleEmbeddingProviderChange(v as EmbeddingProvider)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecione um provider" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {EMBEDDING_PROVIDERS.map((p) => (
                                                <SelectItem key={p.id} value={p.id}>
                                                    <div className="flex items-center gap-2">
                                                        <span>{p.name}</span>
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Embedding Model */}
                                <div className="space-y-2">
                                    <Label htmlFor="embeddingModel" className="text-sm">
                                        Modelo de Embedding
                                    </Label>
                                    <Select
                                        value={embeddingModel}
                                        onValueChange={handleEmbeddingModelChange}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecione um modelo" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableEmbeddingModels.map((m) => (
                                                <SelectItem key={m.id} value={m.id}>
                                                    <div className="flex items-center gap-2">
                                                        <span>{m.name}</span>
                                                        <span className="text-[10px] text-[var(--ds-text-muted)]">
                                                            {m.dimensions}d • ${m.pricePerMillion}/1M
                                                        </span>
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-[10px] text-[var(--ds-text-muted)]">
                                        Dimensões: {embeddingDimensions} • Custo por 1M tokens
                                    </p>
                                </div>

                                {/* Similarity Threshold */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-sm">Threshold de Similaridade</Label>
                                        <span className="rounded bg-[var(--ds-bg-surface)] px-2 py-0.5 text-xs font-mono text-[var(--ds-text-secondary)]">
                                            {ragSimilarityThreshold.toFixed(2)}
                                        </span>
                                    </div>
                                    <Slider
                                        value={[ragSimilarityThreshold]}
                                        onValueChange={([v]) => setRagSimilarityThreshold(v)}
                                        min={0.1}
                                        max={0.95}
                                        step={0.05}
                                        className="w-full"
                                    />
                                    <div className="flex justify-between text-[10px] text-[var(--ds-text-muted)]">
                                        <span>Mais resultados</span>
                                        <span>Mais precisão</span>
                                    </div>
                                </div>

                                {/* Max Results */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-sm">Máximo de Resultados</Label>
                                        <span className="rounded bg-[var(--ds-bg-surface)] px-2 py-0.5 text-xs font-mono text-[var(--ds-text-secondary)]">
                                            {ragMaxResults}
                                        </span>
                                    </div>
                                    <Slider
                                        value={[ragMaxResults]}
                                        onValueChange={([v]) => setRagMaxResults(v)}
                                        min={1}
                                        max={15}
                                        step={1}
                                        className="w-full"
                                    />
                                    <p className="text-[10px] text-[var(--ds-text-muted)]">
                                        Quantidade de chunks retornados da knowledge base
                                    </p>
                                </div>

                                {/* Divider */}
                                <div className="border-t border-[var(--ds-border-default)]" />

                                {/* Reranking Toggle */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <Label htmlFor="rerankEnabled" className="text-sm">
                                            Reranking (Avançado)
                                        </Label>
                                        <p className="text-[10px] text-[var(--ds-text-muted)]">
                                            Melhora precisão em bases grandes (+200-500ms latência)
                                        </p>
                                    </div>
                                    <Switch
                                        id="rerankEnabled"
                                        checked={rerankEnabled}
                                        onCheckedChange={handleRerankToggle}
                                    />
                                </div>

                                {/* Reranking Config (when enabled) */}
                                {rerankEnabled && (
                                    <div className="space-y-4 rounded-md border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-3">
                                        {/* Rerank Provider */}
                                        <div className="space-y-2">
                                            <Label className="text-sm">Provider de Reranking</Label>
                                            <Select
                                                value={rerankProvider || ''}
                                                onValueChange={(v) => handleRerankProviderChange(v as RerankProvider)}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecione um provider" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {RERANK_PROVIDERS.map((p) => (
                                                        <SelectItem key={p.id} value={p.id}>
                                                            {p.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="rounded-md bg-blue-500/10 p-2 text-[10px] text-blue-400">
                                            Configure a API key do {rerankProvider === 'cohere' ? 'Cohere' : 'Together.ai'} nas
                                            configurações para usar reranking.
                                        </div>
                                    </div>
                                )}
                            </CollapsibleContent>
                        </Collapsible>

                        {/* ═══════════════════════════════════════════════════════════════
                SEÇÃO: Status
            ═══════════════════════════════════════════════════════════════ */}
                        <div className="space-y-3 rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <Label htmlFor="isActive" className="text-sm">
                                        Agente ativo
                                    </Label>
                                    <p className="text-xs text-[var(--ds-text-muted)]">
                                        Desativar impede uso em conversas
                                    </p>
                                </div>
                                <Switch
                                    id="isActive"
                                    checked={isActive}
                                    onCheckedChange={setIsActive}
                                />
                            </div>

                            <div className="flex items-center justify-between border-t border-[var(--ds-border-default)] pt-3">
                                <div>
                                    <Label htmlFor="isDefault" className="text-sm">
                                        Definir como padrão
                                    </Label>
                                    <p className="text-xs text-[var(--ds-text-muted)]">
                                        {isDefault
                                            ? 'Este agente é usado em novas conversas'
                                            : 'Usado automaticamente em novas conversas'}
                                    </p>
                                </div>
                                <Switch
                                    id="isDefault"
                                    checked={isDefault}
                                    onCheckedChange={setIsDefault}
                                />
                            </div>
                        </div>
                    </div>

                    <SheetFooter className="border-t border-[var(--ds-border-default)] px-6 py-4">
                        <Button type="submit" disabled={isSubmitting} className="w-full">
                            <div className="flex items-center gap-2">
                                <Search className="h-4 w-4" />
                                {isSubmitting ? 'Salvando...' : 'Salvar Agente'}
                            </div>
                        </Button>
                    </SheetFooter>
                </form>
            </SheetContent>
        </Sheet>
    )
}
