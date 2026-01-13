import React, { useEffect, useMemo, useState } from 'react';
import { MoreHorizontal, Phone, MessageCircle, RefreshCw, GripVertical } from 'lucide-react';
import { Lead } from '../types';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
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
import { SortableContext, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { createPortal } from 'react-dom';

// --- Tipos e Dados Mockados ---

type LeadStatus = Lead['status'];
const ALL_STATUSES: LeadStatus[] = ['new', 'contacted', 'proposal', 'won', 'lost'];

interface CRMProps {
  companyId?: string;
}

const mockLeads: Lead[] = [
  { id: '1', name: 'Juliana Silva', phone: '11999999999', email: 'juliana@email.com', status: 'new', source: 'Instagram', lastInteraction: '10 min atras', value: 1500 },
  { id: '2', name: 'Marcos Oliveira', phone: '11988888888', email: 'marcos@email.com', status: 'contacted', source: 'WhatsApp', lastInteraction: '2 horas atras', value: 2990 },
  { id: '3', name: 'Empresa XYZ', phone: '11977777777', email: 'contato@xyz.com', status: 'proposal', source: 'Manual', lastInteraction: '1 dia atras', value: 5000 },
  { id: '4', name: 'Roberto Santos', phone: '11966666666', email: 'roberto@email.com', status: 'won', source: 'WhatsApp', lastInteraction: '3 dias atras', value: 1500 },
  { id: '5', name: 'Carla Dias', phone: '11955555555', email: 'carla@email.com', status: 'lost', source: 'Facebook', lastInteraction: '5 dias atras', value: 800 },
];

const formatRelativeTime = (dateIso?: string | null) => {
  if (!dateIso) return 'Recentemente';
  const date = new Date(dateIso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMin < 1) return 'Agora';
  if (diffMin < 60) return `${diffMin} min atras`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} horas atras`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} dias atras`;
};

// --- Componentes do Kanban ---

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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 touch-none group"
    >
      <div className="flex justify-between items-start mb-2">
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold tracking-wider ${
            lead.source === 'WhatsApp'
              ? 'bg-green-100 text-green-700'
              : lead.source === 'Instagram'
              ? 'bg-pink-100 text-pink-700'
              : 'bg-gray-100 text-gray-600'
          }`}
        >
          {lead.source}
        </span>
        <div className="flex items-center">
          <button
            {...attributes}
            {...listeners}
            className="text-gray-400 hover:text-gray-600 cursor-grab p-1"
            title="Mover lead"
          >
            <GripVertical className="w-4 h-4" />
          </button>
          <button className="text-gray-400 hover:text-gray-600 p-1 opacity-0 group-hover:opacity-100">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      <h4 className="font-medium text-gray-900 mb-1">{lead.name}</h4>
      <p className="text-sm text-gray-500 mb-1 truncate">{lead.email}</p>
      <p className="text-xs text-gray-400">{lead.lastInteraction}</p>

      <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-50">
        <div className="font-semibold text-gray-700 text-sm">
          {lead.value != null ? `R$ ${lead.value.toLocaleString()}` : '-'}
        </div>
        <div className="flex space-x-1">
          <button className="p-1.5 text-gray-400 hover:text-green-500 hover:bg-green-50 rounded-md">
            <MessageCircle className="w-4 h-4" />
          </button>
          <button className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-md">
            <Phone className="w-4 h-4" />
          </button>
        </div>
      </div>
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
    <div ref={setNodeRef} className="flex-1 bg-gray-50 rounded-xl p-4 flex flex-col border border-gray-200 min-w-[280px]">
      <div className={`flex justify-between items-center mb-4 pb-2 border-b-2 ${color}`}>
        <h3 className="font-semibold text-gray-700">{title}</h3>
        <span className="bg-gray-200 text-gray-600 text-xs px-2 py-1 rounded-full">{leads.length}</span>
      </div>
      <div className="space-y-3 overflow-y-auto scrollbar-hide flex-1">
        <SortableContext items={leadIds} strategy={rectSortingStrategy}>
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
};

// --- Componente Principal ---

export const CRM: React.FC<CRMProps> = ({ companyId }) => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);

  const demoMode = !isSupabaseConfigured();

  const leadsByStatus = useMemo(() => {
    const grouped: Record<LeadStatus, Lead[]> = { new: [], contacted: [], proposal: [], won: [], lost: [] };
    for (const lead of leads) {
      if (grouped[lead.status]) {
        grouped[lead.status].push(lead);
      }
    }
    return grouped;
  }, [leads]);

  const fetchLeads = async () => {
    setErrorMsg(null);
    if (demoMode) {
      setLeads(mockLeads);
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
      }));
      setLeads(mapped);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || 'Erro ao carregar leads.');
      setLeads([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const updateLeadStatus = async (leadId: string, newStatus: LeadStatus) => {
    if (demoMode) return;
    try {
      const { error } = await supabase.from('leads').update({ status: newStatus }).eq('id', leadId);
      if (error) throw error;
    } catch (err: any) {
      console.error('Falha ao atualizar o status do lead:', err);
      setErrorMsg('Falha ao salvar a alteração. A página será atualizada.');
      // Reverter a mudança otimista recarregando os dados
      setTimeout(() => fetchLeads(), 1000);
    }
  };

  const columns: Array<{ id: LeadStatus; title: string; color: string }> = [
    { id: 'new', title: 'Novos Leads', color: 'border-blue-400' },
    { id: 'contacted', title: 'Em Contato', color: 'border-yellow-400' },
    { id: 'proposal', title: 'Proposta Enviada', color: 'border-purple-400' },
    { id: 'won', title: 'Fechado/Ganho', color: 'border-green-400' },
    { id: 'lost', title: 'Perdido', color: 'border-red-400' },
  ];

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 10 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    if (active.data.current?.type === 'Lead') {
      setActiveLead(active.data.current.lead);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveLead(null);
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const activeIsLead = active.data.current?.type === 'Lead';
    if (!activeIsLead) return;

    const leadId = active.id as string;
    const oldStatus = active.data.current?.lead.status as LeadStatus;
    const newStatus = over.data.current?.type === 'Column' ? (over.id as LeadStatus) : (over.data.current?.lead.status as LeadStatus);

    if (oldStatus !== newStatus) {
      // Atualização otimista da UI
      setLeads((prevLeads) => {
        const leadIndex = prevLeads.findIndex((l) => l.id === leadId);
        if (leadIndex === -1) return prevLeads;

        const updatedLeads = [...prevLeads];
        updatedLeads[leadIndex] = { ...updatedLeads[leadIndex], status: newStatus };
        return updatedLeads;
      });

      // Persistir a mudança no banco de dados
      void updateLeadStatus(leadId, newStatus);
    }
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="h-full flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-[hsl(var(--foreground))]">Pipeline de Vendas</h2>
            {errorMsg && <p className="text-sm text-red-600 mt-1">{errorMsg}</p>}
            {!demoMode && leads.length === 0 && !loading && (
              <p className="text-sm text-gray-500 mt-1">Sem leads ainda. Envie via webhook para popular.</p>
            )}
            {demoMode && <p className="text-sm text-yellow-600 mt-1">Modo demonstração. Os dados não serão salvos.</p>}
          </div>

          <div className="flex space-x-2">
            <button onClick={fetchLeads} className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600" title="Atualizar">
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
              + Novo Lead
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-x-auto">
          <div className="flex space-x-4 min-w-[1000px] h-full pb-4">
            <SortableContext items={columns.map(c => c.id)} strategy={rectSortingStrategy}>
              {columns.map((col) => (
                <KanbanColumn key={col.id} id={col.id} title={col.title} color={col.color} leads={leadsByStatus[col.id] ?? []} />
              ))}
            </SortableContext>
          </div>
        </div>
      </div>
      {typeof document !== 'undefined' &&
        createPortal(
          <DragOverlay>
            {activeLead ? <LeadCard lead={activeLead} /> : null}
          </DragOverlay>,
          document.body
        )}
    </DndContext>
  );
};