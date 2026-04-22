import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CalendarRange, Download, ExternalLink, FileBarChart2, Filter, Link2, RefreshCw, Send, Sparkles, X } from 'lucide-react';
import { TrafficDashboard } from './TrafficDashboard';
import { AdMetric, NativeResultContext, NativeResultType } from '../types';
import { loadLocalAiSettings } from '../lib/aiLocal';
import { resolveMetaToken } from '../lib/metaToken';
import { getSupabaseAnonKey, getSupabaseUrl, isSupabaseConfigured, supabase } from '../lib/supabase';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';

interface TrafficAnalyticsProps {
  companyId?: string;
}

type MetaLevel = 'campaign' | 'adset' | 'ad';
type InsightsScopeLevel = MetaLevel | 'account';
type TrafficTab = 'meta' | 'platform';
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

type OptionalMetricKey =
  | 'impressions'
  | 'reach'
  | 'clicks'
  | 'inlineLinkClicks'
  | 'cpm'
  | 'frequency'
  | 'cpc'
  | 'ctr'
  | 'roas';

const OPTIONAL_METRICS_ORDER: OptionalMetricKey[] = [
  'impressions',
  'reach',
  'clicks',
  'inlineLinkClicks',
  'ctr',
  'cpc',
  'cpm',
  'frequency',
  'roas',
];

const isoUtcDate = (value: Date) => value.toISOString().slice(0, 10);

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
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();

  if (preset === 'today') {
    return { start: isoUtcDate(today), end: isoUtcDate(today) };
  }

  if (preset === 'yesterday') {
    const yesterday = shiftUtcDate(today, -1);
    return { start: isoUtcDate(yesterday), end: isoUtcDate(yesterday) };
  }

  if (preset === 'today_yesterday') {
    return { start: isoUtcDate(shiftUtcDate(today, -1)), end: isoUtcDate(today) };
  }

  if (preset === 'last_7d') {
    const start = shiftUtcDate(today, -6);
    return { start: isoUtcDate(start), end: isoUtcDate(today) };
  }

  if (preset === 'last_14d') {
    const start = shiftUtcDate(today, -13);
    return { start: isoUtcDate(start), end: isoUtcDate(today) };
  }

  if (preset === 'last_28d') {
    const start = shiftUtcDate(today, -27);
    return { start: isoUtcDate(start), end: isoUtcDate(today) };
  }

  if (preset === 'last_30d') {
    const start = shiftUtcDate(today, -29);
    return { start: isoUtcDate(start), end: isoUtcDate(today) };
  }

  if (preset === 'this_week') {
    return { start: isoUtcDate(getStartOfWeekUtc(today)), end: isoUtcDate(today) };
  }

  if (preset === 'last_week') {
    const thisWeekStart = getStartOfWeekUtc(today);
    const start = shiftUtcDate(thisWeekStart, -7);
    const end = shiftUtcDate(thisWeekStart, -1);
    return { start: isoUtcDate(start), end: isoUtcDate(end) };
  }

  if (preset === 'this_month') {
    return { start: isoUtcDate(new Date(Date.UTC(year, month, 1))), end: isoUtcDate(today) };
  }

  return {
    start: isoUtcDate(new Date(Date.UTC(year, month - 1, 1))),
    end: isoUtcDate(new Date(Date.UTC(year, month, 0))),
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

const formatDateBr = (value: string) => {
  const normalized = String(value ?? '').trim();
  const parts = normalized.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return normalized;
};

const buildComparisonSeries = (
  rows: any[],
  range: DateRange,
  mapValue: (row: any) => { metaSpend: number; metaLeads: number },
) => {
  const byDay = new Map<string, { metaSpend: number; metaLeads: number }>();

  for (const row of rows) {
    const key = String(row?.date_start ?? '').slice(0, 10);
    if (!key) continue;
    const current = byDay.get(key) ?? { metaSpend: 0, metaLeads: 0 };
    const next = mapValue(row);
    byDay.set(key, {
      metaSpend: current.metaSpend + next.metaSpend,
      metaLeads: current.metaLeads + next.metaLeads,
    });
  }

  const output: Array<{ name: string; metaSpend: number; metaLeads: number }> = [];
  const cursor = new Date(`${range.start}T00:00:00.000Z`);
  const endDate = new Date(`${range.end}T00:00:00.000Z`);

  while (cursor <= endDate) {
    const iso = isoUtcDate(cursor);
    const point = byDay.get(iso) ?? { metaSpend: 0, metaLeads: 0 };
    output.push({
      name: `${iso.slice(8, 10)}/${iso.slice(5, 7)}`,
      metaSpend: point.metaSpend,
      metaLeads: point.metaLeads,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return output;
};

type TrafficViewPreset = {
  id: string;
  name: string;
  level: MetaLevel;
  optionalColumns: OptionalMetricKey[];
};

type TableColumn = {
  key: string;
  label: string;
  render: (row: AdMetric) => React.ReactNode;
};

type MetaAdAccount = {
  id: string; // act_123
  name?: string;
};

type CreativeAnalysisRow = {
  id: string;
  company_id: string;
  created_by: string | null;
  platform: string;
  level: string;
  entity_id: string;
  entity_name: string | null;
  thumbnail_url: string | null;
  period_start: string | null; // date
  period_end: string | null; // date
  metrics: any;
  result: any;
  created_at: string;
};

type PlatformBuckets = {
  messagesStarted: number;
  leadForms: number;
  siteLeads: number;
  businessLeads: number;
  profileVisits: number;
  followers: number;
  videoViews: number;
  thruplays: number;
  purchases: number;
};

type ReportMediaSummary = {
  invest: number;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
};

type ReportPlatformSummary = PlatformBuckets;

type ReportBusinessSummary = {
  crmLeads: number;
  won: number;
  revenue: number;
  pendingFollowup: number;
  leadSignals: number;
};

type TrafficDashboardSummary = {
  media: ReportMediaSummary;
  platform: ReportPlatformSummary;
  dominantNativeType: NativeResultType | null;
};

type CampaignMetaNode = {
  objective?: string;
};

type AdsetMetaNode = {
  campaignId?: string;
  destinationType?: string;
  optimizationGoal?: string;
  promotedObject?: Record<string, unknown> | null;
};

type NativeTypeOverrideMaps = {
  byCampaignId: Map<string, NativeResultContext>;
  byAdsetId: Map<string, NativeResultContext>;
};

const DEFAULT_PRESET_ID = '__default__';
const DEFAULT_PRESET_NAME = 'Padrão';

const META_GRAPH_VERSION: string = import.meta.env.VITE_META_GRAPH_VERSION ?? 'v19.0';
const META_AD_ACCOUNT_ID_ENV: string = import.meta.env.VITE_META_AD_ACCOUNT_ID ?? '';
const META_SCOPES: string = import.meta.env.VITE_FACEBOOK_SCOPES ?? 'public_profile ads_read';

// Ajuste fino (equivalente ao "Índice de criativos" da sua planilha)
const IDC_THRESHOLDS = {
  otimo: 0.8,
  bom: 0.6,
  regular: 0.4,
};

const mockAds: AdMetric[] = [
  {
    id: '1',
    adName: 'Vídeo Case Sucesso',
    adId: 'AD-123',
    subtitle: 'Conjunto: Remarketing • Campanha: Prova Social',
    thumbnail: 'https://picsum.photos/50/50',
    status: 'active',
    spend: 500,
    impressions: 5000,
    leads: 50,
    cpa: 10,
    hookRate: 0.4,
    holdRate: 0.2,
    scores: [
      { label: 'Leads', value: 70 },
      { label: 'CPL', value: 85 },
      { label: 'CTR', value: 60 },
    ],
    idc: 72,
    classification: 'bom',
    tags: ['Quente', 'Prova Social'],
  },
];

const mockComparisonData = [
  { name: 'Seg', metaSpend: 400, metaLeads: 24 },
  { name: 'Ter', metaSpend: 300, metaLeads: 14 },
  { name: 'Qua', metaSpend: 200, metaLeads: 98 },
  { name: 'Qui', metaSpend: 278, metaLeads: 39 },
  { name: 'Sex', metaSpend: 189, metaLeads: 48 },
  { name: 'Sab', metaSpend: 239, metaLeads: 38 },
  { name: 'Dom', metaSpend: 349, metaLeads: 43 },
];

const normalizeAdAccountId = (id: string) => {
  const trimmed = id.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('act_') ? trimmed : `act_${trimmed.replace(/^act_/, '')}`;
};

const normalizeScopes = (scopes: string) => {
  const parts = scopes
    .split(/[,\s]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set(parts)).join(' ');
};

const parseNumber = (value: unknown) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number.parseFloat(value);
  return 0;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(value);

const formatNumber = (value: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value);

const formatPercent = (value01: number, digits = 0) => `${(value01 * 100).toFixed(digits)}%`;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const normalizeHigherBetter = (value: number, min: number, max: number) => {
  const denom = max - min;
  if (!Number.isFinite(denom) || denom <= 0) return 0;
  return clamp01((value - min) / denom);
};

const normalizeLowerBetter = (value: number, min: number, max: number) => {
  return clamp01(1 - normalizeHigherBetter(value, min, max));
};


const svgAvatarDataUrl = (text: string, fg = '#111827', bg = '#E5E7EB') => {
  const label = (text || 'CR8').trim().slice(0, 2).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="100%" height="100%" rx="12" ry="12" fill="${bg}"/><text x="50%" y="56%" text-anchor="middle" font-size="30" font-family="Inter,system-ui,Segoe UI,Roboto,Arial" fill="${fg}">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const normalizeActionType = (actionType: unknown) => String(actionType ?? '').trim().toLowerCase();

const extractActionSum = (actions: any[] | undefined, matcher: (actionType: string) => boolean) => {
  if (!Array.isArray(actions)) return undefined;
  const matches = actions.filter((a) => matcher(normalizeActionType(a?.action_type)));
  if (matches.length === 0) return undefined;
  return matches.reduce((sum, a) => sum + parseNumber(a.value), 0);
};

const extractPreferredActionValue = (
  actions: any[] | undefined,
  exactPriority: string[],
  fallbackMatcher?: (actionType: string) => boolean,
) => {
  if (!Array.isArray(actions) || actions.length === 0) return undefined;

  for (const actionType of exactPriority) {
    const match = actions.find((entry) => normalizeActionType(entry?.action_type) === actionType);
    if (match != null) return parseNumber(match.value);
  }

  if (!fallbackMatcher) return undefined;
  const match = actions.find((entry) => fallbackMatcher(normalizeActionType(entry?.action_type)));
  return match != null ? parseNumber(match.value) : undefined;
};

const extractActionTotal = (actions: any[] | undefined) => {
  if (!Array.isArray(actions) || actions.length === 0) return undefined;
  return actions.reduce((sum, a) => sum + parseNumber(a?.value), 0);
};

const extractLeadFormsFromActions = (actions: any[] | undefined) =>
  extractActionSum(
    actions,
    (t) =>
      t === 'lead' ||
      t === 'onsite_conversion.lead_grouped' ||
      t.includes('lead_grouped') ||
      t.includes('lead_form'),
  );

const extractSiteLeadsFromActions = (actions: any[] | undefined) =>
  extractActionSum(
    actions,
    (t) =>
      t === 'contact' ||
      t === 'omni_contact' ||
      t === 'omni_lead' ||
      t === 'omni_complete_registration' ||
      t.includes('fb_pixel_lead') ||
      (t.startsWith('offsite_conversion.') && (t.includes('lead') || t.includes('contact') || t.includes('complete_registration'))),
  );

const extractPurchasesFromActions = (actions: any[] | undefined) =>
  extractActionSum(actions, (t) => t === 'purchase' || t.endsWith('.purchase') || t.includes('purchase'));

const extractMessagingConversationsFromActions = (actions: any[] | undefined) =>
  extractPreferredActionValue(
    actions,
    [
      'onsite_conversion.messaging_conversation_started_7d',
      'onsite_conversion.messaging_conversation_started_1d',
    ],
    (t) => t.includes('messaging_conversation_started'),
  );

// Visitas ao perfil reais do Instagram; nao incluir page engagement / view content genericos.
const extractProfileVisitsFromActions = (actions: any[] | undefined) =>
  extractActionSum(
    actions,
    (t) =>
      t === 'instagram_profile_visit' ||
      t === 'profile_visit' ||
      t.includes('instagram_profile') ||
      t.includes('profile_visit'),
  );

// Seguidores/likes ganhos (Meta page likes e Instagram follows via anuncios)
const extractFollowersFromActions = (actions: any[] | undefined) =>
  extractActionSum(actions, (t) => t === 'like' || t === 'page_fan' || t === 'instagram_profile_follow' || t === 'follow');

const extractVideo3sFromActions = (actions: any[] | undefined) =>
  extractActionSum(actions, (t) => {
    const type = String(t || '').toLowerCase();
    return type === 'video_view' || type === 'video_view_3s' || type === 'video_view_3_sec' || type === 'video_view_3s_watched';
  });

const extractVideo15sFromActions = (actions: any[] | undefined) =>
  extractActionSum(actions, (t) => {
    const type = String(t || '').toLowerCase();
    return (
      type === 'video_view_15s' ||
      type === 'video_view_15_sec' ||
      type === 'video_view_15s_watched' ||
      type.startsWith('video_view_15')
    );
  });

const normalizeObjective = (objective: unknown) => String(objective ?? '').trim().toUpperCase();
const normalizeMetaSignal = (value: unknown) => String(value ?? '').trim().toUpperCase();

const isGenericObjective = (objective: string) =>
  objective === '' ||
  objective === 'OUTCOME_AWARENESS' ||
  objective === 'OUTCOME_ENGAGEMENT' ||
  objective === 'OUTCOME_TRAFFIC' ||
  objective === 'AWARENESS' ||
  objective === 'ENGAGEMENT' ||
  objective === 'TRAFFIC';

const inferNativeTypeFromContext = (input: {
  objective?: unknown;
  destinationType?: unknown;
  optimizationGoal?: unknown;
  promotedObject?: Record<string, unknown> | null;
  nameHint?: unknown;
}): NativeResultType => {
  const destinationType = normalizeMetaSignal(input.destinationType);
  const optimizationGoal = normalizeMetaSignal(input.optimizationGoal);
  const objective = normalizeObjective(input.objective);
  const promotedJson = JSON.stringify(input.promotedObject ?? {}).toUpperCase();
  const nameHint = normalizeMetaSignal(input.nameHint);

  if (
    destinationType.includes('WHATSAPP') ||
    destinationType.includes('MESSENGER') ||
    destinationType.includes('MESSAGING') ||
    optimizationGoal.includes('MESSAGING') ||
    optimizationGoal.includes('CONVERSATION') ||
    optimizationGoal.includes('REPLIES') ||
    promotedJson.includes('WHATSAPP') ||
    promotedJson.includes('MESSENGER')
  ) {
    return 'messages_started';
  }

  if (
    nameHint.includes('WHATSAPP') ||
    nameHint.includes('WHATS') ||
    nameHint.includes(' MENSA') ||
    nameHint.includes('MSG') ||
    nameHint.includes('DIRECT') ||
    nameHint.includes('DM')
  ) {
    return 'messages_started';
  }

  if (
    destinationType.includes('PROFILE') ||
    destinationType.includes('INSTAGRAM') ||
    optimizationGoal.includes('PROFILE') ||
    promotedJson.includes('INSTAGRAM_PROFILE')
  ) {
    return 'profile_visits';
  }

  if (
    optimizationGoal.includes('OFFSITE') ||
    optimizationGoal.includes('CONVERSION') ||
    optimizationGoal.includes('VALUE') ||
    optimizationGoal.includes('PURCHASE') ||
    destinationType.includes('WEBSITE') ||
    destinationType.includes('WEB') ||
    destinationType.includes('SHOP') ||
    promotedJson.includes('PIXEL') ||
    promotedJson.includes('CUSTOM_EVENT') ||
    objective.includes('OUTCOME_SALES') ||
    objective.includes('CONVERS')
  ) {
    return objective.includes('PURCHASE') || optimizationGoal.includes('PURCHASE') ? 'purchases' : 'site_leads';
  }

  if (
    destinationType.includes('INSTANT_FORM') ||
    destinationType.includes('ON_AD') ||
    optimizationGoal.includes('LEAD') ||
    promotedJson.includes('LEAD') ||
    objective.includes('OUTCOME_LEADS') ||
    objective === 'LEAD_GENERATION' ||
    objective === 'LEADS'
  ) {
    return 'lead_forms';
  }

  if (
    optimizationGoal.includes('THRUPLAY') ||
    optimizationGoal.includes('VIDEO') ||
    objective.includes('VIDEO') ||
    objective.includes('OUTCOME_VIDEO')
  ) {
    return 'video_views';
  }

  if (
    optimizationGoal.includes('FOLLOW') ||
    destinationType.includes('FOLLOW') ||
    promotedJson.includes('FOLLOW') ||
    promotedJson.includes('PAGE_LIKE')
  ) {
    return 'followers';
  }

  if (!isGenericObjective(objective)) {
    if (objective.includes('MESSAGE')) return 'messages_started';
    if (objective.includes('LEAD')) return 'lead_forms';
    if (objective.includes('PURCHASE') || objective.includes('SALE')) return 'purchases';
    if (objective.includes('VIDEO')) return 'video_views';
  }

  return 'unknown';
};

const labelForNativeType = (nativeType: NativeResultType, hasThruplays = false) => {
  switch (nativeType) {
    case 'messages_started':
      return 'Mensagens iniciadas';
    case 'profile_visits':
      return 'Visitas ao perfil';
    case 'lead_forms':
      return 'Lead Forms';
    case 'site_leads':
      return 'Conversões de site';
    case 'video_views':
      return hasThruplays ? 'ThruPlays' : 'Views 3s';
    case 'followers':
      return 'Seguidores';
    case 'purchases':
      return 'Compras';
    default:
      return 'Resultados';
  }
};

const valueForNativeType = (
  nativeType: NativeResultType,
  computed: {
    leadForms?: number;
    siteLeads?: number;
    messagesStarted?: number;
    purchases?: number;
    profileVisits?: number;
    followers?: number;
    linkClicks?: number;
    clicks?: number;
    video3s?: number;
    thruplays?: number;
  },
) => {
  switch (nativeType) {
    case 'messages_started':
      return computed.messagesStarted ?? 0;
    case 'profile_visits':
      if ((computed.profileVisits ?? 0) > 0) return computed.profileVisits ?? 0;
      if ((computed.linkClicks ?? 0) > 0) return computed.linkClicks ?? 0;
      if ((computed.clicks ?? 0) > 0) return computed.clicks ?? 0;
      return 0;
    case 'lead_forms':
      return computed.leadForms ?? 0;
    case 'site_leads':
      return computed.siteLeads ?? 0;
    case 'video_views':
      return (computed.thruplays ?? 0) > 0 ? computed.thruplays ?? 0 : computed.video3s ?? 0;
    case 'followers':
      return computed.followers ?? 0;
    case 'purchases':
      return computed.purchases ?? 0;
    default:
      return undefined;
  }
};

const resolvePrimaryResult = (row: any, computed: {
  leadForms?: number;
  siteLeads?: number;
  messagesStarted?: number;
  purchases?: number;
  profileVisits?: number;
  followers?: number;
  linkClicks?: number;
  clicks?: number;
  video3s?: number;
  thruplays?: number;
  nativeContext?: NativeResultContext;
}) => {
  const nativeType = computed.nativeContext?.nativeType ?? 'unknown';

  const pick = (value: number | undefined, label: string) => ({ value: typeof value === 'number' ? value : undefined, label });

  if (nativeType !== 'unknown') {
    return pick(valueForNativeType(nativeType, computed), labelForNativeType(nativeType, (computed.thruplays ?? 0) > 0));
  }


  if ((computed.purchases ?? 0) > 0) return pick(computed.purchases, 'Compras');
  if ((computed.messagesStarted ?? 0) > 0) return pick(computed.messagesStarted, 'Mensagens iniciadas');
  if ((computed.siteLeads ?? 0) > 0) return pick(computed.siteLeads, 'Conversões de site');
  if ((computed.leadForms ?? 0) > 0) return pick(computed.leadForms, 'Lead Forms');
  if ((computed.followers ?? 0) > 0) return pick(computed.followers, 'Seguidores');
  if ((computed.profileVisits ?? 0) > 0) return pick(computed.profileVisits, 'Visitas ao perfil');
  if ((computed.linkClicks ?? 0) > 0) return pick(computed.linkClicks, 'Cliques no link');
  if ((computed.clicks ?? 0) > 0) return pick(computed.clicks, 'Cliques');
  if ((computed.thruplays ?? 0) > 0) return pick(computed.thruplays, 'ThruPlays');
  if ((computed.video3s ?? 0) > 0) return pick(computed.video3s, 'Views 3s');
  return pick(undefined, 'Resultados');
};

const resolveDominantNativeType = (rows: AdMetric[]): NativeResultType | null => {
  const spendByType = new Map<NativeResultType, number>();

  for (const row of rows) {
    if (row.spend <= 0) continue;
    const nativeType = row.nativeType ?? 'unknown';
    if (nativeType === 'unknown') continue;
    spendByType.set(nativeType, (spendByType.get(nativeType) ?? 0) + row.spend);
  }

  let dominant: NativeResultType | null = null;
  let maxSpend = -1;
  for (const [nativeType, spend] of spendByType.entries()) {
    if (spend > maxSpend) {
      dominant = nativeType;
      maxSpend = spend;
    }
  }

  return dominant;
};

const extractRoas = (purchaseRoas: any[] | undefined) => {
  if (!Array.isArray(purchaseRoas) || purchaseRoas.length === 0) return undefined;
  return purchaseRoas.reduce((sum, r) => sum + parseNumber(r.value), 0);
};

const buildPlatformBuckets = (row: { actions?: any[]; video_thruplay_watched_actions?: any[] }): PlatformBuckets => {
  const leadForms = extractLeadFormsFromActions(row.actions) ?? 0;
  const messagesStarted = extractMessagingConversationsFromActions(row.actions) ?? 0;
  const siteLeads = extractSiteLeadsFromActions(row.actions) ?? 0;
  const profileVisits = extractProfileVisitsFromActions(row.actions) ?? 0;
  const followers = extractFollowersFromActions(row.actions) ?? 0;
  const videoViews = extractVideo3sFromActions(row.actions) ?? 0;
  const thruplays = extractVideo15sFromActions(row.actions) ?? extractActionTotal(row.video_thruplay_watched_actions) ?? 0;
  const purchases = extractPurchasesFromActions(row.actions) ?? 0;

  return {
    leadForms,
    messagesStarted,
    siteLeads,
    businessLeads: leadForms + messagesStarted + siteLeads,
    profileVisits,
    followers,
    videoViews,
    thruplays,
    purchases,
  };
};

export const TrafficAnalytics: React.FC<TrafficAnalyticsProps> = ({ companyId }) => {
  const demoMode = !isSupabaseConfigured();

  const [activeTab, setActiveTab] = useState<TrafficTab>('meta');
  const [selectedLevel, setSelectedLevel] = useState<MetaLevel>('ad');
  const [comparisonData, setComparisonData] = useState<any[]>([]);
  const [campaignFilterId, setCampaignFilterId] = useState<string>('');
  const [adsetFilterId, setAdsetFilterId] = useState<string>('');
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  const [selectedAdsetIds, setSelectedAdsetIds] = useState<string[]>([]);

  const [datePreset, setDatePreset] = useState<DatePreset>('last_7d');
  const [dateSince, setDateSince] = useState<string>('');
  const [dateUntil, setDateUntil] = useState<string>('');
  const [dateDialogOpen, setDateDialogOpen] = useState(false);
  const [draftDatePreset, setDraftDatePreset] = useState<DatePreset>('last_7d');
  const [draftDateSince, setDraftDateSince] = useState<string>('');
  const [draftDateUntil, setDraftDateUntil] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);

  const [adAccounts, setAdAccounts] = useState<MetaAdAccount[]>([]);
  const [selectedAdAccountId, setSelectedAdAccountId] = useState<string>('');
  const [loadingAdAccounts, setLoadingAdAccounts] = useState(false);
  const [accountSearch, setAccountSearch] = useState('');
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);

  const [rows, setRows] = useState<AdMetric[]>([]);
  const [dashboardSummary, setDashboardSummary] = useState<TrafficDashboardSummary | null>(null);

  // Column presets (per-user)
  const [userId, setUserId] = useState<string | null>(null);
  const [presets, setPresets] = useState<TrafficViewPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(DEFAULT_PRESET_ID);
  const [visibleOptionalColumns, setVisibleOptionalColumns] = useState<OptionalMetricKey[]>([]);

  const [columnsModalOpen, setColumnsModalOpen] = useState(false);
  const [draftPresetName, setDraftPresetName] = useState('');
  const [draftOptionalColumns, setDraftOptionalColumns] = useState<OptionalMetricKey[]>([]);
  const [savingPreset, setSavingPreset] = useState(false);

  const facebookScopes = useMemo(() => normalizeScopes(META_SCOPES), []);
  const selectedDateRange = useMemo<DateRange | null>(() => {
    if (datePreset === 'custom') return normalizeDateRange(dateSince, dateUntil);
    return getRangeForPreset(datePreset);
  }, [datePreset, dateSince, dateUntil]);

  const selectedDateRangeLabel = useMemo(() => formatDateRangeLabel(selectedDateRange), [selectedDateRange]);

  const optionalColumnsDef: Record<OptionalMetricKey, TableColumn> = useMemo(
    () => ({
      impressions: { key: 'impressions', label: 'Impressões', render: (r) => formatNumber(r.impressions) },
      reach: { key: 'reach', label: 'Alcance', render: (r) => (r.reach != null ? formatNumber(r.reach) : '-') },
      clicks: { key: 'clicks', label: 'Cliques', render: (r) => (r.clicks != null ? formatNumber(r.clicks) : '-') },
      inlineLinkClicks: {
        key: 'inlineLinkClicks',
        label: 'Cliques no link',
        render: (r) => (r.inlineLinkClicks != null ? formatNumber(r.inlineLinkClicks) : '-'),
      },
      cpm: { key: 'cpm', label: 'CPM', render: (r) => (r.cpm != null ? formatCurrency(r.cpm) : '-') },
      frequency: { key: 'frequency', label: 'Frequência', render: (r) => (r.frequency != null ? r.frequency.toFixed(2) : '-') },
      cpc: { key: 'cpc', label: 'CPC', render: (r) => (r.cpc != null ? formatCurrency(r.cpc) : '-') },
      ctr: { key: 'ctr', label: 'CTR', render: (r) => (r.ctr != null ? `${r.ctr.toFixed(2)}%` : '-') },
      roas: { key: 'roas', label: 'ROAS', render: (r) => (r.roas != null ? r.roas.toFixed(2) : '-') },
    }),
    [],
  );

  const fixedColumnsPrefix: TableColumn[] = useMemo(
    () => [
      {
        key: 'status',
        label: 'Status',
        render: (r) => (
          <span
            className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
              r.status === 'active'
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border))]'
            }`}
          >
            {r.status === 'active' ? 'Ativo' : 'Pausado'}
          </span>
        ),
      },
      { key: 'spend', label: 'Investido', render: (r) => formatCurrency(r.spend) },
      {
        key: 'results',
        label: 'Resultados',
        render: (r) =>
          r.results != null ? (
            <div className="leading-tight">
              <div className="text-sm font-medium text-[hsl(var(--foreground))]">{formatNumber(r.results)}</div>
              <div className="text-xs text-[hsl(var(--muted-foreground))]">{r.resultLabel ?? 'Resultados'}</div>
            </div>
          ) : (
            '-'
          ),
      },
    ],
    [],
  );

  const fixedColumnsSuffix: TableColumn[] = useMemo(
    () => [
      { key: 'leads', label: 'Leads negocio', render: (r) => (r.leads ?? '-') },
      { key: 'cpa', label: 'Custo/lead', render: (r) => (r.cpa != null ? formatCurrency(r.cpa) : '-') },
      { key: 'hookRate', label: 'Hook Rate', render: (r) => (r.hookRate != null ? formatPercent(r.hookRate, 0) : '-') },
      { key: 'holdRate', label: 'Hold Rate', render: (r) => (r.holdRate != null ? formatPercent(r.holdRate, 0) : '-') },
      {
        key: 'scores',
        label: 'Scores',
        render: (r) => (
          <div className="flex gap-2 flex-wrap">
            {(r.scores ?? []).map((s) => (
              <span key={s.label} className="px-2 py-0.5 rounded bg-green-100 text-green-800 text-xs font-medium">
                {s.label}:{s.value}
              </span>
            ))}
            {!r.scores?.length && '-'}
          </div>
        ),
      },
      { key: 'idc', label: 'IDC', render: (r) => (r.idc != null ? r.idc : '-') },
      {
        key: 'classification',
        label: 'Classificação',
        render: (r) =>
          r.classification === 'otimo' ? (
            <span className="px-2 py-0.5 rounded bg-green-100 text-green-800 text-xs font-semibold">Ótimo</span>
          ) : r.classification === 'bom' ? (
            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 text-xs font-semibold">Bom</span>
          ) : r.classification === 'regular' ? (
            <span className="px-2 py-0.5 rounded bg-yellow-50 text-yellow-800 text-xs font-semibold">Regular</span>
          ) : r.classification === 'ruim' ? (
            <span className="px-2 py-0.5 rounded bg-red-50 text-red-800 text-xs font-semibold">Ruim</span>
          ) : (
            <span className="px-2 py-0.5 rounded bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] text-xs font-semibold">
              -
            </span>
          ),
      },
    ],
    [],
  );

  const fixedColumns: TableColumn[] = useMemo(() => [...fixedColumnsPrefix, ...fixedColumnsSuffix], [fixedColumnsPrefix, fixedColumnsSuffix]);

  const tableColumns: TableColumn[] = useMemo(() => {
    const optional = visibleOptionalColumns.map((k) => optionalColumnsDef[k]).filter(Boolean);
    return [...fixedColumnsPrefix, ...optional, ...fixedColumnsSuffix];
  }, [fixedColumnsPrefix, fixedColumnsSuffix, optionalColumnsDef, visibleOptionalColumns]);

  const presetsStorageKey = (uid: string, level: MetaLevel) => `cr8:traffic:presets:${uid}:${level}`;
  const activePresetStorageKey = (uid: string, level: MetaLevel) => `cr8:traffic:activePreset:${uid}:${level}`;

  const getAuthUserId = async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data.user?.id ?? null;
  };

  const getProviderToken = async () => resolveMetaToken(companyId ?? null);

  const resolveCompanyAdAccountIdFromDb = async () => {
    let query = supabase.from('companies').select('meta_ad_account_id');
    if (companyId) query = query.eq('id', companyId);
    const { data, error } = await query.limit(1).maybeSingle();
    if (error) throw error;
    return normalizeAdAccountId(data?.meta_ad_account_id ?? '');
  };

  const persistSelectedAdAccount = async (adAccountId: string) => {
    if (!companyId) return;
    const { error } = await supabase.from('companies').update({ meta_ad_account_id: adAccountId }).eq('id', companyId);
    if (error) throw error;
  };

  const fetchAllAdAccounts = async (providerToken: string) => {
    const results: MetaAdAccount[] = [];
    let nextUrl: string | null = null;

    const buildFirstUrl = () => {
      const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/me/adaccounts`);
      url.searchParams.set('fields', 'id,name');
      url.searchParams.set('limit', '50');
      url.searchParams.set('access_token', providerToken);
      return url.toString();
    };

    for (let page = 0; page < 5; page += 1) {
      const url: string = nextUrl ?? buildFirstUrl();
      const res: Response = await fetch(url);
      const json: any = await res.json();
      if (!res.ok || json?.error) {
        const msg = json?.error?.message || `Erro ao listar contas de anúncio (${res.status})`;
        throw Object.assign(new Error(msg), { metaError: json?.error });
      }

      const pageRows: MetaAdAccount[] = Array.isArray(json?.data) ? json.data : [];
      for (const row of pageRows) {
        if (row?.id) results.push(row);
      }

      nextUrl = typeof json?.paging?.next === 'string' ? json.paging.next : null;
      if (!nextUrl) break;
    }

    return results;
  };

  const fetchAdThumbnails = async (providerToken: string, adIds: string[]) => {
    if (adIds.length === 0) return new Map<string, { thumbnail: string; imageUrl?: string }>();
    const ids = Array.from(new Set(adIds)).slice(0, 50);

    const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/`);
    url.searchParams.set('ids', ids.join(','));
    url.searchParams.set('fields', 'creative{thumbnail_url,image_url}');
    url.searchParams.set('access_token', providerToken);

    const res = await fetch(url.toString());
    const json = await res.json();
    if (!res.ok || json?.error) return new Map<string, { thumbnail: string; imageUrl?: string }>();

    const out = new Map<string, { thumbnail: string; imageUrl?: string }>();
    for (const id of ids) {
      const node = json?.[id];
      const imageUrl: string | undefined = node?.creative?.image_url;
      const thumb: string | undefined = node?.creative?.thumbnail_url || imageUrl;
      if (thumb) out.set(id, { thumbnail: thumb, imageUrl });
    }
    return out;
  };

  const chunk = <T,>(items: T[], size: number) => {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
  };

  const mapMetaEffectiveStatusToLocal = (effectiveStatus?: string): AdMetric['status'] => {
    const s = String(effectiveStatus ?? '').toUpperCase();
    if (!s) return 'active';
    if (s.includes('PAUSED') || s.includes('ARCHIVED') || s.includes('DELETED') || s.includes('DISAPPROVED')) return 'paused';
    return 'active';
  };

  const fetchEffectiveStatusesByIds = async (providerToken: string, entityIds: string[]) => {
    const out = new Map<string, string>();
    const ids = Array.from(new Set(entityIds)).filter(Boolean);
    for (const group of chunk(ids, 50)) {
      const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/`);
      url.searchParams.set('ids', group.join(','));
      url.searchParams.set('fields', 'effective_status');
      url.searchParams.set('access_token', providerToken);

      const res = await fetch(url.toString());
      const json = await res.json();
      if (!res.ok || json?.error) continue;

      for (const id of group) {
        const node = json?.[id];
        const eff: string | undefined = node?.effective_status;
        if (eff) out.set(id, eff);
      }
    }
    return out;
  };

  const fetchCampaignMetadataByIds = async (providerToken: string, campaignIds: string[]) => {
    const out = new Map<string, CampaignMetaNode>();
    const ids = Array.from(new Set(campaignIds)).filter(Boolean);
    for (const group of chunk(ids, 50)) {
      const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/`);
      url.searchParams.set('ids', group.join(','));
      url.searchParams.set('fields', 'objective');
      url.searchParams.set('access_token', providerToken);

      const res = await fetch(url.toString());
      const json = await res.json();
      if (!res.ok || json?.error) continue;

      for (const id of group) {
        const node = json?.[id];
        out.set(id, { objective: node?.objective != null ? String(node.objective) : undefined });
      }
    }
    return out;
  };

  const fetchAdsetMetadataByIds = async (providerToken: string, adsetIds: string[]) => {
    const out = new Map<string, AdsetMetaNode>();
    const ids = Array.from(new Set(adsetIds)).filter(Boolean);
    for (const group of chunk(ids, 50)) {
      const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/`);
      url.searchParams.set('ids', group.join(','));
      url.searchParams.set('fields', 'campaign_id,destination_type,optimization_goal,promoted_object');
      url.searchParams.set('access_token', providerToken);

      const res = await fetch(url.toString());
      const json = await res.json();
      if (!res.ok || json?.error) continue;

      for (const id of group) {
        const node = json?.[id];
        out.set(id, {
          campaignId: node?.campaign_id != null ? String(node.campaign_id) : undefined,
          destinationType: node?.destination_type != null ? String(node.destination_type) : undefined,
          optimizationGoal: node?.optimization_goal != null ? String(node.optimization_goal) : undefined,
          promotedObject: node?.promoted_object && typeof node.promoted_object === 'object' ? node.promoted_object : null,
        });
      }
    }
    return out;
  };

  const buildNativeContext = (
    sourceLevel: NativeResultContext['sourceLevel'],
    signal: {
      objective?: unknown;
      destinationType?: unknown;
      optimizationGoal?: unknown;
      promotedObject?: Record<string, unknown> | null;
      nameHint?: unknown;
    },
  ): NativeResultContext => ({
    nativeType: inferNativeTypeFromContext(signal),
    sourceLevel,
    destinationType: signal.destinationType != null ? String(signal.destinationType) : undefined,
    optimizationGoal: signal.optimizationGoal != null ? String(signal.optimizationGoal) : undefined,
    objective: signal.objective != null ? String(signal.objective) : undefined,
  });

  const chooseDominantContext = (spendByType: Map<NativeResultType, number>, sampleByType: Map<NativeResultType, NativeResultContext>) => {
    let winner: NativeResultType = 'unknown';
    let winnerSpend = -1;
    for (const [nativeType, spend] of spendByType.entries()) {
      if (nativeType === 'unknown') continue;
      if (spend > winnerSpend) {
        winnerSpend = spend;
        winner = nativeType;
      }
    }
    return sampleByType.get(winner) ?? { nativeType: 'unknown', sourceLevel: 'inferred' as const };
  };

  const buildNativeTypeOverrideMapsFromAdInsights = async (
    providerToken: string,
    adInsightRows: any[],
  ): Promise<NativeTypeOverrideMaps> => {
    const adsetIds = adInsightRows.map((row) => String(row.adset_id ?? '')).filter(Boolean);
    const adsetMeta = await fetchAdsetMetadataByIds(providerToken, adsetIds);
    const campaignIds = Array.from(
      new Set(
        adInsightRows
          .map((row) => String(row.campaign_id ?? adsetMeta.get(String(row.adset_id ?? ''))?.campaignId ?? ''))
          .filter(Boolean),
      ),
    );
    const campaignMeta = await fetchCampaignMetadataByIds(providerToken, campaignIds);

    const adsetSpend = new Map<string, Map<NativeResultType, number>>();
    const adsetSample = new Map<string, Map<NativeResultType, NativeResultContext>>();
    const campaignSpend = new Map<string, Map<NativeResultType, number>>();
    const campaignSample = new Map<string, Map<NativeResultType, NativeResultContext>>();

    for (const row of adInsightRows) {
      const adsetId = String(row.adset_id ?? '');
      const campaignId = String(row.campaign_id ?? adsetMeta.get(adsetId)?.campaignId ?? '');
      const adsetNode = adsetMeta.get(adsetId);
      const campaignNode = campaignMeta.get(campaignId);
      const context = buildNativeContext('ad', {
        objective: row.objective ?? campaignNode?.objective,
        destinationType: adsetNode?.destinationType,
        optimizationGoal: adsetNode?.optimizationGoal,
        promotedObject: adsetNode?.promotedObject ?? null,
        nameHint: `${row.ad_name ?? ''} ${row.adset_name ?? ''} ${row.campaign_name ?? ''}`,
      });
      const spend = parseNumber(row.spend);

      if (adsetId) {
        if (!adsetSpend.has(adsetId)) adsetSpend.set(adsetId, new Map());
        if (!adsetSample.has(adsetId)) adsetSample.set(adsetId, new Map());
        const next = (adsetSpend.get(adsetId)?.get(context.nativeType) ?? 0) + spend;
        adsetSpend.get(adsetId)!.set(context.nativeType, next);
        adsetSample.get(adsetId)!.set(context.nativeType, context);
      }

      if (campaignId) {
        if (!campaignSpend.has(campaignId)) campaignSpend.set(campaignId, new Map());
        if (!campaignSample.has(campaignId)) campaignSample.set(campaignId, new Map());
        const next = (campaignSpend.get(campaignId)?.get(context.nativeType) ?? 0) + spend;
        campaignSpend.get(campaignId)!.set(context.nativeType, next);
        campaignSample.get(campaignId)!.set(context.nativeType, context);
      }
    }

    const byCampaignId = new Map<string, NativeResultContext>();
    const byAdsetId = new Map<string, NativeResultContext>();

    for (const [campaignId, spendByType] of campaignSpend.entries()) {
      byCampaignId.set(campaignId, chooseDominantContext(spendByType, campaignSample.get(campaignId) ?? new Map()));
    }
    for (const [adsetId, spendByType] of adsetSpend.entries()) {
      byAdsetId.set(adsetId, chooseDominantContext(spendByType, adsetSample.get(adsetId) ?? new Map()));
    }

    return { byCampaignId, byAdsetId };
  };

  const buildInsightsFilters = (level: InsightsScopeLevel) => {
    const filters: any[] = [];
    const campaignIds = selectedCampaignIds.length ? selectedCampaignIds : campaignFilterId ? [campaignFilterId] : [];
    const adsetIds = selectedAdsetIds.length ? selectedAdsetIds : adsetFilterId ? [adsetFilterId] : [];

    if (campaignIds.length) {
      filters.push({ field: 'campaign.id', operator: 'IN', value: campaignIds });
    }
    if ((level === 'ad' || level === 'adset' || level === 'account') && adsetIds.length) {
      filters.push({ field: 'adset.id', operator: 'IN', value: adsetIds });
    }

    return filters;
  };

  const applyTimeRange = (url: URL, override?: { start?: string; end?: string }) => {
    const range = normalizeDateRange(override?.start, override?.end) ?? selectedDateRange;
    if (range) {
      url.searchParams.set('time_range', JSON.stringify({ since: range.start, until: range.end }));
      return;
    }

    url.searchParams.set('date_preset', 'last_7d');
  };

  const fetchMetaCollection = async (startUrl: string, pageLimit = 20) => {
    const rows: any[] = [];
    let nextUrl: string | null = startUrl;

    for (let page = 0; page < pageLimit && nextUrl; page += 1) {
      const res: Response = await fetch(nextUrl);
      const json: any = await res.json();
      if (!res.ok || json?.error) {
        const err: any = new Error(json?.error?.message || `Erro ao buscar insights (${res.status})`);
        err.metaError = json?.error;
        throw err;
      }

      if (Array.isArray(json?.data)) rows.push(...json.data);
      nextUrl = typeof json?.paging?.next === 'string' ? json.paging.next : null;
    }

    return rows;
  };

  const resolveNativeContextForInsightRow = (
    row: any,
    level: MetaLevel,
    adsetMeta: Map<string, AdsetMetaNode>,
    campaignMeta: Map<string, CampaignMetaNode>,
    nativeOverrides?: NativeTypeOverrideMaps,
  ): NativeResultContext => {
    const adsetId = row?.adset_id != null ? String(row.adset_id) : '';
    const campaignId = row?.campaign_id != null ? String(row.campaign_id) : adsetMeta.get(adsetId)?.campaignId ?? '';
    const adsetNode = adsetMeta.get(adsetId);
    const campaignNode = campaignMeta.get(campaignId);
    const baseContext = buildNativeContext(level === 'campaign' ? 'campaign' : level === 'adset' ? 'adset' : 'ad', {
      objective: row?.objective ?? campaignNode?.objective,
      destinationType: adsetNode?.destinationType,
      optimizationGoal: adsetNode?.optimizationGoal,
      promotedObject: adsetNode?.promotedObject ?? null,
      nameHint: `${row?.ad_name ?? ''} ${row?.adset_name ?? ''} ${row?.campaign_name ?? ''}`,
    });
    const needsOverride =
      baseContext.nativeType === 'unknown' || isGenericObjective(normalizeObjective(baseContext.objective));

    if (level === 'campaign' && campaignId && needsOverride) {
      return nativeOverrides?.byCampaignId.get(campaignId) ?? baseContext;
    }
    if (level === 'adset' && adsetId && needsOverride) {
      return nativeOverrides?.byAdsetId.get(adsetId) ?? baseContext;
    }
    return baseContext;
  };

  const mapInsightRowsToMetrics = async (
    providerToken: string,
    adAccountId: string,
    adAccountName: string | null,
    insightRows: any[],
    level: MetaLevel,
    nativeOverrides?: NativeTypeOverrideMaps,
  ): Promise<AdMetric[]> => {
    const entityIds = insightRows
      .map((row) => (level === 'campaign' ? row.campaign_id : level === 'adset' ? row.adset_id : row.ad_id))
      .filter(Boolean)
      .map((v) => String(v));
    const adsetIds = insightRows.map((row) => String(row?.adset_id ?? '')).filter(Boolean);
    const campaignIds = Array.from(new Set(insightRows.map((row) => String(row?.campaign_id ?? '')).filter(Boolean)));

    const [effectiveStatuses, adsetMeta, campaignMeta] = await Promise.all([
      fetchEffectiveStatusesByIds(providerToken, entityIds),
      fetchAdsetMetadataByIds(providerToken, adsetIds),
      fetchCampaignMetadataByIds(providerToken, campaignIds),
    ]);

    const mapped: AdMetric[] = insightRows.map((row: any) => {
      const entityId = level === 'campaign' ? row.campaign_id : level === 'adset' ? row.adset_id : row.ad_id;
      const entityName = level === 'campaign' ? row.campaign_name : level === 'adset' ? row.adset_name : row.ad_name;

      const impressions = Math.floor(parseNumber(row.impressions));
      const spend = parseNumber(row.spend);
      const buckets = buildPlatformBuckets(row);
      const roas = extractRoas(row.purchase_roas);

      const hookRate = impressions > 0 && buckets.videoViews > 0 ? buckets.videoViews / impressions : undefined;
      const holdRate = impressions > 0 && buckets.thruplays > 0 ? buckets.thruplays / impressions : undefined;

      const linkClicks = row.inline_link_clicks != null ? Math.floor(parseNumber(row.inline_link_clicks)) : undefined;
      const clicks = row.clicks != null ? Math.floor(parseNumber(row.clicks)) : undefined;
      const performanceClicks = typeof linkClicks === 'number' && linkClicks > 0 ? linkClicks : clicks;
      const ctr = typeof performanceClicks === 'number' && impressions > 0 ? (performanceClicks / impressions) * 100 : undefined;
      const nativeContext = resolveNativeContextForInsightRow(row, level, adsetMeta, campaignMeta, nativeOverrides);
      const primary = resolvePrimaryResult(row, {
        leadForms: buckets.leadForms,
        siteLeads: buckets.siteLeads,
        messagesStarted: buckets.messagesStarted,
        purchases: buckets.purchases,
        profileVisits: buckets.profileVisits,
        followers: buckets.followers,
        linkClicks,
        clicks,
        video3s: buckets.videoViews,
        thruplays: buckets.thruplays,
        nativeContext,
      });
      const results = primary.value;
      const costPerResult = typeof results === 'number' && results > 0 ? spend / results : undefined;

      const subtitle =
        level === 'campaign'
          ? `Conta: ${adAccountName ?? adAccountId}`
          : level === 'adset'
            ? `Campanha: ${row.campaign_name ?? row.campaign_id ?? '-'}`
            : `Conjunto: ${row.adset_name ?? row.adset_id ?? '-'} • Campanha: ${row.campaign_name ?? row.campaign_id ?? '-'}`;

      const baseThumb =
        level === 'campaign'
          ? svgAvatarDataUrl(adAccountName ?? adAccountId, '#1F2937', '#EEF2FF')
          : level === 'adset'
            ? svgAvatarDataUrl(String(row.campaign_name ?? 'CP'), '#1F2937', '#ECFDF5')
            : svgAvatarDataUrl(String(entityName ?? 'AD'), '#1F2937', '#F3F4F6');

      const tags: string[] = [];
      const nameLower = String(entityName ?? '').toLowerCase();
      if (nameLower.includes('depoimento') || nameLower.includes('prova')) tags.push('Prova Social');
      if (tags.length === 0) tags.push('Em teste');

      return {
        id: String(entityId),
        adName: entityName ?? `${level} ${entityId}`,
        adId: String(entityId),
        subtitle,
        thumbnail: baseThumb,
        campaignId:
          level === 'campaign'
            ? String(entityId)
            : row.campaign_id != null
              ? String(row.campaign_id)
              : undefined,
        campaignName:
          level === 'campaign'
            ? (row.campaign_name != null ? String(row.campaign_name) : entityName != null ? String(entityName) : undefined)
            : row.campaign_name != null
              ? String(row.campaign_name)
              : undefined,
        adsetId:
          level === 'adset'
            ? String(entityId)
            : row.adset_id != null
              ? String(row.adset_id)
              : undefined,
        adsetName:
          level === 'adset'
            ? (row.adset_name != null ? String(row.adset_name) : entityName != null ? String(entityName) : undefined)
            : row.adset_name != null
              ? String(row.adset_name)
              : undefined,
        results,
        resultLabel: primary.label,
        costPerResult,
        status: mapMetaEffectiveStatusToLocal(effectiveStatuses.get(String(entityId))),
        spend,
        impressions,
        reach: row.reach != null ? Math.floor(parseNumber(row.reach)) : undefined,
        clicks,
        inlineLinkClicks: linkClicks,
        cpm: row.cpm != null ? parseNumber(row.cpm) : undefined,
        frequency: row.frequency != null ? parseNumber(row.frequency) : undefined,
        leads: buckets.businessLeads > 0 ? buckets.businessLeads : undefined,
        messagesStarted: buckets.messagesStarted,
        leadForms: buckets.leadForms,
        siteLeads: buckets.siteLeads,
        videoViews: buckets.videoViews,
        thruplays: buckets.thruplays,
        cpc: typeof performanceClicks === 'number' && performanceClicks > 0 ? spend / performanceClicks : undefined,
        ctr,
        roas,
        cpa: buckets.businessLeads > 0 ? spend / buckets.businessLeads : undefined,
        hookRate,
        holdRate,
        profileVisits: buckets.profileVisits,
        followers: buckets.followers,
        nativeType: nativeContext.nativeType,
        nativeResultContext: nativeContext,
        tags,
      };
    });

    if (level === 'ad' && mapped.length > 0) {
      const adIds = mapped.map((r) => r.adId);
      const thumbs = await fetchAdThumbnails(providerToken, adIds);
      for (const row of mapped) {
        const info = thumbs.get(row.adId);
        if (info?.thumbnail) row.thumbnail = info.thumbnail;
        if (info?.imageUrl) row.imageUrl = info.imageUrl;
      }
    }

    return mapped;
  };

  const fetchInsightRowsFromMeta = async (
    providerToken: string,
    adAccountId: string,
    periodOverride: { start?: string; end?: string } | undefined,
    level: MetaLevel,
  ) => {
    const insightsUrl = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${adAccountId}/insights`);
    insightsUrl.searchParams.set('level', level);
    const filters = buildInsightsFilters(level);
    if (filters.length) insightsUrl.searchParams.set('filtering', JSON.stringify(filters));
    insightsUrl.searchParams.set(
      'fields',
      [
        level === 'campaign'
          ? 'campaign_id,campaign_name'
          : level === 'adset'
            ? 'adset_id,adset_name,campaign_id,campaign_name'
            : 'ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name',
        'objective,impressions,reach,clicks,inline_link_clicks,cpm,frequency,spend,cpc,ctr,actions,purchase_roas,video_thruplay_watched_actions',
      ].join(','),
    );
    applyTimeRange(insightsUrl, periodOverride);
    insightsUrl.searchParams.set('limit', '100');
    insightsUrl.searchParams.set('access_token', providerToken);
    return fetchMetaCollection(insightsUrl.toString());
  };

  const fetchTrafficRowsFromMeta = async (
    providerToken: string,
    adAccountId: string,
    adAccountName: string | null,
    periodOverride?: { start?: string; end?: string },
    level: MetaLevel = selectedLevel,
    nativeOverrides?: NativeTypeOverrideMaps,
  ) => {
    const insightRows = await fetchInsightRowsFromMeta(providerToken, adAccountId, periodOverride, level);
    const resolvedOverrides =
      nativeOverrides ??
      (level === 'ad'
        ? undefined
        : await fetchInsightRowsFromMeta(providerToken, adAccountId, periodOverride, 'ad').then((adRows) =>
            buildNativeTypeOverrideMapsFromAdInsights(providerToken, adRows),
          ));
    return mapInsightRowsToMetrics(providerToken, adAccountId, adAccountName, insightRows, level, resolvedOverrides);
  };

  const fetchAccountSummary = async (
    providerToken: string,
    adAccountId: string,
    periodOverride: { start: string; end: string },
  ): Promise<{ media: ReportMediaSummary; platform: ReportPlatformSummary }> => {
    const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${adAccountId}/insights`);
    url.searchParams.set(
      'fields',
      'impressions,reach,clicks,inline_link_clicks,spend,cpc,cpm,ctr,frequency,actions,video_thruplay_watched_actions',
    );
    url.searchParams.set('level', 'account');
    const filters = buildInsightsFilters('account');
    if (filters.length) url.searchParams.set('filtering', JSON.stringify(filters));
    applyTimeRange(url, periodOverride);
    url.searchParams.set('limit', '1');
    url.searchParams.set('access_token', providerToken);

    const data = await fetchMetaCollection(url.toString(), 1);
    const row = data[0] ?? {};
    const platform = buildPlatformBuckets(row);
    const impressions = parseNumber(row.impressions);
    const clicks = parseNumber(row.clicks);
    const reach = parseNumber(row.reach);
    const invest = parseNumber(row.spend);
    const linkClicks = parseNumber(row.inline_link_clicks);
    const performanceClicks = linkClicks > 0 ? linkClicks : clicks;

    return {
      media: {
        invest,
        impressions,
        reach,
        clicks,
        linkClicks,
        ctr: impressions > 0 ? (performanceClicks / impressions) * 100 : 0,
        cpc: performanceClicks > 0 ? invest / performanceClicks : 0,
        cpm: impressions > 0 ? (invest / impressions) * 1000 : 0,
        frequency: reach > 0 ? impressions / reach : 0,
      },
      platform,
    };
  };

  const fetchAccountTimeseries = async (
    providerToken: string,
    adAccountId: string,
    periodOverride: { start: string; end: string },
  ) => {
    const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${adAccountId}/insights`);
    url.searchParams.set('level', 'account');
    url.searchParams.set('fields', 'date_start,spend,impressions,actions,video_thruplay_watched_actions');
    url.searchParams.set('time_increment', '1');
    const filters = buildInsightsFilters('account');
    if (filters.length) url.searchParams.set('filtering', JSON.stringify(filters));
    applyTimeRange(url, periodOverride);
    url.searchParams.set('limit', '100');
    url.searchParams.set('access_token', providerToken);

    const rows = await fetchMetaCollection(url.toString());
    return buildComparisonSeries(rows, periodOverride, (row: any) => {
      const buckets = buildPlatformBuckets(row);
      return {
        metaSpend: parseNumber(row.spend),
        metaLeads: buckets.businessLeads,
      };
    });
  };

  const fetchCrmBusinessSummary = async (
    periodStart: string,
    periodEnd: string,
    platform: ReportPlatformSummary,
  ): Promise<ReportBusinessSummary> => {
    if (!companyId) {
      return { crmLeads: 0, won: 0, revenue: 0, pendingFollowup: 0, leadSignals: platform.businessLeads };
    }

    const startIso = `${periodStart}T00:00:00.000Z`;
    const endDate = new Date(`${periodEnd}T00:00:00.000Z`);
    endDate.setUTCDate(endDate.getUTCDate() + 1);
    const endIso = endDate.toISOString();
    const pendingCutoff = new Date(endDate.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();

    const [
      crmLeadsRes,
      wonRes,
      revenueRes,
      pendingRes,
    ] = await Promise.all([
      supabase.from('leads').select('id', { count: 'exact', head: true }).eq('company_id', companyId).gte('created_at', startIso).lt('created_at', endIso),
      supabase.from('leads').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'won').gte('updated_at', startIso).lt('updated_at', endIso),
      supabase.from('leads').select('value').eq('company_id', companyId).eq('status', 'won').gte('updated_at', startIso).lt('updated_at', endIso),
      supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .not('status', 'in', '("won","lost")')
        .lt('created_at', pendingCutoff)
        .or(`last_interaction_at.is.null,last_interaction_at.lt.${pendingCutoff}`),
    ]);

    const revenue = (revenueRes.data ?? []).reduce((sum: number, row: any) => sum + parseNumber(row?.value), 0);

    return {
      crmLeads: Number(crmLeadsRes.count ?? 0),
      won: Number(wonRes.count ?? 0),
      revenue,
      pendingFollowup: Number(pendingRes.count ?? 0),
      leadSignals: platform.businessLeads + Number(crmLeadsRes.count ?? 0),
    };
  };

  const reauthorizeFacebook = async () => {
    setErrorMsg(null);
    setNeedsReauth(false);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'facebook',
      options: {
        scopes: facebookScopes,
        redirectTo: window.location.origin,
        queryParams: { auth_type: 'rerequest' },
      },
    });
    if (error) throw error;
  };

  const computeScores = (items: AdMetric[]) => {
    // IDC v2: Hook 30% + Hold 30% + CTR 25% + CPC 15% (normalizacao relativa)
    const hookValues = items.map((r) => r.hookRate ?? 0);
    const holdValues = items.map((r) => r.holdRate ?? 0);
    const ctrValues = items.map((r) => r.ctr ?? 0);
    const cpcValues = items.map((r) => r.cpc).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

    const [minHook, maxHook] = [Math.min(...hookValues), Math.max(...hookValues)];
    const [minHold, maxHold] = [Math.min(...holdValues), Math.max(...holdValues)];
    const [minCtr, maxCtr] = [Math.min(...ctrValues), Math.max(...ctrValues)];
    const [minCpc, maxCpc] = cpcValues.length ? [Math.min(...cpcValues), Math.max(...cpcValues)] : [0, 1];

    return items.map((row) => {
      const scoreHook = normalizeHigherBetter(row.hookRate ?? 0, minHook, maxHook);
      const scoreHold = normalizeHigherBetter(row.holdRate ?? 0, minHold, maxHold);
      const scoreCtr = normalizeHigherBetter(row.ctr ?? 0, minCtr, maxCtr);
      const scoreCpc = row.cpc != null && Number.isFinite(row.cpc) ? normalizeLowerBetter(row.cpc, minCpc, maxCpc) : 0;

      const hasHook = row.hookRate != null;
      const hasHold = row.holdRate != null;
      const hasCpc = row.cpc != null && Number.isFinite(row.cpc);

      // Pesos: Hook 30% + Hold 30% + CTR 25% + CPC 15%
      // Redistribui pesos quando metricas de video estao ausentes
      let idc01: number;
      if (hasHook && hasHold) {
        idc01 = scoreHook * 0.30 + scoreHold * 0.30 + scoreCtr * 0.25 + (hasCpc ? scoreCpc * 0.15 : scoreCtr * 0.15);
      } else if (hasHook || hasHold) {
        const vs = hasHook ? scoreHook : scoreHold;
        idc01 = vs * 0.50 + scoreCtr * 0.35 + (hasCpc ? scoreCpc * 0.15 : scoreCtr * 0.15);
      } else {
        idc01 = hasCpc ? scoreCtr * 0.625 + scoreCpc * 0.375 : scoreCtr;
      }

      const classification: AdMetric['classification'] =
        row.impressions === 0
          ? undefined
          : idc01 >= IDC_THRESHOLDS.otimo
            ? 'otimo'
            : idc01 >= IDC_THRESHOLDS.bom
              ? 'bom'
              : idc01 >= IDC_THRESHOLDS.regular
                ? 'regular'
                : 'ruim';

      const scores = [
        ...(hasHook ? [{ label: 'Hook', value: Math.round(scoreHook * 100) }] : []),
        ...(hasHold ? [{ label: 'Hold', value: Math.round(scoreHold * 100) }] : []),
        { label: 'CTR', value: Math.round(scoreCtr * 100) },
        ...(hasCpc ? [{ label: 'CPC', value: Math.round(scoreCpc * 100) }] : []),
      ];

      const tags = [...(row.tags ?? [])];
      if (classification === 'otimo') tags.unshift('Quente');

      return { ...row, scores, idc: Math.round(idc01 * 100), classification, tags };
    });
  };

  const readLocalPresets = (uid: string, level: MetaLevel): TrafficViewPreset[] => {
    try {
      const raw = localStorage.getItem(presetsStorageKey(uid, level));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string' && Array.isArray(p.optionalColumns))
        .map((p) => ({
          id: String(p.id),
          name: String(p.name),
          level,
          optionalColumns: (p.optionalColumns as any[]).filter(Boolean) as OptionalMetricKey[],
        }));
    } catch {
      return [];
    }
  };

  const writeLocalPresets = (uid: string, level: MetaLevel, rows: TrafficViewPreset[]) => {
    localStorage.setItem(presetsStorageKey(uid, level), JSON.stringify(rows));
  };

  const persistActivePreset = (uid: string, level: MetaLevel, presetId: string) => {
    localStorage.setItem(activePresetStorageKey(uid, level), presetId);
  };

  const loadPresets = async (uid: string, level: MetaLevel) => {
    const base: TrafficViewPreset[] = [{ id: DEFAULT_PRESET_ID, name: DEFAULT_PRESET_NAME, level, optionalColumns: [] }];

    try {
      const { data, error } = await supabase
        .from('traffic_view_presets')
        .select('id,name,level,optional_columns')
        .eq('user_id', uid)
        .eq('level', level);
      if (error) throw error;

      const remote = (data ?? []).map((row: any) => ({
        id: String(row.id),
        name: String(row.name),
        level: row.level as MetaLevel,
        optionalColumns: (row.optional_columns ?? []) as OptionalMetricKey[],
      }));

      const merged = [...base, ...remote];
      setPresets(merged);

      const storedActive = localStorage.getItem(activePresetStorageKey(uid, level)) ?? DEFAULT_PRESET_ID;
      const activeId = merged.some((p) => p.id === storedActive) ? storedActive : DEFAULT_PRESET_ID;
      setSelectedPresetId(activeId);
      const active = merged.find((p) => p.id === activeId);
      setVisibleOptionalColumns(active?.optionalColumns ?? []);
      return;
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      const missingTable =
        msg.includes('traffic_view_presets') && (msg.includes('does not exist') || msg.includes('relation') || msg.includes('42P01'));
      if (!missingTable) console.warn('Falha ao carregar presets do Supabase, usando localStorage.', e);
    }

    const local = readLocalPresets(uid, level);
    const merged = [...base, ...local];
    setPresets(merged);

    const storedActive = localStorage.getItem(activePresetStorageKey(uid, level)) ?? DEFAULT_PRESET_ID;
    const activeId = merged.some((p) => p.id === storedActive) ? storedActive : DEFAULT_PRESET_ID;
    setSelectedPresetId(activeId);
    const active = merged.find((p) => p.id === activeId);
    setVisibleOptionalColumns(active?.optionalColumns ?? []);
  };

  const savePreset = async (uid: string, level: MetaLevel, presetId: string | null, name: string, optionalColumns: OptionalMetricKey[]) => {
    const payload = { user_id: uid, level, name, optional_columns: optionalColumns };

    try {
      if (presetId && presetId !== DEFAULT_PRESET_ID) {
        const { error } = await supabase.from('traffic_view_presets').update(payload).eq('id', presetId).eq('user_id', uid);
        if (error) throw error;
        return presetId;
      }

      const { data, error } = await supabase.from('traffic_view_presets').insert(payload).select('id').single();
      if (error) throw error;
      return String((data as any).id);
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      const missingTable =
        msg.includes('traffic_view_presets') && (msg.includes('does not exist') || msg.includes('relation') || msg.includes('42P01'));
      if (!missingTable) console.warn('Falha ao salvar preset no Supabase, usando localStorage.', e);
    }

    const existing = readLocalPresets(uid, level);
    const id = presetId && presetId !== DEFAULT_PRESET_ID ? presetId : `local_${Date.now()}`;
    const next = existing.filter((p) => p.id !== id).concat([{ id, name, level, optionalColumns }]);
    writeLocalPresets(uid, level, next);
    return id;
  };

  const deletePreset = async (uid: string, level: MetaLevel, presetId: string) => {
    if (presetId === DEFAULT_PRESET_ID) return;

    try {
      const { error } = await supabase.from('traffic_view_presets').delete().eq('id', presetId).eq('user_id', uid);
      if (error) throw error;
      return;
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      const missingTable =
        msg.includes('traffic_view_presets') && (msg.includes('does not exist') || msg.includes('relation') || msg.includes('42P01'));
      if (!missingTable) console.warn('Falha ao excluir preset no Supabase, usando localStorage.', e);
    }

    const existing = readLocalPresets(uid, level);
    writeLocalPresets(uid, level, existing.filter((p) => p.id !== presetId));
  };

  const fetchTraffic = async (overrideAdAccountId?: string) => {
    setErrorMsg(null);
    setNeedsReauth(false);

    if (demoMode) {
      setRows(computeScores(mockAds));
      setComparisonData(mockComparisonData);
      setDashboardSummary(null);
      return;
    }

    if (activeTab !== 'meta') return;
    if (datePreset === 'custom' && !selectedDateRange) {
      setErrorMsg('Selecione a data inicial e final do período.');
      return;
    }

    setLoading(true);
    try {
      const providerToken = await getProviderToken();
      if (!providerToken) {
        setRows([]);
        setDashboardSummary(null);
        setNeedsReauth(true);
        setErrorMsg('Para carregar dados reais, faça login com Facebook (escopo ads_read).');
        return;
      }

      let accounts = adAccounts;
      if (accounts.length === 0) {
        setLoadingAdAccounts(true);
        accounts = await fetchAllAdAccounts(providerToken);
        setAdAccounts(accounts);
        setLoadingAdAccounts(false);
      }

      const dbId = await resolveCompanyAdAccountIdFromDb();
      const envId = normalizeAdAccountId(META_AD_ACCOUNT_ID_ENV);
      const desired = overrideAdAccountId ?? (selectedAdAccountId || dbId || envId || '');
      const normalizedDesired = normalizeAdAccountId(desired) ?? '';
      const hasDesired = Boolean(normalizedDesired && accounts.some((a) => a.id === normalizedDesired));
      const fallback = accounts[0]?.id ?? '';
      const adAccountId = (hasDesired ? normalizedDesired : fallback) || normalizedDesired;
      const adAccountName = accounts.find((a) => a.id === adAccountId)?.name ?? null;

      if (!adAccountId) {
        setRows([]);
        setDashboardSummary(null);
        setErrorMsg(accounts.length === 0 ? 'Nenhuma conta de anúncio encontrada para esse usuário do Facebook.' : 'Selecione uma conta de anúncio.');
        return;
      }

      if (adAccountId !== selectedAdAccountId) setSelectedAdAccountId(adAccountId);
      if (companyId && dbId !== adAccountId) {
        try {
          await persistSelectedAdAccount(adAccountId);
        } catch {
          // ignore
        }
      }

      const timeseriesUrl = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${adAccountId}/insights`);
      timeseriesUrl.searchParams.set('level', 'account');
      timeseriesUrl.searchParams.set('fields', 'date_start,spend,impressions,actions');
      applyTimeRange(timeseriesUrl);
      timeseriesUrl.searchParams.set('time_increment', '1');
      timeseriesUrl.searchParams.set('limit', '50');
      timeseriesUrl.searchParams.set('access_token', providerToken);

      const tsRes = await fetch(timeseriesUrl.toString());
      const tsJson = await tsRes.json();
      if (tsRes.ok && !tsJson?.error) {
        const ts = Array.isArray(tsJson?.data) ? tsJson.data : [];
        setComparisonData(
          buildComparisonSeries(
            ts,
            selectedDateRange ?? getRangeForPreset('last_7d'),
            (row: any) => ({
              metaSpend: parseNumber(row.spend),
              metaLeads:
                (extractLeadFormsFromActions(row.actions) ?? 0) +
                (extractMessagingConversationsFromActions(row.actions) ?? 0) +
                (extractSiteLeadsFromActions(row.actions) ?? 0),
            }),
          ),
        );
      } else {
        setComparisonData([]);
      }

      const [accountSummary, nextMapped] = await Promise.all([
        fetchAccountSummary(providerToken, adAccountId, selectedDateRange ?? getRangeForPreset('last_7d')),
        fetchTrafficRowsFromMeta(providerToken, adAccountId, adAccountName),
      ]);
      setDashboardSummary({
        media: accountSummary.media,
        platform: accountSummary.platform,
        dominantNativeType: resolveDominantNativeType(nextMapped),
      });
      setRows(computeScores(nextMapped));
      if (nextMapped.length === 0) setErrorMsg('Sem dados para esse período.');
      return;

    } catch (e: any) {
      console.error(e);
      setRows([]);
      setDashboardSummary(null);

      const metaCode = e?.metaError?.code;
      if (metaCode === 200) {
        setNeedsReauth(true);
        setErrorMsg('Sem permissão ads_read para acessar essa conta. Reautorize o Facebook ou selecione outra conta.');
      } else {
        setErrorMsg(e?.message || 'Erro ao carregar dados da Meta.');
      }
    } finally {
      setLoading(false);
      setLoadingAdAccounts(false);
    }
  };

  useEffect(() => {
    if (demoMode) return;
    void (async () => {
      const uid = await getAuthUserId();
      setUserId(uid);
      if (uid) await loadPresets(uid, selectedLevel);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoMode, selectedLevel]);

  useEffect(() => {
    void fetchTraffic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, selectedLevel, activeTab, campaignFilterId, adsetFilterId, selectedCampaignIds, selectedAdsetIds, datePreset, dateSince, dateUntil]);

  const onChangeAdAccount = async (id: string) => {
    const normalized = normalizeAdAccountId(id);
    if (!normalized) return;
    setSelectedAdAccountId(normalized);
    try {
      await persistSelectedAdAccount(normalized);
    } catch {
      // ignore
    }
    await fetchTraffic(normalized);
  };

  const onChangeLevel = (level: MetaLevel) => {
    setSelectedLevel(level);
    if (level !== 'ad') setAdsetFilterId('');
  };

  const onChangeDatePreset = (nextPreset: DatePreset) => {
    setDatePreset(nextPreset);
    if (nextPreset !== 'custom') return;

    const fallbackRange = selectedDateRange ?? getRangeForPreset('this_month');
    setDateSince((prev) => prev || fallbackRange.start);
    setDateUntil((prev) => prev || fallbackRange.end);
  };

  const onChangeDateSince = (value: string) => {
    setDateSince(value);
    if (!value) return;
    setDateUntil((prev) => (!prev || prev < value ? value : prev));
  };

  const onChangeDateUntil = (value: string) => {
    setDateUntil(value);
    if (!value) return;
    setDateSince((prev) => (!prev || prev > value ? value : prev));
  };

  const openDateDialog = () => {
    setDraftDatePreset(datePreset);
    setDraftDateSince(dateSince || selectedDateRange?.start || getRangeForPreset('last_7d').start);
    setDraftDateUntil(dateUntil || selectedDateRange?.end || getRangeForPreset('last_7d').end);
    setDateDialogOpen(true);
  };

  const onChangeDraftDatePreset = (nextPreset: DatePreset) => {
    setDraftDatePreset(nextPreset);
    if (nextPreset === 'custom') {
      const fallbackRange = normalizeDateRange(draftDateSince, draftDateUntil) ?? selectedDateRange ?? getRangeForPreset('this_month');
      setDraftDateSince(fallbackRange.start);
      setDraftDateUntil(fallbackRange.end);
      return;
    }

    const nextRange = getRangeForPreset(nextPreset);
    setDraftDateSince(nextRange.start);
    setDraftDateUntil(nextRange.end);
  };

  const applyDateFilter = () => {
    if (draftDatePreset === 'custom') {
      const normalized = normalizeDateRange(draftDateSince, draftDateUntil);
      if (!normalized) {
        setErrorMsg('Selecione a data inicial e final do período.');
        return;
      }
      setDatePreset('custom');
      setDateSince(normalized.start);
      setDateUntil(normalized.end);
      setDateDialogOpen(false);
      return;
    }

    setDatePreset(draftDatePreset);
    setDateSince('');
    setDateUntil('');
    setDateDialogOpen(false);
  };

  const toggleCampaignSelection = (id: string) => {
    setSelectedCampaignIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleAdsetSelection = (id: string) => {
    setSelectedAdsetIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const clearSelections = (level: MetaLevel) => {
    if (level === 'campaign') {
      setSelectedCampaignIds([]);
      setSelectedAdsetIds([]);
      return;
    }
    if (level === 'adset') {
      setSelectedAdsetIds([]);
    }
  };

  const onSelectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    if (userId) persistActivePreset(userId, selectedLevel, presetId);
    const preset = presets.find((p) => p.id === presetId);
    setVisibleOptionalColumns(preset?.optionalColumns ?? []);
  };

  const openColumnsModal = () => {
    const current = presets.find((p) => p.id === selectedPresetId);
    setDraftPresetName(current && current.id !== DEFAULT_PRESET_ID ? current.name : '');
    setDraftOptionalColumns(visibleOptionalColumns);
    setColumnsModalOpen(true);
  };

  const toggleDraftColumn = (key: OptionalMetricKey) => {
    setDraftOptionalColumns((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const moveDraftColumn = (key: OptionalMetricKey, dir: -1 | 1) => {
    setDraftOptionalColumns((prev) => {
      const idx = prev.indexOf(key);
      if (idx === -1) return prev;
      const nextIdx = idx + dir;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const next = [...prev];
      const tmp = next[idx];
      next[idx] = next[nextIdx];
      next[nextIdx] = tmp;
      return next;
    });
  };

  const onSavePreset = async (mode: 'update' | 'create') => {
    if (!userId) {
      setErrorMsg('Sessão inválida. Recarregue a página.');
      return;
    }

    const name = (draftPresetName || '').trim();
    if (!name) {
      setErrorMsg('Digite um nome para a visualização.');
      return;
    }

    setSavingPreset(true);
    try {
      const isUpdating = mode === 'update' && selectedPresetId !== DEFAULT_PRESET_ID;
      const id = await savePreset(
        userId,
        selectedLevel,
        isUpdating ? selectedPresetId : null,
        name,
        draftOptionalColumns,
      );
      await loadPresets(userId, selectedLevel);
      onSelectPreset(id);
      setColumnsModalOpen(false);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message || 'Erro ao salvar visualização.');
    } finally {
      setSavingPreset(false);
    }
  };

  const onDeletePreset = async () => {
    if (!userId || selectedPresetId === DEFAULT_PRESET_ID) return;
    const ok = window.confirm('Excluir esta visualização?');
    if (!ok) return;

    setSavingPreset(true);
    try {
      await deletePreset(userId, selectedLevel, selectedPresetId);
      await loadPresets(userId, selectedLevel);
      onSelectPreset(DEFAULT_PRESET_ID);
      setColumnsModalOpen(false);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message || 'Erro ao excluir visualização.');
    } finally {
      setSavingPreset(false);
    }
  };

  const entityLabel = selectedLevel === 'campaign' ? 'Campanha' : selectedLevel === 'adset' ? 'Conjunto' : 'Anúncio';
  const scopedCampaignIds = selectedCampaignIds.length ? selectedCampaignIds : campaignFilterId ? [campaignFilterId] : [];
  const scopedAdsetIds = selectedAdsetIds.length ? selectedAdsetIds : adsetFilterId ? [adsetFilterId] : [];
  const reportHasScopedSelection = scopedCampaignIds.length > 0 || scopedAdsetIds.length > 0;
  const reportScopeLabel = scopedAdsetIds.length
    ? `${scopedAdsetIds.length} ${scopedAdsetIds.length === 1 ? 'conjunto selecionado' : 'conjuntos selecionados'}`
    : scopedCampaignIds.length
      ? `${scopedCampaignIds.length} ${scopedCampaignIds.length === 1 ? 'campanha selecionada' : 'campanhas selecionadas'}`
      : 'conta inteira';
  const presetOptions: TrafficViewPreset[] = presets.length
    ? presets
    : [{ id: DEFAULT_PRESET_ID, name: DEFAULT_PRESET_NAME, level: selectedLevel, optionalColumns: [] }];

  const campaignOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      if (r.campaignId) map.set(r.campaignId, r.campaignName || r.campaignId);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const adsetOptions = useMemo(() => {
    const campaignIds = selectedCampaignIds.length ? selectedCampaignIds : campaignFilterId ? [campaignFilterId] : [];
    const map = new Map<string, { name: string; campaignId?: string }>();
    for (const r of rows) {
      if (!r.adsetId) continue;
      map.set(r.adsetId, { name: r.adsetName || r.adsetId, campaignId: r.campaignId });
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, name: v.name, campaignId: v.campaignId }))
      .filter((o) => (campaignIds.length ? Boolean(o.campaignId && campaignIds.includes(o.campaignId)) : true))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, campaignFilterId, selectedCampaignIds]);

  const drillDown = (row: AdMetric) => {
    if (selectedLevel === 'campaign' && row.campaignId) {
      setCampaignFilterId(row.campaignId);
      setAdsetFilterId('');
      onChangeLevel('adset');
      return;
    }
    if (selectedLevel === 'adset' && row.adsetId) {
      if (row.campaignId) setCampaignFilterId(row.campaignId);
      setAdsetFilterId(row.adsetId);
      onChangeLevel('ad');
    }
  };

  const openInAdsManager = (entityId: string) => {
    const act = String(selectedAdAccountId ?? '').replace(/^act_/, '');
    if (!act || !entityId) return;
    const base =
      selectedLevel === 'campaign'
        ? 'https://www.facebook.com/adsmanager/manage/campaigns'
        : selectedLevel === 'adset'
          ? 'https://www.facebook.com/adsmanager/manage/adsets'
          : 'https://www.facebook.com/adsmanager/manage/ads';
    const url = `${base}?act=${encodeURIComponent(act)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const exportCsv = () => {
    const classificationLabel = (c?: AdMetric['classification']) =>
      c === 'otimo' ? 'Ótimo' : c === 'bom' ? 'Bom' : c === 'regular' ? 'Regular' : c === 'ruim' ? 'Ruim' : '';

    const exportValue = (key: string, r: AdMetric) => {
      switch (key) {
        case 'adName':
          return r.adName;
        case 'adId':
          return r.adId;
        case 'subtitle':
          return r.subtitle ?? '';
        case 'tags':
          return (r.tags ?? []).join(' | ');
        case 'status':
          return r.status === 'active' ? 'Ativo' : 'Pausado';
        case 'spend':
          return Number.isFinite(r.spend) ? r.spend.toFixed(2) : '';
        case 'impressions':
          return Number.isFinite(r.impressions) ? String(r.impressions) : '';
        case 'results':
          return r.results != null ? String(r.results) : '';
        case 'reach':
          return r.reach != null ? String(r.reach) : '';
        case 'clicks':
          return r.clicks != null ? String(r.clicks) : '';
        case 'inlineLinkClicks':
          return r.inlineLinkClicks != null ? String(r.inlineLinkClicks) : '';
        case 'cpm':
          return r.cpm != null ? r.cpm.toFixed(2) : '';
        case 'frequency':
          return r.frequency != null ? r.frequency.toFixed(2) : '';
        case 'cpc':
          return r.cpc != null ? r.cpc.toFixed(2) : '';
        case 'ctr':
          return r.ctr != null ? r.ctr.toFixed(2) : '';
        case 'roas':
          return r.roas != null ? r.roas.toFixed(2) : '';
        case 'leads':
          return r.leads != null ? String(r.leads) : '';
        case 'cpa':
          return r.cpa != null ? r.cpa.toFixed(2) : '';
        case 'hookRate':
          return r.hookRate != null ? (r.hookRate * 100).toFixed(2) : '';
        case 'holdRate':
          return r.holdRate != null ? (r.holdRate * 100).toFixed(2) : '';
        case 'scores':
          return (r.scores ?? []).map((s) => `${s.label}:${s.value}`).join(' | ');
        case 'idc':
          return r.idc != null ? String(r.idc) : '';
        case 'classification':
          return classificationLabel(r.classification);
        default:
          return '';
      }
    };

    const cols = [
      { label: entityLabel, key: 'adName' },
      { label: 'ID', key: 'adId' },
      { label: 'Contexto', key: 'subtitle' },
      ...tableColumns.map((c) => ({ label: c.label, key: c.key })),
      { label: 'Etiquetas', key: 'tags' },
    ];

    const escapeCell = (v: string) => {
      const s = String(v ?? '');
      const needs = /[",\n;]/.test(s);
      const cleaned = s.replace(/\r?\n/g, ' ').replace(/"/g, '""');
      return needs ? `"${cleaned}"` : cleaned;
    };

    const lines = [
      cols.map((c) => escapeCell(c.label)).join(';'),
      ...rows.map((r) => cols.map((c) => escapeCell(exportValue(c.key, r))).join(';')),
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cr8_traffic_${selectedLevel}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Report modal state
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportGenerating, setReportGenerating] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportPublicUrl, setReportPublicUrl] = useState<string | null>(null);
  const [reportTitle, setReportTitle] = useState('');
  const [reportClientName, setReportClientName] = useState('');
  const [reportAgencyName, setReportAgencyName] = useState('CR8');
  const [reportCopied, setReportCopied] = useState(false);

  const openReportModal = () => {
    setReportError(null);
    setReportPublicUrl(null);
    setReportCopied(false);
    const period = currentAnalysisPeriod();
    setReportTitle(`Relatorio ${period.start ?? ''} a ${period.end ?? ''}`);
    setReportModalOpen(true);
  };

  const calcPreviousPeriod = (start: string, end: string) => {
    const s = new Date(start + 'T00:00:00Z');
    const e = new Date(end + 'T00:00:00Z');
    const deltaMs = e.getTime() - s.getTime() + 86400000;
    const prevEnd = new Date(s.getTime() - 86400000);
    const prevStart = new Date(s.getTime() - deltaMs);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    return { start: iso(prevStart), end: iso(prevEnd) };
  };

  const generateReport = async () => {
    if (!companyId || !userId || rows.length === 0) return;
    setReportGenerating(true);
    setReportError(null);
    setReportPublicUrl(null);
    try {
      const period = currentAnalysisPeriod();
      const periodStart = period.start ?? new Date().toISOString().slice(0, 10);
      const periodEnd = period.end ?? new Date().toISOString().slice(0, 10);
      const prevDates = calcPreviousPeriod(periodStart, periodEnd);

      const providerToken = await getProviderToken();
      if (!providerToken) throw new Error('Faça login com Facebook para gerar um relatório real da Meta.');
      if (!selectedAdAccountId) throw new Error('Selecione uma conta de anúncio para gerar o relatório.');

      const selectedAccountName = adAccounts.find((a) => a.id === selectedAdAccountId)?.name ?? null;
      const [currentMeta, previousMeta, currentTimeseries, reportRows, topAdRows] = await Promise.all([
        fetchAccountSummary(providerToken, selectedAdAccountId, { start: periodStart, end: periodEnd }),
        fetchAccountSummary(providerToken, selectedAdAccountId, { start: prevDates.start, end: prevDates.end }),
        fetchAccountTimeseries(providerToken, selectedAdAccountId, { start: periodStart, end: periodEnd }),
        fetchTrafficRowsFromMeta(providerToken, selectedAdAccountId, selectedAccountName, { start: periodStart, end: periodEnd }, selectedLevel).then(computeScores),
        fetchTrafficRowsFromMeta(providerToken, selectedAdAccountId, selectedAccountName, { start: periodStart, end: periodEnd }, 'ad').then(computeScores),
      ]);
      const [currentBusiness, previousBusiness] = reportHasScopedSelection
        ? await Promise.all([
            Promise.resolve({
              crmLeads: 0,
              won: 0,
              revenue: 0,
              pendingFollowup: 0,
              leadSignals: currentMeta.platform.businessLeads,
            } satisfies ReportBusinessSummary),
            Promise.resolve({
              crmLeads: 0,
              won: 0,
              revenue: 0,
              pendingFollowup: 0,
              leadSignals: previousMeta.platform.businessLeads,
            } satisfies ReportBusinessSummary),
          ])
        : await Promise.all([
            fetchCrmBusinessSummary(periodStart, periodEnd, currentMeta.platform),
            fetchCrmBusinessSummary(prevDates.start, prevDates.end, previousMeta.platform),
          ]);

      const buildActiveObjectives = (currentPlatform: ReportPlatformSummary, previousPlatform: ReportPlatformSummary, currentBiz: ReportBusinessSummary, previousBiz: ReportBusinessSummary) => {
        const items = [
          { key: 'thruplays', label: 'ThruPlays', current: currentPlatform.thruplays, previous: previousPlatform.thruplays, layer: 'platform' },
          { key: 'videoViews', label: 'Views 3s', current: currentPlatform.videoViews, previous: previousPlatform.videoViews, layer: 'platform' },
          { key: 'profileVisits', label: 'Visitas ao perfil', current: currentPlatform.profileVisits, previous: previousPlatform.profileVisits, layer: 'platform' },
          { key: 'followers', label: 'Seguidores', current: currentPlatform.followers, previous: previousPlatform.followers, layer: 'platform' },
          { key: 'messagesStarted', label: 'Mensagens iniciadas', current: currentPlatform.messagesStarted, previous: previousPlatform.messagesStarted, layer: 'platform' },
          { key: 'leadForms', label: 'Lead Forms', current: currentPlatform.leadForms, previous: previousPlatform.leadForms, layer: 'platform' },
          { key: 'siteLeads', label: 'Conversões de site', current: currentPlatform.siteLeads, previous: previousPlatform.siteLeads, layer: 'platform' },
          { key: 'crmLeads', label: 'Leads no CRM', current: currentBiz.crmLeads, previous: previousBiz.crmLeads, layer: 'business' },
          { key: 'won', label: 'Won', current: currentBiz.won, previous: previousBiz.won, layer: 'business' },
        ];
        return items.filter((item) => item.current > 0 || item.previous > 0);
      };

      const currentSummaryLegacy = {
        ...currentMeta.media,
        results: currentBusiness.leadSignals,
        resultLabel: 'Leads de negócio',
        costPerResult: currentBusiness.leadSignals > 0 ? currentMeta.media.invest / currentBusiness.leadSignals : undefined,
        profileVisits: currentMeta.platform.profileVisits > 0 ? currentMeta.platform.profileVisits : undefined,
        followers: currentMeta.platform.followers > 0 ? currentMeta.platform.followers : undefined,
      };
      const previousSummaryLegacy = {
        ...previousMeta.media,
        results: previousBusiness.leadSignals,
        resultLabel: 'Leads de negócio',
        costPerResult: previousBusiness.leadSignals > 0 ? previousMeta.media.invest / previousBusiness.leadSignals : undefined,
        profileVisits: previousMeta.platform.profileVisits > 0 ? previousMeta.platform.profileVisits : undefined,
        followers: previousMeta.platform.followers > 0 ? previousMeta.platform.followers : undefined,
      };

      const campaignRows = reportRows.map((r) => ({
        name: r.adName,
        status: r.status,
        spend: r.spend,
        reach: r.reach ?? 0,
        impressions: r.impressions,
        results: r.results ?? 0,
        resultLabel: r.resultLabel ?? 'Resultados',
        costPerResult: r.costPerResult ?? 0,
        ctr: r.ctr ?? 0,
        cpc: r.cpc ?? 0,
        cpm: r.cpm ?? 0,
        frequency: r.frequency ?? 0,
        hookRate: r.hookRate,
        holdRate: r.holdRate,
        idc: r.idc,
        classification: r.classification,
      }));

      const campaignGroupMap = new Map<string, AdMetric[]>();
      for (const row of topAdRows.filter((item) => item.spend > 0)) {
        const key = row.campaignName ?? row.adsetName ?? 'Sem campanha';
        if (!campaignGroupMap.has(key)) campaignGroupMap.set(key, []);
        campaignGroupMap.get(key)!.push(row);
      }

      const topAds: any[] = [];
      for (const [, campRows] of campaignGroupMap) {
        const sorted = [...campRows].sort((a, b) => (b.idc ?? 0) - (a.idc ?? 0) || (b.results ?? 0) - (a.results ?? 0));
        for (const r of sorted.slice(0, 3)) {
          topAds.push({
            id: r.adId,
            name: r.adName,
            campaign: r.campaignName ?? r.adsetName ?? '',
            spend: r.spend,
            impressions: r.impressions,
            reach: r.reach ?? 0,
            ctr: r.ctr ?? 0,
            cpc: r.cpc ?? 0,
            cpm: r.cpm ?? 0,
            frequency: r.frequency ?? 0,
            results: r.results ?? 0,
            resultLabel: r.resultLabel ?? 'Resultados',
            hookRate: r.hookRate ?? 0,
            holdRate: r.holdRate ?? 0,
            idc: r.idc ?? 0,
            idcClass: r.classification === 'otimo' ? 'great' : r.classification === 'bom' ? 'good' : r.classification === 'regular' ? 'ok' : 'bad',
            thumbnailUrl: r.imageUrl ?? r.thumbnail,
          });
        }
      }
      topAds.sort((a, b) => b.idc - a.idc);

      const fmtDateBR = (iso: string) => {
        const p = iso.split('-');
        return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
      };

      const reportData: any = {
        schemaVersion: 2,
        clientName: reportClientName.trim() || 'Cliente',
        agencyName: reportAgencyName.trim() || 'CR8',
        level: selectedLevel,
        scope: reportHasScopedSelection ? 'selection' : 'account',
        scopeLabel: reportScopeLabel,
        periodCurrent: { label: `${fmtDateBR(periodStart)} a ${fmtDateBR(periodEnd)}`, start: periodStart, end: periodEnd },
        periodPrevious: { label: `${fmtDateBR(prevDates.start)} a ${fmtDateBR(prevDates.end)}`, start: prevDates.start, end: prevDates.end },
        current: currentSummaryLegacy,
        previous: previousSummaryLegacy,
        currentLayers: {
          media: currentMeta.media,
          platform: currentMeta.platform,
          business: currentBusiness,
        },
        previousLayers: {
          media: previousMeta.media,
          platform: previousMeta.platform,
          business: previousBusiness,
        },
        activeObjectives: buildActiveObjectives(currentMeta.platform, previousMeta.platform, currentBusiness, previousBusiness),
        timeseries: currentTimeseries,
        campaigns: campaignRows,
        topAds,
        insights: [] as string[],
        actionItems: [] as string[],
      };

      try {
        const local = loadLocalAiSettings(userId ?? '');
        if (local?.apiKey) {
          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData.session?.access_token;
          if (accessToken) {
            const aiRes = await fetch(`${getSupabaseUrl()}/functions/v1/ai-assistant`, {
              method: 'POST',
              headers: {
                apikey: getSupabaseAnonKey(),
                authorization: `Bearer ${accessToken}`,
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                mode: 'weekly_report',
                company_id: companyId,
                provider: local.provider,
                api_key: local.apiKey,
                model: local.model,
                access_token: accessToken,
                metrics: {
                  periodLabel: reportData.periodCurrent.label,
                  media: currentMeta.media,
                  platform: currentMeta.platform,
                  business: currentBusiness,
                  previousMedia: previousMeta.media,
                  previousPlatform: previousMeta.platform,
                  previousBusiness,
                  topAds: topAds.slice(0, 5).map((a: any) => ({
                    name: a.name,
                    resultLabel: a.resultLabel,
                    results: a.results,
                    ctr: a.ctr,
                    hookRate: a.hookRate,
                    holdRate: a.holdRate,
                    spend: a.spend,
                  })),
                },
              }),
            });

            if (aiRes.ok) {
              const aiJson = await aiRes.json().catch(() => ({}));
              const result = aiJson?.result ?? {};
              const highlights: string[] = Array.isArray(result.highlights) ? result.highlights : [];
              const risks: string[] = Array.isArray(result.risks) ? result.risks : [];
              const nextWeek: string[] = Array.isArray(result.next_week) ? result.next_week : [];
              if (result.summary) highlights.unshift(result.summary);
              reportData.insights = highlights;
              reportData.actionItems = [...risks, ...nextWeek];
            }
          }
        }
      } catch {
        // IA opcional
      }

      const { data, error } = await supabase
        .from('traffic_reports')
        .insert({
          company_id: companyId,
          created_by: userId,
          title: reportTitle.trim() || `Relatorio de Trafego ${periodStart}`,
          period_start: periodStart,
          period_end: periodEnd,
          report_data: reportData,
        })
        .select('public_id')
        .single();

      if (error) throw error;
      const publicId = (data as any)?.public_id;
      setReportPublicUrl(`${window.location.origin}/traffic-report/${publicId}`);
      return;

    } catch (e: any) {
      const msg = String((e as any)?.message ?? '').toLowerCase();
      if (msg.includes('does not exist') || msg.includes('relation')) {
        setReportError('Tabela traffic_reports nao encontrada. Execute a migration SQL primeiro.');
      } else {
        setReportError(e?.message ?? 'Falha ao gerar relatorio.');
      }
    } finally {
      setReportGenerating(false);
    }
  };

  const copyReportLink = () => {
    if (!reportPublicUrl) return;
    navigator.clipboard.writeText(reportPublicUrl).catch(() => {});
    setReportCopied(true);
    setTimeout(() => setReportCopied(false), 2000);
  };

  const shareOnWhatsApp = () => {
    if (!reportPublicUrl) return;
    const text = encodeURIComponent(`Relatorio de Trafego - ${reportTitle}\n${reportPublicUrl}`);
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  const [creativeModalOpen, setCreativeModalOpen] = useState(false);
  const [creativeRow, setCreativeRow] = useState<AdMetric | null>(null);
  const [creativeBusy, setCreativeBusy] = useState(false);
  const [creativeError, setCreativeError] = useState<string | null>(null);
  const [creativeResult, setCreativeResult] = useState<any | null>(null);
  const [creativeMetrics, setCreativeMetrics] = useState<any | null>(null);
  const [creativeHistoryLoading, setCreativeHistoryLoading] = useState(false);
  const [creativeHistory, setCreativeHistory] = useState<CreativeAnalysisRow[]>([]);
  const [creativeSaving, setCreativeSaving] = useState(false);
  const [creativeSaveOk, setCreativeSaveOk] = useState<string | null>(null);

  const closeCreativeModal = () => {
    setCreativeModalOpen(false);
    setCreativeRow(null);
    setCreativeBusy(false);
    setCreativeError(null);
    setCreativeResult(null);
    setCreativeMetrics(null);
    setCreativeHistoryLoading(false);
    setCreativeHistory([]);
    setCreativeSaving(false);
    setCreativeSaveOk(null);
  };

  const currentAnalysisPeriod = (): { start?: string; end?: string } =>
    selectedDateRange ?? getRangeForPreset('last_7d');

  const refreshCreativeHistory = async (row: AdMetric) => {
    if (demoMode || !companyId || !isSupabaseConfigured()) return;

    setCreativeHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('creative_analyses')
        .select('id,company_id,created_by,platform,level,entity_id,entity_name,thumbnail_url,period_start,period_end,metrics,result,created_at')
        .eq('company_id', companyId)
        .eq('level', selectedLevel)
        .eq('entity_id', String(row.adId))
        .order('created_at', { ascending: false })
        .limit(10);

      const msg = String((error as any)?.message ?? '').toLowerCase();
      const missingTable = msg.includes('does not exist') || msg.includes('relation');
      if (missingTable) {
        setCreativeHistory([]);
        return;
      }
      if (error) throw error;

      setCreativeHistory(((data ?? []) as any) as CreativeAnalysisRow[]);
    } catch {
      setCreativeHistory([]);
    } finally {
      setCreativeHistoryLoading(false);
    }
  };

  const saveCreativeAnalysis = async () => {
    if (demoMode) return;
    if (!companyId || !isSupabaseConfigured()) return;
    if (!userId) return;
    if (!creativeRow || !creativeResult) return;

    setCreativeSaving(true);
    setCreativeSaveOk(null);
    setCreativeError(null);
    try {
      const { start, end } = currentAnalysisPeriod();

      const payload: any = {
        company_id: companyId,
        created_by: userId,
        platform: 'meta',
        level: selectedLevel,
        entity_id: String(creativeRow.adId),
        entity_name: creativeRow.adName ?? null,
        thumbnail_url: creativeRow.imageUrl ?? creativeRow.thumbnail ?? null,
        period_start: start ?? null,
        period_end: end ?? null,
        metrics: creativeMetrics ?? {},
        result: creativeResult ?? {},
      };

      const { error } = await supabase.from('creative_analyses').insert([payload]);
      const msg = String((error as any)?.message ?? '').toLowerCase();
      const missingTable = msg.includes('does not exist') || msg.includes('relation');
      if (missingTable) {
        throw new Error('Tabela de análises não existe ainda. Rode `supabase db push` para aplicar as migrations.');
      }
      if (error) throw error;

      setCreativeSaveOk('Análise salva.');
      await refreshCreativeHistory(creativeRow);
    } catch (e: any) {
      setCreativeError(String(e?.message ?? 'Falha ao salvar análise.'));
    } finally {
      setCreativeSaving(false);
    }
  };

  const analyzeCreative = async (row: AdMetric) => {
    setCreativeModalOpen(true);
    setCreativeRow(row);
    setCreativeError(null);
    setCreativeResult(null);
    setCreativeMetrics(null);
    setCreativeSaveOk(null);

    void refreshCreativeHistory(row);

    if (demoMode) {
      setCreativeError('Análise de criativos com IA está disponível apenas no modo real.');
      return;
    }

    if (!companyId || !isSupabaseConfigured()) {
      setCreativeError('IA indisponível: configure Supabase e selecione uma empresa.');
      return;
    }

    if (!userId) {
      setCreativeError('Faça login para usar a análise de criativos.');
      return;
    }

    const local = loadLocalAiSettings(userId);
    if (!local?.apiKey) {
      setCreativeError('Falta sua API Key. Vá em Agente IA e salve a chave do provedor (fica só no seu navegador).');
      return;
    }

    const imageUrl = row.imageUrl ?? '';
    if (!/^https?:\/\//i.test(imageUrl)) {
      setCreativeError('Esse item não tem imagem disponível para análise (thumbnail).');
      return;
    }

    setCreativeBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Sessão inválida. Faça logout/login e tente novamente.');

      const metrics = {
        level: selectedLevel,
        status: row.status,
        spend: row.spend,
        impressions: row.impressions,
        reach: row.reach,
        clicks: row.clicks,
        inlineLinkClicks: row.inlineLinkClicks,
        ctr: row.ctr,
        cpc: row.cpc,
        cpm: row.cpm,
        frequency: row.frequency,
        results: row.results,
        resultLabel: row.resultLabel,
        costPerResult: row.costPerResult,
        roas: row.roas,
        leads: row.leads,
        cpa: row.cpa,
        hookRate: row.hookRate,
        holdRate: row.holdRate,
        idc: row.idc,
        classification: row.classification,
        tags: row.tags ?? [],
      };

      setCreativeMetrics(metrics);

      const res = await fetch(`${getSupabaseUrl()}/functions/v1/ai-assistant`, {
        method: 'POST',
        headers: {
          apikey: getSupabaseAnonKey(),
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'creative_analysis',
          company_id: companyId,
          image_url: imageUrl,
          metrics,
          provider: local.provider,
          api_key: local.apiKey,
          model: local.model,
          access_token: accessToken,
        }),
      });

      const payloadText = await res.text().catch(() => '');
      const payload = payloadText ? JSON.parse(payloadText) : {};
      if (!res.ok) {
        throw new Error(payload?.error ?? `Falha ao chamar IA (HTTP ${res.status}).`);
      }

      setCreativeResult((payload as any)?.result ?? payload);
    } catch (e: any) {
      console.error(e);
      setCreativeError(String(e?.message ?? 'Falha ao analisar criativo.'));
    } finally {
      setCreativeBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="sticky top-0 z-20 rounded-[28px] border border-[hsl(var(--border))] bg-[hsl(var(--background))]/95 p-4 backdrop-blur-xl shadow-[0_24px_70px_-36px_rgba(0,0,0,0.8)]">
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <ArrowUp className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="text-lg font-bold text-[hsl(var(--foreground))] leading-tight whitespace-nowrap">Analise de Trafego</h2>
              <span className="inline-flex items-center rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-medium text-indigo-300">
                {selectedDateRangeLabel}
              </span>
            </div>
            {errorMsg && <p className="text-xs text-red-400 mt-1">{errorMsg}</p>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center justify-end">
          {!demoMode && (
            <div className="relative">
              <button
                type="button"
                onClick={() => { setAccountDropdownOpen((o) => !o); setAccountSearch(''); }}
                disabled={loadingAdAccounts}
                className="flex items-center gap-2 max-w-[280px] min-w-[200px] px-3 py-2 rounded-xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] transition-all"
              >
                <span className="truncate flex-1 text-left">
                  {loadingAdAccounts
                    ? 'Carregando contas...'
                    : selectedAdAccountId
                      ? (adAccounts.find((a) => a.id === selectedAdAccountId)?.name ?? selectedAdAccountId)
                      : 'Selecione a conta'}
                </span>
                <ArrowDown className={`w-3.5 h-3.5 shrink-0 text-[hsl(var(--muted-foreground))] transition-transform ${accountDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {accountDropdownOpen && (
                <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-[320px] rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-2xl py-2">
                  <div className="px-3 pb-2">
                    <input
                      autoFocus
                      type="text"
                      value={accountSearch}
                      onChange={(e) => setAccountSearch(e.target.value)}
                      placeholder="Buscar conta..."
                      className="w-full px-3 py-2 rounded-xl bg-[hsl(var(--background))] border border-[hsl(var(--border))] text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] outline-none"
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {adAccounts
                      .filter((a) => {
                        const q = accountSearch.toLowerCase();
                        return !q || (a.name ?? '').toLowerCase().includes(q) || a.id.toLowerCase().includes(q);
                      })
                      .map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => { void onChangeAdAccount(a.id); setAccountDropdownOpen(false); }}
                          className={`w-full text-left px-4 py-2.5 text-sm hover:bg-[hsl(var(--secondary))] transition-colors ${selectedAdAccountId === a.id ? 'text-indigo-400 font-semibold' : 'text-[hsl(var(--foreground))]'}`}
                        >
                          <div className="truncate">{a.name ?? a.id}</div>
                          <div className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{a.id}</div>
                        </button>
                      ))}
                    {adAccounts.filter((a) => {
                      const q = accountSearch.toLowerCase();
                      return !q || (a.name ?? '').toLowerCase().includes(q) || a.id.toLowerCase().includes(q);
                    }).length === 0 && (
                      <div className="px-4 py-3 text-sm text-[hsl(var(--muted-foreground))]">Nenhuma conta encontrada.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={openDateDialog}
            className="flex min-w-[240px] items-center gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-left transition-all hover:bg-[hsl(var(--secondary))]"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-500/15 bg-indigo-500/10">
              <CalendarRange className="h-4 w-4 text-indigo-300" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-[hsl(var(--muted-foreground))]">
                Periodo
              </div>
              <div className="truncate text-sm text-[hsl(var(--foreground))]">
                {getDatePresetLabel(datePreset)} · {selectedDateRangeLabel}
              </div>
            </div>
            <ArrowDown className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--muted-foreground))]" />
          </button>

          {needsReauth && !demoMode && (
            <button
              onClick={() => void reauthorizeFacebook().catch((e) => setErrorMsg(e?.message || 'Erro ao reautorizar Facebook.'))}
              className="px-3 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/25 text-indigo-400 text-sm font-semibold hover:bg-indigo-500/20 transition-all"
            >
              Reautorizar Facebook
            </button>
          )}

          <button
            onClick={() => void fetchTraffic()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>

          <button
            onClick={openColumnsModal}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] transition-all"
          >
            <Filter className="w-3.5 h-3.5" />
            Colunas
          </button>

          <button
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar
          </button>

          {!demoMode && isSupabaseConfigured() && (
            <button
              onClick={openReportModal}
              disabled={rows.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/25 text-indigo-400 text-sm font-semibold hover:bg-indigo-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <FileBarChart2 className="w-3.5 h-3.5" />
              Gerar Relatorio
            </button>
          )}
        </div>
      </div>
      </div>

      <TrafficDashboard
        rows={rows}
        comparisonData={comparisonData}
        summary={dashboardSummary}
        selectedAdAccountId={selectedAdAccountId}
        adAccountName={adAccounts.find((a) => a.id === selectedAdAccountId)?.name ?? ''}
        datePreset={datePreset}
        dateSince={dateSince}
        dateUntil={dateUntil}
        loading={loading}
        demoMode={demoMode}
      />

      <div className="rounded-2xl border border-[hsl(var(--border))] overflow-hidden" style={{ background: 'hsl(220 18% 7%)' }}>
        <div className="px-6 pt-4 border-b border-[hsl(var(--border))] flex items-center justify-between gap-4 flex-wrap">
          <div className="flex gap-6 text-sm font-medium">
            <button
              type="button"
              onClick={() => setActiveTab('meta')}
              className={
                activeTab === 'meta'
                  ? 'text-[hsl(var(--primary))] border-b-2 border-[hsl(var(--primary))] pb-2'
                  : 'text-[hsl(var(--muted-foreground))] pb-2 hover:text-[hsl(var(--foreground))]'
              }
            >
              Performance de Anúncios
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('platform')}
              className={
                activeTab === 'platform'
                  ? 'text-[hsl(var(--primary))] border-b-2 border-[hsl(var(--primary))] pb-2'
                  : 'text-[hsl(var(--muted-foreground))] pb-2 hover:text-[hsl(var(--foreground))]'
              }
            >
              Dados de Plataforma
            </button>
          </div>

          {activeTab === 'meta' && (
            <div className="flex items-center gap-4 flex-wrap">
              {!demoMode && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">Campanha:</span>
                  <select
                    value={campaignFilterId}
                    onChange={(e) => {
                      setCampaignFilterId(e.target.value);
                      setAdsetFilterId('');
                      setSelectedCampaignIds([]);
                      setSelectedAdsetIds([]);
                    }}
                    className="max-w-[320px] px-3 py-2 bg-[hsl(var(--input))] border border-[hsl(var(--border))] rounded-md text-sm text-[hsl(var(--foreground))] shadow-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                    title="Filtrar por campanha"
                  >
                    <option value="">Todas</option>
                    {campaignOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {selectedLevel === 'ad' && !demoMode && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">Conjunto:</span>
                  <select
                    value={adsetFilterId}
                    onChange={(e) => {
                      setAdsetFilterId(e.target.value);
                      setSelectedAdsetIds([]);
                    }}
                    className="max-w-[320px] px-3 py-2 bg-[hsl(var(--input))] border border-[hsl(var(--border))] rounded-md text-sm text-[hsl(var(--foreground))] shadow-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                    title="Filtrar por conjunto"
                  >
                    <option value="">Todos</option>
                    {adsetOptions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="hidden">
                <span className="text-xs text-[hsl(var(--muted-foreground))]">Período:</span>
                <select
                  value={datePreset}
                  onChange={(e) => onChangeDatePreset(e.target.value as DatePreset)}
                  className="px-3 py-2 bg-[hsl(var(--input))] border border-[hsl(var(--border))] rounded-md text-sm text-[hsl(var(--foreground))] shadow-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                >
                  <option value="last_7d">Últimos 7 dias</option>
                  <option value="last_30d">Últimos 30 dias</option>
                  <option value="this_month">Este mês</option>
                  <option value="last_month">Mês passado</option>
                  <option value="custom">Personalizado</option>
                </select>
                {datePreset === 'custom' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={dateSince}
                      max={dateUntil || undefined}
                      onChange={(e) => onChangeDateSince(e.target.value)}
                      className="px-3 py-2 bg-[hsl(var(--input))] border border-[hsl(var(--border))] rounded-md text-sm text-[hsl(var(--foreground))] shadow-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                    />
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">até</span>
                    <input
                      type="date"
                      value={dateUntil}
                      min={dateSince || undefined}
                      onChange={(e) => onChangeDateUntil(e.target.value)}
                      className="px-3 py-2 bg-[hsl(var(--input))] border border-[hsl(var(--border))] rounded-md text-sm text-[hsl(var(--foreground))] shadow-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                    />
                  </div>
                )}
              </div>

              {!demoMode && userId && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">Colunas:</span>
                  <select
                    value={selectedPresetId}
                    onChange={(e) => onSelectPreset(e.target.value)}
                    className="px-3 py-2 bg-[hsl(var(--input))] border border-[hsl(var(--border))] rounded-md text-sm text-[hsl(var(--foreground))] shadow-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                  >
                    {presetOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="overflow-auto h-[60vh]">
          <table className="min-w-full divide-y divide-[hsl(var(--border))]">
            <thead className="bg-[hsl(var(--secondary))] sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider w-10">
                  {(selectedLevel === 'campaign' || selectedLevel === 'adset') && (
                    <input
                      type="checkbox"
                      className="h-4 w-4 border border-[hsl(var(--border))] rounded bg-[hsl(var(--input))]"
                      checked={
                        rows.length > 0 &&
                        (selectedLevel === 'campaign'
                          ? rows.every((r) => selectedCampaignIds.includes(String(r.id)))
                          : rows.every((r) => selectedAdsetIds.includes(String(r.id))))
                      }
                      onChange={() => {
                        const ids = rows.map((r) => String(r.id));
                        if (selectedLevel === 'campaign') {
                          const all = ids.length > 0 && ids.every((id) => selectedCampaignIds.includes(id));
                          setSelectedCampaignIds(all ? [] : ids);
                        } else {
                          const all = ids.length > 0 && ids.every((id) => selectedAdsetIds.includes(id));
                          setSelectedAdsetIds(all ? [] : ids);
                        }
                      }}
                    />
                  )}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onChangeLevel('campaign')}
                        className={
                          selectedLevel === 'campaign'
                            ? 'text-[hsl(var(--foreground))] font-semibold'
                            : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                        }
                      >
                        Campanha
                        {selectedCampaignIds.length > 0 && (
                          <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]">
                            {selectedCampaignIds.length}
                          </span>
                        )}
                      </button>
                      <span className="text-[hsl(var(--muted-foreground))]">|</span>
                      <button
                        type="button"
                        onClick={() => onChangeLevel('adset')}
                        className={
                          selectedLevel === 'adset'
                            ? 'text-[hsl(var(--foreground))] font-semibold'
                            : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                        }
                      >
                        Conjunto
                        {selectedAdsetIds.length > 0 && (
                          <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]">
                            {selectedAdsetIds.length}
                          </span>
                        )}
                      </button>
                      <span className="text-[hsl(var(--muted-foreground))]">|</span>
                      <button
                        type="button"
                        onClick={() => onChangeLevel('ad')}
                        className={
                          selectedLevel === 'ad'
                            ? 'text-[hsl(var(--foreground))] font-semibold'
                            : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                        }
                      >
                        Anúncio
                      </button>
                    </div>

                    {(selectedLevel === 'campaign' && selectedCampaignIds.length > 0) ||
                    (selectedLevel === 'adset' && selectedAdsetIds.length > 0) ? (
                      <button
                        type="button"
                        onClick={() => clearSelections(selectedLevel)}
                        className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                        title="Limpar seleção"
                      >
                        Limpar
                      </button>
                    ) : null}
                  </div>
                </th>
                {tableColumns.map((c) => (
                  <th key={c.key} className="px-6 py-3 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                    {c.label}
                  </th>
                ))}
                <th className="px-6 py-3 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Etiquetas</th>
              </tr>
            </thead>
            <tbody className="bg-[hsl(var(--card))] divide-y divide-[hsl(var(--border))]">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={tableColumns.length + 3} className="px-6 py-10 text-center text-sm text-[hsl(var(--muted-foreground))]">
                    {demoMode ? 'Sem dados.' : 'Sem dados reais para mostrar ainda.'}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-[hsl(var(--secondary))] transition-colors">
                    <td className="px-4 py-4 whitespace-nowrap align-top">
                      {(selectedLevel === 'campaign' || selectedLevel === 'adset') && (
                        <input
                          type="checkbox"
                          className="h-4 w-4 border border-[hsl(var(--border))] rounded bg-[hsl(var(--input))]"
                          checked={
                            selectedLevel === 'campaign'
                              ? selectedCampaignIds.includes(String(row.id))
                              : selectedAdsetIds.includes(String(row.id))
                          }
                          onChange={() =>
                            selectedLevel === 'campaign' ? toggleCampaignSelection(String(row.id)) : toggleAdsetSelection(String(row.id))
                          }
                        />
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <img className="h-10 w-10 rounded object-cover" src={row.thumbnail} alt="" />
                        <div className="ml-4">
                          {selectedLevel === 'ad' ? (
                            <div className="text-sm font-medium text-[hsl(var(--foreground))]">{row.adName}</div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => drillDown(row)}
                              className="text-sm font-medium text-[hsl(var(--foreground))] hover:text-[hsl(var(--primary))] hover:underline text-left"
                              title="Abrir nível abaixo"
                            >
                              {row.adName}
                            </button>
                          )}
                          <div className="text-xs text-[hsl(var(--muted-foreground))] flex items-center">
                            {row.subtitle ?? ''}
                            <button
                              type="button"
                              className="ml-1 inline-flex items-center hover:text-[hsl(var(--primary))]"
                              title={`Abrir no Ads Manager (ID: ${row.adId})`}
                              onClick={() => openInAdsManager(row.adId)}
                            >
                              <ExternalLink className="w-3 h-3" />
                            </button>
                            {selectedLevel === 'ad' && !demoMode && row.imageUrl ? (
                              <button
                                type="button"
                                className="ml-2 inline-flex items-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))]"
                                title="Analisar criativo com IA"
                                disabled={creativeBusy && creativeRow?.id === row.id}
                                onClick={() => void analyzeCreative(row)}
                              >
                                <Sparkles className={`w-3 h-3 ${creativeBusy && creativeRow?.id === row.id ? 'animate-pulse' : ''}`} />
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </td>
                    {tableColumns.map((c) => (
                      <td key={c.key} className="px-6 py-4 whitespace-nowrap text-sm text-[hsl(var(--foreground))]">
                        {c.render(row)}
                      </td>
                    ))}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[hsl(var(--foreground))]">
                      <div className="flex gap-2 flex-wrap">
                        {(row.tags ?? []).map((t) => (
                          <span key={t} className="px-2 py-0.5 rounded bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] text-xs font-medium">
                            {t}
                          </span>
                        ))}
                        {(!row.tags || row.tags.length === 0) && '-'}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-xs text-[hsl(var(--muted-foreground))] space-y-1">
          <div>
            *Hook Rate: views 3s / impressoes. Hold Rate: views 15s (ThruPlay) / views 3s — retencao apos primeiro engajamento.
          </div>
          <div>
            *IDC: score ponderado — Resultados 30%, C/Res 25%, CTR 20%, Hook 15%, Hold 10%. Benchmarks absolutos para Hook/Hold. Classificacao: Otimo/Bom/Regular/Ruim.
          </div>
        </div>
      </div>

      {columnsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-[hsl(var(--card))] rounded-xl shadow-xl w-full max-w-4xl border border-[hsl(var(--border))] overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-[hsl(var(--border))] flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold text-[hsl(var(--foreground))]">Colunas</div>
                <div className="text-xs text-[hsl(var(--muted-foreground))]">Salve visualizações por usuário (e por nível).</div>
              </div>
              <button
                type="button"
                className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                onClick={() => setColumnsModalOpen(false)}
              >
                <span className="sr-only">Fechar</span>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 flex-1 min-h-0 overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full min-h-0">
                <div className="space-y-5 min-h-0 overflow-y-auto pr-2">
                <div>
                  <div className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                    Colunas fixas (sempre visíveis)
                  </div>
                  <div className="mt-3 space-y-2">
                    {fixedColumns.map((c) => (
                      <label key={c.key} className="flex items-center gap-2 text-sm text-[hsl(var(--foreground))]">
                        <input type="checkbox" checked disabled className="h-4 w-4 accent-[hsl(var(--primary))]" />
                        <span>{c.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Métricas opcionais</div>
                  <div className="mt-3 space-y-2">
                    {OPTIONAL_METRICS_ORDER.map((k) => {
                      const col = optionalColumnsDef[k];
                      const checked = draftOptionalColumns.includes(k);
                      return (
                        <label key={k} className="flex items-center gap-2 text-sm text-[hsl(var(--foreground))]">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleDraftColumn(k)}
                            className="h-4 w-4 accent-[hsl(var(--primary))]"
                          />
                          <span>{col.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="space-y-5 min-h-0 overflow-y-auto pr-2">
                <div>
                  <div className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                    Colunas selecionadas ({fixedColumns.length + draftOptionalColumns.length})
                  </div>
                  <div className="mt-3 border border-[hsl(var(--border))] rounded-lg overflow-hidden">
                    <div className="px-4 py-2 bg-[hsl(var(--secondary))] text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                      Fixas
                    </div>
                    <div className="divide-y divide-[hsl(var(--border))]">
                      {fixedColumns.map((c) => (
                        <div
                          key={c.key}
                          className="px-4 py-3 text-sm text-[hsl(var(--foreground))] flex items-center justify-between"
                        >
                          <span>{c.label}</span>
                          <span className="text-xs text-[hsl(var(--muted-foreground))]">fixa</span>
                        </div>
                      ))}
                    </div>

                    <div className="px-4 py-2 bg-[hsl(var(--secondary))] text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                      Opcionais
                    </div>
                    <div className="divide-y divide-[hsl(var(--border))]">
                      {draftOptionalColumns.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-[hsl(var(--muted-foreground))]">Nenhuma métrica opcional selecionada.</div>
                      ) : (
                        draftOptionalColumns.map((k) => (
                          <div
                            key={k}
                            className="px-4 py-3 text-sm text-[hsl(var(--foreground))] flex items-center justify-between gap-3"
                          >
                            <span className="min-w-0 truncate">{optionalColumnsDef[k].label}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                className="px-2 py-1 text-xs border border-[hsl(var(--border))] rounded hover:bg-[hsl(var(--secondary))]"
                                onClick={() => moveDraftColumn(k, -1)}
                                title="Mover para cima"
                              >
                                <ArrowUp className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                className="px-2 py-1 text-xs border border-[hsl(var(--border))] rounded hover:bg-[hsl(var(--secondary))]"
                                onClick={() => moveDraftColumn(k, 1)}
                                title="Mover para baixo"
                              >
                                <ArrowDown className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                className="px-2 py-1 text-xs border border-[hsl(var(--border))] rounded hover:bg-[hsl(var(--secondary))]"
                                onClick={() => toggleDraftColumn(k)}
                                title="Remover"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Nome da visualização</div>
                  <input
                    value={draftPresetName}
                    onChange={(e) => setDraftPresetName(e.target.value)}
                    placeholder={selectedPresetId === DEFAULT_PRESET_ID ? 'Ex: Meu relatório' : ''}
                    className="w-full px-3 py-2 bg-[hsl(var(--input))] border border-[hsl(var(--border))] rounded-md text-sm text-[hsl(var(--foreground))] shadow-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                  />
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">
                    {selectedPresetId === DEFAULT_PRESET_ID
                      ? 'Para salvar, digite um nome e clique em "Salvar".'
                      : 'Você pode salvar as mudanças nesta visualização ou salvar como uma nova.'}
                  </div>
                </div>
              </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-[hsl(var(--border))] flex items-center justify-between gap-3 flex-wrap">
              <div>
                {selectedPresetId !== DEFAULT_PRESET_ID && (
                  <button
                    type="button"
                    onClick={() => void onDeletePreset()}
                    disabled={savingPreset}
                    className="px-3 py-2 text-sm border border-red-300 text-red-700 rounded-md hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Excluir predefinição
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setColumnsModalOpen(false)}
                  className="px-3 py-2 text-sm border border-[hsl(var(--border))] rounded-md hover:bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]"
                >
                  Cancelar
                </button>

                {selectedPresetId !== DEFAULT_PRESET_ID && (
                  <button
                    type="button"
                    onClick={() => void onSavePreset('update')}
                    disabled={savingPreset}
                    className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Salvar
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => void onSavePreset('create')}
                  disabled={savingPreset}
                  className="px-3 py-2 text-sm border border-[hsl(var(--border))] rounded-md hover:bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {selectedPresetId === DEFAULT_PRESET_ID ? 'Salvar' : 'Salvar como nova'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {creativeModalOpen && creativeRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] shadow-xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-[hsl(var(--border))]">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Análise de Criativo (IA)</div>
                <div className="text-xs text-[hsl(var(--muted-foreground))] truncate">{creativeRow.adName}</div>
              </div>
              <button
                type="button"
                className="p-2 rounded hover:bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]"
                onClick={closeCreativeModal}
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[70vh] overflow-auto">
              <div className="flex items-start gap-4">
                <img
                  src={creativeRow.thumbnail}
                  alt=""
                  className="w-20 h-20 rounded object-cover border border-[hsl(var(--border))]"
                />
                <div className="flex-1">
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">Resultado: {creativeRow.resultLabel ?? '-'}</div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">Investido: R$ {creativeRow.spend.toFixed(2)}</div>
                  {creativeRow.ctr != null && (
                    <div className="text-xs text-[hsl(var(--muted-foreground))]">CTR: {creativeRow.ctr.toFixed(2)}%</div>
                  )}
                </div>
              </div>

              {creativeBusy && <div className="text-sm text-[hsl(var(--muted-foreground))]">Analisando…</div>}
              {creativeError && <div className="text-sm text-red-500">{creativeError}</div>}
              {creativeSaveOk && <div className="text-sm text-emerald-400">{creativeSaveOk}</div>}

              {!demoMode && creativeHistoryLoading ? (
                <div className="text-sm text-[hsl(var(--muted-foreground))]">Carregando histórico…</div>
              ) : !demoMode && creativeHistory.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                    Histórico (últimas {creativeHistory.length})
                  </div>
                  <div className="space-y-2">
                    {creativeHistory.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        className="w-full text-left rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 hover:bg-[hsl(var(--secondary))]"
                        onClick={() => {
                          setCreativeResult(h.result ?? null);
                          setCreativeError(null);
                          setCreativeSaveOk(null);
                        }}
                        title="Abrir esta análise"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs text-[hsl(var(--muted-foreground))]">
                            {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(h.created_at))}
                          </div>
                          {h.period_start && h.period_end ? (
                            <div className="text-[10px] text-[hsl(var(--muted-foreground))]">
                              {h.period_start} → {h.period_end}
                            </div>
                          ) : null}
                        </div>
                        {typeof h?.result?.summary === 'string' ? (
                          <div className="mt-1 text-xs text-[hsl(var(--foreground))] break-words">{h.result.summary}</div>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {creativeResult && (
                <div className="space-y-3">
                  {typeof creativeResult?.summary === 'string' && (
                    <div>
                      <div className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Resumo</div>
                      <div className="mt-1 text-sm text-[hsl(var(--foreground))] whitespace-pre-wrap">{creativeResult.summary}</div>
                    </div>
                  )}

                  {Array.isArray(creativeResult?.hypotheses) && creativeResult.hypotheses.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Hipóteses</div>
                      <ul className="mt-1 list-disc pl-5 text-sm text-[hsl(var(--foreground))] space-y-1">
                        {creativeResult.hypotheses.map((h: any, idx: number) => (
                          <li key={idx}>{String(h)}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {Array.isArray(creativeResult?.recommendations) && creativeResult.recommendations.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Recomendações</div>
                      <ul className="mt-1 list-disc pl-5 text-sm text-[hsl(var(--foreground))] space-y-1">
                        {creativeResult.recommendations.map((r: any, idx: number) => (
                          <li key={idx}>{String(r)}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {typeof creativeResult?.classification === 'string' && (
                    <div className="text-xs text-[hsl(var(--muted-foreground))]">
                      Classificação (IA): <span className="text-[hsl(var(--foreground))]">{creativeResult.classification}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-[hsl(var(--border))] flex justify-end gap-2">
              {creativeResult && !demoMode ? (
                <button
                  type="button"
                  className="px-3 py-2 text-sm bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] border border-[hsl(var(--border))] rounded-md hover:bg-[hsl(var(--secondary))/0.8]"
                  onClick={() => void saveCreativeAnalysis()}
                  disabled={creativeSaving || !companyId || !userId}
                  title="Salva a análise no Supabase (sem salvar API keys)."
                >
                  {creativeSaving ? 'Salvando…' : 'Salvar análise'}
                </button>
              ) : null}
              {selectedLevel === 'ad' && !demoMode && creativeRow.imageUrl ? (
                <button
                  type="button"
                  className="px-3 py-2 text-sm bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] border border-[hsl(var(--border))] rounded-md hover:bg-[hsl(var(--secondary))/0.8]"
                  onClick={() => void analyzeCreative(creativeRow)}
                  disabled={creativeBusy}
                >
                  {creativeBusy ? 'Analisando…' : 'Reanalisar'}
                </button>
              ) : null}
              <button
                type="button"
                className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                onClick={closeCreativeModal}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Generation Modal */}
      <Dialog open={dateDialogOpen} onOpenChange={setDateDialogOpen}>
        <DialogContent className="flex max-h-[85vh] w-[860px] max-w-[92vw] flex-col overflow-hidden border-[hsl(var(--border))] bg-[hsl(var(--card))] p-0 text-[hsl(var(--foreground))] sm:max-w-[92vw]">
          <DialogHeader className="border-b border-[hsl(var(--border))] px-6 py-5">
            <DialogTitle className="text-base font-semibold">Selecionar periodo</DialogTitle>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 gap-0 overflow-x-hidden md:grid-cols-[220px_minmax(0,1fr)]">
            <div className="overflow-y-auto border-b border-[hsl(var(--border))] p-4 md:border-b-0 md:border-r">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[hsl(var(--muted-foreground))]">
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
                        ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
                        : 'border border-transparent text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]'
                    }`}
                  >
                    <span>{getDatePresetLabel(option)}</span>
                    {draftDatePreset === option && <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">ativo</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 overflow-x-hidden overflow-y-auto p-5">
              <div className="grid grid-cols-1 gap-4">
                <div className="min-w-0 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[hsl(var(--muted-foreground))]">
                    Preset
                  </div>
                  <div className="mt-2 break-words text-lg font-semibold leading-tight text-[hsl(var(--foreground))]">
                    {getDatePresetLabel(draftDatePreset)}
                  </div>
                  <div className="mt-2 break-words text-sm leading-6 text-[hsl(var(--muted-foreground))]">
                    {formatDateRangeLabel(normalizeDateRange(draftDateSince, draftDateUntil))}
                  </div>
                </div>

                <div className="min-w-0 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[hsl(var(--muted-foreground))]">
                    Intervalo
                  </div>
                  <div className="mt-3 grid gap-3">
                    <label className="grid gap-1.5 text-xs text-[hsl(var(--muted-foreground))]">
                      Data inicial
                      <input
                        type="date"
                        value={draftDateSince}
                        max={draftDateUntil || undefined}
                        onChange={(e) => {
                          setDraftDatePreset('custom');
                          setDraftDateSince(e.target.value);
                          setDraftDateUntil((prev) => (!prev || prev < e.target.value ? e.target.value : prev));
                        }}
                        className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-sm text-[hsl(var(--foreground))] outline-none"
                      />
                    </label>
                    <label className="grid gap-1.5 text-xs text-[hsl(var(--muted-foreground))]">
                      Data final
                      <input
                        type="date"
                        value={draftDateUntil}
                        min={draftDateSince || undefined}
                        onChange={(e) => {
                          setDraftDatePreset('custom');
                          setDraftDateUntil(e.target.value);
                          setDraftDateSince((prev) => (!prev || prev > e.target.value ? e.target.value : prev));
                        }}
                        className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-sm text-[hsl(var(--foreground))] outline-none"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-[hsl(var(--border))] px-6 py-4">
            <button
              type="button"
              onClick={() => setDateDialogOpen(false)}
              className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-4 py-2 text-sm text-[hsl(var(--foreground))]"
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

      {reportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-md rounded-2xl border border-[hsl(var(--border))] shadow-2xl" style={{ background: 'hsl(220 18% 9%)' }}>
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-[hsl(var(--border))] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                  <FileBarChart2 className="w-4 h-4 text-indigo-400" />
                </div>
                <div>
                  <div className="text-sm font-bold text-[hsl(var(--foreground))]">Gerar Relatorio Semanal</div>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">Cria um link publico para compartilhar com o cliente</p>
                </div>
              </div>
              <button
                onClick={() => setReportModalOpen(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-5 space-y-4">
              {/* Period summary */}
              <div className="rounded-xl bg-indigo-500/5 border border-indigo-500/15 px-4 py-3">
                <div className="text-xs font-semibold text-indigo-300 mb-1">Periodo selecionado</div>
                <div className="text-sm text-[hsl(var(--foreground))]">
                  {datePreset === 'custom' && dateSince && dateUntil
                    ? `${dateSince} ate ${dateUntil}`
                    : datePreset === 'last_7d'
                      ? 'Ultimos 7 dias'
                      : datePreset === 'last_30d'
                        ? 'Ultimos 30 dias'
                        : datePreset === 'this_month'
                          ? 'Este mes'
                          : datePreset === 'last_month'
                            ? 'Mes passado'
                            : 'Periodo atual'}
                </div>
                <div className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                  Escopo: {reportScopeLabel}
                </div>
                <div className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                  {rows.length} {selectedLevel === 'campaign' ? 'campanhas' : selectedLevel === 'adset' ? 'conjuntos' : 'anuncios'} com dados na visualizacao atual
                </div>
              </div>

              {/* Client + Agency */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1.5">
                    Cliente
                  </label>
                  <input
                    type="text"
                    value={reportClientName}
                    onChange={(e) => setReportClientName(e.target.value)}
                    className="w-full rounded-xl bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2.5 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                    placeholder="Nome do cliente"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1.5">
                    Agencia
                  </label>
                  <input
                    type="text"
                    value={reportAgencyName}
                    onChange={(e) => setReportAgencyName(e.target.value)}
                    className="w-full rounded-xl bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2.5 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                    placeholder="Nome da agencia"
                  />
                </div>
              </div>

              {/* Title input */}
              <div>
                <label className="block text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1.5">
                  Titulo do relatorio
                </label>
                <input
                  type="text"
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  className="w-full rounded-xl bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2.5 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                  placeholder="Ex: Relatorio Semana 14"
                />
              </div>

              {/* Error */}
              {reportError && (
                <div className="flex items-start gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5 text-xs">
                  <X className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {reportError}
                </div>
              )}

              {/* Result - link generated */}
              {reportPublicUrl && (
                <div className="space-y-3">
                  <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 px-3 py-3">
                    <div className="text-xs font-semibold text-emerald-400 mb-1.5">Link gerado com sucesso!</div>
                    <div className="text-xs text-[hsl(var(--muted-foreground))] break-all font-mono bg-[hsl(var(--background))] rounded-lg px-2 py-1.5">
                      {reportPublicUrl}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={copyReportLink}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]/80 transition-all"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      {reportCopied ? 'Copiado!' : 'Copiar link'}
                    </button>
                    <button
                      onClick={shareOnWhatsApp}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-semibold hover:bg-emerald-500/20 transition-all"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Enviar WhatsApp
                    </button>
                  </div>
                  <button
                    onClick={() => window.open(reportPublicUrl, '_blank', 'noopener,noreferrer')}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-indigo-500/20 text-indigo-400 text-xs hover:bg-indigo-500/10 transition-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Abrir visualizacao do relatorio
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            {!reportPublicUrl && (
              <div className="px-5 pb-5 flex justify-end gap-2">
                <button
                  onClick={() => setReportModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] text-sm text-[hsl(var(--foreground))] hover:opacity-90 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => void generateReport()}
                  disabled={reportGenerating || rows.length === 0}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {reportGenerating ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <FileBarChart2 className="w-3.5 h-3.5" />
                      Gerar relatorio
                    </>
                  )}
                </button>
              </div>
            )}
            {reportPublicUrl && (
              <div className="px-5 pb-5 flex justify-end">
                <button
                  onClick={() => setReportModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-all"
                >
                  Fechar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
