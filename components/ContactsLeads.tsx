import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, RefreshCw, Search, X, Clock, Link2, BarChart2,
  CheckCircle2, XCircle, AlertCircle, Activity,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { Lead } from '../types';
import { NewLeadModal } from './NewLeadModal';

interface ContactsLeadsProps {
  companyId?: string;
}

const formatRelativeTime = (dateIso?: string | null) => {
  if (!dateIso) return '--';
  const diffMs = Date.now() - new Date(dateIso).getTime();
  const diffMin = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMin < 1) return 'Agora';
  if (diffMin < 60) return `${diffMin}m`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
};

const formatFullDate = (iso?: string | null) => {
  if (!iso) return '--';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const initials = (name: string) =>
  name.split(' ').slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase() || '?';

const AVATAR_COLORS = [
  'bg-blue-500/20 text-blue-300',
  'bg-purple-500/20 text-purple-300',
  'bg-emerald-500/20 text-emerald-300',
  'bg-orange-500/20 text-orange-300',
  'bg-pink-500/20 text-pink-300',
  'bg-cyan-500/20 text-cyan-300',
];
const avatarColor = (id: string) => AVATAR_COLORS[id.charCodeAt(0) % AVATAR_COLORS.length];

const STATUS_CONFIG: Record<Lead['status'], { label: string; badge: string; dot: string }> = {
  new:       { label: 'Novo',       badge: 'bg-sky-500/15 text-sky-300 border-sky-500/20',       dot: 'bg-sky-400' },
  contacted: { label: 'Contato',    badge: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/20', dot: 'bg-yellow-400' },
  proposal:  { label: 'Proposta',   badge: 'bg-purple-500/15 text-purple-300 border-purple-500/20', dot: 'bg-purple-400' },
  won:       { label: 'Ganho',      badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20', dot: 'bg-emerald-400' },
  lost:      { label: 'Perdido',    badge: 'bg-rose-500/15 text-rose-300 border-rose-500/20',     dot: 'bg-rose-400' },
};

const SOURCE_COLORS: Record<string, string> = {
  whatsapp: 'bg-emerald-500/15 text-emerald-400',
  instagram: 'bg-pink-500/15 text-pink-400',
  facebook: 'bg-blue-500/15 text-blue-400',
  meta: 'bg-blue-500/15 text-blue-400',
  google: 'bg-yellow-500/15 text-yellow-300',
  form: 'bg-violet-500/15 text-violet-400',
};
const sourceColor = (s: string) => {
  const lower = (s ?? '').toLowerCase();
  for (const [k, v] of Object.entries(SOURCE_COLORS)) {
    if (lower.includes(k)) return v;
  }
  return 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]';
};

const EVENT_ICON: Record<string, React.ReactNode> = {
  message: <Activity className="h-3 w-3" />,
  conversion: <CheckCircle2 className="h-3 w-3" />,
  status_change: <RefreshCw className="h-3 w-3" />,
};
const eventIcon = (type: string) => EVENT_ICON[type] ?? <Clock className="h-3 w-3" />;

// ── Stat badge ────────────────────────────────────────────────────────────────
const Stat = ({ value, label }: { value: number; label: string }) => (
  <div className="text-center">
    <div className="text-lg font-extrabold text-[hsl(var(--foreground))] tabular-nums">{value}</div>
    <div className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-wider">{label}</div>
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────
export const ContactsLeads: React.FC<ContactsLeadsProps> = ({ companyId }) => {
  const readOnlyMode = !isSupabaseConfigured();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | Lead['status']>('all');

  const [leads, setLeads] = useState<Lead[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [leadEvents, setLeadEvents] = useState<any[]>([]);
  const [conversionEvents, setConversionEvents] = useState<any[]>([]);

  const selectedLead = useMemo(() => leads.find((l) => l.id === selectedLeadId) ?? null, [leads, selectedLeadId]);

  const fetchLeads = useCallback(async () => {
    setError(null);
    if (readOnlyMode || !companyId) { setLeads([]); return; }
    setLoading(true);
    try {
      const { data, error: dbError } = await supabase
        .from('leads').select('*').eq('company_id', companyId)
        .order('created_at', { ascending: false }).limit(500);
      if (dbError) throw dbError;
      const mapped: Lead[] = (data ?? []).map((d: any) => ({
        id: d.id, name: d.name ?? 'Lead', phone: d.phone ?? '', email: d.email ?? '',
        status: d.status, source: d.source ?? 'Manual',
        utm_source: d.utm_source, utm_campaign: d.utm_campaign, utm_medium: d.utm_medium,
        utm_content: d.utm_content, utm_term: d.utm_term,
        landing_page_url: d.landing_page_url, referrer_url: d.referrer_url,
        gclid: d.gclid, gbraid: d.gbraid, wbraid: d.wbraid,
        fbclid: d.fbclid, fbc: d.fbc, fbp: d.fbp,
        first_touch_at: d.first_touch_at, first_touch_channel: d.first_touch_channel,
        last_touch_at: d.last_touch_at, last_touch_channel: d.last_touch_channel,
        lead_score_total: d.lead_score_total, lead_score_last: d.lead_score_last,
        lead_score_updated_at: d.lead_score_updated_at,
        lastInteraction: formatRelativeTime(d.last_interaction_at ?? d.created_at),
        value: d.value, assigned_to: d.assigned_to, raw: d.raw,
        created_at: d.created_at, updated_at: d.updated_at,
      }));
      setLeads(mapped);
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao carregar leads.');
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, [companyId, readOnlyMode]);

  useEffect(() => { void fetchLeads(); }, [fetchLeads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (status !== 'all' && l.status !== status) return false;
      if (!q) return true;
      return `${l.name} ${l.email} ${l.phone} ${l.source}`.toLowerCase().includes(q);
    });
  }, [leads, search, status]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: leads.length };
    for (const l of leads) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [leads]);

  const fetchLeadTimeline = useCallback(async (leadId: string) => {
    if (readOnlyMode || !companyId) return;
    setDetailError(null);
    setDetailLoading(true);
    try {
      const [{ data: events, error: evErr }, { data: convs, error: convErr }] = await Promise.all([
        supabase.from('lead_events').select('id,type,channel,summary,raw,occurred_at,created_at')
          .eq('company_id', companyId).eq('lead_id', leadId)
          .order('occurred_at', { ascending: false }).limit(200),
        supabase.from('conversion_events').select('id,provider,event_key,status,attempts,last_error,event_time,created_at,updated_at')
          .eq('company_id', companyId).eq('lead_id', leadId)
          .order('created_at', { ascending: false }).limit(200),
      ]);
      if (evErr) throw evErr;
      if (convErr) throw convErr;
      setLeadEvents(events ?? []);
      setConversionEvents(convs ?? []);
    } catch (e: any) {
      setDetailError(e?.message ?? 'Erro ao carregar historico.');
      setLeadEvents([]);
      setConversionEvents([]);
    } finally {
      setDetailLoading(false);
    }
  }, [companyId, readOnlyMode]);

  useEffect(() => {
    if (selectedLeadId) void fetchLeadTimeline(selectedLeadId);
  }, [fetchLeadTimeline, selectedLeadId]);

  const closeDetails = () => {
    setSelectedLeadId(null);
    setLeadEvents([]);
    setConversionEvents([]);
    setDetailError(null);
    setDetailLoading(false);
  };

  if (readOnlyMode) {
    return (
      <div className="h-[calc(100vh-8rem)] flex items-center justify-center">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-[hsl(var(--foreground))]">Contatos & Leads</h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Configure o Supabase para habilitar este modulo.</p>
        </div>
      </div>
    );
  }

  const STATUS_FILTERS: Array<{ value: 'all' | Lead['status']; label: string }> = [
    { value: 'all', label: 'Todos' },
    { value: 'new', label: 'Novos' },
    { value: 'contacted', label: 'Contato' },
    { value: 'proposal', label: 'Proposta' },
    { value: 'won', label: 'Ganhos' },
    { value: 'lost', label: 'Perdidos' },
  ];

  return (
    <>
      <div className="space-y-5 pb-4">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
          className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-[hsl(var(--foreground))]">Contatos</h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">Base de leads da empresa</p>
            {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void fetchLeads()}
              className="p-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[hsl(var(--primary))] text-white text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm shadow-[hsl(var(--primary))]/20">
              <Plus className="h-4 w-4" /> Novo Lead
            </button>
          </div>
        </motion.div>

        {/* Stats row */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}
          className="grid grid-cols-5 gap-3">
          {(['new', 'contacted', 'proposal', 'won', 'lost'] as Lead['status'][]).map((s) => {
            const cfg = STATUS_CONFIG[s];
            return (
              <button key={s} onClick={() => setStatus(status === s ? 'all' : s)}
                className={`cr8-card p-3 text-left transition-all ${status === s ? 'ring-1 ring-[hsl(var(--primary))]/40' : 'hover:border-[hsl(var(--primary))]/20'}`}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">{cfg.label}</span>
                </div>
                <div className="text-2xl font-extrabold text-[hsl(var(--foreground))] tabular-nums">{counts[s] ?? 0}</div>
              </button>
            );
          })}
        </motion.div>

        {/* Search + Filter bar */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.1 }}
          className="cr8-card p-3 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nome, email, telefone ou fonte..."
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]/50 transition-all" />
            {search && (
              <button onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[hsl(var(--secondary))] border border-[hsl(var(--border))]">
            {STATUS_FILTERS.map((f) => (
              <button key={f.value} onClick={() => setStatus(f.value)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
                  status === f.value
                    ? 'bg-[hsl(var(--primary))] text-white shadow-sm'
                    : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                }`}>
                {f.label}
                {f.value !== 'all' && counts[f.value] ? (
                  <span className="ml-1 opacity-70">{counts[f.value]}</span>
                ) : f.value === 'all' ? (
                  <span className="ml-1 opacity-70">{counts.all}</span>
                ) : null}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Table */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.12 }}
          className="cr8-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[hsl(var(--border))]">
                  {['Contato', 'Status', 'Fonte', 'Ultima Interacao', 'Valor', 'Score'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--muted-foreground))]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-[hsl(var(--border))]/50">
                      {[...Array(6)].map((_, j) => (
                        <td key={j} className="px-4 py-3.5">
                          <div className={`h-3.5 rounded animate-shimmer ${j === 0 ? 'w-32' : 'w-16'}`} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-16 text-center text-sm text-[hsl(var(--muted-foreground))]">
                      {search ? `Nenhum resultado para "${search}"` : 'Nenhum lead encontrado.'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((lead, idx) => {
                    const cfg = STATUS_CONFIG[lead.status];
                    const score = lead.lead_score_total ?? 0;
                    return (
                      <motion.tr
                        key={lead.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: Math.min(idx * 0.02, 0.3) }}
                        onClick={() => setSelectedLeadId(lead.id)}
                        className="border-b border-[hsl(var(--border))]/40 hover:bg-[hsl(var(--secondary))]/60 cursor-pointer transition-colors group"
                      >
                        {/* Contact */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${avatarColor(lead.id)}`}>
                              {initials(lead.name)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-[hsl(var(--foreground))] truncate leading-tight">{lead.name}</p>
                              <p className="text-[11px] text-[hsl(var(--muted-foreground))] truncate mt-0.5">
                                {lead.email || lead.phone || '--'}
                              </p>
                            </div>
                          </div>
                        </td>
                        {/* Status */}
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.badge}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                            {cfg.label}
                          </span>
                        </td>
                        {/* Source */}
                        <td className="px-4 py-3.5">
                          <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide ${sourceColor(lead.source ?? '')}`}>
                            {lead.source ?? 'Manual'}
                          </span>
                        </td>
                        {/* Last interaction */}
                        <td className="px-4 py-3.5">
                          <span className="text-xs text-[hsl(var(--muted-foreground))]">{lead.lastInteraction}</span>
                        </td>
                        {/* Value */}
                        <td className="px-4 py-3.5">
                          {lead.value != null ? (
                            <span className="text-sm font-semibold text-[hsl(var(--foreground))]">
                              R$ {lead.value.toLocaleString('pt-BR')}
                            </span>
                          ) : (
                            <span className="text-xs text-[hsl(var(--muted-foreground))]">--</span>
                          )}
                        </td>
                        {/* Score */}
                        <td className="px-4 py-3.5">
                          {score > 0 ? (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1 rounded-full bg-[hsl(var(--muted))] overflow-hidden w-16">
                                <div className="h-full bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--accent))]"
                                  style={{ width: `${Math.min((score / 100) * 100, 100)}%` }} />
                              </div>
                              <span className="text-[11px] font-bold text-[hsl(var(--foreground))]">{score}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-[hsl(var(--muted-foreground))]">--</span>
                          )}
                        </td>
                      </motion.tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          {!loading && filtered.length > 0 && (
            <div className="px-4 py-2.5 border-t border-[hsl(var(--border))]/50 flex items-center justify-between">
              <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
                {filtered.length} de {leads.length} contatos
              </span>
              <div className="flex items-center gap-3">
                {(['won', 'lost'] as Lead['status'][]).map((s) => (
                  <span key={s} className="text-[11px] text-[hsl(var(--muted-foreground))]">
                    {STATUS_CONFIG[s].label}: <strong className="text-[hsl(var(--foreground))]">{counts[s] ?? 0}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* Detail slide-over */}
      {selectedLeadId && createPortal(
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/60 flex justify-end"
            onMouseDown={closeDetails}
          >
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="w-full max-w-[480px] h-full bg-[hsl(var(--background))] border-l border-[hsl(var(--border))] flex flex-col overflow-hidden"
              onMouseDown={(e) => e.stopPropagation()}
            >
              {/* Panel header */}
              <div className="px-5 py-4 border-b border-[hsl(var(--border))] flex items-start justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${avatarColor(selectedLeadId)}`}>
                    {initials(selectedLead?.name ?? '?')}
                  </div>
                  <div>
                    <p className="font-bold text-[hsl(var(--foreground))] leading-tight">{selectedLead?.name ?? 'Contato'}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                      {selectedLead?.email || selectedLead?.phone || '--'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selectedLead && (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_CONFIG[selectedLead.status].badge}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_CONFIG[selectedLead.status].dot}`} />
                      {STATUS_CONFIG[selectedLead.status].label}
                    </span>
                  )}
                  <button onClick={closeDetails}
                    className="p-1.5 rounded-lg hover:bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Panel body */}
              <div className="flex-1 overflow-y-auto cr8-scroll p-5 space-y-5">
                {detailError && (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {detailError}
                  </div>
                )}

                {/* Value + Score */}
                {(selectedLead?.value || (selectedLead?.lead_score_total ?? 0) > 0) && (
                  <div className="flex gap-3">
                    {selectedLead?.value != null && (
                      <div className="flex-1 cr8-card p-3.5 text-center">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-1">Valor</p>
                        <p className="text-xl font-extrabold text-[hsl(var(--foreground))]">
                          R$ {selectedLead.value.toLocaleString('pt-BR')}
                        </p>
                      </div>
                    )}
                    {(selectedLead?.lead_score_total ?? 0) > 0 && (
                      <div className="flex-1 cr8-card p-3.5 text-center">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-1">Lead Score</p>
                        <p className="text-xl font-extrabold text-[hsl(var(--foreground))]">{selectedLead?.lead_score_total}</p>
                        <div className="h-1 rounded-full bg-[hsl(var(--muted))] mt-1.5 overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--accent))]"
                            style={{ width: `${Math.min(((selectedLead?.lead_score_total ?? 0) / 100) * 100, 100)}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Attribution */}
                <div className="cr8-card overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-[hsl(var(--border))]">
                    <Link2 className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
                    <span className="text-xs font-bold text-[hsl(var(--foreground))]">Atribuicao</span>
                  </div>
                  <div className="divide-y divide-[hsl(var(--border))]/50">
                    {[
                      { label: 'Primeiro toque', value: `${selectedLead?.first_touch_channel ?? '--'} · ${formatRelativeTime(selectedLead?.first_touch_at)}` },
                      { label: 'Ultimo toque',   value: `${selectedLead?.last_touch_channel ?? '--'} · ${formatRelativeTime(selectedLead?.last_touch_at)}` },
                      { label: 'UTM Source',     value: selectedLead?.utm_source },
                      { label: 'UTM Medium',     value: selectedLead?.utm_medium },
                      { label: 'UTM Campaign',   value: selectedLead?.utm_campaign },
                      { label: 'Landing Page',   value: selectedLead?.landing_page_url },
                      { label: 'Referrer',       value: selectedLead?.referrer_url },
                      { label: 'Click ID (Google)', value: selectedLead?.gclid ?? selectedLead?.gbraid ?? selectedLead?.wbraid },
                      { label: 'Click ID (Meta)', value: selectedLead?.fbclid ?? selectedLead?.fbc },
                    ]
                      .filter((r) => r.value)
                      .map((row) => (
                        <div key={row.label} className="flex items-start justify-between gap-3 px-4 py-2.5">
                          <span className="text-[11px] text-[hsl(var(--muted-foreground))] shrink-0">{row.label}</span>
                          <span className="text-[11px] text-[hsl(var(--foreground))] text-right break-all font-mono">{row.value}</span>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Timeline */}
                <div className="cr8-card overflow-hidden">
                  <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[hsl(var(--border))]">
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
                      <span className="text-xs font-bold text-[hsl(var(--foreground))]">Historico</span>
                    </div>
                    <button onClick={() => selectedLeadId && fetchLeadTimeline(selectedLeadId)}
                      disabled={detailLoading}
                      className="p-1 rounded-md hover:bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors disabled:opacity-40">
                      <RefreshCw className={`h-3.5 w-3.5 ${detailLoading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  {detailLoading ? (
                    <div className="p-4 space-y-2">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="h-10 rounded-lg animate-shimmer" />
                      ))}
                    </div>
                  ) : leadEvents.length === 0 ? (
                    <div className="px-4 py-8 text-center text-xs text-[hsl(var(--muted-foreground))]">
                      Sem eventos registrados.
                    </div>
                  ) : (
                    <div className="p-4">
                      <div className="relative pl-5 space-y-3">
                        {/* Vertical line */}
                        <div className="absolute left-[7px] top-1 bottom-1 w-px bg-[hsl(var(--border))]" />
                        {leadEvents.map((ev) => (
                          <div key={ev.id} className="relative flex gap-3">
                            <div className="absolute -left-5 top-1 h-3.5 w-3.5 rounded-full border-2 border-[hsl(var(--border))] bg-[hsl(var(--background))] flex items-center justify-center text-[hsl(var(--muted-foreground))]">
                              {eventIcon(ev.type)}
                            </div>
                            <div className="flex-1 min-w-0 bg-[hsl(var(--secondary))] rounded-lg px-3 py-2.5 border border-[hsl(var(--border))]">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-xs font-semibold text-[hsl(var(--foreground))] leading-tight">
                                  {ev.summary ?? ev.type}
                                </p>
                                <span className="text-[10px] text-[hsl(var(--muted-foreground))] whitespace-nowrap shrink-0">
                                  {formatRelativeTime(ev.occurred_at ?? ev.created_at)}
                                </span>
                              </div>
                              {ev.channel && (
                                <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">{ev.channel}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Conversions */}
                {conversionEvents.length > 0 && (
                  <div className="cr8-card overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-[hsl(var(--border))]">
                      <BarChart2 className="h-3.5 w-3.5 text-[hsl(var(--accent))]" />
                      <span className="text-xs font-bold text-[hsl(var(--foreground))]">Conversoes Outbox</span>
                    </div>
                    <div className="divide-y divide-[hsl(var(--border))]/50">
                      {conversionEvents.map((c) => (
                        <div key={c.id} className="flex items-start justify-between gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[hsl(var(--foreground))]">
                              {c.provider}:{c.event_key}
                            </p>
                            <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">
                              {formatRelativeTime(c.created_at)} · {c.attempts ?? 0} tentativas
                            </p>
                            {c.last_error && (
                              <p className="text-[10px] text-red-400 mt-0.5 break-all">{c.last_error}</p>
                            )}
                          </div>
                          <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                            c.status === 'sent' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20'
                            : c.status === 'failed' ? 'bg-red-500/15 text-red-300 border-red-500/20'
                            : 'bg-yellow-500/15 text-yellow-300 border-yellow-500/20'
                          }`}>
                            {c.status === 'sent' ? <CheckCircle2 className="h-3 w-3" />
                              : c.status === 'failed' ? <XCircle className="h-3 w-3" />
                              : <Clock className="h-3 w-3" />}
                            {c.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}

      <NewLeadModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={(newLead) => setLeads((prev) => [newLead, ...prev])}
        companyId={companyId}
      />
    </>
  );
};
