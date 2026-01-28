'use client'

/**
 * AIAgentForm - Create/Edit form for AI agents
 * Form with all agent configuration options
 */

import React, { useState, useEffect } from 'react'
import { Bot, Sparkles, SlidersHorizontal, Database, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
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
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible'
import type { AIAgent, EmbeddingProvider, RerankProvider } from '@/types'
import type { CreateAIAgentParams, UpdateAIAgentParams } from '@/services/aiAgentService'
import { DEFAULT_MODEL_ID, AI_PROVIDERS } from '@/lib/ai/model'
import { DEFAULT_EMBEDDING_CONFIG } from '@/lib/ai/embeddings'
import { KnowledgeBaseSection } from './KnowledgeBaseSection'
import { aiAgentService } from '@/services/aiAgentService'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

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

    // Knowledge files state
    const queryClient = useQueryClient()
    const { data: knowledgeFiles = [] } = useQuery({
        queryKey: ['agent-knowledge', agent?.id],
        queryFn: () => agent ? aiAgentService.listFiles(agent.id) : Promise.resolve([]),
        enabled: !!agent && open
    })

    const uploadFileMutation = useMutation({
        mutationFn: async (file: File) => {
            if (!agent) return
            // For now, we need to extract content or send the file.
            // aiAgentService.uploadFile expects content as string.
            // In a real scenario, we might want to send the actual File.
            const reader = new FileReader()
            const content = await new Promise<string>((resolve) => {
                reader.onload = (e) => resolve(e.target?.result as string || '')
                reader.readAsText(file)
            })
            return aiAgentService.uploadFile(agent.id, file, content)
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['agent-knowledge', agent?.id] })
        }
    })

    const deleteFileMutation = useMutation({
        mutationFn: (fileId: string) => aiAgentService.deleteFile(fileId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['agent-knowledge', agent?.id] })
        }
    })

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

    // Get selected model info
    const selectedModel = AI_PROVIDERS.flatMap(p => p.models).find((m) => m.id === model)

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-0 p-0 overflow-hidden border-zinc-800 bg-[#0a0c10]/95 backdrop-blur-xl">
                {/* Header fixo */}
                <DialogHeader className="border-b border-zinc-800/50 bg-[#0a0c10]/40 px-6 py-6 backdrop-blur-md">
                    <DialogTitle className="flex items-center gap-3 text-2xl font-bold tracking-tight">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-500/10 border border-primary-500/20 shadow-inner">
                            <Bot className="h-7 w-7 text-primary-500" />
                        </div>
                        <span className="cr8-text-gradient">
                            {isEditing ? 'Editar Assistente' : 'Novo Assistente IA'}
                        </span>
                    </DialogTitle>
                    <DialogDescription className="text-zinc-400 mt-1.5 text-sm">
                        Configure o comportamento e a base de conhecimento do seu assistente
                    </DialogDescription>
                </DialogHeader>

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
                                        {AI_PROVIDERS.map((provider: any) => (
                                            <SelectGroup key={provider.id}>
                                                <SelectLabel className="flex items-center gap-2 text-xs font-semibold text-zinc-400">
                                                    <span>{provider.icon}</span>
                                                    <span>{provider.name}</span>
                                                </SelectLabel>
                                                {provider.models.map((m: any, index: number) => (
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
                                    <p className="text-xs text-zinc-500 italic">{selectedModel.description}</p>
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
                                onChange={(e: any) => setSystemPrompt(e.target.value)}
                                placeholder="Descreva como o agente deve se comportar..."
                                className="min-h-[180px] resize-none font-mono text-sm"
                                required
                            />
                            <p className="text-xs text-zinc-500">
                                Dica: Defina quem é o agente, o que ele faz e como deve se comportar. Quanto mais claro, melhor.
                            </p>
                        </div>

                        <div className="space-y-6">
                            <div className="relative py-2">
                                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                    <div className="w-full border-t border-zinc-800/80"></div>
                                </div>
                                <div className="relative flex justify-start">
                                    <span className="bg-[#0a0c10] pr-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 flex items-center gap-2">
                                        <SlidersHorizontal className="h-3.5 w-3.5" />
                                        Parâmetros Avançados
                                    </span>
                                </div>
                            </div>

                            {/* Temperature */}
                            <div className="space-y-4 pt-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-sm text-zinc-400">Temperature</Label>
                                    <span className="rounded-lg bg-zinc-800/50 border border-zinc-700/50 px-2.5 py-1 text-xs font-mono text-primary-400">
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
                                <div className="flex justify-between text-[10px] text-zinc-500">
                                    <span>Focado</span>
                                    <span>Criativo</span>
                                </div>
                            </div>

                            {/* Max Tokens */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-sm">Max Tokens</Label>
                                    <span className="rounded bg-zinc-800/50 text-zinc-300">
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
                                <div className="flex justify-between text-[10px] text-zinc-500">
                                    <span>Curto (256)</span>
                                    <span>Longo (4096)</span>
                                </div>
                            </div>

                            {/* Debounce */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-sm">Debounce</Label>
                                    <span className="rounded bg-zinc-800/50 text-zinc-300">
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
                                <p className="text-[10px] text-zinc-500">
                                    Aguarda mensagens consecutivas antes de responder
                                </p>
                            </div>
                        </div>

                        {/* ═══════════════════════════════════════════════════════════════
                SEÇÃO: Knowledge Base (RAG)
            ═══════════════════════════════════════════════════════════════ */}
                        {isEditing ? (
                            <KnowledgeBaseSection
                                files={knowledgeFiles}
                                onUpload={async (file) => { await uploadFileMutation.mutateAsync(file) }}
                                onDelete={async (id) => { await deleteFileMutation.mutateAsync(id) }}
                                isUploading={uploadFileMutation.isPending}
                            />
                        ) : (
                            <div className="p-6 rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/10 text-center">
                                <Database className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
                                <p className="text-sm text-zinc-400">Salve o assistente primeiro para começar a adicionar documentos à base de conhecimento.</p>
                            </div>
                        )}

                        {/* Configurações Técnicas de RAG (Opcional/Colapsável) */}
                        <Collapsible open={ragConfigOpen} onOpenChange={setRagConfigOpen}>
                            <CollapsibleTrigger className="flex w-full items-center justify-between px-2 py-1 text-left opacity-60 hover:opacity-100 transition-opacity" type="button">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Configurações Avançadas de Busca</span>
                                <Search className={cn("h-3 w-3 transition-transform", ragConfigOpen && "rotate-90")} />
                            </CollapsibleTrigger>
                            <CollapsibleContent className="space-y-6 pt-4">
                                {/* Similarity Threshold */}
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-sm text-zinc-400">Threshold de Similaridade</Label>
                                        <span className="rounded-lg bg-zinc-800/50 border border-zinc-700/50 px-2.5 py-1 text-xs font-mono text-zinc-300">
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
                                    <div className="flex justify-between text-[10px] text-zinc-500">
                                        <span>Mais resultados</span>
                                        <span>Mais precisão</span>
                                    </div>
                                </div>

                                {/* Max Results */}
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-sm text-zinc-400">Máximo de Resultados (Top K)</Label>
                                        <span className="rounded-lg bg-zinc-800/50 border border-zinc-700/50 px-2.5 py-1 text-xs font-mono text-zinc-300">
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
                                    <p className="text-[10px] text-zinc-500">
                                        Quantidade de fragmentos retornados da base de conhecimento
                                    </p>
                                </div>
                            </CollapsibleContent>
                        </Collapsible>

                        {/* ═══════════════════════════════════════════════════════════════
                SEÇÃO: Status
            ═══════════════════════════════════════════════════════════════ */}
                        <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <Label htmlFor="isActive" className="text-sm font-semibold text-zinc-200">
                                        Agente Ativo
                                    </Label>
                                    <p className="text-[11px] text-zinc-500 mt-0.5">
                                        Ative para permitir que responda conversas
                                    </p>
                                </div>
                                <Switch
                                    id="isActive"
                                    checked={isActive}
                                    onCheckedChange={setIsActive}
                                />
                            </div>

                            <div className="flex items-center justify-between border-t border-zinc-800/50 pt-4">
                                <div>
                                    <Label htmlFor="isDefault" className="text-sm font-semibold text-zinc-200">
                                        Agente Principal
                                    </Label>
                                    <p className="text-[11px] text-zinc-500 mt-0.5">
                                        Define como assistente padrão da empresa
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

                    <DialogFooter className="border-t border-zinc-800/50 bg-[#0a0c10]/40 px-6 py-6 backdrop-blur-md mt-auto">
                        <Button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full h-12 text-base font-bold bg-primary-500 hover:bg-primary-600 shadow-lg shadow-primary-500/20 transition-all rounded-xl"
                        >
                            <div className="flex items-center gap-2">
                                {isSubmitting ? <Sparkles className="h-5 w-5 animate-pulse" /> : <Bot className="h-5 w-5" />}
                                {isSubmitting ? 'Salvando Assistente...' : 'Salvar Assistente'}
                            </div>
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
