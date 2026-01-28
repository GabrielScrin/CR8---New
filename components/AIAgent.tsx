import React, { useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { clearLocalAiSettings, defaultModelByProvider, loadLocalAiSettings, saveLocalAiSettings, type LlmProvider } from '../lib/aiLocal';
import { useAIAgentsController, useAIAgentsGlobalToggle } from '../hooks/useAIAgents';
import { AIAgentsSettingsView } from './features/ai-agents/AIAgentsSettingsView';
import { ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface AIAgentProps {
  companyId?: string;
  userId?: string;
}

const providerLabel: Record<LlmProvider, string> = {
  openai: 'OpenAI',
  google: 'Google (Gemini)',
  anthropic: 'Anthropic (Claude)',
  deepseek: 'DeepSeek',
};

export const AIAgent: React.FC<AIAgentProps> = ({ companyId, userId }) => {
  const readOnlyMode = !isSupabaseConfigured();
  const [loadingLegacy, setLoadingLegacy] = useState(false);
  const [savingLegacy, setSavingLegacy] = useState(false);
  const [errorLegacy, setErrorLegacy] = useState<string | null>(null);
  const [okMsgLegacy, setOkMsgLegacy] = useState<string | null>(null);

  const [helperPrompt, setHelperPrompt] = useState('');
  const [sdrPrompt, setSdrPrompt] = useState('');
  const [legacyOpen, setLegacyOpen] = useState(false);

  // New Multi-Agent System Hooks
  const aiAgentsController = useAIAgentsController();
  const globalToggle = useAIAgentsGlobalToggle();

  // Local (per device) LLM settings
  const [provider, setProvider] = useState<LlmProvider>('openai');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(defaultModelByProvider.openai);

  const canEdit = useMemo(() => Boolean(companyId && !readOnlyMode), [companyId, readOnlyMode]);
  const canEditLocal = useMemo(() => Boolean(userId), [userId]);

  // Load Legacy Settings
  useEffect(() => {
    if (!canEdit) return;
    let cancelled = false;
    setLoadingLegacy(true);
    setErrorLegacy(null);
    void (async () => {
      const { data, error: dbError } = await supabase
        .from('company_ai_settings')
        .select('helper_prompt, sdr_prompt')
        .eq('company_id', companyId!)
        .maybeSingle();

      if (cancelled) return;
      if (dbError) {
        setErrorLegacy(dbError.message);
      } else {
        setHelperPrompt((data as any)?.helper_prompt ?? '');
        setSdrPrompt((data as any)?.sdr_prompt ?? '');
      }
      setLoadingLegacy(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [canEdit, companyId]);

  // Load Local Settings
  useEffect(() => {
    if (!userId) return;
    const local = loadLocalAiSettings(userId);
    if (local) {
      setProvider(local.provider);
      setApiKey(local.apiKey);
      setModel(local.model ?? defaultModelByProvider[local.provider]);
      return;
    }
    setProvider('openai');
    setApiKey('');
    setModel(defaultModelByProvider.openai);
  }, [userId]);

  const saveLegacy = async () => {
    if (!companyId) return;
    setSavingLegacy(true);
    setErrorLegacy(null);
    setOkMsgLegacy(null);
    try {
      const { error: upsertError } = await supabase.from('company_ai_settings').upsert([
        {
          company_id: companyId,
          helper_prompt: helperPrompt.trim() || null,
          sdr_prompt: sdrPrompt.trim() || null,
        },
      ]);
      if (upsertError) throw upsertError;
      setOkMsgLegacy('Configurações salvas.');
    } catch (e: any) {
      setErrorLegacy(e?.message ?? 'Falha ao salvar.');
    } finally {
      setSavingLegacy(false);
    }
  };

  const saveLocal = () => {
    if (!userId) return;
    setOkMsgLegacy(null);
    setErrorLegacy(null);

    if (!apiKey.trim()) {
      setErrorLegacy('Cole uma API Key para salvar.');
      return;
    }

    saveLocalAiSettings(userId, { provider, apiKey: apiKey.trim(), model: model.trim() || undefined });
    setOkMsgLegacy('Configurações locais salvas (somente neste navegador).');
  };

  const clearLocal = () => {
    if (!userId) return;
    clearLocalAiSettings(userId);
    setProvider('openai');
    setApiKey('');
    setModel(defaultModelByProvider.openai);
    setOkMsgLegacy('Configurações locais removidas.');
  };

  if (readOnlyMode) {
    return (
      <div className="cr8-card h-[calc(100vh-8rem)] flex items-center justify-center">
        <div className="max-w-md text-center px-6">
          <h2 className="text-xl font-bold text-[hsl(var(--foreground))]">Agente IA</h2>
          <p className="text-[hsl(var(--muted-foreground))] mt-2 text-sm">Configure o Supabase para habilitar a Fase 4.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      <div>
        <h1 className="text-3xl font-bold text-[hsl(var(--foreground))]">Agente IA</h1>
        <p className="text-[hsl(var(--muted-foreground))] mt-1 text-sm">
          Gerencie seus assistentes virtuais e configure a inteligência artificial.
        </p>
      </div>

      {/* 1. Local Settings (API Key) */}
      <div className="cr8-card p-6 space-y-4 border border-[hsl(var(--border))]">
        <div>
          <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Configuração de API (Local)</h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
            Esta Chave de API é usada para executar os agentes. Ela fica salva apenas no seu navegador.
          </p>
        </div>

        {!canEditLocal ? (
          <div className="text-sm text-[hsl(var(--muted-foreground))]">Faça login novamente para habilitar as configurações locais.</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Provedor</label>
                <select
                  value={provider}
                  onChange={(e) => {
                    const next = e.target.value as LlmProvider;
                    setProvider(next);
                    setModel(defaultModelByProvider[next]);
                  }}
                  className="mt-2 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
                >
                  {Object.keys(providerLabel).map((p) => (
                    <option key={p} value={p}>
                      {providerLabel[p as LlmProvider]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-[hsl(var(--foreground))]">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={`Cole sua chave da ${providerLabel[provider]} aqui`}
                  className="mt-2 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={clearLocal}
                className="px-4 py-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] hover:opacity-90 text-sm"
              >
                Remover local
              </button>
              <button
                onClick={saveLocal}
                className="px-4 py-2 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 text-sm"
              >
                Salvar local
              </button>
            </div>

            {(errorLegacy || okMsgLegacy) && (
              <div className="text-sm mt-2">
                {errorLegacy && <span className="text-[hsl(var(--destructive))]">{errorLegacy}</span>}
                {okMsgLegacy && <span className="text-emerald-400">{okMsgLegacy}</span>}
              </div>
            )}
          </>
        )}
      </div>

      {/* 2. New Multi-Agent System */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-[hsl(var(--foreground))]">Seus Assistentes</h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Configure múltiplos agentes com personalidades e conhecimentos diferentes.
          </p>
        </div>

        <AIAgentsSettingsView
          agents={aiAgentsController.agents}
          isLoading={aiAgentsController.isLoading}
          error={aiAgentsController.error}
          onCreate={aiAgentsController.onCreate}
          onUpdate={aiAgentsController.onUpdate}
          onDelete={aiAgentsController.onDelete}
          onSetDefault={aiAgentsController.onSetDefault}
          onToggleActive={aiAgentsController.onToggleActive}
          isCreating={aiAgentsController.isCreating}
          isUpdating={aiAgentsController.isUpdating}
          isDeleting={aiAgentsController.isDeleting}
          globalEnabled={globalToggle.enabled}
          isGlobalToggleLoading={globalToggle.isLoading}
          onGlobalToggle={globalToggle.toggle}
        />
      </div>

      {/* 3. Legacy Settings (Collapsed) */}
      <Collapsible open={legacyOpen} onOpenChange={setLegacyOpen}>
        <div className="flex items-center justify-between py-2">
          <CollapsibleTrigger className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors">
            {legacyOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Configurações Legadas (Prompt Único)
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent>
          <div className="cr8-card p-6 space-y-4 mt-2 border border-[hsl(var(--border))] border-dashed opacity-75">
            <div className="flex items-center gap-2 text-amber-500 bg-amber-500/10 p-3 rounded-lg text-sm mb-4">
              <AlertCircle className="h-4 w-4" />
              <p>Recomendamos migrar seus prompts para o novo sistema de Agentes acima.</p>
            </div>

            {loadingLegacy ? (
              <div className="text-sm text-[hsl(var(--muted-foreground))]">Carregando…</div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Prompt do IA Helper (Antigo)</label>
                  <textarea
                    value={helperPrompt}
                    onChange={(e) => setHelperPrompt(e.target.value)}
                    rows={6}
                    className="mt-2 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Prompt do SDR IA (Antigo)</label>
                  <textarea
                    value={sdrPrompt}
                    onChange={(e) => setSdrPrompt(e.target.value)}
                    rows={8}
                    className="mt-2 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => void saveLegacy()}
                    disabled={!companyId || savingLegacy}
                    className="px-4 py-2 rounded-lg bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:opacity-90 disabled:opacity-50 text-sm"
                  >
                    {savingLegacy ? 'Salvando…' : 'Salvar (Legado)'}
                  </button>
                </div>
              </>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};
