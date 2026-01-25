import React, { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Search, Sparkles, X } from 'lucide-react';
import { Role } from '../types';
import { callWhatsAppTemplates } from './whatsapp/templatesApi';
import { supabase, getSupabaseAnonKey, getSupabaseUrl } from '../lib/supabase';
import { loadLocalAiSettings } from '../lib/aiLocal';

type TemplateRow = {
  id: string;
  name: string;
  language: string;
  category: string | null;
  status: string | null;
  quality_score: string | null;
  parameter_format: 'positional' | 'named';
  components: any;
  updated_at?: string | null;
  last_synced_at?: string | null;
};

const badge = (status?: string | null) => {
  const s = String(status || '').toUpperCase();
  if (s === 'APPROVED') return 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20';
  if (s === 'PENDING') return 'bg-amber-500/15 text-amber-300 border border-amber-500/20';
  if (s === 'REJECTED') return 'bg-red-500/15 text-red-300 border border-red-500/20';
  if (s === 'PAUSED') return 'bg-zinc-500/15 text-zinc-300 border border-zinc-500/20';
  return 'bg-slate-500/15 text-slate-300 border border-slate-500/20';
};

type TemplateDraft = {
  name: string;
  language: string;
  category: string;
  components: unknown[];
};

const safeJson = (text: string) => {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
};

export function WhatsAppTemplates({ companyId, role }: { companyId: string; role: Role }) {
  const canManage = useMemo(() => role === 'admin' || role === 'gestor', [role]);

  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [items, setItems] = useState<TemplateRow[]>([]);
  const [selected, setSelected] = useState<TemplateRow | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [tplPrompt, setTplPrompt] = useState('');
  const [tplLanguage, setTplLanguage] = useState('pt_BR');
  const [tplCategory, setTplCategory] = useState<'UTILITY' | 'MARKETING' | 'AUTHENTICATION'>('UTILITY');
  const [tplNameHint, setTplNameHint] = useState('');
  const [tplJson, setTplJson] = useState<string>('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await callWhatsAppTemplates<{ ok: boolean; items: TemplateRow[] }>({
        action: 'list',
        company_id: companyId,
        q: q.trim() || undefined,
      });
      setItems(res?.items ?? []);
    } catch (e: any) {
      setItems([]);
      setError(e?.message ?? 'Erro ao carregar templates.');
    } finally {
      setLoading(false);
    }
  };

  const sync = async () => {
    if (!canManage) return;
    setLoading(true);
    setError(null);
    setOk(null);
    try {
      const res = await callWhatsAppTemplates<{ ok: boolean; synced?: number; error?: string }>({
        action: 'sync',
        company_id: companyId,
      });
      setOk(`Sincronizado: ${res?.synced ?? 0}`);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao sincronizar.');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setCreateOpen(true);
    setAiBusy(false);
    setCreateBusy(false);
    setError(null);
    setOk(null);
    setTplPrompt('');
    setTplLanguage('pt_BR');
    setTplCategory('UTILITY');
    setTplNameHint('');
    setTplJson('');
  };

  const generateWithAi = async () => {
    if (!canManage) return;
    const prompt = tplPrompt.trim();
    if (!prompt) {
      setError('Descreva o template que você quer criar.');
      return;
    }

    setAiBusy(true);
    setError(null);
    setOk(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const userId = sessionData.session?.user?.id ?? null;
      if (!accessToken || !userId) throw new Error('Sessão inválida. Faça login novamente.');

      const local = loadLocalAiSettings(userId);
      if (!local?.apiKey) {
        throw new Error('Falta sua API Key. Vá em Agente IA e salve a chave do provedor.');
      }

      const res = await fetch(`${getSupabaseUrl()}/functions/v1/ai-assistant`, {
        method: 'POST',
        headers: {
          apikey: getSupabaseAnonKey(),
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'wa_template',
          company_id: companyId,
          template_prompt: prompt,
          template_language: tplLanguage.trim() || 'pt_BR',
          template_category: tplCategory,
          template_name_hint: tplNameHint.trim() || undefined,
          provider: local.provider,
          api_key: local.apiKey,
          model: local.model,
          access_token: accessToken,
        }),
      });

      const payloadText = await res.text().catch(() => '');
      const payload = safeJson(payloadText);
      if (!res.ok) throw new Error(payload?.error ?? `Falha ao gerar template (HTTP ${res.status}).`);

      const draft = (payload as any)?.result ?? payload ?? {};
      setTplJson(JSON.stringify(draft, null, 2));
      setOk('Template gerado. Revise o JSON e clique em “Criar na Meta”.');
    } catch (e: any) {
      setError(e?.message ?? 'Falha ao gerar template com IA.');
    } finally {
      setAiBusy(false);
    }
  };

  const createInMeta = async () => {
    if (!canManage) return;
    const raw = tplJson.trim();
    if (!raw) {
      setError('Cole/gerar um JSON de template antes de criar.');
      return;
    }

    let parsed: any = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setError('JSON inválido.');
      return;
    }

    const draft: TemplateDraft = {
      name: String(parsed?.name ?? '').trim(),
      language: String(parsed?.language ?? 'pt_BR').trim() || 'pt_BR',
      category: String(parsed?.category ?? tplCategory).trim() || tplCategory,
      components: Array.isArray(parsed?.components) ? parsed.components : [],
    };

    if (!draft.name) {
      setError('Template precisa ter "name".');
      return;
    }
    if (!Array.isArray(draft.components) || draft.components.length === 0) {
      setError('Template precisa ter "components" (array).');
      return;
    }

    setCreateBusy(true);
    setError(null);
    setOk(null);
    try {
      await callWhatsAppTemplates<{ ok: boolean }>({
        action: 'create_in_meta',
        company_id: companyId,
        template: {
          name: draft.name,
          language: draft.language,
          category: draft.category,
          components: draft.components,
        },
      });
      setOk('Template enviado para a Meta. Fazendo sync…');
      await sync();
      setCreateOpen(false);
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao criar template na Meta.');
    } finally {
      setCreateBusy(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  return (
    <div className="cr8-card p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Templates (Meta)</div>
            <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
              Sincronize do WhatsApp Manager para escolher templates no disparo e no Live Chat.
            </div>
          </div>
        <div className="flex items-center gap-2">
          <button
            disabled={!canManage}
            onClick={openCreate}
            className="px-3 py-2 rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] disabled:opacity-50 inline-flex items-center gap-2"
            title="Criar template"
          >
            <Plus className="h-4 w-4" />
            Novo
          </button>
          <button
            disabled={!canManage || loading}
            onClick={() => void sync()}
            className="px-3 py-2 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2"
            title="Sincronizar com a Meta"
          >
            <RefreshCw className="h-4 w-4" />
            Sync
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <div className="relative w-full max-w-md">
          <Search className="h-4 w-4 text-[hsl(var(--muted-foreground))] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void load();
            }}
            placeholder="Buscar template..."
            className="w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] pl-9 pr-3 py-2 text-[hsl(var(--foreground))]"
          />
        </div>
        <button
          disabled={loading}
          onClick={() => void load()}
          className="px-3 py-2 rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] disabled:opacity-50"
        >
          Atualizar
        </button>
      </div>

      {error && <div className="mt-3 text-sm text-[hsl(var(--destructive))]">{error}</div>}
      {ok && <div className="mt-3 text-sm text-emerald-300">{ok}</div>}

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="cr8-card p-0 overflow-hidden lg:col-span-2">
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))]">
                <tr className="border-b border-[hsl(var(--border))]">
                  <th className="p-2 text-left">Nome</th>
                  <th className="p-2 text-left">Lang</th>
                  <th className="p-2 text-left">Categoria</th>
                  <th className="p-2 text-left">Status</th>
                  <th className="p-2 text-left">Parâmetros</th>
                </tr>
              </thead>
              <tbody>
                {items.map((t) => {
                  const active = selected?.id === t.id;
                  return (
                    <tr
                      key={t.id}
                      onClick={() => setSelected(t)}
                      className={`border-b border-[hsl(var(--border))] cursor-pointer hover:bg-[hsl(var(--secondary))] ${
                        active ? 'bg-[hsl(var(--secondary))]' : ''
                      }`}
                    >
                      <td className="p-2 text-[hsl(var(--foreground))] font-medium">{t.name}</td>
                      <td className="p-2 text-[hsl(var(--muted-foreground))] font-mono">{t.language}</td>
                      <td className="p-2 text-[hsl(var(--muted-foreground))]">{t.category || '-'}</td>
                      <td className="p-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${badge(t.status)}`}>{t.status || '-'}</span>
                      </td>
                      <td className="p-2 text-[hsl(var(--muted-foreground))]">{t.parameter_format}</td>
                    </tr>
                  );
                })}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-[hsl(var(--muted-foreground))]">
                      Nenhum template em cache. Clique em Sync.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="cr8-card p-4">
          <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Detalhes</div>
          {!selected ? (
            <div className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">Selecione um template na lista.</div>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="text-xs text-[hsl(var(--muted-foreground))]">
                <div className="font-mono text-[hsl(var(--foreground))]">{selected.name}</div>
                <div className="mt-1">
                  {selected.language} • {selected.category || '-'} • {selected.status || '-'}
                </div>
              </div>
              <div className="text-[11px] text-[hsl(var(--muted-foreground))]">Components (Meta)</div>
              <textarea
                readOnly
                value={JSON.stringify(selected.components ?? [], null, 2)}
                rows={14}
                className="w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-[hsl(var(--foreground))] font-mono text-xs"
              />
            </div>
          )}
        </div>
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={() => setCreateOpen(false)}>
          <div
            className="cr8-card w-full max-w-3xl p-0 overflow-hidden"
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
          >
            <div className="flex items-center justify-between p-4 border-b border-[hsl(var(--border))]">
              <div>
                <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Novo template</div>
                <div className="text-xs text-[hsl(var(--muted-foreground))]">
                  Gere com IA (opcional), revise o JSON e envie para a Meta.
                </div>
              </div>
              <button
                onClick={() => setCreateOpen(false)}
                className="p-2 rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]"
                title="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {error && <div className="text-sm text-[hsl(var(--destructive))]">{error}</div>}
              {ok && <div className="text-sm text-emerald-300">{ok}</div>}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-xs text-[hsl(var(--muted-foreground))]">Prompt (o que o template deve dizer)</label>
                  <textarea
                    value={tplPrompt}
                    onChange={(e) => setTplPrompt(e.target.value)}
                    rows={3}
                    placeholder="Ex: Template para confirmar agendamento com {{1}} = nome e {{2}} = data."
                    className="mt-1 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                  />
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-[hsl(var(--muted-foreground))]">Idioma</label>
                    <input
                      value={tplLanguage}
                      onChange={(e) => setTplLanguage(e.target.value)}
                      placeholder="pt_BR"
                      className="mt-1 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-[hsl(var(--foreground))]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[hsl(var(--muted-foreground))]">Categoria</label>
                    <select
                      value={tplCategory}
                      onChange={(e) => setTplCategory(e.target.value as any)}
                      className="mt-1 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-[hsl(var(--foreground))]"
                    >
                      <option value="UTILITY">UTILITY</option>
                      <option value="MARKETING">MARKETING</option>
                      <option value="AUTHENTICATION">AUTHENTICATION</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-xs text-[hsl(var(--muted-foreground))]">Dica de nome (opcional)</label>
                  <input
                    value={tplNameHint}
                    onChange={(e) => setTplNameHint(e.target.value)}
                    placeholder="ex: confirmacao_agendamento"
                    className="mt-1 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-[hsl(var(--foreground))]"
                  />
                  <div className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">
                    O nome final precisa ser minúsculo, com underscore e sem espaços.
                  </div>
                </div>
                <div className="flex items-end">
                  <button
                    disabled={!canManage || aiBusy}
                    onClick={() => void generateWithAi()}
                    className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--secondary)/0.8)] text-[hsl(var(--foreground))] border border-[hsl(var(--border))] disabled:opacity-50 inline-flex items-center justify-center gap-2"
                    title="Gerar JSON com IA (usa sua API key local)"
                  >
                    <Sparkles className="h-4 w-4" />
                    {aiBusy ? 'Gerando…' : 'Gerar com IA'}
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs text-[hsl(var(--muted-foreground))]">JSON do template</label>
                  <div className="text-[11px] text-[hsl(var(--muted-foreground))]">
                    Dica: mantenha apenas BODY/HEADER de texto (sem mídia) para aprovação mais rápida.
                  </div>
                </div>
                <textarea
                  value={tplJson}
                  onChange={(e) => setTplJson(e.target.value)}
                  rows={14}
                  className="mt-1 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-[hsl(var(--foreground))] font-mono text-xs focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                  placeholder='{\n  "name": "exemplo_template",\n  "language": "pt_BR",\n  "category": "UTILITY",\n  "components": [ ... ]\n}'
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setCreateOpen(false)}
                  className="px-3 py-2 rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]"
                >
                  Cancelar
                </button>
                <button
                  disabled={!canManage || createBusy}
                  onClick={() => void createInMeta()}
                  className="px-3 py-2 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2"
                >
                  <Sparkles className="h-4 w-4" />
                  {createBusy ? 'Enviando…' : 'Criar na Meta'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
