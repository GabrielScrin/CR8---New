import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { GripVertical, MessageCircle, MoreHorizontal, Phone, RefreshCw } from 'lucide-react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  UniqueIdentifier,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { Lead } from '../types';
import { NewLeadModal } from './NewLeadModal';

type LeadStatus = Lead['status'];

interface CRMProps {
  companyId?: string;
}

const formatRelativeTime = (dateIso?: string | null) => {
  if (!dateIso) return 'Recentemente';
  const date = new Date(dateIso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMin < 1) return 'Agora';
  if (diffMin < 60) return `${diffMin} min atrás`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} horas atrás`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} dias atrás`;
};

const LeadCard: React.FC<{ lead: Lead }> = ({ lead }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
    data: { type: 'Lead', lead },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const sourceStyle = useMemo(() => {
    switch (lead.source) {
      case 'WhatsApp':
        return 'bg-[hsl(var(--accent)/0.1)] text-[hsl(var(--accent))]';
      case 'Instagram':
        return 'bg-pink-500/10 text-pink-400';
      default:
        return 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]';
    }
  }, [lead.source]);

  return (
    <div ref={setNodeRef} style={style} className="cr8-card p-3 touch-none group relative">
      <div className="flex justify-between items-start mb-2">
        <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold tracking-wider ${sourceStyle}`}>
          {lead.source}
        </span>
        <div className="flex items-center">
          <button
            {...attributes}
            {...listeners}
            className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] cursor-grab p-1"
            title="Mover lead"
          >
            <GripVertical className="w-4 h-4" />
          </button>
          <button className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] p-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      <h4 className="font-semibold text-[hsl(var(--card-foreground))] mb-1">{lead.name}</h4>
      <p className="text-sm text-[hsl(var(--muted-foreground))] mb-2 truncate" title={lead.email}>
        {lead.email}
      </p>

      <div className="flex justify-between items-center mt-3 pt-3 border-t border-[hsl(var(--border))]">
        <div className="font-bold text-[hsl(var(--card-foreground))] text-sm">
          {lead.value != null ? `R$ ${lead.value.toLocaleString()}` : '-'}
        </div>
        <div className="flex space-x-0.5">
          <button className="p-1.5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--accent))] hover:bg-[hsl(var(--accent)/0.1)] rounded-md transition-colors">
            <MessageCircle className="w-4 h-4" />
          </button>
          <button className="p-1.5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/0.1)] rounded-md transition-colors">
            <Phone className="w-4 h-4" />
          </button>
        </div>
      </div>
      <p className="text-xs text-[hsl(var(--muted-foreground))] absolute top-3 right-12 opacity-0 group-hover:opacity-100 transition-opacity">
        {lead.lastInteraction}
      </p>
    </div>
  );
};

interface ColumnProps {
  id: UniqueIdentifier;
  title: string;
  color: string;
  leads: Lead[];
}

const KanbanColumn: React.FC<ColumnProps> = ({ id, title, color, leads }) => {
  const { setNodeRef } = useSortable({ id, data: { type: 'Column' } });
  const leadIds = useMemo(() => leads.map((l) => l.id), [leads]);

  return (
    <div
      ref={setNodeRef}
      className="flex-1 bg-[hsl(var(--secondary))] rounded-xl p-3 flex flex-col border border-[hsl(var(--border))] min-w-[280px]"
    >
      <div className={`flex justify-between items-center mb-4 pb-2 border-b-2 ${color}`}>
        <h3 className="font-semibold text-[hsl(var(--foreground))]">{title}</h3>
        <span className="bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] text-xs px-2 py-1 rounded-full font-medium">
          {leads.length}
        </span>
      </div>
      <div className="space-y-3 overflow-y-auto flex-1 pr-1">
        <SortableContext items={leadIds} strategy={rectSortingStrategy}>
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
};

export const CRM: React.FC<CRMProps> = ({ companyId }) => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const readOnlyMode = !isSupabaseConfigured();

  const leadsByStatus = useMemo(() => {
    const grouped: Record<LeadStatus, Lead[]> = { new: [], contacted: [], proposal: [], won: [], lost: [] };
    for (const lead of leads) grouped[lead.status]?.push(lead);
    return grouped;
  }, [leads]);

  const fetchLeads = useCallback(async () => {
    setErrorMsg(null);
    if (readOnlyMode) {
      setLeads([]);
      return;
    }

    setLoading(true);
    try {
      let query = supabase.from('leads').select('*').order('created_at', { ascending: false }).limit(200);
      if (companyId) query = query.eq('company_id', companyId);
      const { data, error } = await query;
      if (error) throw error;

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
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || 'Erro ao carregar leads.');
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, [companyId, readOnlyMode]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const updateLeadStatus = async (leadId: string, newStatus: LeadStatus) => {
    if (readOnlyMode) return;
    try {
      const { error } = await supabase
        .from('leads')
        .update({ status: newStatus, last_interaction_at: new Date().toISOString() })
        .eq('id', leadId);
      if (error) throw error;
    } catch (err: any) {
      console.error('Falha ao atualizar o status do lead:', err);
      setErrorMsg('Falha ao salvar a alteração. A página será atualizada.');
      setTimeout(() => fetchLeads(), 1000);
    }
  };

  const handleAddNewLead = (newLead: Lead) => {
    setLeads((prevLeads) => [newLead, ...prevLeads]);
  };

  const columns: Array<{ id: LeadStatus; title: string; color: string }> = [
    { id: 'new', title: 'Novos Leads', color: 'border-[hsl(var(--primary))]' },
    { id: 'contacted', title: 'Em Contato', color: 'border-yellow-400' },
    { id: 'proposal', title: 'Proposta Enviada', color: 'border-purple-400' },
    { id: 'won', title: 'Fechado/Ganho', color: 'border-[hsl(var(--accent))]' },
    { id: 'lost', title: 'Perdido', color: 'border-[hsl(var(--destructive))]' },
  ];

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 10 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    if (active.data.current?.type === 'Lead') setActiveLead(active.data.current.lead);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveLead(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeIsLead = active.data.current?.type === 'Lead';
    if (!activeIsLead) return;

    const leadId = active.id as string;
    const oldStatus = active.data.current?.lead.status as LeadStatus;
    const newStatus =
      over.data.current?.type === 'Column' ? (over.id as LeadStatus) : (over.data.current?.lead.status as LeadStatus);

    if (oldStatus === newStatus) return;

    setLeads((prevLeads) => {
      const leadIndex = prevLeads.findIndex((l) => l.id === leadId);
      if (leadIndex === -1) return prevLeads;
      const updatedLeads = [...prevLeads];
      updatedLeads[leadIndex] = { ...updatedLeads[leadIndex], status: newStatus, lastInteraction: 'Agora' };
      return updatedLeads;
    });

    void updateLeadStatus(leadId, newStatus);
  };

  return (
    <>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="h-full flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-bold text-[hsl(var(--foreground))]">Pipeline de Vendas</h2>
              {errorMsg && <p className="text-sm text-[hsl(var(--destructive))] mt-1">{errorMsg}</p>}
              {readOnlyMode ? (
                <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                  Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` para carregar leads reais.
                </p>
              ) : (
                leads.length === 0 &&
                !loading && (
                  <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                    Sem leads ainda. Use o botão “+ Novo Lead” ou envie via webhook.
                  </p>
                )
              )}
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => void fetchLeads()}
                className="p-2 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg hover:bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                title="Atualizar"
              >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setIsModalOpen(true)}
                className="bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] px-4 py-2 rounded-lg hover:opacity-90 transition-opacity shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={readOnlyMode}
              >
                + Novo Lead
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-x-auto">
            <div className="flex space-x-4 min-w-[1000px] h-full pb-4">
              <SortableContext items={columns.map((c) => c.id)} strategy={rectSortingStrategy}>
                {columns.map((col) => (
                  <KanbanColumn
                    key={col.id}
                    id={col.id}
                    title={col.title}
                    color={col.color}
                    leads={leadsByStatus[col.id] ?? []}
                  />
                ))}
              </SortableContext>
            </div>
          </div>
        </div>

        {typeof document !== 'undefined' &&
          createPortal(
            <DragOverlay>{activeLead ? <LeadCard lead={activeLead} /> : null}</DragOverlay>,
            document.body
          )}
      </DndContext>

      <NewLeadModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleAddNewLead}
        companyId={companyId}
      />
    </>
  );
};
