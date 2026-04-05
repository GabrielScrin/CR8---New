import React, { useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { clearLocalAiSettings, defaultModelByProvider, loadLocalAiSettings, saveLocalAiSettings, type LlmProvider } from '../lib/aiLocal';
import { useAIAgentsController, useAIAgentsGlobalToggle } from '../hooks/useAIAgents';
import { AIAgentsSettingsView } from '@/components/features/ai-agents';
import { Bot, ChevronDown, ChevronRight, AlertCircle, Key, Trash2, Save, CheckCircle2 } from 'lucide-react';
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
      <div className="flex items-center justify-center h-full text-[hsl(var(--muted-foreground))]">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-[hsl(var(--primary))]/10 border border-[hsl(var(--primary))]/20 flex items-center justify-center mx-auto mb-4">
            <Bot className="w-7 h-7 text-[hsl(var(--primary))]/60" />
          </div>
          <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">Agente IA</h3>
          <p className="text-sm mt-1">Configure o Supabase para habilitar este modulo.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-[hsl(var(--primary))]/10 border border-[hsl(var(--primary))]/20 flex items-center justify-center shrink-0">
          <Bot className="w-5 h-5 text-[hsl(var(--primary))]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[hsl(var(--foreground))] leading-none">Agente IA</h1>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
            Gerencie assistentes virtuais e configure a inteligencia artificial.
          </p>
        </div>
      </div>

      {/* 1. Local API Key */}
      <div className="rounded-2xl border border-[hsl(var(--border))] overflow-hidden"
           style={{ background: 'hsl(220 18% 7%)' }}>
        <div className="px-5 py-4 border-b border-[hsl(var(--border))] flex items-center gap-3">
          <Key className="w-4 h-4 text-[hsl(var(--primary))]" />
          <div>
            <div className="text-sm font-bold text-[hsl(var(--foreground))]">Configuracao de API (Local)</div>
            <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">
              A API Key fica salva apenas neste navegador — nunca vai para o servidor.
            </p>
          </div>
        </div>

        <div className="px-5 py-5">
          {!canEditLocal ? (
            <div className="text-sm text-[hsl(var(--muted-foreground))]">Faca login novamente para habilitar as configuracoes locais.</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1.5">Provedor</label>
                  <select
                    value={provider}
                    onChange={(e) => {
                      const next = e.target.value as LlmProvider;
                      setProvider(next);
                      setModel(defaultModelByProvider[next]);
                    }}
                    className="w-full rounded-xl bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2.5 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                  >
                    {Object.keys(providerLabel).map((p) => (
                      <option key={p} value={p}>{providerLabel[p as LlmProvider]}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1.5">API Key</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={`Cole sua chave da ${providerLabel[provider]} aqui`}
                    className="w-full rounded-xl bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                  />
                </div>
              </div>

              {(errorLegacy || okMsgLegacy) && (
                <div className="text-xs">
                  {errorLegacy && (
                    <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      {errorLegacy}
                    </div>
                  )}
                  {okMsgLegacy && (
                    <div className="flex items-center gap-2 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      {okMsgLegacy}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  onClick={clearLocal}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400/70 hover:text-red-400 hover:bg-red-500/15 text-xs transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remover local
                </button>
                <button
                  onClick={saveLocal}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-xs font-semibold hover:opacity-90 transition-all shadow-sm"
                >
                  <Save className="w-3.5 h-3.5" />
                  Salvar local
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. Multi-Agent System */}
      <div className="space-y-3">
        <div>
          <h2 className="text-base font-bold text-[hsl(var(--foreground))]">Seus Assistentes</h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
            Configure multiplos agentes com personalidades e conhecimentos diferentes.
          </p>
        </div>
        <AIAgentsSettingsView
          userId={userId}
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
        <CollapsibleTrigger className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors py-1">
          {legacyOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Configuracoes Legadas (Prompt Unico)
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="mt-2 rounded-2xl border border-dashed border-[hsl(var(--border))] p-5 opacity-75 space-y-4">
            <div className="flex items-center gap-2 text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 text-xs">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Recomendamos migrar seus prompts para o novo sistema de Agentes acima.
            </div>

            {loadingLegacy ? (
              <div className="text-xs text-[hsl(var(--muted-foreground))]">Carregando...</div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1.5">
                    Prompt do IA Helper (Antigo)
                  </label>
                  <textarea
                    value={helperPrompt}
                    onChange={(e) => setHelperPrompt(e.target.value)}
                    rows={5}
                    className="w-full rounded-xl bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2.5 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1.5">
                    Prompt do SDR IA (Antigo)
                  </label>
                  <textarea
                    value={sdrPrompt}
                    onChange={(e) => setSdrPrompt(e.target.value)}
                    rows={7}
                    className="w-full rounded-xl bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2.5 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] resize-none"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => void saveLegacy()}
                    disabled={!companyId || savingLegacy}
                    className="px-4 py-2 rounded-xl bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] text-xs text-[hsl(var(--foreground))] hover:opacity-90 disabled:opacity-50 transition-all"
                  >
                    {savingLegacy ? 'Salvando...' : 'Salvar (Legado)'}
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
