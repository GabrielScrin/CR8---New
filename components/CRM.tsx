import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GripVertical,
  MessageCircle,
  MoreHorizontal,
  Phone,
  RefreshCw,
  Settings2,
  X,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  RotateCcw,
  Plus,
} from 'lucide-react';
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

// ── Pipeline config types ────────────────────────────────────────────────────

type ColumnColor = 'blue' | 'yellow' | 'purple' | 'green' | 'red' | 'cyan' | 'orange' | 'pink';

type PipelineColumn = {
  id: LeadStatus;
  title: string;
  color: ColumnColor;
  visible: boolean;
};

const COLOR_MAP: Record<ColumnColor, { dot: string; border: string; badge: string }> = {
  blue:   { dot: 'bg-blue-400',   border: 'border-blue-400/60',   badge: 'bg-blue-500/15 text-blue-300' },
  yellow: { dot: 'bg-yellow-400', border: 'border-yellow-400/60', badge: 'bg-yellow-500/15 text-yellow-300' },
  purple: { dot: 'bg-purple-400', border: 'border-purple-400/60', badge: 'bg-purple-500/15 text-purple-300' },
  green:  { dot: 'bg-emerald-400',border: 'border-emerald-400/60',badge: 'bg-emerald-500/15 text-emerald-300' },
  red:    { dot: 'bg-red-400',    border: 'border-red-400/60',    badge: 'bg-red-500/15 text-red-300' },
  cyan:   { dot: 'bg-cyan-400',   border: 'border-cyan-400/60',   badge: 'bg-cyan-500/15 text-cyan-300' },
  orange: { dot: 'bg-orange-400', border: 'border-orange-400/60', badge: 'bg-orange-500/15 text-orange-300' },
  pink:   { dot: 'bg-pink-400',   border: 'border-pink-400/60',   badge: 'bg-pink-500/15 text-pink-300' },
};

const DEFAULT_COLUMNS: PipelineColumn[] = [
  { id: 'new',       title: 'Novos Leads',       color: 'blue',   visible: true },
  { id: 'contacted', title: 'Em Contato',         color: 'yellow', visible: true },
  { id: 'proposal',  title: 'Proposta Enviada',   color: 'purple', visible: true },
  { id: 'won',       title: 'Fechado / Ganho',    color: 'green',  visible: true },
  { id: 'lost',      title: 'Perdido',            color: 'red',    visible: true },
];

const PIPELINE_STORAGE_KEY = (companyId?: string) => `cr8_pipeline_${companyId ?? 'default'}`;

const loadPipelineColumns = (companyId?: string): PipelineColumn[] => {
  try {
    const raw = localStorage.getItem(PIPELINE_STORAGE_KEY(companyId));
    if (!raw) return DEFAULT_COLUMNS;
    const parsed: PipelineColumn[] = JSON.parse(raw);
    // merge: keep DB-valid ids, fill missing from defaults
    const all = DEFAULT_COLUMNS.map((def) => {
      const saved = parsed.find((p) => p.id === def.id);
      return saved ? { ...def, ...saved } : def;
    });
    // respect saved order
    const order = parsed.map((p) => p.id);
    return [...all].sort((a, b) => {
      const ai = order.indexOf(a.id);
      const bi = order.indexOf(b.id);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  } catch {
    return DEFAULT_COLUMNS;
  }
};

const savePipelineColumns = (cols: PipelineColumn[], companyId?: string) => {
  try {
    localStorage.setItem(PIPELINE_STORAGE_KEY(companyId), JSON.stringify(cols));
  } catch {}
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const formatRelativeTime = (dateIso?: string | null) => {
  if (!dateIso) return 'Recentemente';
  const diffMs = Date.now() - new Date(dateIso).getTime();
  const diffMin = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMin < 1) return 'Agora';
  if (diffMin < 60) return `${diffMin}m atrás`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h atrás`;
  return `${Math.floor(diffH / 24)}d atrás`;
};

const sourceStyle = (source: string | null | undefined): string => {
  const s = (source ?? '').toLowerCase();
  if (s.includes('whats')) return 'bg-emerald-500/15 text-emerald-400';
  if (s.includes('insta')) return 'bg-pink-500/15 text-pink-400';
  if (s.includes('facebook') || s.includes('meta')) return 'bg-blue-500/15 text-blue-400';
  if (s.includes('google')) return 'bg-yellow-500/15 text-yellow-300';
  if (s.includes('form') || s.includes('landing')) return 'bg-violet-500/15 text-violet-400';
  return 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]';
};

// ── Lead Card ────────────────────────────────────────────────────────────────

const LeadCard: React.FC<{ lead: Lead }> = ({ lead }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
    data: { type: 'Lead', lead },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:border-[hsl(var(--primary))]/40 transition-all duration-200 overflow-hidden touch-none"
    >
      {/* top micro-line accent on hover */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--accent))] opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wide uppercase ${sourceStyle(lead.source)}`}>
            {lead.source ?? 'Manual'}
          </span>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              {...attributes}
              {...listeners}
              className="p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] cursor-grab active:cursor-grabbing transition-colors"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </button>
            <button className="p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] opacity-0 group-hover:opacity-100 transition-all">
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <h4 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-0.5 leading-snug">{lead.name}</h4>
        {lead.email && (
          <p className="text-[11px] text-[hsl(var(--muted-foreground))] truncate">{lead.email}</p>
        )}

        <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-[hsl(var(--border))]">
          <span className="text-sm font-bold text-[hsl(var(--foreground))]">
            {lead.value != null ? `R$ ${lead.value.toLocaleString('pt-BR')}` : <span className="text-[hsl(var(--muted-foreground))] font-normal text-xs">sem valor</span>}
          </span>
          <div className="flex items-center gap-0.5">
            <button className="p-1.5 text-[hsl(var(--muted-foreground))] hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors">
              <MessageCircle className="w-3.5 h-3.5" />
            </button>
            <button className="p-1.5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/10 rounded-lg transition-colors">
              <Phone className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1.5">{lead.lastInteraction}</p>
      </div>
    </div>
  );
};

// ── Kanban Column ────────────────────────────────────────────────────────────

interface ColumnProps {
  id: UniqueIdentifier;
  column: PipelineColumn;
  leads: Lead[];
}

const KanbanColumn: React.FC<ColumnProps> = ({ id, column, leads }) => {
  const { setNodeRef } = useSortable({ id, data: { type: 'Column' } });
  const leadIds = useMemo(() => leads.map((l) => l.id), [leads]);
  const colorCls = COLOR_MAP[column.color];

  return (
    <div
      ref={setNodeRef}
      className="flex-1 flex flex-col min-w-[260px] max-w-[320px] rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/60 overflow-hidden"
    >
      {/* Column header */}
      <div className={`px-3.5 py-3 border-b border-[hsl(var(--border))] flex items-center justify-between gap-2`}>
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full shrink-0 ${colorCls.dot}`} />
          <h3 className="text-sm font-semibold text-[hsl(var(--foreground))] leading-none">{column.title}</h3>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${colorCls.badge}`}>
          {leads.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2 cr8-scroll">
        <SortableContext items={leadIds} strategy={rectSortingStrategy}>
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </SortableContext>
        {leads.length === 0 && (
          <div className="flex items-center justify-center h-20 text-[11px] text-[hsl(var(--muted-foreground))] border-2 border-dashed border-[hsl(var(--border))] rounded-xl">
            Arraste leads aqui
          </div>
        )}
      </div>
    </div>
  );
};

// ── Pipeline Editor Modal ────────────────────────────────────────────────────

const ALL_COLORS: ColumnColor[] = ['blue', 'yellow', 'purple', 'green', 'red', 'cyan', 'orange', 'pink'];

interface PipelineEditorProps {
  columns: PipelineColumn[];
  onSave: (cols: PipelineColumn[]) => void;
  onClose: () => void;
}

const PipelineEditor: React.FC<PipelineEditorProps> = ({ columns, onSave, onClose }) => {
  const [draft, setDraft] = useState<PipelineColumn[]>(columns);

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...draft];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setDraft(next);
  };

  const update = (idx: number, patch: Partial<PipelineColumn>) => {
    setDraft((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };

  const reset = () => setDraft(DEFAULT_COLUMNS);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-lg cr8-card overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[hsl(var(--border))]">
          <div>
            <h2 className="text-base font-bold text-[hsl(var(--foreground))]">Editar Pipeline</h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">Renomeie, reordene ou oculte etapas</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Columns list */}
        <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto cr8-scroll">
          {draft.map((col, idx) => {
            const colorCls = COLOR_MAP[col.color];
            return (
              <div
                key={col.id}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                  col.visible ? 'bg-[hsl(var(--secondary))] border-[hsl(var(--border))]' : 'bg-transparent border-dashed border-[hsl(var(--border))]/50 opacity-50'
                }`}
              >
                {/* Reorder */}
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    className="p-0.5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] disabled:opacity-20 transition-colors"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => move(idx, 1)}
                    disabled={idx === draft.length - 1}
                    className="p-0.5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] disabled:opacity-20 transition-colors"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Color dot picker */}
                <div className="relative group/color">
                  <div className={`h-5 w-5 rounded-full cursor-pointer border-2 border-white/20 ${colorCls.dot}`} title="Mudar cor" />
                  <div className="absolute left-0 top-7 z-10 hidden group-hover/color:flex flex-wrap gap-1 p-2 rounded-xl bg-[hsl(var(--popover))] border border-[hsl(var(--border))] shadow-xl w-28">
                    {ALL_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => update(idx, { color: c })}
                        className={`h-5 w-5 rounded-full ${COLOR_MAP[c].dot} ${col.color === c ? 'ring-2 ring-white/60' : ''} transition-all`}
                      />
                    ))}
                  </div>
                </div>

                {/* Name input */}
                <input
                  value={col.title}
                  onChange={(e) => update(idx, { title: e.target.value })}
                  className="flex-1 bg-transparent text-sm font-medium text-[hsl(var(--foreground))] outline-none border-b border-transparent focus:border-[hsl(var(--primary))]/60 transition-colors placeholder:text-[hsl(var(--muted-foreground))]"
                />

                {/* Status ID badge */}
                <span className="text-[10px] font-mono text-[hsl(var(--muted-foreground))] shrink-0">{col.id}</span>

                {/* Visibility toggle */}
                <button
                  onClick={() => update(idx, { visible: !col.visible })}
                  className={`p-1.5 rounded-lg transition-colors ${
                    col.visible
                      ? 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                      : 'text-[hsl(var(--muted-foreground))]/40 hover:text-[hsl(var(--foreground))]'
                  }`}
                  title={col.visible ? 'Ocultar coluna' : 'Mostrar coluna'}
                >
                  {col.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-[hsl(var(--border))] bg-[hsl(var(--background))]/40">
          <button
            onClick={reset}
            className="flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Restaurar padrão
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg border border-[hsl(var(--border))] text-xs text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => onSave(draft)}
              className="px-3.5 py-1.5 rounded-lg bg-[hsl(var(--primary))] text-white text-xs font-semibold hover:opacity-90 transition-opacity"
            >
              Salvar pipeline
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// ── CRM Main ─────────────────────────────────────────────────────────────────

export const CRM: React.FC<CRMProps> = ({ companyId }) => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPipelineEditorOpen, setIsPipelineEditorOpen] = useState(false);
  const [columns, setColumns] = useState<PipelineColumn[]>(() => loadPipelineColumns(companyId));

  const readOnlyMode = !isSupabaseConfigured();

  // reload columns when company changes
  useEffect(() => {
    setColumns(loadPipelineColumns(companyId));
  }, [companyId]);

  const visibleColumns = useMemo(() => columns.filter((c) => c.visible), [columns]);

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
      setErrorMsg('Falha ao salvar a alteração.');
      setTimeout(() => fetchLeads(), 1000);
    }
  };

  const handleAddNewLead = (newLead: Lead) => {
    setLeads((prev) => [newLead, ...prev]);
  };

  const handleSavePipeline = (cols: PipelineColumn[]) => {
    setColumns(cols);
    savePipelineColumns(cols, companyId);
    setIsPipelineEditorOpen(false);
  };

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 10 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = (event: DragStartEvent) => {
    if (event.active.data.current?.type === 'Lead') setActiveLead(event.active.data.current.lead);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveLead(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    if (active.data.current?.type !== 'Lead') return;

    const leadId = active.id as string;
    const oldStatus = active.data.current?.lead.status as LeadStatus;
    const newStatus: LeadStatus =
      over.data.current?.type === 'Column'
        ? (over.id as LeadStatus)
        : (over.data.current?.lead.status as LeadStatus);

    if (oldStatus === newStatus) return;

    setLeads((prev) => {
      const idx = prev.findIndex((l) => l.id === leadId);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], status: newStatus, lastInteraction: 'Agora' };
      return next;
    });

    void updateLeadStatus(leadId, newStatus);
  };

  const totalLeads = leads.length;

  return (
    <>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="h-full flex flex-col gap-4">
          {/* ── Header ── */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-center justify-between gap-4 shrink-0"
          >
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-extrabold tracking-tight text-[hsl(var(--foreground))]">CRM</h2>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]">
                  {totalLeads} lead{totalLeads !== 1 ? 's' : ''}
                </span>
                {loading && (
                  <RefreshCw className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))] animate-spin" />
                )}
              </div>
              {errorMsg && <p className="text-xs text-red-400 mt-1">{errorMsg}</p>}
              {readOnlyMode && (
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                  Configure Supabase para carregar leads reais.
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsPipelineEditorOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:border-[hsl(var(--primary))]/40 transition-all"
              >
                <Settings2 className="h-3.5 w-3.5" /> Editar Pipeline
              </button>
              <button
                onClick={() => void fetchLeads()}
                className="p-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                title="Atualizar"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
              <button
                onClick={() => setIsModalOpen(true)}
                disabled={readOnlyMode}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[hsl(var(--primary))] text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-[hsl(var(--primary))]/20"
              >
                <Plus className="h-4 w-4" /> Novo Lead
              </button>
            </div>
          </motion.div>

          {/* ── Kanban Board ── */}
          <div className="flex-1 overflow-x-auto">
            <div className="flex gap-3 h-full pb-2" style={{ minWidth: `${visibleColumns.length * 276}px` }}>
              <SortableContext items={visibleColumns.map((c) => c.id)} strategy={rectSortingStrategy}>
                {visibleColumns.map((col) => (
                  <KanbanColumn
                    key={col.id}
                    id={col.id}
                    column={col}
                    leads={leadsByStatus[col.id] ?? []}
                  />
                ))}
              </SortableContext>
            </div>
          </div>
        </div>

        {typeof document !== 'undefined' &&
          createPortal(
            <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
              {activeLead ? <LeadCard lead={activeLead} /> : null}
            </DragOverlay>,
            document.body
          )}
      </DndContext>

      {/* Modals */}
      <NewLeadModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleAddNewLead}
        companyId={companyId}
      />

      <AnimatePresence>
        {isPipelineEditorOpen && (
          <PipelineEditor
            columns={columns}
            onSave={handleSavePipeline}
            onClose={() => setIsPipelineEditorOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
};
