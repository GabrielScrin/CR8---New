import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Search } from 'lucide-react';
import { createPortal } from 'react-dom';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { Lead } from '../types';
import { NewLeadModal } from './NewLeadModal';

interface ContactsLeadsProps {
  companyId?: string;
}

const formatRelativeTime = (dateIso?: string | null) => {
  if (!dateIso) return '—';
  const date = new Date(dateIso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMin < 1) return 'Agora';
  if (diffMin < 60) return `${diffMin} min atrás`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} h atrás`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} d atrás`;
};

const statusLabel: Record<Lead['status'], string> = {
  new: 'Novo',
  contacted: 'Em contato',
  proposal: 'Proposta',
  won: 'Ganho',
  lost: 'Perdido',
};

const statusBadge: Record<Lead['status'], string> = {
  new: 'bg-sky-500/15 text-sky-300 border border-sky-500/20',
  contacted: 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/20',
  proposal: 'bg-purple-500/15 text-purple-300 border border-purple-500/20',
  won: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20',
  lost: 'bg-rose-500/15 text-rose-300 border border-rose-500/20',
};

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
    if (readOnlyMode) {
      setLeads([]);
      return;
    }
    if (!companyId) {
      setLeads([]);
      return;
    }

    setLoading(true);
    try {
      const { data, error: dbError } = await supabase
        .from('leads')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(500);
      if (dbError) throw dbError;

      const mapped: Lead[] = (data ?? []).map((d: any) => ({
        id: d.id,
        name: d.name ?? 'Lead',
        phone: d.phone ?? '',
        email: d.email ?? '',
        status: d.status,
        source: d.source ?? 'Manual',
        utm_source: d.utm_source ?? undefined,
        utm_campaign: d.utm_campaign ?? undefined,
        utm_medium: d.utm_medium ?? undefined,
        utm_content: d.utm_content ?? undefined,
        utm_term: d.utm_term ?? undefined,
        landing_page_url: d.landing_page_url ?? undefined,
        referrer_url: d.referrer_url ?? undefined,
        gclid: d.gclid ?? undefined,
        gbraid: d.gbraid ?? undefined,
        wbraid: d.wbraid ?? undefined,
        fbclid: d.fbclid ?? undefined,
        fbc: d.fbc ?? undefined,
        fbp: d.fbp ?? undefined,
        first_touch_at: d.first_touch_at ?? undefined,
        first_touch_channel: d.first_touch_channel ?? undefined,
        last_touch_at: d.last_touch_at ?? undefined,
        last_touch_channel: d.last_touch_channel ?? undefined,
        lead_score_total: d.lead_score_total ?? undefined,
        lead_score_last: d.lead_score_last ?? undefined,
        lead_score_updated_at: d.lead_score_updated_at ?? undefined,
        lastInteraction: formatRelativeTime(d.last_interaction_at ?? d.created_at),
        value: d.value ?? undefined,
        assigned_to: d.assigned_to ?? undefined,
        raw: d.raw ?? undefined,
        created_at: d.created_at ?? undefined,
        updated_at: d.updated_at ?? undefined,
      }));
      setLeads(mapped);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? 'Erro ao carregar leads.');
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, [companyId, readOnlyMode]);

  useEffect(() => {
    void fetchLeads();
  }, [fetchLeads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (status !== 'all' && l.status !== status) return false;
      if (!q) return true;
      const hay = `${l.name} ${l.email} ${l.phone} ${l.source}`.toLowerCase();
      return hay.includes(q);
    });
  }, [leads, search, status]);

  const fetchLeadTimeline = useCallback(
    async (leadId: string) => {
      if (readOnlyMode) return;
      if (!companyId) return;

      setDetailError(null);
      setDetailLoading(true);
      try {
        const [{ data: events, error: eventsError }, { data: convs, error: convsError }] = await Promise.all([
          supabase
            .from('lead_events')
            .select('id,type,channel,summary,raw,occurred_at,created_at')
            .eq('company_id', companyId)
            .eq('lead_id', leadId)
            .order('occurred_at', { ascending: false })
            .limit(200),
          supabase
            .from('conversion_events')
            .select('id,provider,event_key,status,attempts,last_error,event_time,created_at,updated_at')
            .eq('company_id', companyId)
            .eq('lead_id', leadId)
            .order('created_at', { ascending: false })
            .limit(200),
        ]);
        if (eventsError) throw eventsError;
        if (convsError) throw convsError;
        setLeadEvents(events ?? []);
        setConversionEvents(convs ?? []);
      } catch (e: any) {
        console.error(e);
        setDetailError(e?.message ?? 'Erro ao carregar histórico do contato.');
        setLeadEvents([]);
        setConversionEvents([]);
      } finally {
        setDetailLoading(false);
      }
    },
    [companyId, readOnlyMode]
  );

  useEffect(() => {
    if (!selectedLeadId) return;
    void fetchLeadTimeline(selectedLeadId);
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
      <div className="cr8-card h-[calc(100vh-8rem)] flex items-center justify-center">
        <div className="max-w-md text-center px-6">
          <h2 className="text-xl font-bold text-[hsl(var(--foreground))]">Contatos & Leads</h2>
          <p className="text-[hsl(var(--muted-foreground))] mt-2 text-sm">Configure o Supabase para habilitar este módulo.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[hsl(var(--foreground))]">Contatos & Leads</h1>
            <p className="text-[hsl(var(--muted-foreground))] mt-1 text-sm">Lista completa de leads da empresa selecionada.</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void fetchLeads()}
              className="px-3 py-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] flex items-center gap-2"
              title="Atualizar"
            >
              <RefreshCw className="w-4 h-4" />
              Atualizar
            </button>
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-3 py-2 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 flex items-center gap-2"
              title="Novo lead"
            >
              <Plus className="w-4 h-4" />
              Novo lead
            </button>
          </div>
        </div>

        <div className="cr8-card p-4">
          <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-3 text-[hsl(var(--muted-foreground))]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, e-mail, telefone ou fonte..."
                className="w-full pl-10 pr-3 py-2 rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm text-[hsl(var(--muted-foreground))]">Status:</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              >
                <option value="all">Todos</option>
                <option value="new">Novo</option>
                <option value="contacted">Em contato</option>
                <option value="proposal">Proposta</option>
                <option value="won">Ganho</option>
                <option value="lost">Perdido</option>
              </select>
            </div>
          </div>

          {error && <div className="mt-4 text-sm text-[hsl(var(--destructive))]">{error}</div>}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[hsl(var(--muted-foreground))] border-b border-[hsl(var(--border))]">
                  <th className="py-3 pr-4 font-medium">Contato</th>
                  <th className="py-3 pr-4 font-medium">Status</th>
                  <th className="py-3 pr-4 font-medium">Fonte</th>
                  <th className="py-3 pr-4 font-medium">Última interação</th>
                  <th className="py-3 pr-4 font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-[hsl(var(--muted-foreground))]">
                      Carregando…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-[hsl(var(--muted-foreground))]">
                      Nenhum lead encontrado.
                    </td>
                  </tr>
                ) : (
                  filtered.map((lead) => (
                    <tr
                      key={lead.id}
                      className="border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary)/0.4)] cursor-pointer"
                      onClick={() => setSelectedLeadId(lead.id)}
                    >
                      <td className="py-4 pr-4">
                        <div className="font-semibold text-[hsl(var(--foreground))]">{lead.name}</div>
                        <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                          {lead.email ? lead.email : '—'} {lead.phone ? `• ${lead.phone}` : ''}
                        </div>
                        {(lead.utm_source || lead.utm_medium || lead.utm_campaign) && (
                          <div className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">
                            UTM: {lead.utm_source ?? '—'}
                            {lead.utm_medium ? ` / ${lead.utm_medium}` : ''}
                            {lead.utm_campaign ? ` / ${lead.utm_campaign}` : ''}
                          </div>
                        )}
                      </td>
                      <td className="py-4 pr-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs ${statusBadge[lead.status]}`}>
                          {statusLabel[lead.status]}
                        </span>
                      </td>
                      <td className="py-4 pr-4 text-[hsl(var(--foreground))]">{lead.source}</td>
                      <td className="py-4 pr-4 text-[hsl(var(--foreground))]">{lead.lastInteraction}</td>
                      <td className="py-4 pr-4 text-[hsl(var(--foreground))]">
                        {lead.value != null ? `R$ ${lead.value.toLocaleString('pt-BR')}` : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedLeadId &&
        createPortal(
          <div className="fixed inset-0 z-[110] bg-black/70 flex justify-end" onMouseDown={closeDetails}>
            <div
              className="w-full max-w-xl h-full bg-[hsl(var(--background))] border-l border-[hsl(var(--border))] overflow-y-auto"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="p-5 border-b border-[hsl(var(--border))] flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-[hsl(var(--foreground))]">{selectedLead?.name ?? 'Contato'}</div>
                  <div className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                    {selectedLead?.email ? selectedLead.email : '—'} {selectedLead?.phone ? `• ${selectedLead.phone}` : ''}
                  </div>
                </div>
                <button
                  onClick={closeDetails}
                  className="px-3 py-2 rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]"
                >
                  Fechar
                </button>
              </div>

              <div className="p-5 space-y-6">
                {detailError && <div className="text-sm text-[hsl(var(--destructive))]">{detailError}</div>}

                <section className="cr8-card p-4">
                  <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Atribuição</div>
                  <div className="mt-3 grid grid-cols-1 gap-2 text-sm">
                    <div className="flex justify-between gap-4">
                      <span className="text-[hsl(var(--muted-foreground))]">Primeiro toque</span>
                      <span className="text-[hsl(var(--foreground))]">
                        {selectedLead?.first_touch_channel ?? '—'} • {formatRelativeTime(selectedLead?.first_touch_at)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-[hsl(var(--muted-foreground))]">Último toque</span>
                      <span className="text-[hsl(var(--foreground))]">
                        {selectedLead?.last_touch_channel ?? '—'} • {formatRelativeTime(selectedLead?.last_touch_at)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-[hsl(var(--muted-foreground))]">UTM</span>
                      <span className="text-[hsl(var(--foreground))]">
                        {selectedLead?.utm_source ?? '—'}
                        {selectedLead?.utm_medium ? ` / ${selectedLead.utm_medium}` : ''}
                        {selectedLead?.utm_campaign ? ` / ${selectedLead.utm_campaign}` : ''}
                      </span>
                    </div>
                    {selectedLead?.landing_page_url && (
                      <div className="flex justify-between gap-4">
                        <span className="text-[hsl(var(--muted-foreground))]">Landing</span>
                        <span className="text-[hsl(var(--foreground))] break-all">{selectedLead.landing_page_url}</span>
                      </div>
                    )}
                    {selectedLead?.referrer_url && (
                      <div className="flex justify-between gap-4">
                        <span className="text-[hsl(var(--muted-foreground))]">Referrer</span>
                        <span className="text-[hsl(var(--foreground))] break-all">{selectedLead.referrer_url}</span>
                      </div>
                    )}
                    {(selectedLead?.gclid || selectedLead?.gbraid || selectedLead?.wbraid) && (
                      <div className="flex justify-between gap-4">
                        <span className="text-[hsl(var(--muted-foreground))]">Click ID</span>
                        <span className="text-[hsl(var(--foreground))] font-mono text-xs break-all">
                          {selectedLead.gclid ?? selectedLead.gbraid ?? selectedLead.wbraid}
                        </span>
                      </div>
                    )}
                    {(selectedLead?.fbclid || selectedLead?.fbc || selectedLead?.fbp) && (
                      <div className="flex justify-between gap-4">
                        <span className="text-[hsl(var(--muted-foreground))]">Meta IDs</span>
                        <span className="text-[hsl(var(--foreground))] font-mono text-xs break-all">
                          {selectedLead.fbclid ?? selectedLead.fbc ?? selectedLead.fbp}
                        </span>
                      </div>
                    )}
                  </div>
                </section>

                <section className="cr8-card p-4">
                  <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Lead Score</div>
                  <div className="mt-3 grid grid-cols-1 gap-2 text-sm">
                    <div className="flex justify-between gap-4">
                      <span className="text-[hsl(var(--muted-foreground))]">Total</span>
                      <span className="text-[hsl(var(--foreground))]">{selectedLead?.lead_score_total ?? '—'}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-[hsl(var(--muted-foreground))]">Último</span>
                      <span className="text-[hsl(var(--foreground))]">{selectedLead?.lead_score_last ?? '—'}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-[hsl(var(--muted-foreground))]">Atualizado</span>
                      <span className="text-[hsl(var(--foreground))]">{formatRelativeTime(selectedLead?.lead_score_updated_at)}</span>
                    </div>
                  </div>
                </section>

                <section className="cr8-card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Histórico</div>
                    <button
                      onClick={() => selectedLeadId && fetchLeadTimeline(selectedLeadId)}
                      className="px-3 py-2 rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] flex items-center gap-2 text-sm"
                      disabled={detailLoading}
                    >
                      <RefreshCw className="w-4 h-4" />
                      Atualizar
                    </button>
                  </div>

                  {detailLoading ? (
                    <div className="mt-4 text-sm text-[hsl(var(--muted-foreground))]">Carregando…</div>
                  ) : leadEvents.length === 0 ? (
                    <div className="mt-4 text-sm text-[hsl(var(--muted-foreground))]">Sem eventos ainda.</div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {leadEvents.map((ev) => (
                        <div key={ev.id} className="border border-[hsl(var(--border))] rounded-lg p-3 bg-[hsl(var(--card))]">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium text-[hsl(var(--foreground))]">{ev.summary ?? ev.type}</div>
                              <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                                {ev.channel} • {formatRelativeTime(ev.occurred_at ?? ev.created_at)}
                              </div>
                            </div>
                            <span className="text-[10px] px-2 py-1 rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border))]">
                              {ev.type}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="cr8-card p-4">
                  <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Conversões (Outbox)</div>
                  {conversionEvents.length === 0 ? (
                    <div className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">Nenhuma conversão enfileirada.</div>
                  ) : (
                    <div className="mt-3 space-y-2 text-sm">
                      {conversionEvents.map((c) => (
                        <div
                          key={c.id}
                          className="flex items-start justify-between gap-3 border border-[hsl(var(--border))] rounded-lg p-3 bg-[hsl(var(--card))]"
                        >
                          <div>
                            <div className="text-[hsl(var(--foreground))] font-medium">
                              {c.provider}:{c.event_key}
                            </div>
                            <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                              {formatRelativeTime(c.created_at)} • tentativas: {c.attempts ?? 0}
                            </div>
                            {c.last_error && (
                              <div className="mt-1 text-xs text-[hsl(var(--destructive))] break-words">{c.last_error}</div>
                            )}
                          </div>
                          <span className="text-[10px] px-2 py-1 rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border))]">
                            {c.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>
          </div>,
          document.body
        )}

      <NewLeadModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={(newLead) => {
          setLeads((prev) => [newLead, ...prev]);
        }}
        companyId={companyId}
      />
    </>
  );
};
