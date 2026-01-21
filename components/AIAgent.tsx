import React, { useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { clearLocalAiSettings, defaultModelByProvider, loadLocalAiSettings, saveLocalAiSettings, type LlmProvider } from '../lib/aiLocal';

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
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [helperPrompt, setHelperPrompt] = useState('');
  const [sdrPrompt, setSdrPrompt] = useState('');

  // Local (per device) LLM settings
  const [provider, setProvider] = useState<LlmProvider>('openai');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(defaultModelByProvider.openai);

  const canEdit = useMemo(() => Boolean(companyId && !readOnlyMode), [companyId, readOnlyMode]);
  const canEditLocal = useMemo(() => Boolean(userId), [userId]);

  useEffect(() => {
    if (!canEdit) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      const { data, error: dbError } = await supabase
        .from('company_ai_settings')
        .select('helper_prompt, sdr_prompt')
        .eq('company_id', companyId!)
        .maybeSingle();

      if (cancelled) return;
      if (dbError) {
        setError(dbError.message);
      } else {
        setHelperPrompt((data as any)?.helper_prompt ?? '');
        setSdrPrompt((data as any)?.sdr_prompt ?? '');
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [canEdit, companyId]);

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

  const save = async () => {
    if (!companyId) return;
    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      const { error: upsertError } = await supabase.from('company_ai_settings').upsert([
        {
          company_id: companyId,
          helper_prompt: helperPrompt.trim() || null,
          sdr_prompt: sdrPrompt.trim() || null,
        },
      ]);
      if (upsertError) throw upsertError;
      setOkMsg('Configurações salvas.');
    } catch (e: any) {
      setError(e?.message ?? 'Falha ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const saveLocal = () => {
    if (!userId) return;
    setOkMsg(null);
    setError(null);

    if (!apiKey.trim()) {
      setError('Cole uma API Key para salvar.');
      return;
    }

    saveLocalAiSettings(userId, { provider, apiKey: apiKey.trim(), model: model.trim() || undefined });
    setOkMsg('Configurações locais salvas (somente neste navegador).');
  };

  const clearLocal = () => {
    if (!userId) return;
    clearLocalAiSettings(userId);
    setProvider('openai');
    setApiKey('');
    setModel(defaultModelByProvider.openai);
    setOkMsg('Configurações locais removidas.');
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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[hsl(var(--foreground))]">Agente IA</h1>
        <p className="text-[hsl(var(--muted-foreground))] mt-1 text-sm">
          Ajuste os prompts por empresa e escolha o provedor de IA por usuário. A chave fica salva apenas no seu navegador.
        </p>
      </div>

      <div className="cr8-card p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Provedor de IA (por usuário)</h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
            Esta API Key não é enviada/armazenada no banco. Ela fica apenas no <span className="font-mono">localStorage</span> do seu navegador
            e é enviada junto das chamadas da IA.
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

            <div>
              <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Model (opcional)</label>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={defaultModelByProvider[provider]}
                className="mt-2 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              />
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                Padrão: <span className="font-mono">{defaultModelByProvider[provider]}</span>
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={clearLocal}
                className="px-4 py-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] hover:opacity-90"
              >
                Remover local
              </button>
              <button
                onClick={saveLocal}
                className="px-4 py-2 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
              >
                Salvar local
              </button>
            </div>
          </>
        )}
      </div>

      <div className="cr8-card p-6 space-y-4">
        {loading ? (
          <div className="text-sm text-[hsl(var(--muted-foreground))]">Carregando…</div>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Prompt do IA Helper (opcional)</label>
              <textarea
                value={helperPrompt}
                onChange={(e) => setHelperPrompt(e.target.value)}
                rows={6}
                className="mt-2 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                placeholder="Ex: Seja direto e foque em performance de tráfego. Pergunte sempre qual é o objetivo e o período."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Prompt do SDR IA (opcional)</label>
              <textarea
                value={sdrPrompt}
                onChange={(e) => setSdrPrompt(e.target.value)}
                rows={8}
                className="mt-2 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                placeholder="Ex: Qualifique orçamento, urgência e necessidade. Se for campanha de mensagens, trate conversa como lead."
              />
            </div>

            {error && <div className="text-sm text-[hsl(var(--destructive))]">{error}</div>}
            {okMsg && <div className="text-sm text-emerald-400">{okMsg}</div>}

            <div className="flex justify-end">
              <button
                onClick={() => void save()}
                disabled={!companyId || saving}
                className="px-4 py-2 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
