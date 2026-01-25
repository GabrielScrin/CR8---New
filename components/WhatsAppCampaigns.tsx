import React, { useEffect, useMemo, useState } from 'react';
import { FileDown, Plus, RefreshCw, RotateCcw, Send, StopCircle, ClipboardCheck, ListOrdered } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Role } from '../types';
import { callWhatsAppBroadcast } from './whatsapp/broadcastApi';
import { WhatsAppCampaignCreateModal } from './WhatsAppCampaignCreateModal';

type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'paused' | 'completed' | 'failed' | 'cancelled';
type MessageKind = 'text' | 'template';

type CampaignRow = {
  id: string;
  company_id: string;
  name: string;
  status: CampaignStatus;
  message_kind: MessageKind;
  text_body: string | null;
  template_name: string | null;
  template_language: string | null;
  total_recipients: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  skipped: number;
  created_at: string;
  updated_at: string;
};

type RecipientRow = {
  id: string;
  campaign_id: string;
  phone: string;
  name: string | null;
  status: string;
  external_message_id: string | null;
  error: string | null;
  created_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  skipped_at: string | null;
};

type TraceEventRow = {
  id: string;
  campaign_id: string;
  recipient_id: string | null;
  chat_id: string | null;
  step: string;
  ok: boolean;
  http_status: number | null;
  message: string | null;
  created_at: string;
};

const formatDateTimeShort = (iso?: string | null) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
};

const statusBadge = (status: CampaignStatus) => {
  switch (status) {
    case 'draft':
      return 'bg-slate-500/15 text-slate-300 border border-slate-500/20';
    case 'sending':
      return 'bg-blue-500/15 text-blue-300 border border-blue-500/20';
    case 'completed':
      return 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20';
    case 'failed':
      return 'bg-red-500/15 text-red-300 border border-red-500/20';
    case 'cancelled':
      return 'bg-zinc-500/15 text-zinc-300 border border-zinc-500/20';
    case 'paused':
      return 'bg-amber-500/15 text-amber-300 border border-amber-500/20';
    case 'scheduled':
      return 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/20';
    default:
      return 'bg-slate-500/15 text-slate-300 border border-slate-500/20';
  }
};

export function WhatsAppCampaigns({ companyId, role }: { companyId: string; role: Role }) {
  const canManage = useMemo(() => role === 'admin' || role === 'gestor', [role]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const selectedCampaign = useMemo(
    () => campaigns.find((c) => c.id === selectedCampaignId) ?? null,
    [campaigns, selectedCampaignId]
  );

  const [recipients, setRecipients] = useState<RecipientRow[]>([]);
  const [recipientStatusFilter, setRecipientStatusFilter] = useState<string>('all');

  const [showTrace, setShowTrace] = useState(false);
  const [traceEvents, setTraceEvents] = useState<TraceEventRow[]>([]);

  const [batchSize, setBatchSize] = useState(10);
  const [delayMs, setDelayMs] = useState(500);
  const [runLoop, setRunLoop] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);

  const downloadCsv = (rows: RecipientRow[], filename: string) => {
    const headers = ['phone', 'name', 'status', 'error', 'external_message_id', 'created_at'];
    const escape = (v: any) => `"${String(v ?? '').replaceAll('"', '""')}"`;
    const lines = [
      headers.join(','),
      ...rows.map((r) =>
        [
          escape(r.phone),
          escape(r.name),
          escape(r.status),
          escape(r.error),
          escape(r.external_message_id),
          escape(r.created_at),
        ].join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const fetchCampaigns = async (selectId?: string | null) => {
    setLoading(true);
    setError(null);
    setOk(null);
    try {
      const { data, error: dbError } = await supabase
        .from('whatsapp_campaigns')
        .select(
          'id,company_id,name,status,message_kind,text_body,template_name,template_language,total_recipients,sent,delivered,read,failed,skipped,created_at,updated_at'
        )
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (dbError) throw dbError;
      const rows = (data ?? []) as any as CampaignRow[];
      setCampaigns(rows);
      const nextId = selectId ?? selectedCampaignId ?? rows[0]?.id ?? null;
      setSelectedCampaignId(nextId);
    } catch (e: any) {
      setCampaigns([]);
      setSelectedCampaignId(null);
      setError(e?.message ?? 'Erro ao carregar campanhas.');
    } finally {
      setLoading(false);
    }
  };

  const fetchRecipients = async (campaignId: string) => {
    setError(null);
    try {
      let q = supabase
        .from('whatsapp_campaign_recipients')
        .select(
          'id,campaign_id,phone,name,status,external_message_id,error,created_at,sent_at,delivered_at,read_at,failed_at,skipped_at'
        )
        .eq('company_id', companyId)
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false })
        .limit(1000);
      if (recipientStatusFilter !== 'all') q = q.eq('status', recipientStatusFilter);
      const { data, error: dbError } = await q;
      if (dbError) throw dbError;
      setRecipients((data ?? []) as any as RecipientRow[]);
    } catch (e: any) {
      setRecipients([]);
      setError(e?.message ?? 'Erro ao carregar destinatários.');
    }
  };

  const fetchTrace = async (campaignId: string) => {
    try {
      const { data, error: dbError } = await supabase
        .from('whatsapp_campaign_trace_events')
        .select('id,campaign_id,recipient_id,chat_id,step,ok,http_status,message,created_at')
        .eq('company_id', companyId)
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (dbError) throw dbError;
      setTraceEvents((data ?? []) as any as TraceEventRow[]);
    } catch {
      setTraceEvents([]);
    }
  };

  useEffect(() => {
    void fetchCampaigns(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    if (!selectedCampaignId) {
      setRecipients([]);
      setTraceEvents([]);
      return;
    }
    void fetchRecipients(selectedCampaignId);
    if (showTrace) void fetchTrace(selectedCampaignId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCampaignId, recipientStatusFilter, showTrace]);

  const runBatch = async () => {
    if (!canManage || !selectedCampaignId) return;
    setLoading(true);
    setError(null);
    setOk(null);
    try {
      const res = await callWhatsAppBroadcast<{ ok: boolean; processed: number; sent: number; failed: number; skipped: number }>({
        action: 'run',
        campaign_id: selectedCampaignId,
        batch_size: Math.max(1, Math.min(50, Number(batchSize) || 10)),
        delay_ms: Math.max(0, Math.min(5000, Number(delayMs) || 0)),
      });
      setOk(`Batch: processados ${res.processed}, enviados ${res.sent}, falhas ${res.failed}, ignorados ${res.skipped}.`);
      await fetchCampaigns(selectedCampaignId);
      await fetchRecipients(selectedCampaignId);
      return res;
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao enviar.');
      return { ok: false, processed: 0, sent: 0, failed: 0, skipped: 0 };
    } finally {
      setLoading(false);
    }
  };

  const precheckCampaign = async () => {
    if (!canManage || !selectedCampaignId) return;
    setLoading(true);
    setError(null);
    setOk(null);
    try {
      const res = await callWhatsAppBroadcast<{
        ok: boolean;
        totals?: { pending: number; failed: number; skipped: number };
        opt_out?: { checked: number; hits: number; limit: number };
      }>({ action: 'precheck', campaign_id: selectedCampaignId });
      const pending = Number(res?.totals?.pending ?? 0);
      const failed = Number(res?.totals?.failed ?? 0);
      const skipped = Number(res?.totals?.skipped ?? 0);
      const optChecked = Number(res?.opt_out?.checked ?? 0);
      const optHits = Number(res?.opt_out?.hits ?? 0);
      setOk(`Pré-check: pending ${pending}, failed ${failed}, skipped ${skipped}. Opt-out (amostra ${optChecked}): ${optHits}.`);
    } catch (e: any) {
      setError(e?.message ?? 'Erro no pré-check.');
    } finally {
      setLoading(false);
    }
  };

  const requeue = async (statuses: Array<'failed' | 'skipped'>) => {
    if (!canManage || !selectedCampaignId) return;
    setLoading(true);
    setError(null);
    setOk(null);
    try {
      const res = await callWhatsAppBroadcast<{ ok: boolean; requeued: number; error?: string }>({
        action: 'requeue',
        campaign_id: selectedCampaignId,
        statuses,
      });
      if (!res?.ok) throw new Error(res?.error || 'Falha ao reenfileirar.');
      setOk(`Reenfileirados: ${res.requeued}.`);
      await fetchCampaigns(selectedCampaignId);
      await fetchRecipients(selectedCampaignId);
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao reenfileirar.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!runLoop) return;
    if (!selectedCampaignId) return;
    let cancelled = false;
    (async () => {
      while (!cancelled) {
        const res: any = await runBatch();
        const processed = Number(res?.processed ?? 0);
        if (!processed) break;
      }
      if (!cancelled) setRunLoop(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runLoop, selectedCampaignId]);

  const cancelCampaign = async () => {
    if (!canManage || !selectedCampaignId) return;
    setLoading(true);
    setError(null);
    setOk(null);
    try {
      const res = await callWhatsAppBroadcast<{ ok: boolean; error?: string }>({ action: 'cancel', campaign_id: selectedCampaignId });
      if (!res?.ok) throw new Error(res?.error || 'Falha ao cancelar.');
      setOk('Campanha cancelada.');
      await fetchCampaigns(selectedCampaignId);
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao cancelar.');
    } finally {
      setLoading(false);
    }
  };

  const preview = useMemo(() => {
    if (!selectedCampaign) return '';
    if (selectedCampaign.message_kind === 'template') {
      return `Template: ${(selectedCampaign.template_name ?? '').trim()} (${(selectedCampaign.template_language ?? '').trim()})`;
    }
    return (selectedCampaign.text_body ?? '').trim();
  }, [selectedCampaign]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="cr8-card p-4 lg:col-span-1">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Campanhas</div>
            <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Disparo em massa (Cloud API).</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void fetchCampaigns(selectedCampaignId)}
              disabled={loading}
              className="px-3 py-2 rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] disabled:opacity-50 inline-flex items-center gap-2"
              title="Atualizar"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCreateOpen(true)}
              disabled={!canManage}
              className="px-3 py-2 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2"
              title="Nova campanha"
            >
              <Plus className="h-4 w-4" />
              Nova
            </button>
          </div>
        </div>

        {(error || ok) && (
          <div className="mt-3">
            {error && <div className="text-sm text-[hsl(var(--destructive))]">{error}</div>}
            {ok && <div className="text-sm text-emerald-300">{ok}</div>}
          </div>
        )}

        <div className="mt-4 max-h-[62vh] overflow-auto border border-[hsl(var(--border))] rounded-xl">
          {campaigns.map((c) => {
            const active = c.id === selectedCampaignId;
            return (
              <button
                key={c.id}
                onClick={() => setSelectedCampaignId(c.id)}
                className={`w-full text-left p-3 border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))] ${
                  active ? 'bg-[hsl(var(--secondary))]' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate font-medium text-[hsl(var(--foreground))]">{c.name}</div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusBadge(c.status)}`}>{c.status}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-[hsl(var(--muted-foreground))] gap-2">
                  <span className="truncate">{c.message_kind === 'template' ? `template:${c.template_name ?? ''}` : 'texto'}</span>
                  <span>{formatDateTimeShort(c.created_at)}</span>
                </div>
                <div className="mt-2 text-[11px] text-[hsl(var(--muted-foreground))]">
                  {c.sent}/{c.total_recipients} enviados â€¢ {c.failed} falhas â€¢ {c.skipped} ignorados
                </div>
              </button>
            );
          })}
          {!loading && campaigns.length === 0 && (
            <div className="p-6 text-center text-sm text-[hsl(var(--muted-foreground))]">Nenhuma campanha ainda.</div>
          )}
        </div>
      </div>

      <div className="cr8-card p-4 lg:col-span-2">
        {!selectedCampaign ? (
          <div className="h-[62vh] flex items-center justify-center text-[hsl(var(--muted-foreground))]">Selecione uma campanha.</div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-[hsl(var(--foreground))]">{selectedCampaign.name}</div>
                <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                  Criada em {formatDateTimeShort(selectedCampaign.created_at)} â€¢ Atualizada em {formatDateTimeShort(selectedCampaign.updated_at)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={!canManage || loading || runLoop}
                  onClick={() => void runBatch()}
                  className="px-3 py-2 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2"
                >
                  <Send className="h-4 w-4" />
                  Enviar batch
                </button>
                {!runLoop ? (
                  <button
                    disabled={!canManage || loading}
                    onClick={() => setRunLoop(true)}
                    className="px-3 py-2 rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] disabled:opacity-50"
                    title="Processar atÃ© acabar"
                  >
                    Enviar tudo
                  </button>
                ) : (
                  <button
                    disabled={loading}
                    onClick={() => setRunLoop(false)}
                    className="px-3 py-2 rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] disabled:opacity-50 inline-flex items-center gap-2"
                    title="Parar"
                  >
                    <StopCircle className="h-4 w-4" />
                    Parar
                  </button>
                )}
                <button
                  disabled={!canManage || loading}
                  onClick={() => void cancelCampaign()}
                  className="px-3 py-2 rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] disabled:opacity-50"
                  title="Cancelar"
                >
                  Cancelar
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 md:grid-cols-6 gap-3">
              {[
                { label: 'Total', v: selectedCampaign.total_recipients },
                { label: 'Enviados', v: selectedCampaign.sent },
                { label: 'Entregues', v: selectedCampaign.delivered },
                { label: 'Lidos', v: selectedCampaign.read },
                { label: 'Falhas', v: selectedCampaign.failed },
                { label: 'Ignorados', v: selectedCampaign.skipped },
              ].map((k) => (
                <div key={k.label} className="cr8-card p-3">
                  <div className="text-[11px] text-[hsl(var(--muted-foreground))]">{k.label}</div>
                  <div className="mt-1 text-lg font-bold text-[hsl(var(--foreground))]">{k.v}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 cr8-card p-4">
              <div className="text-xs font-semibold text-[hsl(var(--foreground))]">Preview</div>
              <div className="mt-2 text-sm text-[hsl(var(--foreground))] whitespace-pre-wrap">{preview || '-'}</div>
              <div className="mt-2 text-[11px] text-[hsl(var(--muted-foreground))]">
                Texto suporta variáveis <span className="font-mono">{'{{name}}'}</span> e <span className="font-mono">{'{{phone}}'}</span>.
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                disabled={!canManage || loading}
                onClick={() => void precheckCampaign()}
                className="px-3 py-2 rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] disabled:opacity-50 inline-flex items-center gap-2"
                title="Dry-run: contagens e opt-out (amostra)"
              >
                <ClipboardCheck className="h-4 w-4" />
                Pré-checar
              </button>
              <button
                disabled={!canManage || loading}
                onClick={() => void requeue(['failed'])}
                className="px-3 py-2 rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] disabled:opacity-50 inline-flex items-center gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Reenviar falhas
              </button>
              <button
                disabled={!canManage || loading}
                onClick={() => void requeue(['skipped'])}
                className="px-3 py-2 rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] disabled:opacity-50 inline-flex items-center gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Reenviar ignorados
              </button>
              <button
                disabled={loading || recipients.length === 0}
                onClick={() => downloadCsv(recipients, `whatsapp-campaign-${selectedCampaignId}-recipients.csv`)}
                className="px-3 py-2 rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] disabled:opacity-50 inline-flex items-center gap-2"
                title="Exporta os destinatários carregados (filtro atual)"
              >
                <FileDown className="h-4 w-4" />
                Exportar CSV
              </button>
              <button
                disabled={loading || !selectedCampaignId}
                onClick={() => setShowTrace((v) => !v)}
                className="px-3 py-2 rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] disabled:opacity-50 inline-flex items-center gap-2"
                title="Logs tÃ©cnicos do disparo (para debug)"
              >
                <ListOrdered className="h-4 w-4" />
                {showTrace ? 'Ocultar logs' : 'Ver logs'}
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs text-[hsl(var(--muted-foreground))]">Batch</label>
                <input
                  type="number"
                  value={batchSize}
                  onChange={(e) => setBatchSize(Number(e.target.value))}
                  className="w-20 rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-2 py-1 text-sm text-[hsl(var(--foreground))]"
                />
                <label className="text-xs text-[hsl(var(--muted-foreground))] ml-2">Delay (ms)</label>
                <input
                  type="number"
                  value={delayMs}
                  onChange={(e) => setDelayMs(Number(e.target.value))}
                  className="w-24 rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-2 py-1 text-sm text-[hsl(var(--foreground))]"
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs text-[hsl(var(--muted-foreground))]">Status</label>
                <select
                  value={recipientStatusFilter}
                  onChange={(e) => setRecipientStatusFilter(e.target.value)}
                  className="rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-2 py-1 text-sm text-[hsl(var(--foreground))]"
                >
                  <option value="all">Todos</option>
                  <option value="pending">pending</option>
                  <option value="sending">sending</option>
                  <option value="sent">sent</option>
                  <option value="delivered">delivered</option>
                  <option value="read">read</option>
                  <option value="failed">failed</option>
                  <option value="skipped">skipped</option>
                </select>
              </div>
            </div>

            <div className="mt-3 overflow-auto max-h-[38vh] border border-[hsl(var(--border))] rounded-xl">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[hsl(var(--card))] text-xs text-[hsl(var(--muted-foreground))]">
                  <tr className="border-b border-[hsl(var(--border))] text-left">
                    <th className="p-3">Telefone</th>
                    <th className="p-3">Nome</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Quando</th>
                    <th className="p-3">Erro</th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.map((r) => {
                    const when = r.read_at || r.delivered_at || r.sent_at || r.failed_at || r.skipped_at || r.created_at;
                    return (
                      <tr key={r.id} className="border-b border-[hsl(var(--border))]">
                        <td className="p-3 font-mono text-[hsl(var(--foreground))]">{r.phone}</td>
                        <td className="p-3 text-[hsl(var(--muted-foreground))]">{r.name || '-'}</td>
                        <td className="p-3">
                          <span className="text-xs px-2 py-0.5 rounded-full border border-[hsl(var(--border))] text-[hsl(var(--foreground))]">
                            {r.status}
                          </span>
                        </td>
                        <td className="p-3 text-xs text-[hsl(var(--muted-foreground))]">{formatDateTimeShort(when)}</td>
                        <td className="p-3 text-xs text-[hsl(var(--destructive))]">{r.error || ''}</td>
                      </tr>
                    );
                  })}
                  {!loading && recipients.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-[hsl(var(--muted-foreground))]">
                        Nenhum destinatário.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {showTrace && (
              <div className="mt-4 border border-[hsl(var(--border))] rounded-xl overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-3 py-2 bg-[hsl(var(--card))] border-b border-[hsl(var(--border))]">
                  <div className="text-xs font-semibold text-[hsl(var(--foreground))]">Logs (Ãºltimos 200)</div>
                  <button
                    disabled={loading || !selectedCampaignId}
                    onClick={() => selectedCampaignId && void fetchTrace(selectedCampaignId)}
                    className="px-2 py-1 rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] disabled:opacity-50 text-xs"
                  >
                    Atualizar
                  </button>
                </div>
                <div className="max-h-[26vh] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))]">
                      <tr className="border-b border-[hsl(var(--border))] text-left">
                        <th className="p-2">Quando</th>
                        <th className="p-2">Step</th>
                        <th className="p-2">OK</th>
                        <th className="p-2">HTTP</th>
                        <th className="p-2">Mensagem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {traceEvents.map((ev) => (
                        <tr key={ev.id} className="border-b border-[hsl(var(--border))]">
                          <td className="p-2 text-[hsl(var(--muted-foreground))]">{formatDateTimeShort(ev.created_at)}</td>
                          <td className="p-2 font-mono text-[hsl(var(--foreground))]">{ev.step}</td>
                          <td className="p-2">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full border ${
                                ev.ok ? 'border-emerald-500/20 text-emerald-300 bg-emerald-500/10' : 'border-red-500/20 text-red-300 bg-red-500/10'
                              }`}
                            >
                              {ev.ok ? 'ok' : 'fail'}
                            </span>
                          </td>
                          <td className="p-2 text-[hsl(var(--muted-foreground))]">{ev.http_status ?? ''}</td>
                          <td className="p-2 text-[hsl(var(--muted-foreground))]">{ev.message ?? ''}</td>
                        </tr>
                      ))}
                      {!loading && traceEvents.length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-4 text-center text-[hsl(var(--muted-foreground))]">
                            Sem logs ainda.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <WhatsAppCampaignCreateModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        companyId={companyId}
        role={role}
        onCreated={(campaignId) => {
          setCreateOpen(false);
          void fetchCampaigns(campaignId);
        }}
      />
    </div>
  );
}
