import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Search } from 'lucide-react';
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
        lastInteraction: formatRelativeTime(d.last_interaction_at ?? d.created_at),
        value: d.value ?? undefined,
        assigned_to: d.assigned_to ?? undefined,
        raw: d.raw ?? undefined,
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
                    <tr key={lead.id} className="border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary)/0.4)]">
                      <td className="py-4 pr-4">
                        <div className="font-semibold text-[hsl(var(--foreground))]">{lead.name}</div>
                        <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                          {lead.email ? lead.email : '—'} {lead.phone ? `• ${lead.phone}` : ''}
                        </div>
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

