import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Role } from '../types';
import { callWhatsAppBroadcast, WhatsAppCampaignMessageKind } from './whatsapp/broadcastApi';

type LeadRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  status: string | null;
  created_at: string;
};

type WhatsAppTemplateRow = {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string | null;
  components: unknown;
  updated_at: string;
};

const normalizePhone = (v: string) => String(v || '').replace(/\D/g, '');

const parseRecipientsText = (raw: string) => {
  const lines = String(raw || '')
    .split(/\r?\n/g)
    .map((l) => l.trim())
    .filter(Boolean);

  const out: Array<{ phone: string; name?: string | null }> = [];
  for (const line of lines) {
    // Formats supported:
    // - 5511999999999
    // - 5511999999999;Nome
    // - 5511999999999,Nome
    const parts = line.split(/[;,]/g).map((p) => p.trim());
    const phone = normalizePhone(parts[0] || '');
    if (!phone) continue;
    const name = parts.slice(1).join(' ').trim() || null;
    out.push({ phone, name });
  }
  return out;
};

const parseRecipientsCsvText = (raw: string) => {
  const rows = String(raw || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/g)
    .map((l) => l.trim())
    .filter(Boolean);

  if (rows.length === 0) return [] as Array<{ phone: string; name?: string | null }>;

  const headerLine = rows[0] || '';
  const delimiter = headerLine.includes(';') && !headerLine.includes(',') ? ';' : headerLine.includes('\t') ? '\t' : ',';

  const split = (line: string) => line.split(delimiter).map((v) => v.trim().replace(/^"|"$/g, ''));

  const first = split(rows[0]).map((v) => v.toLowerCase());
  const looksLikeHeader =
    first.some((v) => ['phone', 'telefone', 'celular', 'whatsapp', 'numero', 'number'].includes(v)) ||
    first.some((v) => ['name', 'nome'].includes(v));

  let start = 0;
  let phoneIdx = 0;
  let nameIdx: number | null = 1;
  if (looksLikeHeader) {
    start = 1;
    const pi = first.findIndex((v) => ['phone', 'telefone', 'celular', 'whatsapp', 'numero', 'number'].includes(v));
    phoneIdx = pi >= 0 ? pi : 0;
    const ni = first.findIndex((v) => ['name', 'nome'].includes(v));
    nameIdx = ni >= 0 ? ni : null;
  }

  const out: Array<{ phone: string; name?: string | null }> = [];
  for (const line of rows.slice(start)) {
    const cols = split(line);
    const phone = normalizePhone(cols[phoneIdx] || '');
    if (!phone) continue;
    const name = nameIdx != null ? (cols[nameIdx] || '').trim() : '';
    out.push({ phone, name: name || null });
  }
  return out;
};

type TemplateHeaderRequirement =
  | { kind: 'none' }
  | { kind: 'text'; varCount: number }
  | { kind: 'image' | 'video' | 'document' };

const placeholderMaxIndex = (text: string): number => {
  let max = 0;
  for (const m of String(text || '').matchAll(/\{\{\s*(\d+)\s*\}\}/g)) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
};

const detectTemplateHeaderRequirement = (components: unknown): TemplateHeaderRequirement => {
  if (!Array.isArray(components)) return { kind: 'none' };
  const header = (components as any[]).find((c) => String(c?.type || '').toUpperCase() === 'HEADER');
  const format = String(header?.format || '').toUpperCase();
  if (format === 'TEXT') {
    return { kind: 'text', varCount: placeholderMaxIndex(String(header?.text || '')) };
  }
  if (format === 'IMAGE') return { kind: 'image' };
  if (format === 'VIDEO') return { kind: 'video' };
  if (format === 'DOCUMENT') return { kind: 'document' };
  return { kind: 'none' };
};

const templateVarCount = (components: unknown): number => {
  if (!Array.isArray(components)) return 0;
  for (const c of components as any[]) {
    const type = String(c?.type || '').toUpperCase();
    if (type !== 'BODY') continue;
    const text = typeof c?.text === 'string' ? c.text : '';
    if (!text) return 0;
    let max = 0;
    for (const m of text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > max) max = n;
    }
    return max;
  }
  return 0;
};

const suggestTemplateComponents = (template: WhatsAppTemplateRow): string => {
  const header = detectTemplateHeaderRequirement(template.components);
  const out: any[] = [];

  if (header.kind === 'text' && header.varCount > 0) {
    const headerParams = Array.from({ length: header.varCount }).map((_, idx) => {
      const i = idx + 1;
      const text = i === 1 ? '{{name}}' : i === 2 ? '{{phone}}' : '{{name}}';
      return { type: 'text', text };
    });
    out.push({ type: 'header', parameters: headerParams });
  } else if (header.kind === 'image') {
    out.push({ type: 'header', parameters: [{ type: 'image', image: { link: 'https://example.com/header.jpg' } }] });
  } else if (header.kind === 'video') {
    out.push({ type: 'header', parameters: [{ type: 'video', video: { link: 'https://example.com/header.mp4' } }] });
  } else if (header.kind === 'document') {
    out.push({
      type: 'header',
      parameters: [{ type: 'document', document: { link: 'https://example.com/arquivo.pdf', filename: 'arquivo.pdf' } }],
    });
  }

  const count = templateVarCount(template.components);
  if (!count) return out.length ? JSON.stringify(out, null, 2) : '';

  const params = Array.from({ length: count }).map((_, idx) => {
    const i = idx + 1;
    const text = i === 1 ? '{{name}}' : i === 2 ? '{{phone}}' : '{{name}}';
    return { type: 'text', text };
  });

  out.push({ type: 'body', parameters: params });
  return JSON.stringify(out, null, 2);
};

export function WhatsAppCampaignCreateModal({
  isOpen,
  onClose,
  companyId,
  role,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  role: Role;
  onCreated: (campaignId: string) => void;
}) {
  const canManage = useMemo(() => role === 'admin' || role === 'gestor', [role]);

  const [tab, setTab] = useState<'leads' | 'paste' | 'csv'>('leads');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [kind, setKind] = useState<WhatsAppCampaignMessageKind>('text');
  const [textBody, setTextBody] = useState('Olá {{name}}! Tudo bem?');

  const [templateName, setTemplateName] = useState('');
  const [templateLanguage, setTemplateLanguage] = useState('pt_BR');
  const [templateComponents, setTemplateComponents] = useState('');
  const [templates, setTemplates] = useState<WhatsAppTemplateRow[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  const [leadQuery, setLeadQuery] = useState('');
  const [leadRows, setLeadRows] = useState<LeadRow[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Record<string, boolean>>({});

  const [paste, setPaste] = useState('');
  const [csvName, setCsvName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState('');

  const [headerMediaUrl, setHeaderMediaUrl] = useState('');
  const [headerMediaFilename, setHeaderMediaFilename] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setTab('leads');
    setLoading(false);
    setError(null);
    setName('');
    setKind('text');
    setTextBody('Olá {{name}}! Tudo bem?');
    setTemplateName('');
    setTemplateLanguage('pt_BR');
    setTemplateComponents('');
    setTemplates([]);
    setTemplatesLoading(false);
    setTemplatesError(null);
    setSelectedTemplateId('');
    setLeadQuery('');
    setLeadRows([]);
    setSelectedLeadIds({});
    setPaste('');
    setCsvName(null);
    setCsvText('');
    setHeaderMediaUrl('');
    setHeaderMediaFilename('');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      setTemplatesLoading(true);
      setTemplatesError(null);
      try {
        const { data, error } = await supabase
          .from('whatsapp_templates')
          .select('id,name,language,status,category,components,updated_at')
          .eq('company_id', companyId)
          .order('updated_at', { ascending: false })
          .limit(300);
        if (error) throw error;
        if (!cancelled) setTemplates((data ?? []) as any as WhatsAppTemplateRow[]);
      } catch (e: any) {
        if (!cancelled) {
          setTemplates([]);
          setTemplatesError(e?.message ?? 'Erro ao carregar templates.');
        }
      } finally {
        if (!cancelled) setTemplatesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('leads')
          .select('id,name,phone,email,status,created_at')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .limit(500);
        if (error) throw error;
        if (!cancelled) setLeadRows((data ?? []) as any as LeadRow[]);
      } catch {
        if (!cancelled) setLeadRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, isOpen]);

  const filteredLeads = useMemo(() => {
    const q = leadQuery.trim().toLowerCase();
    const hasQ = Boolean(q);
    return leadRows
      .filter((l) => normalizePhone(l.phone || ''))
      .filter((l) => {
        if (!hasQ) return true;
        return (
          String(l.name || '').toLowerCase().includes(q) ||
          String(l.email || '').toLowerCase().includes(q) ||
          String(l.phone || '').toLowerCase().includes(q)
        );
      });
  }, [leadQuery, leadRows]);

  const recipientsFromLeads = useMemo(() => {
    const out: Array<{ phone: string; name?: string | null; lead_id?: string | null }> = [];
    for (const l of leadRows) {
      if (!selectedLeadIds[l.id]) continue;
      const phone = normalizePhone(l.phone || '');
      if (!phone) continue;
      out.push({ phone, name: l.name || null, lead_id: l.id });
    }
    return out;
  }, [leadRows, selectedLeadIds]);

  const recipientsFromPaste = useMemo(() => parseRecipientsText(paste).map((r) => ({ ...r, lead_id: null })), [paste]);
  const recipientsFromCsv = useMemo(() => parseRecipientsCsvText(csvText).map((r) => ({ ...r, lead_id: null })), [csvText]);

  const totalRecipients = useMemo(() => {
    const byPhone = new Map<string, { phone: string; name?: string | null; lead_id?: string | null }>();
    for (const r of [...recipientsFromLeads, ...recipientsFromPaste, ...recipientsFromCsv]) {
      const p = normalizePhone(r.phone);
      if (!p) continue;
      if (!byPhone.has(p)) byPhone.set(p, { phone: p, name: r.name || null, lead_id: r.lead_id ?? null });
    }
    return Array.from(byPhone.values());
  }, [recipientsFromLeads, recipientsFromPaste, recipientsFromCsv]);

  const selectedTemplate = useMemo(
    () => (selectedTemplateId ? templates.find((t) => t.id === selectedTemplateId) ?? null : null),
    [selectedTemplateId, templates]
  );

  const headerRequirement = useMemo(
    () => detectTemplateHeaderRequirement(selectedTemplate?.components),
    [selectedTemplate]
  );

  const create = async () => {
    if (!canManage) {
      setError('Sem permissão para criar campanhas.');
      return;
    }
    if (!name.trim()) {
      setError('Informe um nome para a campanha.');
      return;
    }
    if (totalRecipients.length === 0) {
      setError('Selecione ou cole ao menos 1 destinatário.');
      return;
    }
    if (kind === 'text' && !textBody.trim()) {
      setError('Digite a mensagem.');
      return;
    }
    if (kind === 'template' && (!templateName.trim() || !templateLanguage.trim())) {
      setError('Informe template name e language.');
      return;
    }

    let parsedComponents: unknown = undefined;
    if (kind === 'template' && templateComponents.trim()) {
      try {
        parsedComponents = JSON.parse(templateComponents);
      } catch {
        setError('Template components deve ser um JSON válido.');
        return;
      }
    }

    if (kind === 'template' && headerRequirement.kind !== 'none' && headerRequirement.kind !== 'text') {
      const list = Array.isArray(parsedComponents) ? ([...parsedComponents] as any[]) : [];
      const idx = list.findIndex((c) => String(c?.type || '').toLowerCase() === 'header');

      const upsertHeader = (headerComponent: any) => {
        if (idx >= 0) list[idx] = headerComponent;
        else list.unshift(headerComponent);
      };

      if (!headerMediaUrl.trim()) {
        setError('Este template exige HEADER de mídia: informe a URL pública.');
        return;
      }

      if (headerRequirement.kind === 'image') {
        upsertHeader({ type: 'header', parameters: [{ type: 'image', image: { link: headerMediaUrl.trim() } }] });
      } else if (headerRequirement.kind === 'video') {
        upsertHeader({ type: 'header', parameters: [{ type: 'video', video: { link: headerMediaUrl.trim() } }] });
      } else if (headerRequirement.kind === 'document') {
        const filename = headerMediaFilename.trim();
        if (!filename) {
          setError('Este template exige HEADER de documento: informe o filename.');
          return;
        }
        upsertHeader({ type: 'header', parameters: [{ type: 'document', document: { link: headerMediaUrl.trim(), filename } }] });
      }

      parsedComponents = list;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await callWhatsAppBroadcast<{ ok: boolean; campaign_id?: string; error?: string }>({
        action: 'create',
        company_id: companyId,
        name: name.trim(),
        message_kind: kind,
        text_body: kind === 'text' ? textBody : undefined,
        template_name: kind === 'template' ? templateName.trim() : undefined,
        template_language: kind === 'template' ? templateLanguage.trim() : undefined,
        template_components: kind === 'template' ? parsedComponents : undefined,
        recipients: totalRecipients,
      });
      if (!res?.ok || !res?.campaign_id) throw new Error(res?.error || 'Falha ao criar campanha.');
      onCreated(String(res.campaign_id));
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao criar campanha.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="cr8-card w-full max-w-3xl p-0 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-[hsl(var(--border))]">
          <div>
            <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Nova campanha</div>
            <div className="text-xs text-[hsl(var(--muted-foreground))]">Disparo em massa via Cloud API (aparece no Live Chat).</div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]"
            title="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {error && <div className="text-sm text-[hsl(var(--destructive))]">{error}</div>}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs text-[hsl(var(--muted-foreground))]">Nome</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Oferta Janeiro"
                className="mt-1 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              />
            </div>
            <div>
              <label className="block text-xs text-[hsl(var(--muted-foreground))]">Tipo</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as any)}
                className="mt-1 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-[hsl(var(--foreground))]"
              >
                <option value="text">Texto</option>
                <option value="template">Template</option>
              </select>
            </div>
          </div>

          {kind === 'text' ? (
            <div>
              <label className="block text-xs text-[hsl(var(--muted-foreground))]">Mensagem</label>
              <textarea
                value={textBody}
                onChange={(e) => setTextBody(e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              />
              <div className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">
                Variáveis: <span className="font-mono">{'{{name}}'}</span>, <span className="font-mono">{'{{phone}}'}</span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-[hsl(var(--muted-foreground))]">
                  Template do catálogo <span className="text-[10px]">(opcional)</span>
                </label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setSelectedTemplateId(nextId);
                    const t = templates.find((x) => x.id === nextId);
                    if (t) {
                      setTemplateName(t.name);
                      setTemplateLanguage(t.language);
                      setHeaderMediaUrl('');
                      setHeaderMediaFilename('');
                      const suggested = suggestTemplateComponents(t);
                      if (suggested) setTemplateComponents(suggested);
                    }
                  }}
                  disabled={templatesLoading}
                  className="mt-1 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-[hsl(var(--foreground))] disabled:opacity-50"
                >
                  <option value="">(selecionar)</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.language}) - {t.status}
                    </option>
                  ))}
                </select>
                {templatesError && <div className="mt-1 text-[11px] text-[hsl(var(--destructive))]">{templatesError}</div>}
                {!templatesError && (
                  <div className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">
                    {templatesLoading ? 'Carregando...' : `${templates.length} template(s) no cache.`}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs text-[hsl(var(--muted-foreground))]">Template name</label>
                <input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="ex: hello_world"
                  className="mt-1 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-[hsl(var(--foreground))]"
                />
              </div>
              <div className="md:col-span-1">
                <label className="block text-xs text-[hsl(var(--muted-foreground))]">Language</label>
                <input
                  value={templateLanguage}
                  onChange={(e) => setTemplateLanguage(e.target.value)}
                  placeholder="pt_BR"
                  className="mt-1 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-[hsl(var(--foreground))]"
                />
              </div>
              {headerRequirement.kind !== 'none' && headerRequirement.kind !== 'text' && (
                <div className="md:col-span-3 cr8-card p-3">
                  <div className="text-xs font-semibold text-[hsl(var(--foreground))]">HEADER de mídia</div>
                  <div className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">
                    Este template exige HEADER de {headerRequirement.kind}. Informe a URL pública do arquivo para enviar.
                  </div>
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className={headerRequirement.kind === 'document' ? 'md:col-span-2' : 'md:col-span-3'}>
                      <label className="block text-xs text-[hsl(var(--muted-foreground))]">URL da mídia</label>
                      <input
                        value={headerMediaUrl}
                        onChange={(e) => setHeaderMediaUrl(e.target.value)}
                        placeholder="https://..."
                        className="mt-1 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-[hsl(var(--foreground))]"
                      />
                    </div>
                    {headerRequirement.kind === 'document' && (
                      <div>
                        <label className="block text-xs text-[hsl(var(--muted-foreground))]">Filename</label>
                        <input
                          value={headerMediaFilename}
                          onChange={(e) => setHeaderMediaFilename(e.target.value)}
                          placeholder="arquivo.pdf"
                          className="mt-1 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-[hsl(var(--foreground))]"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="md:col-span-3">
                <label className="block text-xs text-[hsl(var(--muted-foreground))]">Components (JSON, opcional)</label>
                <textarea
                  value={templateComponents}
                  onChange={(e) => setTemplateComponents(e.target.value)}
                  placeholder='[{"type":"body","parameters":[{"type":"text","text":"Gabriel"}]}]'
                  rows={4}
                  className="mt-1 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-[hsl(var(--foreground))] font-mono text-xs"
                />
                <div className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">
                  Dica: use <span className="font-mono">{'{{name}}'}</span> e <span className="font-mono">{'{{phone}}'}</span> dentro dos parâmetros.
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="cr8-card p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Destinatários</div>
                <div className="text-xs text-[hsl(var(--muted-foreground))]">{totalRecipients.length}</div>
              </div>

              <div className="mt-3 inline-flex rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-1">
                <button
                  onClick={() => setTab('leads')}
                  className={`px-3 py-2 text-xs rounded-lg ${tab === 'leads' ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'text-[hsl(var(--muted-foreground))]'}`}
                >
                  Leads
                </button>
                <button
                  onClick={() => setTab('paste')}
                  className={`px-3 py-2 text-xs rounded-lg ${tab === 'paste' ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'text-[hsl(var(--muted-foreground))]'}`}
                >
                  Colar lista
                </button>
                <button
                  onClick={() => setTab('csv')}
                  className={`px-3 py-2 text-xs rounded-lg ${tab === 'csv' ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'text-[hsl(var(--muted-foreground))]'}`}
                >
                  Importar CSV
                </button>
              </div>

              {tab === 'leads' ? (
                <div className="mt-3">
                  <input
                    value={leadQuery}
                    onChange={(e) => setLeadQuery(e.target.value)}
                    placeholder="Buscar..."
                    className="w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-[hsl(var(--foreground))]"
                  />
                  <div className="mt-3 max-h-72 overflow-auto border border-[hsl(var(--border))] rounded-xl">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))]">
                        <tr className="border-b border-[hsl(var(--border))]">
                          <th className="p-2 w-8"></th>
                          <th className="p-2">Nome</th>
                          <th className="p-2">Telefone</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredLeads.slice(0, 200).map((l) => {
                          const p = normalizePhone(l.phone || '');
                          const checked = Boolean(selectedLeadIds[l.id]);
                          return (
                            <tr key={l.id} className="border-b border-[hsl(var(--border))]">
                              <td className="p-2">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => setSelectedLeadIds((prev) => ({ ...prev, [l.id]: e.target.checked }))}
                                />
                              </td>
                              <td className="p-2 text-[hsl(var(--foreground))]">{l.name || '-'}</td>
                              <td className="p-2 font-mono text-[hsl(var(--muted-foreground))]">{p}</td>
                            </tr>
                          );
                        })}
                        {filteredLeads.length === 0 && (
                          <tr>
                            <td colSpan={3} className="p-4 text-center text-[hsl(var(--muted-foreground))]">
                              Nenhum lead com telefone.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : tab === 'paste' ? (
                <div className="mt-3">
                  <textarea
                    value={paste}
                    onChange={(e) => setPaste(e.target.value)}
                    rows={10}
                    placeholder={'5511999999999;Maria\n5511888888888;João'}
                    className="w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-[hsl(var(--foreground))] font-mono text-xs"
                  />
                  <div className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">
                    Um por linha. Formato: <span className="font-mono">telefone;nome</span> (nome opcional).
                  </div>
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-[hsl(var(--muted-foreground))]">
                      {csvName ? `Arquivo: ${csvName}` : 'Escolha um arquivo CSV com colunas phone/telefone e opcionalmente name/nome.'}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCsvName(null);
                        setCsvText('');
                      }}
                      className="text-xs px-3 py-2 rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]"
                    >
                      Limpar CSV
                    </button>
                  </div>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setCsvName(file.name);
                      const reader = new FileReader();
                      reader.onload = () => setCsvText(String(reader.result || ''));
                      reader.readAsText(file);
                    }}
                    className="block w-full text-xs text-[hsl(var(--muted-foreground))]"
                  />
                  <textarea
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    rows={6}
                    placeholder={'phone,name\n5511999999999,Maria'}
                    className="w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-[hsl(var(--foreground))] font-mono text-xs"
                  />
                  <div className="text-[11px] text-[hsl(var(--muted-foreground))]">
                    Dica: se não tiver cabeçalho, use <span className="font-mono">telefone,nome</span> nas colunas 1 e 2.
                  </div>
                </div>
              )}
            </div>

            <div className="cr8-card p-4">
              <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Resumo</div>
              <div className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
                {kind === 'template'
                  ? 'Templates exigem aprovação no WhatsApp Manager.'
                  : 'Texto livre: respeite as regras de opt-in/opt-out.'}
              </div>

              <div className="mt-4 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[hsl(var(--muted-foreground))]">Tipo</span>
                  <span className="text-[hsl(var(--foreground))]">{kind}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[hsl(var(--muted-foreground))]">Destinatários</span>
                  <span className="text-[hsl(var(--foreground))]">{totalRecipients.length}</span>
                </div>
              </div>

              <button
                disabled={!canManage || loading}
                onClick={() => void create()}
                className="mt-6 w-full px-3 py-2 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50"
              >
                {loading ? 'Criando...' : 'Criar campanha'}
              </button>
              {!canManage && (
                <div className="mt-2 text-[11px] text-[hsl(var(--muted-foreground))]">Apenas admin/gestor pode criar.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
