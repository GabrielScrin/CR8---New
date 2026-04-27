import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowLeft,
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  CalendarRange,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  FileText,
  Filter,
  Grid3X3,
  Instagram,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import {
  DashboardBootstrap,
  AdBreakdownRow,
  DashboardData,
  DashboardWeekly,
  MetaSummary,
  fetchDashboardCampaignAds,
  fetchDashboardBootstrap,
  fetchDashboardData,
  fetchDashboardWeekly,
} from '../lib/portalDashboard';
import { PublicTrafficReport } from './PublicTrafficReport';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { InstagramMediaTypeChart } from './features/instagram/components/InstagramMediaTypeChart';
import { InstagramPostsTable } from './features/instagram/components/InstagramPostsTable';

type Tab = 'campanhas' | 'instagram' | 'relatorio';
type CampaignPlatform = 'meta' | 'google';
type ViewMode = 'performance' | 'distribuicao';
type CampaignSortKey = 'spend' | 'leads' | 'msgs' | 'ctr' | 'cpc';
type AdSortKey = 'spend' | 'leads' | 'msgs' | 'ctr' | 'hook' | 'hold';
type InstagramView = 'overview' | 'content';
type FunnelGoal = 'messagesStarted' | 'leadForms' | 'siteLeads' | 'profileVisits';
type InstagramChartMetricKey = 'reach' | 'views' | 'accountsEngaged' | 'followerDelta';
type DatePreset =
  | 'today'
  | 'yesterday'
  | 'today_yesterday'
  | 'last_7d'
  | 'last_14d'
  | 'last_28d'
  | 'last_30d'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'custom';
type DateRange = { start: string; end: string };

const brl = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  }).format(value ?? 0);

const num = (value: number) =>
  new Intl.NumberFormat('pt-BR').format(Math.round(value ?? 0));

const compactNum = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    notation: value >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(Math.round(value ?? 0));

const pct = (value: number, digits = 1) => `${(value ?? 0).toFixed(digits)}%`;
const isoLabel = (value: string) => `${value.slice(8, 10)}/${value.slice(5, 7)}`;
const isoUtcDate = (value: Date) => value.toISOString().slice(0, 10);
const formatDateBr = (value: string) => {
  const normalized = String(value ?? '').trim();
  const parts = normalized.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return normalized;
};

const getTodayUtc = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const shiftUtcDate = (value: Date, days: number) => {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const getStartOfWeekUtc = (value: Date) => {
  const weekday = value.getUTCDay();
  const offset = weekday === 0 ? -6 : 1 - weekday;
  return shiftUtcDate(value, offset);
};

const getRangeForPreset = (preset: Exclude<DatePreset, 'custom'>): DateRange => {
  const today = getTodayUtc();
  const stableReferenceDay = shiftUtcDate(today, -2);
  const stableYear = stableReferenceDay.getUTCFullYear();
  const stableMonth = stableReferenceDay.getUTCMonth();

  if (preset === 'today') return { start: isoUtcDate(today), end: isoUtcDate(today) };
  if (preset === 'yesterday') {
    const yesterday = shiftUtcDate(today, -1);
    return { start: isoUtcDate(yesterday), end: isoUtcDate(yesterday) };
  }
  if (preset === 'today_yesterday') return { start: isoUtcDate(shiftUtcDate(today, -1)), end: isoUtcDate(today) };
  if (preset === 'last_7d') return { start: isoUtcDate(shiftUtcDate(stableReferenceDay, -6)), end: isoUtcDate(stableReferenceDay) };
  if (preset === 'last_14d') return { start: isoUtcDate(shiftUtcDate(stableReferenceDay, -13)), end: isoUtcDate(stableReferenceDay) };
  if (preset === 'last_28d') return { start: isoUtcDate(shiftUtcDate(stableReferenceDay, -27)), end: isoUtcDate(stableReferenceDay) };
  if (preset === 'last_30d') return { start: isoUtcDate(shiftUtcDate(stableReferenceDay, -29)), end: isoUtcDate(stableReferenceDay) };
  if (preset === 'this_week') return { start: isoUtcDate(getStartOfWeekUtc(stableReferenceDay)), end: isoUtcDate(stableReferenceDay) };
  if (preset === 'last_week') {
    const thisWeekStart = getStartOfWeekUtc(stableReferenceDay);
    return { start: isoUtcDate(shiftUtcDate(thisWeekStart, -7)), end: isoUtcDate(shiftUtcDate(thisWeekStart, -1)) };
  }
  if (preset === 'this_month') return { start: isoUtcDate(new Date(Date.UTC(stableYear, stableMonth, 1))), end: isoUtcDate(stableReferenceDay) };
  return {
    start: isoUtcDate(new Date(Date.UTC(stableYear, stableMonth - 1, 1))),
    end: isoUtcDate(new Date(Date.UTC(stableYear, stableMonth, 0))),
  };
};

const normalizeDateRange = (start?: string, end?: string): DateRange | null => {
  if (!start || !end) return null;
  return start <= end ? { start, end } : { start: end, end: start };
};

const getDatePresetLabel = (preset: DatePreset) => {
  switch (preset) {
    case 'today':
      return 'Hoje';
    case 'yesterday':
      return 'Ontem';
    case 'today_yesterday':
      return 'Hoje e ontem';
    case 'last_7d':
      return 'Ultimos 7 dias';
    case 'last_14d':
      return 'Ultimos 14 dias';
    case 'last_28d':
      return 'Ultimos 28 dias';
    case 'last_30d':
      return 'Ultimos 30 dias';
    case 'this_week':
      return 'Esta semana';
    case 'last_week':
      return 'Semana passada';
    case 'this_month':
      return 'Este mes';
    case 'last_month':
      return 'Mes passado';
    case 'custom':
      return 'Personalizado';
    default:
      return 'Periodo';
  }
};

const DATE_PRESET_OPTIONS: DatePreset[] = [
  'today',
  'yesterday',
  'today_yesterday',
  'last_7d',
  'last_14d',
  'last_28d',
  'last_30d',
  'this_week',
  'last_week',
  'this_month',
  'last_month',
  'custom',
];

const formatDateRangeLabel = (range: DateRange | null) => {
  if (!range) return 'Selecione o periodo';
  return `${formatDateBr(range.start)} ate ${formatDateBr(range.end)}`;
};

const delta = (current: number, previous: number): number | null => {
  if (!current || !previous) return null;
  return ((current - previous) / previous) * 100;
};

const GradientDefs = () => (
  <defs>
    <linearGradient id="gSpend" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
      <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
    </linearGradient>
    <linearGradient id="gReach" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.35} />
      <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
    </linearGradient>
    <linearGradient id="gLeads" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
    </linearGradient>
    <linearGradient id="gMsgs" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.3} />
      <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
    </linearGradient>
    <linearGradient id="gProfileVisits" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
    </linearGradient>
    <linearGradient id="gThruplays" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.3} />
      <stop offset="100%" stopColor="#14b8a6" stopOpacity={0} />
    </linearGradient>
  </defs>
);

const DeltaBadge: React.FC<{ value: number | null; invert?: boolean }> = ({ value, invert }) => {
  if (value === null) return <span className="text-[11px] text-white/30">—</span>;

  const positive = invert ? value < 0 : value >= 0;
  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${positive ? 'text-emerald-400' : 'text-rose-400'}`}>
      <Icon className="h-3 w-3" />
      {Math.abs(value).toFixed(1)}%
    </span>
  );
};

const KpiCard: React.FC<{
  label: string;
  value: string;
  accent: string;
  delta?: number | null;
  hint?: string;
  sub?: string;
  invertDelta?: boolean;
}> = ({ label, value, accent, delta: change, hint, sub, invertDelta }) => (
  <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 backdrop-blur-sm">
    <div
      className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full opacity-15 blur-3xl"
      style={{ background: accent }}
    />
    <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">{label}</div>
    <div className="text-[26px] font-black tracking-tight text-white leading-none">{value}</div>
    {sub ? <div className="mt-1 text-[11px] text-white/45">{sub}</div> : null}
    <div className="mt-2.5 flex items-center gap-2">
      {change !== undefined && change !== null ? <DeltaBadge value={change} invert={invertDelta} /> : null}
      {hint ? <span className="text-[10px] text-white/30">{hint}</span> : null}
    </div>
  </div>
);

const MiniMetricPill: React.FC<{
  label: string;
  value: string;
  delta?: number | null;
  invertDelta?: boolean;
}> = ({ label, value, delta: change, invertDelta }) => (
  <div className="rounded-2xl border border-white/[0.08] bg-[#0c0f15]/90 px-3 py-2.5 shadow-[0_12px_28px_rgba(0,0,0,0.24)] backdrop-blur-xl">
    <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/28">{label}</div>
    <div className="mt-1 text-base font-black tracking-tight text-white">{value}</div>
    <div className="mt-1">{change !== undefined ? <DeltaBadge value={change ?? null} invert={invertDelta} /> : <span className="text-[10px] text-white/18">â€”</span>}</div>
  </div>
);

const FunnelStageCard: React.FC<{
  label: string;
  value: number;
  delta?: number | null;
  widthClass: string;
  accent: string;
}> = ({ label, value, delta: change, widthClass, accent }) => (
  <div className={`relative mx-auto overflow-hidden rounded-[28px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.10),rgba(255,255,255,0.04))] px-6 py-4 shadow-[0_18px_60px_rgba(0,0,0,0.38)] backdrop-blur-xl ${widthClass}`}>
    <div className="absolute inset-x-[18%] top-0 h-px bg-white/20" />
    <div className="pointer-events-none absolute inset-0 opacity-70" style={{ background: `radial-gradient(circle at 50% 0%, ${accent}22 0%, transparent 58%)` }} />
    <div className="text-center">
      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/38">{label}</div>
      <div className="mt-1 text-[30px] font-black tracking-[-0.05em] text-white leading-none">{compactNum(value)}</div>
      <div className="mt-1 flex justify-center">{change !== undefined ? <DeltaBadge value={change ?? null} /> : null}</div>
    </div>
  </div>
);

const fmtYAxis = (value: number) => {
  if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(0)}k`;
  return `${Math.round(value)}`;
};

const pctShare = (part: number, total: number) => (total > 0 ? ((part / total) * 100).toFixed(1) : '0.0');

const CampaignPerformanceFunnel: React.FC<{
  metrics: ReturnType<typeof useCampaignMetrics>;
  goal: FunnelGoal;
  onGoalChange: (goal: FunnelGoal) => void;
  visibleProfileVisitsCurrent: number;
  visibleProfileVisitsPrevious: number;
}> = ({ metrics, goal, onGoalChange, visibleProfileVisitsCurrent, visibleProfileVisitsPrevious }) => {
  if (!metrics) return null;

  const goalOptions: Array<{ id: FunnelGoal; label: string; available: boolean }> = [
    { id: 'messagesStarted', label: 'Mensagens', available: (metrics.messagesStarted ?? 0) > 0 },
    { id: 'leadForms', label: 'Leads / Formulários', available: (metrics.leadForms ?? 0) > 0 },
    { id: 'siteLeads', label: 'Leads no Site', available: (metrics.siteLeads ?? 0) > 0 || (metrics.landingPageViews ?? 0) > 0 },
    { id: 'profileVisits', label: 'Visitas ao Perfil', available: visibleProfileVisitsCurrent > 0 },
  ];

  const selectedGoal = goalOptions.find((item) => item.id === goal) ?? goalOptions[0];
  const goalCurrentMap: Record<FunnelGoal, number> = {
    messagesStarted: metrics.messagesStarted ?? 0,
    leadForms: metrics.leadForms ?? 0,
    siteLeads: metrics.siteLeads ?? 0,
    profileVisits: visibleProfileVisitsCurrent,
  };
  const goalPreviousMap: Record<FunnelGoal, number> = {
    messagesStarted: metrics.prevMsgs ?? 0,
    leadForms: metrics.prevLeadForms ?? 0,
    siteLeads: 0,
    profileVisits: visibleProfileVisitsPrevious,
  };
  const goalAccentMap: Record<FunnelGoal, string> = {
    messagesStarted: '#38bdf8',
    leadForms: '#10b981',
    siteLeads: '#34d399',
    profileVisits: '#f59e0b',
  };

  const finalValue = goalCurrentMap[goal] ?? 0;
  const finalPrevValue = goalPreviousMap[goal] ?? 0;
  const costPerResult = finalValue > 0 ? metrics.spend / finalValue : 0;
  const clickToResultRate = metrics.linkClicks > 0 ? (finalValue / metrics.linkClicks) * 100 : 0;
  const impressionToClickRate = metrics.impressions > 0 ? (metrics.linkClicks / metrics.impressions) * 100 : 0;
  const reachToImpressionRate = metrics.reach > 0 ? metrics.impressions / metrics.reach : 0;
  const landingToSiteLeadRate = metrics.landingPageViews > 0 ? (metrics.siteLeads / metrics.landingPageViews) * 100 : 0;

  const stages: Array<{ key: string; label: string; value: number; prev: number; widthClass: string; accent: string }> = [
    { key: 'reach', label: 'Alcance', value: metrics.reach ?? 0, prev: metrics.prevReach ?? 0, widthClass: 'w-full max-w-[760px]', accent: '#8b5cf6' },
    { key: 'impressions', label: 'Impressões', value: metrics.impressions ?? 0, prev: metrics.prevImpressions ?? 0, widthClass: 'w-[88%] max-w-[660px]', accent: '#6366f1' },
    { key: 'clicks', label: 'Cliques no Link', value: metrics.linkClicks ?? 0, prev: metrics.prevLinkClicks ?? 0, widthClass: 'w-[74%] max-w-[560px]', accent: '#3b82f6' },
  ];

  if (goal === 'siteLeads') {
    stages.push({
      key: 'landingPageViews',
      label: 'Vis. Página Destino',
      value: metrics.landingPageViews ?? 0,
      prev: metrics.prevLandingPageViews ?? 0,
      widthClass: 'w-[60%] max-w-[460px]',
      accent: '#10b981',
    });
  }

  stages.push({
    key: goal,
    label: selectedGoal.label,
    value: finalValue,
    prev: finalPrevValue,
    widthClass: goal === 'siteLeads' ? 'w-[48%] max-w-[360px]' : 'w-[56%] max-w-[420px]',
    accent: goalAccentMap[goal],
  });

  const leftStats =
    goal === 'messagesStarted'
      ? [
          { label: 'CPM', value: brl(metrics.cpm ?? 0), delta: delta(metrics.cpm ?? 0, metrics.prevCpm ?? 0), invertDelta: true },
          { label: 'Custo/Msg', value: finalValue > 0 ? brl(costPerResult) : 'â€”', delta: null, invertDelta: true },
        ]
      : goal === 'leadForms'
        ? [
            { label: 'CPL Form', value: finalValue > 0 ? brl(costPerResult) : 'â€”', delta: null, invertDelta: true },
            { label: 'CPM', value: brl(metrics.cpm ?? 0), delta: delta(metrics.cpm ?? 0, metrics.prevCpm ?? 0), invertDelta: true },
          ]
        : goal === 'siteLeads'
          ? [
              { label: 'CPL Site', value: finalValue > 0 ? brl(costPerResult) : 'â€”', delta: null, invertDelta: true },
              { label: 'LPV > Lead', value: pct(landingToSiteLeadRate), delta: null, invertDelta: false },
            ]
          : [
              { label: 'CPV Perfil', value: finalValue > 0 ? brl(costPerResult) : 'â€”', delta: null, invertDelta: true },
              { label: 'Freq.', value: (metrics.frequency ?? 0).toFixed(2), delta: null, invertDelta: false },
            ];

  const rightStats =
    goal === 'messagesStarted'
      ? [
          { label: 'CTR', value: pct(metrics.ctr ?? 0), delta: delta(metrics.ctr ?? 0, metrics.prevCtr ?? 0), invertDelta: false },
          { label: 'Clique > Msg', value: pct(clickToResultRate), delta: null, invertDelta: false },
        ]
      : goal === 'leadForms'
        ? [
            { label: 'CTR', value: pct(metrics.ctr ?? 0), delta: delta(metrics.ctr ?? 0, metrics.prevCtr ?? 0), invertDelta: false },
            { label: 'Clique > Form', value: pct(clickToResultRate), delta: null, invertDelta: false },
          ]
        : goal === 'siteLeads'
          ? [
              { label: 'Connect Rate', value: pct(metrics.connectRate ?? 0), delta: null, invertDelta: false },
              { label: 'Clique > Site', value: pct(clickToResultRate), delta: null, invertDelta: false },
            ]
          : [
              { label: 'CTR', value: pct(metrics.ctr ?? 0), delta: delta(metrics.ctr ?? 0, metrics.prevCtr ?? 0), invertDelta: false },
              { label: 'Clique > Perfil', value: pct(clickToResultRate), delta: null, invertDelta: false },
            ];

  return (
    <div className="overflow-hidden rounded-[32px] border border-white/[0.08] bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.12),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.02))] px-4 py-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)] sm:px-6">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <SectionLabel>Funil da Campanha</SectionLabel>
          <div className="text-sm font-semibold text-white/70">Da entrega ao resultado final, com seletor por objetivo.</div>
        </div>
        <div className="inline-flex flex-wrap gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-1">
          {goalOptions.filter((item) => item.available).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onGoalChange(item.id)}
              className={`rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] transition-all ${
                goal === item.id ? 'bg-indigo-600 text-white shadow-[0_8px_24px_rgba(79,70,229,0.38)]' : 'text-white/45 hover:text-white/75'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[170px_minmax(0,1fr)_170px] lg:items-center">
        <div className="grid gap-3">
          {leftStats.map((item) => (
            <MiniMetricPill key={item.label} label={item.label} value={item.value} delta={item.delta} invertDelta={item.invertDelta} />
          ))}
        </div>

        <div className="relative py-2">
          <div className="pointer-events-none absolute left-1/2 top-3 bottom-3 w-px -translate-x-1/2 bg-gradient-to-b from-white/0 via-white/12 to-white/0" />
          <div className="space-y-3">
            {stages.map((stage, index) => (
              <React.Fragment key={stage.key}>
                <FunnelStageCard
                  label={stage.label}
                  value={stage.value}
                  delta={delta(stage.value, stage.prev)}
                  widthClass={stage.widthClass}
                  accent={stage.accent}
                />
                {index < stages.length - 1 ? <div className="mx-auto h-3 w-px bg-white/15" /> : null}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="grid gap-3">
          {rightStats.map((item) => (
            <MiniMetricPill key={item.label} label={item.label} value={item.value} delta={item.delta} invertDelta={item.invertDelta} />
          ))}
          <MiniMetricPill label="Imp. > Clique" value={pct(impressionToClickRate)} delta={null} />
          <MiniMetricPill label="Imp./Alcance" value={`${reachToImpressionRate.toFixed(2)}x`} delta={null} />
        </div>
      </div>
    </div>
  );
};

const INSTAGRAM_CHART_METRICS: Array<{
  key: InstagramChartMetricKey;
  label: string;
  color: string;
  axis: 'left' | 'right';
}> = [
  { key: 'reach', label: 'Alcance', color: '#3b82f6', axis: 'left' },
  { key: 'views', label: 'Visualizações', color: '#a855f7', axis: 'left' },
  { key: 'accountsEngaged', label: 'Contas Engajadas', color: '#ec4899', axis: 'right' },
  { key: 'followerDelta', label: 'Seguidores', color: '#10b981', axis: 'right' },
];

const ChartTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-[#111827] px-3 py-2.5 text-xs shadow-2xl">
      <div className="mb-1.5 font-semibold text-white/50">{label}</div>
      {payload.map((item: any) => (
        <div key={item.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
          <span className="text-white/70">{item.name}:</span>
          <span className="font-bold text-white">
            {String(item.name).toLowerCase().includes('invest') ? brl(item.value) : num(item.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white/25">{children}</div>
);

const ViewToggle: React.FC<{ value: ViewMode; onChange: (value: ViewMode) => void }> = ({ value, onChange }) => (
  <div className="inline-flex overflow-hidden rounded-xl border border-white/[0.07] text-xs">
    {(['performance', 'distribuicao'] as ViewMode[]).map((item) => (
      <button
        key={item}
        type="button"
        onClick={() => onChange(item)}
        className={`px-4 py-2 font-semibold transition-all ${
          value === item ? 'bg-indigo-600 text-white' : 'bg-transparent text-white/40 hover:text-white/70'
        }`}
      >
        {item === 'performance' ? 'Desempenho' : 'Distribuição'}
      </button>
    ))}
  </div>
);

const useCampaignMetrics = (summary: MetaSummary | undefined, prevSummary: MetaSummary | undefined) =>
  useMemo(() => {
    if (!summary) return null;

    const s = summary;
    const p = prevSummary;
    const totalLeads = s.leadForms + s.siteLeads;

    return {
      ...s,
      totalLeads,
      cpl: totalLeads > 0 ? s.spend / totalLeads : 0,
      connectRate: s.linkClicks > 0 ? (s.landingPageViews / s.linkClicks) * 100 : 0,
      hasLeads: totalLeads > 0,
      hasMsgs: s.messagesStarted > 0,
      hasLeadForms: s.leadForms > 0,
      hasSiteLeads: s.siteLeads > 0,
      hasConversions: totalLeads > 0 || s.messagesStarted > 0,
      prevSpend: p?.spend ?? 0,
      prevReach: p?.reach ?? 0,
      prevImpressions: p?.impressions ?? 0,
      prevLeadForms: p?.leadForms ?? 0,
      prevMsgs: p?.messagesStarted ?? 0,
      prevLinkClicks: p?.linkClicks ?? 0,
      prevCtr: p?.ctr ?? 0,
      prevCpm: p?.cpm ?? 0,
      prevLandingPageViews: p?.landingPageViews ?? 0,
      prevProfileVisits: p?.profileVisits ?? 0,
      prevVideoViews: p?.videoViews ?? 0,
      prevHookRate: p?.hookRate ?? 0,
      prevHoldRate: p?.holdRate ?? 0,
    };
  }, [summary, prevSummary]);

export const PublicDashboard: React.FC<{ token: string }> = ({ token }) => {
  const [bootstrap, setBootstrap] = useState<DashboardBootstrap | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [weekly, setWeekly] = useState<DashboardWeekly | null>(null);
  const [tab, setTab] = useState<Tab>('campanhas');
  const [campaignPlatform, setCampaignPlatform] = useState<CampaignPlatform>('meta');
  const [viewMode, setViewMode] = useState<ViewMode>('performance');
  const [instagramView, setInstagramView] = useState<InstagramView>('overview');
  const [funnelGoal, setFunnelGoal] = useState<FunnelGoal>('messagesStarted');
  const [instagramChartMetrics, setInstagramChartMetrics] = useState<Set<InstagramChartMetricKey>>(
    new Set(['reach', 'views']),
  );
  const [datePreset, setDatePreset] = useState<DatePreset>('last_30d');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dateDialogOpen, setDateDialogOpen] = useState(false);
  const [draftDatePreset, setDraftDatePreset] = useState<DatePreset>('last_30d');
  const [draftDateFrom, setDraftDateFrom] = useState('');
  const [draftDateTo, setDraftDateTo] = useState('');
  const [campaignIds, setCampaignIds] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [campaignSortKey, setCampaignSortKey] = useState<CampaignSortKey>('spend');
  const [adSortKey, setAdSortKey] = useState<AdSortKey>('spend');
  const [selectedCampaign, setSelectedCampaign] = useState<{ id: string; name: string } | null>(null);
  const [campaignAds, setCampaignAds] = useState<AdBreakdownRow[]>([]);
  const [loadingBoot, setLoadingBoot] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [loadingWeekly, setLoadingWeekly] = useState(false);
  const [loadingCampaignAds, setLoadingCampaignAds] = useState(false);
  const [campaignAdsError, setCampaignAdsError] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const latestDashboardRequestRef = useRef(0);
  const showDashboardOverlay = loadingData || (tab === 'relatorio' && loadingWeekly);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setFilterOpen(false);
      }
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    setLoadingBoot(true);
    fetchDashboardBootstrap(token)
      .then((payload) => {
        setBootstrap(payload);
        const defaultRange = getRangeForPreset('last_30d');
        setDatePreset('last_30d');
        setDateFrom(defaultRange.start);
        setDateTo(defaultRange.end);
        setDraftDatePreset('last_30d');
        setDraftDateFrom(defaultRange.start);
        setDraftDateTo(defaultRange.end);
      })
      .catch((error) => setErrorMsg(error?.message ?? 'Dashboard indisponível.'))
      .finally(() => setLoadingBoot(false));
  }, [token]);

  const loadData = useCallback((range?: { dateFrom: string; dateTo: string }) => {
    const activeDateFrom = range?.dateFrom ?? dateFrom;
    const activeDateTo = range?.dateTo ?? dateTo;
    if (!activeDateFrom || !activeDateTo) return;

    const requestId = Date.now();
    latestDashboardRequestRef.current = requestId;

    setLoadingData(true);
    setErrorMsg(null);

    fetchDashboardData({ token, dateFrom: activeDateFrom, dateTo: activeDateTo, campaignIds })
      .then((payload) => {
        if (latestDashboardRequestRef.current !== requestId) return;
        setData(payload);
        const summary = payload.meta?.summary;
        if (summary && (summary.leadForms > 0 || summary.siteLeads > 0 || summary.messagesStarted > 0)) {
          setViewMode('performance');
        } else if (summary?.reach) {
          setViewMode('distribuicao');
        }
      })
      .catch((error) => {
        if (latestDashboardRequestRef.current !== requestId) return;
        setErrorMsg(error?.message ?? 'Erro ao carregar dados.');
      })
      .finally(() => {
        if (latestDashboardRequestRef.current === requestId) setLoadingData(false);
      });
  }, [campaignIds, dateFrom, dateTo, token]);

  useEffect(() => {
    if (dateFrom && dateTo) loadData();
  }, [dateFrom, dateTo, loadData]);

  useEffect(() => {
    if (tab !== 'relatorio' || !dateFrom || !dateTo) return;

    setLoadingWeekly(true);
    fetchDashboardWeekly({ token, dateFrom, dateTo })
      .then(setWeekly)
      .catch((error) => setErrorMsg(error?.message ?? 'Erro ao carregar relatório.'))
      .finally(() => setLoadingWeekly(false));
  }, [dateFrom, dateTo, tab, token]);

  const meta = data?.meta;
  const prevMeta = data?.prevMeta;
  const ig = data?.instagram;
  const prevIg = data?.prevInstagram;
  const metrics = useCampaignMetrics(meta?.summary, prevMeta?.summary);
  const paidProfileVisitsCurrent = metrics?.profileVisits ?? 0;
  const paidProfileVisitsPrevious = metrics?.prevProfileVisits ?? 0;
  const visibleProfileVisitsCurrent = paidProfileVisitsCurrent;
  const visibleProfileVisitsPrevious = paidProfileVisitsPrevious;
  const profileVisitsHint = 'Fonte atual: Meta Ads';
  const resultsBreakdown = metrics
    ? `Msgs ${num(metrics.messagesStarted)} · Forms ${num(metrics.leadForms)} · Site ${num(metrics.siteLeads)}`
    : 'Msgs 0 · Forms 0 · Site 0';
  const igProfile = ig?.profile ?? bootstrap?.instagramProfile;
  const clientLabel = bootstrap?.clientName || bootstrap?.metaAdAccountName || 'Dashboard';

  const campaigns = useMemo(() => {
    const list = meta?.campaigns ?? [];
    return [...list].sort((a, b) => {
      if (campaignSortKey === 'leads') return (b.leadForms + b.siteLeads) - (a.leadForms + a.siteLeads);
      if (campaignSortKey === 'msgs') return b.messagesStarted - a.messagesStarted;
      if (campaignSortKey === 'ctr') return b.ctr - a.ctr;
      if (campaignSortKey === 'cpc') return a.cpc - b.cpc;
      return b.spend - a.spend;
    });
  }, [campaignSortKey, meta?.campaigns]);

  const sortedCampaignAds = useMemo(() => {
    return [...campaignAds].sort((a, b) => {
      if (adSortKey === 'leads') return (b.leadForms + b.siteLeads) - (a.leadForms + a.siteLeads);
      if (adSortKey === 'msgs') return b.messagesStarted - a.messagesStarted;
      if (adSortKey === 'ctr') return b.ctr - a.ctr;
      if (adSortKey === 'hook') return b.hookRate - a.hookRate;
      if (adSortKey === 'hold') return b.holdRate - a.holdRate;
      return b.spend - a.spend;
    });
  }, [adSortKey, campaignAds]);

  const maxSpend = useMemo(() => Math.max(...campaigns.map((item) => item.spend), 1), [campaigns]);
  const maxAdSpend = useMemo(() => Math.max(...sortedCampaignAds.map((item) => item.spend), 1), [sortedCampaignAds]);
  const campaignOptions = useMemo(
    () => (meta?.campaigns ?? []).map((item) => ({ id: `meta:${item.id}`, label: item.name })),
    [meta?.campaigns],
  );

  const toggleCampaign = (id: string) =>
    setCampaignIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

  const openCampaignAds = useCallback((campaignId: string, campaignName: string) => {
    setSelectedCampaign({ id: campaignId, name: campaignName });
    setAdSortKey('spend');
  }, []);

  const closeCampaignAds = useCallback(() => {
    setSelectedCampaign(null);
    setCampaignAds([]);
    setCampaignAdsError(null);
  }, []);

  const selectedDateRangeLabel = useMemo(
    () => formatDateRangeLabel(normalizeDateRange(dateFrom, dateTo)),
    [dateFrom, dateTo],
  );

  useEffect(() => {
    const availableGoals: FunnelGoal[] = [];
    if ((metrics?.messagesStarted ?? 0) > 0) availableGoals.push('messagesStarted');
    if ((metrics?.leadForms ?? 0) > 0) availableGoals.push('leadForms');
    if ((metrics?.siteLeads ?? 0) > 0 || (metrics?.landingPageViews ?? 0) > 0) availableGoals.push('siteLeads');
    if (visibleProfileVisitsCurrent > 0) availableGoals.push('profileVisits');
    if (availableGoals.length === 0) return;
    if (!availableGoals.includes(funnelGoal)) setFunnelGoal(availableGoals[0]);
  }, [funnelGoal, metrics?.landingPageViews, metrics?.leadForms, metrics?.messagesStarted, metrics?.siteLeads, visibleProfileVisitsCurrent]);

  const openDateDialog = () => {
    setDraftDatePreset(datePreset);
    setDraftDateFrom(dateFrom);
    setDraftDateTo(dateTo);
    setDateDialogOpen(true);
  };

  const onChangeDraftDatePreset = (nextPreset: DatePreset) => {
    setDraftDatePreset(nextPreset);

    if (nextPreset === 'custom') {
      const fallbackRange =
        normalizeDateRange(draftDateFrom, draftDateTo) ??
        normalizeDateRange(dateFrom, dateTo) ??
        getRangeForPreset('last_30d');
      setDraftDateFrom(fallbackRange.start);
      setDraftDateTo(fallbackRange.end);
      return;
    }

    const nextRange = getRangeForPreset(nextPreset);
    setDraftDateFrom(nextRange.start);
    setDraftDateTo(nextRange.end);
  };

  const applyDateFilter = () => {
    const normalized =
      normalizeDateRange(draftDateFrom, draftDateTo) ??
      (draftDatePreset === 'custom' ? null : getRangeForPreset(draftDatePreset));

    if (!normalized) return;

    setDatePreset(draftDatePreset);
    setDateFrom(normalized.start);
    setDateTo(normalized.end);
    setDateDialogOpen(false);
    loadData({ dateFrom: normalized.start, dateTo: normalized.end });
  };

  useEffect(() => {
    if (!selectedCampaign?.id || !dateFrom || !dateTo) return;

    let alive = true;
    setLoadingCampaignAds(true);
    setCampaignAdsError(null);

    fetchDashboardCampaignAds({
      token,
      dateFrom,
      dateTo,
      campaignId: selectedCampaign.id,
    })
      .then((payload) => {
        if (!alive) return;
        setCampaignAds(payload.rows ?? []);
        if (payload.campaignName) {
          setSelectedCampaign((current) => (current ? { ...current, name: payload.campaignName } : current));
        }
      })
      .catch((error) => {
        if (!alive) return;
        setCampaignAdsError(error?.message ?? 'Erro ao carregar anuncios da campanha.');
      })
      .finally(() => {
        if (alive) setLoadingCampaignAds(false);
      });

    return () => {
      alive = false;
    };
  }, [dateFrom, dateTo, selectedCampaign?.id, token]);

  if (loadingBoot) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070810]">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-500/10">
            <TrendingUp className="h-6 w-6 text-indigo-400" />
          </div>
          <div className="flex items-center gap-2 text-sm text-white/50">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando dashboard...
          </div>
        </div>
      </div>
    );
  }

  if (!bootstrap && errorMsg) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070810] px-6">
        <div className="max-w-sm text-center">
          <div className="mb-4 text-4xl opacity-20">!</div>
          <h1 className="mb-2 text-lg font-bold text-white">Dashboard indisponível</h1>
          <p className="text-sm text-white/50">{errorMsg}</p>
        </div>
      </div>
    );
  }

  const CampanhasTab = () => {
    const isPerf = viewMode === 'performance';
    const chartSecondarySeries = isPerf
      ? [
          { key: 'leads', label: 'Leads', color: '#10b981', gradient: 'url(#gLeads)' },
          { key: 'messages', label: 'Mensagens', color: '#38bdf8', gradient: 'url(#gMsgs)' },
        ]
      : [
          { key: 'thruplays', label: 'ThruPlays', color: '#14b8a6', gradient: 'url(#gThruplays)' },
          { key: 'profileVisits', label: 'Visitas ao Perfil', color: '#f59e0b', gradient: 'url(#gProfileVisits)' },
        ];
    const chartTitle = isPerf ? 'Investimento, Leads & Mensagens' : 'Investimento, ThruPlays & Visitas ao Perfil';

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <ViewToggle value={viewMode} onChange={setViewMode} />
          {loadingData ? (
            <div className="flex items-center gap-1.5 text-xs text-white/40">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Atualizando...
            </div>
          ) : null}
        </div>

        {isPerf ? (
          <>
            <div>
              <SectionLabel>Investimento &amp; Alcance</SectionLabel>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
                <KpiCard label="Valor Investido" value={brl(metrics?.spend ?? 0)} delta={delta(metrics?.spend ?? 0, metrics?.prevSpend ?? 0)} accent="#6366f1" hint="vs período anterior" />
                <KpiCard label="Alcance" value={num(metrics?.reach ?? 0)} delta={delta(metrics?.reach ?? 0, metrics?.prevReach ?? 0)} accent="#a855f7" />
                <KpiCard label="Impressões" value={num(metrics?.impressions ?? 0)} delta={delta(metrics?.impressions ?? 0, metrics?.prevImpressions ?? 0)} accent="#8b5cf6" />
                <KpiCard label="Frequência" value={(metrics?.frequency ?? 0).toFixed(2)} accent="#64748b" />
              </div>
            </div>

            {(metrics?.hasConversions || visibleProfileVisitsCurrent > 0 || (metrics?.followers ?? 0) > 0) ? (
              <div>
                <SectionLabel>Resultados por tipo</SectionLabel>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {(metrics?.hasLeadForms || metrics?.hasLeads) ? (
                    <KpiCard
                      label="Leads / Formulários"
                      value={num(metrics?.leadForms ?? 0)}
                      delta={delta(metrics?.leadForms ?? 0, metrics?.prevLeadForms ?? 0)}
                      accent="#10b981"
                      sub={metrics?.leadForms ? `CPL ${brl((metrics?.spend ?? 0) / metrics.leadForms)}` : undefined}
                    />
                  ) : null}
                  {metrics?.hasSiteLeads ? (
                    <KpiCard
                      label="Leads no Site"
                      value={num(metrics?.siteLeads ?? 0)}
                      accent="#34d399"
                      sub={metrics?.siteLeads ? `CPL ${brl((metrics?.spend ?? 0) / metrics.siteLeads)}` : undefined}
                    />
                  ) : null}
                  {metrics?.hasMsgs ? (
                    <KpiCard
                      label="Mensagens Iniciadas"
                      value={num(metrics?.messagesStarted ?? 0)}
                      delta={delta(metrics?.messagesStarted ?? 0, metrics?.prevMsgs ?? 0)}
                      accent="#38bdf8"
                      sub={metrics?.messagesStarted ? `Custo/msg ${brl((metrics?.spend ?? 0) / metrics.messagesStarted)}` : undefined}
                    />
                  ) : null}
                  {visibleProfileVisitsCurrent > 0 ? (
                    <KpiCard
                      label="Visitas ao Perfil"
                      value={num(visibleProfileVisitsCurrent)}
                      delta={delta(visibleProfileVisitsCurrent, visibleProfileVisitsPrevious)}
                      accent="#f59e0b"
                      sub={profileVisitsHint}
                    />
                  ) : null}
                  {(metrics?.followers ?? 0) > 0 ? (
                    <KpiCard label="Novos Seguidores" value={num(metrics?.followers ?? 0)} accent="#f43f5e" />
                  ) : null}
                </div>
                <div className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-xs leading-5 text-white/55">
                  <strong className="font-semibold text-white/75">Resultados</strong> considera somente <span className="text-white/80">Mensagens iniciadas + Lead Forms + Leads no site</span>. Visitas ao perfil e seguidores aparecem separados e nao entram nesse total.
                </div>
              </div>
            ) : null}

            <div>
              <SectionLabel>Métricas de Entrega</SectionLabel>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
                <KpiCard label="CTR Médio" value={pct(metrics?.ctr ?? 0)} delta={delta(metrics?.ctr ?? 0, metrics?.prevCtr ?? 0)} accent="#06b6d4" />
                <KpiCard label="Cliques no Link" value={num(metrics?.linkClicks ?? 0)} delta={delta(metrics?.linkClicks ?? 0, metrics?.prevLinkClicks ?? 0)} accent="#3b82f6" />
                <KpiCard label="Vis. Pág. Destino" value={num(metrics?.landingPageViews ?? 0)} delta={delta(metrics?.landingPageViews ?? 0, metrics?.prevLandingPageViews ?? 0)} accent="#10b981" />
                <KpiCard label="Connect Rate" value={pct(metrics?.connectRate ?? 0)} accent="#10b981" />
                <KpiCard label="CPM Médio" value={brl(metrics?.cpm ?? 0)} delta={delta(metrics?.cpm ?? 0, metrics?.prevCpm ?? 0)} accent="#a855f7" invertDelta />
                <KpiCard label="CPC Médio" value={brl(metrics?.cpc ?? 0)} accent="#f59e0b" invertDelta />
                <KpiCard
                  label="Visitas ao Perfil"
                  value={num(visibleProfileVisitsCurrent)}
                  delta={delta(visibleProfileVisitsCurrent, visibleProfileVisitsPrevious)}
                  accent="#f43f5e"
                  sub={profileVisitsHint}
                />
                <KpiCard
                  label="Resultados"
                  value={num(metrics?.results ?? 0)}
                  accent="#38bdf8"
                  sub={resultsBreakdown}
                  hint="Nao inclui visitas ao perfil"
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <div>
              <SectionLabel>Alcance &amp; Cobertura</SectionLabel>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <KpiCard label="Total Investido" value={brl(metrics?.spend ?? 0)} delta={delta(metrics?.spend ?? 0, metrics?.prevSpend ?? 0)} accent="#6366f1" hint="vs período anterior" />
                <KpiCard label="Alcance Total" value={num(metrics?.reach ?? 0)} delta={delta(metrics?.reach ?? 0, metrics?.prevReach ?? 0)} accent="#a855f7" />
                <KpiCard label="Impressões" value={num(metrics?.impressions ?? 0)} delta={delta(metrics?.impressions ?? 0, metrics?.prevImpressions ?? 0)} accent="#8b5cf6" />
                <KpiCard label="Frequência" value={(metrics?.frequency ?? 0).toFixed(2)} accent="#64748b" />
              </div>
            </div>

            <div>
              <SectionLabel>Distribuição</SectionLabel>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <KpiCard label="Cliques no Link" value={num(metrics?.linkClicks ?? 0)} delta={delta(metrics?.linkClicks ?? 0, metrics?.prevLinkClicks ?? 0)} accent="#3b82f6" />
                <KpiCard label="Vis. Pág. Destino" value={num(metrics?.landingPageViews ?? 0)} delta={delta(metrics?.landingPageViews ?? 0, metrics?.prevLandingPageViews ?? 0)} accent="#10b981" />
                <KpiCard
                  label="Visitas ao Perfil"
                  value={num(visibleProfileVisitsCurrent)}
                  delta={delta(visibleProfileVisitsCurrent, visibleProfileVisitsPrevious)}
                  accent="#f43f5e"
                  sub={profileVisitsHint}
                />
                <KpiCard label="CTR Médio" value={pct(metrics?.ctr ?? 0)} delta={delta(metrics?.ctr ?? 0, metrics?.prevCtr ?? 0)} accent="#06b6d4" />
              </div>
            </div>

            <div>
              <SectionLabel>Vídeo &amp; Qualidade</SectionLabel>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <KpiCard label="Visualizações de Vídeo" value={num(metrics?.videoViews ?? 0)} delta={delta(metrics?.videoViews ?? 0, metrics?.prevVideoViews ?? 0)} accent="#8b5cf6" />
                <KpiCard label="ThruPlays" value={num(metrics?.thruplays ?? 0)} accent="#6366f1" />
                <KpiCard label="Hook Rate" value={pct((metrics?.hookRate ?? 0) * 100)} delta={delta(metrics?.hookRate ?? 0, metrics?.prevHookRate ?? 0)} accent="#f59e0b" />
                <KpiCard label="Hold Rate" value={pct((metrics?.holdRate ?? 0) * 100)} delta={delta(metrics?.holdRate ?? 0, metrics?.prevHoldRate ?? 0)} accent="#38bdf8" />
              </div>
            </div>

            <div>
              <SectionLabel>Eficiência</SectionLabel>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <KpiCard label="CPM Médio" value={brl(metrics?.cpm ?? 0)} delta={delta(metrics?.cpm ?? 0, metrics?.prevCpm ?? 0)} accent="#f59e0b" invertDelta />
                <KpiCard label="CPC Médio" value={brl(metrics?.cpc ?? 0)} accent="#f43f5e" invertDelta />
                <KpiCard label="Connect Rate" value={pct(metrics?.connectRate ?? 0)} accent="#10b981" />
                <KpiCard
                  label="Resultados"
                  value={num(metrics?.results ?? 0)}
                  accent="#06b6d4"
                  sub={resultsBreakdown}
                  hint="Nao inclui visitas ao perfil"
                />
              </div>
            </div>
          </>
        )}

        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">Evolução Diária</div>
              <div className="mt-1 text-base font-black text-white">{chartTitle}</div>
            </div>
            <div className="hidden flex-wrap items-center justify-end gap-3 text-[11px] text-white/45 sm:flex">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#6366f1]" />
                Investimento
              </span>
              {chartSecondarySeries.map((item) => (
                <span key={item.key} className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  {item.label}
                </span>
              ))}
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={meta?.timeseries?.map((item) => ({ ...item, date: isoLabel(item.date) })) ?? []}>
                <GradientDefs />
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="spend" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="conv" orientation="right" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area yAxisId="spend" type="monotone" dataKey="spend" stroke="#6366f1" strokeWidth={2} fill="url(#gSpend)" name="Investimento" dot={false} />
                {chartSecondarySeries.map((item) => (
                  <Area
                    key={item.key}
                    yAxisId="conv"
                    type="monotone"
                    dataKey={item.key}
                    stroke={item.color}
                    strokeWidth={2}
                    fill={item.gradient}
                    name={item.label}
                    dot={false}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {isPerf && metrics ? (
          <CampaignPerformanceFunnel
            metrics={metrics}
            goal={funnelGoal}
            onGoalChange={setFunnelGoal}
            visibleProfileVisitsCurrent={visibleProfileVisitsCurrent}
            visibleProfileVisitsPrevious={visibleProfileVisitsPrevious}
          />
        ) : null}

        <div className="flex items-center justify-between gap-4">
          <div className="inline-flex overflow-hidden rounded-xl border border-white/[0.07] text-xs">
            {([
              { id: 'meta', label: 'Meta' },
              { id: 'google', label: 'Google' },
            ] as const).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setCampaignPlatform(item.id);
                  if (item.id !== 'meta') closeCampaignAds();
                }}
                className={`px-4 py-2 font-semibold transition-all ${
                  campaignPlatform === item.id ? 'bg-indigo-600 text-white' : 'bg-transparent text-white/40 hover:text-white/70'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {campaignPlatform === 'meta' ? (
          <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">
            <div className="flex flex-col gap-4 border-b border-white/[0.06] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">Meta Ads</div>
                <div className="mt-0.5 flex items-center gap-2 text-base font-black text-white">
                  {selectedCampaign ? (
                    <button
                      type="button"
                      onClick={closeCampaignAds}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] text-white/70 transition-colors hover:text-white"
                      aria-label="Voltar para campanhas"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                  ) : null}
                  <div className="min-w-0">
                    <div>{selectedCampaign ? 'Anuncios da campanha' : 'Campanhas do periodo'}</div>
                    {selectedCampaign ? (
                      <div className="truncate text-xs font-medium text-white/45">{selectedCampaign.name}</div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 text-[10px]">
                <span className="hidden uppercase tracking-wider text-white/30 sm:block">Ordenar</span>
                {selectedCampaign
                  ? ([
                      { id: 'spend', label: 'Invest.' },
                      { id: 'leads', label: 'Leads' },
                      { id: 'msgs', label: 'Msgs' },
                      { id: 'ctr', label: 'CTR' },
                      { id: 'hook', label: 'Hook' },
                      { id: 'hold', label: 'Hold' },
                    ] as const).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setAdSortKey(item.id)}
                        className={`font-bold uppercase tracking-[0.15em] transition-colors ${
                          adSortKey === item.id ? 'text-indigo-400' : 'text-white/30 hover:text-white/60'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))
                  : ([
                      { id: 'spend', label: 'Invest.' },
                      { id: 'leads', label: 'Leads' },
                      { id: 'msgs', label: 'Msgs' },
                      { id: 'ctr', label: 'CTR' },
                    ] as const).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setCampaignSortKey(item.id)}
                        className={`font-bold uppercase tracking-[0.15em] transition-colors ${
                          campaignSortKey === item.id ? 'text-indigo-400' : 'text-white/30 hover:text-white/60'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
              </div>
            </div>

            <div className="divide-y divide-white/[0.04]">
              {selectedCampaign ? (
                loadingCampaignAds ? (
                  <div className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-white/40">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando anuncios da campanha...
                  </div>
                ) : campaignAdsError ? (
                  <div className="px-5 py-10 text-center text-sm text-red-400/70">
                    {campaignAdsError}
                  </div>
                ) : sortedCampaignAds.length === 0 ? (
                  <div className="px-5 py-10 text-center text-sm text-white/30">
                    Nenhum anuncio encontrado para essa campanha no periodo.
                  </div>
                ) : (
                  sortedCampaignAds.map((ad) => {
                    const adLeads = ad.leadForms + ad.siteLeads;
                    const cpl = adLeads > 0 ? ad.spend / adLeads : 0;
                    const costPerMessage = ad.messagesStarted > 0 ? ad.spend / ad.messagesStarted : 0;
                    const adHook = ad.videoViews > 0 ? pct(ad.hookRate * 100) : '—';
                    const adHold = ad.thruplays > 0 ? pct(ad.holdRate * 100) : '—';

                    return (
                      <div key={ad.id} className="px-5 py-4 transition-colors hover:bg-white/[0.02]">
                        <div className="mb-2.5 flex items-start gap-3">
                          {ad.thumbnailUrl ? (
                            <img
                              src={ad.thumbnailUrl}
                              alt={ad.name}
                              className="h-14 w-14 shrink-0 rounded-lg object-cover bg-white/[0.05]"
                            />
                          ) : (
                            <div className="h-14 w-14 shrink-0 rounded-lg bg-white/[0.05]" />
                          )}
                          <div className="flex min-w-0 flex-1 items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-white/90">{ad.name}</div>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center justify-end gap-4 text-xs">
                            <div className="text-right">
                              <div className="text-[10px] uppercase tracking-wider text-white/30">Invest.</div>
                              <div className="font-bold text-white">{brl(ad.spend)}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] uppercase tracking-wider text-white/30">Leads</div>
                              <div className="font-bold text-emerald-400">{num(adLeads)}</div>
                              {cpl > 0 ? <div className="text-[10px] text-white/40">CPL {brl(cpl)}</div> : null}
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] uppercase tracking-wider text-white/30">Msgs</div>
                              <div className="font-bold text-sky-400">{num(ad.messagesStarted)}</div>
                              {costPerMessage > 0 ? <div className="text-[10px] text-white/40">{brl(costPerMessage)}/msg</div> : null}
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] uppercase tracking-wider text-white/30">CTR</div>
                              <div className="font-bold text-white/80">{pct(ad.ctr)}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] uppercase tracking-wider text-white/30">Hook</div>
                              <div className="font-bold text-white/80">{adHook}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] uppercase tracking-wider text-white/30">Hold</div>
                              <div className="font-bold text-white/80">{adHold}</div>
                            </div>
                          </div>
                          </div>
                        </div>
                        <div className="h-1 overflow-hidden rounded-full bg-white/[0.04]">
                          <div
                            className="h-full rounded-full bg-indigo-500/70 transition-all duration-500"
                            style={{ width: `${Math.round((ad.spend / maxAdSpend) * 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )
              ) : campaigns.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-white/30">
                  {loadingData ? 'Carregando campanhas...' : 'Nenhuma campanha no periodo.'}
                </div>
              ) : (
                campaigns.map((campaign) => {
                  const campaignLeads = campaign.leadForms + campaign.siteLeads;
                  const cpl = campaignLeads > 0 ? campaign.spend / campaignLeads : 0;
                  const costPerMessage = campaign.messagesStarted > 0 ? campaign.spend / campaign.messagesStarted : 0;
                  const connectRate = campaign.linkClicks > 0 ? (campaign.landingPageViews / campaign.linkClicks) * 100 : 0;

                  return (
                    <div key={campaign.id} className="px-5 py-4 transition-colors hover:bg-white/[0.02]">
                      <div className="mb-2.5 flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold text-white/90">{campaign.name}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => openCampaignAds(campaign.id, campaign.name)}
                              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/65 transition-colors hover:text-white"
                            >
                              Anuncios
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-4 text-xs">
                          <div className="text-right">
                            <div className="text-[10px] uppercase tracking-wider text-white/30">Invest.</div>
                            <div className="font-bold text-white">{brl(campaign.spend)}</div>
                          </div>

                          {isPerf ? (
                            <>
                              {campaignLeads > 0 ? (
                                <div className="text-right">
                                  <div className="text-[10px] uppercase tracking-wider text-white/30">Leads</div>
                                  <div className="font-bold text-emerald-400">{num(campaignLeads)}</div>
                                  {cpl > 0 ? <div className="text-[10px] text-white/40">CPL {brl(cpl)}</div> : null}
                                </div>
                              ) : null}
                              {campaign.messagesStarted > 0 ? (
                                <div className="text-right">
                                  <div className="text-[10px] uppercase tracking-wider text-white/30">Msgs</div>
                                  <div className="font-bold text-sky-400">{num(campaign.messagesStarted)}</div>
                                  {costPerMessage > 0 ? <div className="text-[10px] text-white/40">{brl(costPerMessage)}/msg</div> : null}
                                </div>
                              ) : null}
                              {campaignLeads === 0 && campaign.messagesStarted === 0 ? (
                                <div className="text-right">
                                  <div className="text-[10px] uppercase tracking-wider text-white/30">Alcance</div>
                                  <div className="font-bold text-white/80">{num(campaign.reach)}</div>
                                </div>
                              ) : null}
                              <div className="text-right">
                                <div className="text-[10px] uppercase tracking-wider text-white/30">CTR</div>
                                <div className="font-bold text-white/80">{pct(campaign.ctr)}</div>
                              </div>
                              <div className="text-right">
                                <div className="text-[10px] uppercase tracking-wider text-white/30">CPM</div>
                                <div className="font-bold text-white/80">{brl(campaign.cpm)}</div>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="text-right">
                                <div className="text-[10px] uppercase tracking-wider text-white/30">Cliques</div>
                                <div className="font-bold text-white/90">{num(campaign.linkClicks)}</div>
                              </div>
                              <div className="text-right">
                                <div className="text-[10px] uppercase tracking-wider text-white/30">LPV</div>
                                <div className="font-bold text-emerald-400">{num(campaign.landingPageViews)}</div>
                                {connectRate > 0 ? <div className="text-[10px] text-white/40">{pct(connectRate)}</div> : null}
                              </div>
                              <div className="text-right">
                                <div className="text-[10px] uppercase tracking-wider text-white/30">Perfil</div>
                                <div className="font-bold text-fuchsia-400">{num(campaign.profileVisits)}</div>
                              </div>
                              <div className="text-right">
                                <div className="text-[10px] uppercase tracking-wider text-white/30">Video</div>
                                <div className="font-bold text-violet-300">{num(campaign.videoViews)}</div>
                                {campaign.thruplays > 0 ? <div className="text-[10px] text-white/40">TP {num(campaign.thruplays)}</div> : null}
                              </div>
                              <div className="text-right">
                                <div className="text-[10px] uppercase tracking-wider text-white/30">CTR</div>
                                <div className="font-bold text-white/80">{pct(campaign.ctr)}</div>
                              </div>
                              <div className="text-right">
                                <div className="text-[10px] uppercase tracking-wider text-white/30">Hook / Hold</div>
                                <div className="font-bold text-white/80">
                                  {campaign.videoViews > 0 || campaign.thruplays > 0
                                    ? `${pct(campaign.hookRate * 100)} / ${pct(campaign.holdRate * 100)}`
                                    : '—'}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-white/[0.04]">
                        <div
                          className="h-full rounded-full bg-indigo-500/70 transition-all duration-500"
                          style={{ width: `${Math.round((campaign.spend / maxSpend) * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-xs leading-5 text-white/50">
              <span className="font-semibold text-white/70">Legenda:</span> `Invest.` = investimento. `Leads` = formulários + leads no site. `CPL` = custo por lead. `Msgs` = mensagens iniciadas. `CTR` = taxa de cliques. `CPM` = custo por mil impressões. `LPV` = visualizações da página de destino. `Perfil` = visitas ao perfil. `TP` = ThruPlay. `Hook` = taxa de retenção inicial do vídeo. `Hold` = taxa de retenção até o ThruPlay.
            </div>
            <div className="hidden flex-wrap items-center justify-end gap-3 text-[11px] text-white/45 sm:flex">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#6366f1]" />
                Investimento
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#10b981]" />
                Leads
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#38bdf8]" />
                Mensagens
              </span>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-6 py-10 text-center">
            <div className="mx-auto max-w-md rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] px-6 py-8">
              <div className="text-sm font-semibold text-white/85">Google Ads</div>
              <div className="mt-2 text-sm leading-6 text-white/45">
                Esta aba fica reservada para a implementacao do painel Google com campanhas e anuncios.
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const InstagramTab = () => {
    const toggleInstagramMetric = (key: InstagramChartMetricKey) => {
      setInstagramChartMetrics((current) => {
        const next = new Set(current);
        if (next.has(key)) {
          if (next.size > 1) next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
    };

    const cityMax = ig?.audience?.cities?.[0]?.count ?? 1;
    const ageTotal = (ig?.audience?.ageGroups ?? []).reduce((sum, item) => sum + item.total, 0) || 1;

    return (
    <div className="space-y-6">
      {igProfile ? (
        <div className="flex items-center gap-5 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-6 py-5">
          {igProfile.profilePictureUrl ? (
            <img src={igProfile.profilePictureUrl} alt="" className="h-16 w-16 shrink-0 rounded-full border-2 border-white/10 object-cover" />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full" style={{ background: 'linear-gradient(135deg,#f09433,#dc2743,#bc1888)' }}>
              <Instagram className="h-7 w-7 text-white" />
            </div>
          )}
          <div>
            <div className="text-xl font-black tracking-tight text-white">@{igProfile.username}</div>
            <div className="mt-0.5 text-sm text-white/40">{igProfile.name}</div>
            <div className="mt-2 flex gap-5 text-xs">
              <span><strong className="text-white">{num(igProfile.followersCount)}</strong><span className="ml-1 text-white/40">seguidores</span></span>
              <span><strong className="text-white">{num(igProfile.mediaCount)}</strong><span className="ml-1 text-white/40">publicações</span></span>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <div className="inline-flex overflow-hidden rounded-xl border border-white/[0.07] text-xs">
          {([
            { id: 'overview', label: 'Visão Geral', icon: LayoutDashboard },
            { id: 'content', label: 'Conteúdo', icon: Grid3X3 },
          ] as const).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setInstagramView(item.id)}
              className={`flex items-center gap-1.5 px-4 py-2 font-semibold transition-all ${
                instagramView === item.id ? 'bg-indigo-600 text-white' : 'bg-transparent text-white/40 hover:text-white/70'
              }`}
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {ig?.available ? (
        <>
          {instagramView === 'overview' ? (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <KpiCard label="Alcance" value={num(ig.summary.totalReach)} delta={delta(ig.summary.totalReach, prevIg?.summary.totalReach ?? 0)} accent="#f43f5e" hint="vs período anterior" />
                <KpiCard label="Visualizações" value={num(ig.summary.totalViews)} delta={delta(ig.summary.totalViews, prevIg?.summary.totalViews ?? 0)} accent="#a855f7" />
                <KpiCard label="Visitas ao Perfil" value={num(ig.summary.totalProfileViews)} delta={delta(ig.summary.totalProfileViews, prevIg?.summary.totalProfileViews ?? 0)} accent="#fb7185" />
                <KpiCard label="Contas Engajadas" value={num(ig.summary.totalAccountsEngaged)} delta={delta(ig.summary.totalAccountsEngaged, prevIg?.summary.totalAccountsEngaged ?? 0)} accent="#ec4899" />
                <KpiCard label="Seguidores Ganhos" value={num(ig.summary.totalFollowerGain)} delta={delta(ig.summary.totalFollowerGain, prevIg?.summary.totalFollowerGain ?? 0)} accent="#34d399" />
                <KpiCard label="Total Seguidores" value={num(igProfile?.followersCount ?? 0)} accent="#f59e0b" />
              </div>

              {ig.series.some((item) => item.reach > 0 || item.views > 0 || item.accountsEngaged > 0 || item.followerDelta > 0) ? (
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
                  <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">Instagram Orgânico</div>
                      <div className="mt-1 text-base font-black text-white">Alcance diário</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {INSTAGRAM_CHART_METRICS.map((metric) => {
                        const active = instagramChartMetrics.has(metric.key);
                        return (
                          <button
                            key={metric.key}
                            type="button"
                            onClick={() => toggleInstagramMetric(metric.key)}
                            className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all"
                            style={{
                              borderColor: active ? metric.color : 'rgba(255,255,255,0.12)',
                              background: active ? `${metric.color}20` : 'transparent',
                              color: active ? metric.color : 'rgba(255,255,255,0.48)',
                            }}
                          >
                            <span className="h-2 w-2 rounded-full" style={{ background: active ? metric.color : 'rgba(255,255,255,0.18)' }} />
                            {metric.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={ig.series} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="left" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtYAxis} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtYAxis} />
                        <Tooltip content={<ChartTooltip />} />
                        {INSTAGRAM_CHART_METRICS.filter((metric) => instagramChartMetrics.has(metric.key)).map((metric) => (
                          <Line
                            key={metric.key}
                            yAxisId={metric.axis}
                            type="monotone"
                            dataKey={metric.key}
                            name={metric.label}
                            stroke={metric.color}
                            strokeWidth={2.2}
                            dot={false}
                            activeDot={{ r: 4, fill: metric.color }}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : null}

              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
                <div className="mb-5">
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">Audiência</div>
                  <div className="mt-1 text-base font-black text-white">Perfil demográfico e geográfico</div>
                </div>
                {ig.audience.cities.length === 0 && ig.audience.ageGroups.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-white/40">
                    Dados de audiência indisponíveis para esta conta.
                  </div>
                ) : (
                  <div className="grid gap-6 lg:grid-cols-3">
                    <div>
                      <div className="mb-3 flex items-center gap-2">
                        <div className="h-5 w-0.5 rounded-full bg-gradient-to-b from-amber-500 to-orange-400" />
                        <span className="text-[15px] font-bold text-white">Top Cidades</span>
                      </div>
                      <div className="space-y-2">
                        {ig.audience.cities.map((city) => (
                          <div key={city.city}>
                            <div className="mb-0.5 flex items-center justify-between">
                              <span className="truncate text-xs text-white/85">{city.city}</span>
                              <span className="text-xs tabular-nums text-white/45">{num(city.count)}</span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                              <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500" style={{ width: `${(city.count / cityMax) * 100}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="mb-3 flex items-center gap-2">
                        <div className="h-5 w-0.5 rounded-full bg-gradient-to-b from-violet-500 to-purple-400" />
                        <span className="text-[15px] font-bold text-white">Faixa Etária</span>
                      </div>
                      <div className="space-y-2">
                        {ig.audience.ageGroups.map((group) => (
                          <div key={group.range}>
                            <div className="mb-0.5 flex items-center justify-between">
                              <span className="text-xs text-white/85">{group.range}</span>
                              <span className="text-xs tabular-nums text-white/45">{pctShare(group.total, ageTotal)}%</span>
                            </div>
                            <div className="flex h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                              <div className="h-full bg-blue-500" style={{ width: `${pctShare(group.male, group.total)}%` }} />
                              <div className="h-full bg-pink-500" style={{ width: `${pctShare(group.female, group.total)}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="mb-3 flex items-center gap-2">
                        <div className="h-5 w-0.5 rounded-full bg-gradient-to-b from-pink-500 to-rose-400" />
                        <span className="text-[15px] font-bold text-white">Gênero</span>
                      </div>
                      {ig.audience.gender ? (
                        <div className="space-y-3">
                          {[
                            { label: 'Masculino', value: ig.audience.gender.male, color: '#3b82f6' },
                            { label: 'Feminino', value: ig.audience.gender.female, color: '#ec4899' },
                            { label: 'Não identificado', value: ig.audience.gender.unknown, color: '#94a3b8' },
                          ].map((item) => (
                            <div key={item.label}>
                              <div className="mb-1 flex items-center justify-between">
                                <span className="text-xs text-white/85">{item.label}</span>
                                <span className="text-xs font-semibold tabular-nums" style={{ color: item.color }}>
                                  {pctShare(item.value, ig.audience.gender?.total ?? 0)}%
                                </span>
                              </div>
                              <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                                <div className="h-full rounded-full" style={{ width: `${pctShare(item.value, ig.audience.gender?.total ?? 0)}%`, background: item.color }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-white/40">Sem dados de gênero.</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </>
      ) : ig?.reason && !igProfile ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-5 py-4 text-sm text-amber-300">
          Métricas de insights indisponíveis: {ig.reason}
        </div>
      ) : null}

      {instagramView === 'content' ? (
        (ig?.media ?? []).length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] py-5">
            <InstagramMediaTypeChart media={ig.media as any} loading={false} />
            <div className="mx-6 mb-5 border-t border-white/[0.07]" />
            <InstagramPostsTable media={ig.media as any} loading={false} error={null} onReload={loadData} />
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-white/40">
            Nenhum conteúdo disponível para esta conta.
          </div>
        )
      ) : null}

      {!igProfile && !ig?.available ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Instagram className="mb-3 h-10 w-10 text-white/15" />
          <p className="text-sm text-white/40">Instagram não configurado para este portal.</p>
        </div>
      ) : null}
    </div>
  );
  };

  const RelatorioTab = () => (
    <div className="space-y-6">
      {loadingWeekly ? (
        <div className="flex h-40 items-center justify-center text-white/40">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Gerando relatório...
        </div>
      ) : weekly ? (
        <>
          {weekly.trafficLikeReport ? (
            <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
              <div className="mb-5">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">Relatório final</div>
                <div className="mt-0.5 text-base font-black text-white">Relatório Semanal</div>
              </div>
              <PublicTrafficReport
                embedded
                reportDataOverride={weekly.trafficLikeReport as any}
                titleOverride="Relatório Semanal"
                createdAtOverride={new Date().toISOString()}
              />
            </div>
          ) : weekly.trafficReport?.publicId ? (
            <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">Relatório final</div>
                  <div className="mt-0.5 text-base font-black text-white">{weekly.trafficReport.title || 'Visualização de tráfego'}</div>
                </div>
                <a
                  href={`/traffic-report/${weekly.trafficReport.publicId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir separado
                </a>
              </div>
              <PublicTrafficReport publicId={weekly.trafficReport.publicId} embedded />
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-6 py-5">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">Período analisado</div>
                <div className="text-xl font-black text-white">{weekly.periodStart} → {weekly.periodEnd}</div>
                <p className="mt-3 text-sm leading-relaxed text-white/60">{weekly.summary}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <KpiCard label="Investimento" value={brl(weekly.meta.spend)} accent="#6366f1" hint="últimos 7 dias" />
                <KpiCard label="Resultados" value={num(weekly.meta.results)} accent="#10b981" />
                <KpiCard label="Alcance" value={num(weekly.meta.reach)} accent="#f59e0b" />
                <KpiCard label="Alcance IG" value={num(weekly.instagram.totalReach)} accent="#f43f5e" />
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5">
                  <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400/70">Destaques</div>
                  <div className="space-y-2.5">
                    {(weekly.highlights ?? []).map((item, index) => (
                      <div key={index} className="border-l-2 border-emerald-500/30 pl-3 text-sm leading-relaxed text-emerald-100/80">{item}</div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-5">
                  <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/70">Atenção</div>
                  <div className="space-y-2.5">
                    {(weekly.risks ?? []).map((item, index) => (
                      <div key={index} className="border-l-2 border-amber-500/30 pl-3 text-sm leading-relaxed text-amber-100/80">{item}</div>
                    ))}
                    {(weekly.risks ?? []).length === 0 ? <div className="text-sm text-white/30">Sem alertas.</div> : null}
                  </div>
                </div>

                <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.04] p-5">
                  <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-400/70">Próxima semana</div>
                  <div className="space-y-2.5">
                    {(weekly.next_week ?? []).map((item, index) => (
                      <div key={index} className="border-l-2 border-indigo-500/30 pl-3 text-sm leading-relaxed text-indigo-100/80">{item}</div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      ) : (
        <div className="flex h-40 items-center justify-center text-sm text-white/30">Sem relatório disponível.</div>
      )}
    </div>
  );

  const tabs: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
    { id: 'campanhas', label: 'Campanhas', icon: BarChart2 },
    { id: 'instagram', label: 'Instagram', icon: Instagram },
    { id: 'relatorio', label: 'Relatório Semanal', icon: FileText },
  ];

  return (
    <div className="relative min-h-screen text-white" style={{ background: 'linear-gradient(160deg,#070810 0%,#090b14 60%,#07080e 100%)' }}>
      {showDashboardOverlay ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#070810]/72 backdrop-blur-sm">
          <div className="rounded-[28px] border border-white/10 bg-[#0c1017]/95 px-8 py-7 shadow-[0_28px_80px_-38px_rgba(0,0,0,0.9)]">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-500/10">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-300" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">Atualizando dashboard</div>
                <div className="mt-1 text-xs text-white/45">Carregando métricas e gráficos do período selecionado.</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-indigo-600/10 blur-3xl" />
        <div className="absolute top-0 right-0 h-64 w-64 rounded-full bg-violet-600/8 blur-3xl" />
      </div>

      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#070810]/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex h-14 items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-indigo-500/20 bg-indigo-500/10">
                <TrendingUp className="h-4 w-4 text-indigo-400" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-black">{clientLabel}</div>
                {bootstrap?.instagramUsername ? <div className="truncate text-[10px] text-white/35">@{bootstrap.instagramUsername}</div> : null}
              </div>
            </div>

            <nav className="hidden items-center gap-1 md:flex">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    tab === item.id ? 'bg-white/8 text-white' : 'text-white/40 hover:bg-white/4 hover:text-white/70'
                  }`}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={openDateDialog}
                className="hidden items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-left text-xs text-white/75 transition-colors hover:bg-white/[0.05] sm:flex"
              >
                <CalendarRange className="h-3.5 w-3.5 text-white/40" />
                <span className="flex flex-col">
                  <span className="font-semibold text-white/85">{getDatePresetLabel(datePreset)}</span>
                  <span className="text-[10px] text-white/40">{selectedDateRangeLabel}</span>
                </span>
              </button>

              <div ref={filterRef} className="relative">
                <button
                  type="button"
                  onClick={() => setFilterOpen((open) => !open)}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                    campaignIds.length > 0
                      ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300'
                      : 'border-white/[0.07] bg-white/[0.03] text-white/50 hover:text-white/70'
                  }`}
                >
                  <Filter className="h-3.5 w-3.5" />
                  {campaignIds.length > 0 ? `${campaignIds.length} filtro${campaignIds.length > 1 ? 's' : ''}` : 'Filtrar'}
                  <ChevronDown className={`h-3 w-3 transition-transform ${filterOpen ? 'rotate-180' : ''}`} />
                </button>

                {filterOpen ? (
                  <div className="absolute right-0 top-[calc(100%+6px)] z-40 w-72 rounded-2xl border border-white/10 bg-[#0d1018] py-2 shadow-2xl">
                    <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">Campanhas</span>
                      {campaignIds.length > 0 ? (
                        <button type="button" onClick={() => setCampaignIds([])} className="text-[10px] text-indigo-400 hover:text-indigo-300">
                          Limpar
                        </button>
                      ) : null}
                    </div>
                    <div className="max-h-60 overflow-y-auto py-1">
                      {campaignOptions.length === 0 ? (
                        <div className="px-4 py-3 text-xs text-white/30">Sem campanhas disponíveis.</div>
                      ) : (
                        campaignOptions.map((item) => (
                          <label key={item.id} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.03]">
                            <input
                              type="checkbox"
                              checked={campaignIds.includes(item.id)}
                              onChange={() => toggleCampaign(item.id)}
                              className="h-3.5 w-3.5 rounded border-white/20 bg-transparent accent-indigo-500"
                            />
                            <span className="truncate text-xs text-white/70">{item.label}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={loadData}
                className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-1.5 text-white/40 transition-all hover:bg-white/[0.06] hover:text-white/70"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingData ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1 overflow-x-auto pb-2 md:hidden">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  tab === item.id ? 'bg-white/8 text-white' : 'text-white/40 hover:text-white/70'
                }`}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={openDateDialog}
              className="ml-auto whitespace-nowrap rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-white/65"
            >
              {getDatePresetLabel(datePreset)}
            </button>
          </div>
        </div>
      </header>

      {errorMsg ? (
        <div className="mx-auto mt-4 max-w-7xl px-4 sm:px-6">
          <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-xs text-red-300">{errorMsg}</div>
        </div>
      ) : null}

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {tab === 'campanhas' ? <CampanhasTab /> : null}
        {tab === 'instagram' ? <InstagramTab /> : null}
        {tab === 'relatorio' ? <RelatorioTab /> : null}
      </main>

      <Dialog open={dateDialogOpen} onOpenChange={setDateDialogOpen}>
        <DialogContent className="flex max-h-[85vh] w-[860px] max-w-[92vw] flex-col overflow-hidden border-white/[0.08] bg-[#11131b] p-0 text-white sm:max-w-[92vw]">
          <DialogHeader className="border-b border-white/[0.08] px-6 py-5">
            <DialogTitle className="text-base font-semibold">Selecionar periodo</DialogTitle>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 gap-0 overflow-x-hidden md:grid-cols-[220px_minmax(0,1fr)]">
            <div className="overflow-y-auto border-b border-white/[0.08] p-4 md:border-b-0 md:border-r md:border-white/[0.08]">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/40">
                Usados recentemente
              </div>
              <div className="space-y-1.5">
                {DATE_PRESET_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onChangeDraftDatePreset(option)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-all ${
                      draftDatePreset === option
                        ? 'border border-indigo-500/20 bg-indigo-500/10 text-indigo-300'
                        : 'border border-transparent text-white/85 hover:bg-white/[0.04]'
                    }`}
                  >
                    <span>{getDatePresetLabel(option)}</span>
                    {draftDatePreset === option ? <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">ativo</span> : null}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 overflow-x-hidden overflow-y-auto p-5">
              <div className="grid grid-cols-1 gap-4">
                <div className="min-w-0 rounded-2xl border border-white/[0.08] bg-[#0c1017] p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-white/40">
                    Selecao
                  </div>
                  <div className="mt-2 break-words text-lg font-semibold leading-tight text-white">
                    {getDatePresetLabel(draftDatePreset)}
                  </div>
                  <div className="mt-2 break-words text-sm leading-6 text-white/50">
                    {formatDateRangeLabel(normalizeDateRange(draftDateFrom, draftDateTo))}
                  </div>
                </div>

                <div className="min-w-0 rounded-2xl border border-white/[0.08] bg-[#0c1017] p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-white/40">
                    Intervalo
                  </div>
                  <div className="mt-3 grid gap-3">
                    <label className="grid gap-1.5 text-xs text-white/50">
                      Data inicial
                      <input
                        type="date"
                        value={draftDateFrom}
                        max={draftDateTo || undefined}
                        onChange={(event) => {
                          setDraftDatePreset('custom');
                          setDraftDateFrom(event.target.value);
                          setDraftDateTo((prev) => (!prev || prev < event.target.value ? event.target.value : prev));
                        }}
                        className="w-full rounded-xl border border-white/[0.08] bg-[#1a1f29] px-3 py-2 text-sm text-white outline-none"
                      />
                    </label>
                    <label className="grid gap-1.5 text-xs text-white/50">
                      Data final
                      <input
                        type="date"
                        value={draftDateTo}
                        min={draftDateFrom || undefined}
                        onChange={(event) => {
                          setDraftDatePreset('custom');
                          setDraftDateTo(event.target.value);
                          setDraftDateFrom((prev) => (!prev || prev > event.target.value ? event.target.value : prev));
                        }}
                        className="w-full rounded-xl border border-white/[0.08] bg-[#1a1f29] px-3 py-2 text-sm text-white outline-none"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-white/[0.08] px-6 py-4">
            <button
              type="button"
              onClick={() => setDateDialogOpen(false)}
              className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-sm text-white/80"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={applyDateFilter}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Aplicar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <footer className="mt-8 border-t border-white/[0.04] py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6">
          <span className="text-[10px] font-mono text-white/20">Powered by CR8</span>
          <span className="text-[10px] text-white/20">{dateFrom} → {dateTo}</span>
        </div>
      </footer>
    </div>
  );
};
