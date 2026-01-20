import React, { useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

interface AIAgentProps {
  companyId?: string;
}

export const AIAgent: React.FC<AIAgentProps> = ({ companyId }) => {
  const readOnlyMode = !isSupabaseConfigured();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [helperPrompt, setHelperPrompt] = useState('');
  const [sdrPrompt, setSdrPrompt] = useState('');

  const canEdit = useMemo(() => Boolean(companyId && !readOnlyMode), [companyId, readOnlyMode]);

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
          Ajuste os prompts do Assistente e do SDR IA por empresa. A chave da IA deve ficar nas Secrets do Supabase.
        </p>
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

