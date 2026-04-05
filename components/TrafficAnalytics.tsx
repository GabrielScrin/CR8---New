import React, { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDown, ArrowUp, Download, ExternalLink, Filter, RefreshCw, Sparkles, X } from 'lucide-react';
import { AdMetric } from '../types';
import { loadLocalAiSettings } from '../lib/aiLocal';
import { getSupabaseAnonKey, getSupabaseUrl, isSupabaseConfigured, supabase } from '../lib/supabase';

interface TrafficAnalyticsProps {
  companyId?: string;
}

type MetaLevel = 'campaign' | 'adset' | 'ad';
type TrafficTab = 'meta' | 'platform';

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

const extractActionSum = (actions: any[] | undefined, matcher: (actionType: string) => boolean) => {
  if (!Array.isArray(actions)) return undefined;
  const matches = actions.filter((a) => typeof a?.action_type === 'string' && matcher(a.action_type));
  if (matches.length === 0) return undefined;
  return matches.reduce((sum, a) => sum + parseNumber(a.value), 0);
};

const extractActionTotal = (actions: any[] | undefined) => {
  if (!Array.isArray(actions) || actions.length === 0) return undefined;
  return actions.reduce((sum, a) => sum + parseNumber(a?.value), 0);
};

const extractLeadsFromActions = (actions: any[] | undefined) =>
  extractActionSum(actions, (t) => t.includes('lead') || t === 'onsite_conversion.lead_grouped');

const extractPurchasesFromActions = (actions: any[] | undefined) =>
  extractActionSum(actions, (t) => t === 'purchase' || t.endsWith('.purchase') || t.includes('purchase'));

const extractMessagingConversationsFromActions = (actions: any[] | undefined) =>
  extractActionSum(actions, (t) => t.includes('messaging_conversation_started') || t.includes('onsite_conversion.messaging'));

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

const resolvePrimaryResult = (row: any, computed: { leads?: number; purchases?: number; conversations?: number; linkClicks?: number; clicks?: number; video3s?: number }) => {
  const objective = normalizeObjective(row?.objective ?? row?.campaign_objective ?? row?.objective_name ?? row?.campaign?.objective);

  const pick = (value: number | undefined, label: string) => ({ value: typeof value === 'number' ? value : undefined, label });

  if (objective.includes('LEAD')) return pick(computed.leads, 'Leads');
  if (objective.includes('MESSAGE')) return pick(computed.conversations, 'Leads');
  if (objective.includes('VIDEO')) return pick(computed.video3s, 'Views 3s');
  if (objective.includes('TRAFFIC')) return pick(computed.linkClicks ?? computed.clicks, 'Cliques no link');
  if (objective.includes('CONVERS') || objective.includes('SALE') || objective.includes('PURCHASE')) return pick(computed.purchases, 'Compras');

  if ((computed.leads ?? 0) > 0) return pick(computed.leads, 'Leads');
  if ((computed.purchases ?? 0) > 0) return pick(computed.purchases, 'Compras');
  if ((computed.conversations ?? 0) > 0) return pick(computed.conversations, 'Conversas');
  if ((computed.linkClicks ?? 0) > 0) return pick(computed.linkClicks, 'Cliques no link');
  if ((computed.clicks ?? 0) > 0) return pick(computed.clicks, 'Cliques');
  if ((computed.video3s ?? 0) > 0) return pick(computed.video3s, 'Views 3s');
  return pick(undefined, 'Resultados');
};

const extractRoas = (purchaseRoas: any[] | undefined) => {
  if (!Array.isArray(purchaseRoas) || purchaseRoas.length === 0) return undefined;
  return purchaseRoas.reduce((sum, r) => sum + parseNumber(r.value), 0);
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

  const [datePreset, setDatePreset] = useState<'last_7d' | 'last_30d' | 'this_month' | 'last_month' | 'custom'>('last_7d');
  const [dateSince, setDateSince] = useState<string>('');
  const [dateUntil, setDateUntil] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);

  const [adAccounts, setAdAccounts] = useState<MetaAdAccount[]>([]);
  const [selectedAdAccountId, setSelectedAdAccountId] = useState<string>('');
  const [loadingAdAccounts, setLoadingAdAccounts] = useState(false);

  const [rows, setRows] = useState<AdMetric[]>([]);

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
      { key: 'leads', label: 'Leads', render: (r) => (r.leads ?? '-') },
      { key: 'cpa', label: 'CPL', render: (r) => (r.cpa != null ? formatCurrency(r.cpa) : '-') },
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

  const getProviderToken = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.provider_token ?? null;
  };

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
    const resultsValues = items.map((r) => r.results ?? 0);
    const ctrValues = items.map((r) => r.ctr ?? 0);
    const cprValues = items
      .map((r) => r.costPerResult)
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

    const minResults = resultsValues.length ? Math.min(...resultsValues) : 0;
    const maxResults = resultsValues.length ? Math.max(...resultsValues) : 0;
    const minCtr = ctrValues.length ? Math.min(...ctrValues) : 0;
    const maxCtr = ctrValues.length ? Math.max(...ctrValues) : 0;
    const minCpr = cprValues.length ? Math.min(...cprValues) : 0;
    const maxCpr = cprValues.length ? Math.max(...cprValues) : 0;

    return items.map((row) => {
      const results = row.results ?? 0;
      const cpr = row.costPerResult;
      const ctr = row.ctr ?? 0;

      const scoreResults01 = normalizeHigherBetter(results, minResults, maxResults);
      const scoreCpr01 = cpr != null ? normalizeLowerBetter(cpr, minCpr, maxCpr) : 0;
      const scoreCtr01 = normalizeHigherBetter(ctr, minCtr, maxCtr);

      const idc01 = (scoreResults01 + scoreCpr01 + scoreCtr01) / 3;

      const classification: AdMetric['classification'] =
        results === 0
          ? undefined
          : idc01 >= IDC_THRESHOLDS.otimo
            ? 'otimo'
            : idc01 >= IDC_THRESHOLDS.bom
              ? 'bom'
              : idc01 >= IDC_THRESHOLDS.regular
                ? 'regular'
                : 'ruim';

      const resultLabel = (row.resultLabel || 'Resultados').slice(0, 12);
      const scores = [
        { label: resultLabel, value: Math.round(scoreResults01 * 100) },
        { label: 'C/Res', value: Math.round(scoreCpr01 * 100) },
        { label: 'CTR', value: Math.round(scoreCtr01 * 100) },
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
      return;
    }

    if (activeTab !== 'meta') return;

    setLoading(true);
    try {
      const providerToken = await getProviderToken();
      if (!providerToken) {
        setRows([]);
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
      if (datePreset === 'custom' && dateSince && dateUntil) {
        timeseriesUrl.searchParams.set('time_range', JSON.stringify({ since: dateSince, until: dateUntil }));
      } else {
        timeseriesUrl.searchParams.set('date_preset', datePreset === 'custom' ? 'last_7d' : datePreset);
      }
      timeseriesUrl.searchParams.set('time_increment', '1');
      timeseriesUrl.searchParams.set('limit', '50');
      timeseriesUrl.searchParams.set('access_token', providerToken);

      const tsRes = await fetch(timeseriesUrl.toString());
      const tsJson = await tsRes.json();
      if (tsRes.ok && !tsJson?.error) {
        const ts = Array.isArray(tsJson?.data) ? tsJson.data : [];
        setComparisonData(
          ts.map((row: any) => ({
            name: String(row.date_start ?? '').slice(5).replace('-', '/'),
            metaSpend: parseNumber(row.spend),
            metaLeads: (extractLeadsFromActions(row.actions) ?? 0) + (extractMessagingConversationsFromActions(row.actions) ?? 0),
          })),
        );
      } else {
        setComparisonData([]);
      }

      const insightsUrl = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${adAccountId}/insights`);
      insightsUrl.searchParams.set('level', selectedLevel);
      {
        const filters: any[] = [];
        const campaignIds = selectedCampaignIds.length ? selectedCampaignIds : campaignFilterId ? [campaignFilterId] : [];
        const adsetIds = selectedAdsetIds.length ? selectedAdsetIds : adsetFilterId ? [adsetFilterId] : [];

        if (selectedLevel === 'ad' && adsetIds.length) {
          filters.push({ field: 'adset.id', operator: 'IN', value: adsetIds });
        }
        if (selectedLevel !== 'campaign' && campaignIds.length) {
          filters.push({ field: 'campaign.id', operator: 'IN', value: campaignIds });
        }
        if (filters.length) insightsUrl.searchParams.set('filtering', JSON.stringify(filters));
      }
      insightsUrl.searchParams.set(
        'fields',
        [
          selectedLevel === 'campaign'
            ? 'campaign_id,campaign_name'
            : selectedLevel === 'adset'
              ? 'adset_id,adset_name,campaign_id,campaign_name'
              : 'ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name',
          'objective,impressions,reach,clicks,inline_link_clicks,cpm,frequency,spend,cpc,ctr,actions,purchase_roas,video_thruplay_watched_actions',
        ].join(','),
      );
      if (datePreset === 'custom' && dateSince && dateUntil) {
        insightsUrl.searchParams.set('time_range', JSON.stringify({ since: dateSince, until: dateUntil }));
      } else {
        insightsUrl.searchParams.set('date_preset', datePreset === 'custom' ? 'last_7d' : datePreset);
      }
      insightsUrl.searchParams.set('limit', '50');
      insightsUrl.searchParams.set('access_token', providerToken);

      const res = await fetch(insightsUrl.toString());
      const json = await res.json();
      if (!res.ok || json?.error) {
        const err: any = new Error(json?.error?.message || `Erro ao buscar insights (${res.status})`);
        err.metaError = json?.error;
        throw err;
      }

      const insightRows: any[] = Array.isArray(json?.data) ? json.data : [];
      const entityIds = insightRows
        .map((row) => (selectedLevel === 'campaign' ? row.campaign_id : selectedLevel === 'adset' ? row.adset_id : row.ad_id))
        .filter(Boolean)
        .map((v) => String(v));
      const effectiveStatuses = await fetchEffectiveStatusesByIds(providerToken, entityIds);

      const mapped: AdMetric[] = insightRows.map((row: any) => {
        const entityId = selectedLevel === 'campaign' ? row.campaign_id : selectedLevel === 'adset' ? row.adset_id : row.ad_id;
        const entityName =
          selectedLevel === 'campaign' ? row.campaign_name : selectedLevel === 'adset' ? row.adset_name : row.ad_name;

        const impressions = Math.floor(parseNumber(row.impressions));
        const spend = parseNumber(row.spend);
        const formLeads = extractLeadsFromActions(row.actions) ?? 0;
        const conversations = extractMessagingConversationsFromActions(row.actions) ?? 0;
        const leads = formLeads + conversations;
        const cpa = leads > 0 ? spend / leads : undefined;
        const ctr = typeof row.ctr === 'string' || typeof row.ctr === 'number' ? parseNumber(row.ctr) : undefined;
        const roas = extractRoas(row.purchase_roas);

        const video3s = extractVideo3sFromActions(row.actions);
        const video15s = extractVideo15sFromActions(row.actions) ?? extractActionTotal(row.video_thruplay_watched_actions);
        const hookRate = impressions > 0 && video3s != null && video3s > 0 ? video3s / impressions : undefined;
        const holdRate = impressions > 0 && video15s != null && video15s > 0 ? video15s / impressions : undefined;

        const linkClicks = row.inline_link_clicks != null ? Math.floor(parseNumber(row.inline_link_clicks)) : undefined;
        const clicks = row.clicks != null ? Math.floor(parseNumber(row.clicks)) : undefined;
        const purchases = extractPurchasesFromActions(row.actions);
        const primary = resolvePrimaryResult(row, { leads, purchases, conversations: conversations || undefined, linkClicks, clicks, video3s });
        const results = primary.value;
        const costPerResult = results && results > 0 ? spend / results : undefined;

        const subtitle =
          selectedLevel === 'campaign'
            ? `Conta: ${adAccountName ?? adAccountId}`
            : selectedLevel === 'adset'
              ? `Campanha: ${row.campaign_name ?? row.campaign_id ?? '-'}`
              : `Conjunto: ${row.adset_name ?? row.adset_id ?? '-'} • Campanha: ${row.campaign_name ?? row.campaign_id ?? '-'}`;

        const baseThumb =
          selectedLevel === 'campaign'
            ? svgAvatarDataUrl(adAccountName ?? adAccountId, '#1F2937', '#EEF2FF')
            : selectedLevel === 'adset'
              ? svgAvatarDataUrl(String(row.campaign_name ?? 'CP'), '#1F2937', '#ECFDF5')
              : svgAvatarDataUrl(String(entityName ?? 'AD'), '#1F2937', '#F3F4F6');

        const tags: string[] = [];
        const nameLower = String(entityName ?? '').toLowerCase();
        if (nameLower.includes('depoimento') || nameLower.includes('prova')) tags.push('Prova Social');
        if (tags.length === 0) tags.push('Em teste');

        return {
          id: String(entityId),
          adName: entityName ?? `${selectedLevel} ${entityId}`,
          adId: String(entityId),
          subtitle,
          thumbnail: baseThumb,
          campaignId:
            selectedLevel === 'campaign'
              ? String(entityId)
              : row.campaign_id != null
                ? String(row.campaign_id)
                : undefined,
          campaignName:
            selectedLevel === 'campaign'
              ? (row.campaign_name != null ? String(row.campaign_name) : entityName != null ? String(entityName) : undefined)
              : row.campaign_name != null
                ? String(row.campaign_name)
                : undefined,
          adsetId:
            selectedLevel === 'adset'
              ? String(entityId)
              : row.adset_id != null
                ? String(row.adset_id)
                : undefined,
          adsetName:
            selectedLevel === 'adset'
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
          cpc: row.cpc != null ? parseNumber(row.cpc) : undefined,
          ctr,
          roas,
          leads,
          cpa,
          hookRate,
          holdRate,
          tags,
        };
      });

      if (selectedLevel === 'ad' && mapped.length > 0) {
        const adIds = mapped.map((r) => r.adId);
        const thumbs = await fetchAdThumbnails(providerToken, adIds);
        for (const row of mapped) {
          const info = thumbs.get(row.adId);
          if (info?.thumbnail) row.thumbnail = info.thumbnail;
          if (info?.imageUrl) row.imageUrl = info.imageUrl;
        }
      }

      setRows(computeScores(mapped));
      if (mapped.length === 0) setErrorMsg('Sem dados para esse período.');
    } catch (e: any) {
      console.error(e);
      setRows([]);

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

  const currentAnalysisPeriod = (): { start?: string; end?: string } => {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth(); // 0-based
    const d = now.getUTCDate();
    const today = new Date(Date.UTC(y, m, d));
    const iso = (dt: Date) => dt.toISOString().slice(0, 10);

    if (datePreset === 'custom' && dateSince && dateUntil) return { start: dateSince, end: dateUntil };

    if (datePreset === 'last_7d') {
      const start = new Date(today);
      start.setUTCDate(start.getUTCDate() - 6);
      return { start: iso(start), end: iso(today) };
    }

    if (datePreset === 'last_30d') {
      const start = new Date(today);
      start.setUTCDate(start.getUTCDate() - 29);
      return { start: iso(start), end: iso(today) };
    }

    if (datePreset === 'this_month') {
      const start = new Date(Date.UTC(y, m, 1));
      return { start: iso(start), end: iso(today) };
    }

    if (datePreset === 'last_month') {
      const start = new Date(Date.UTC(y, m - 1, 1));
      const end = new Date(Date.UTC(y, m, 0)); // last day of previous month
      return { start: iso(start), end: iso(end) };
    }

    // Fallback
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - 6);
    return { start: iso(start), end: iso(today) };
  };

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
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <ArrowUp className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[hsl(var(--foreground))] leading-none">Analise de Trafego</h2>
            {errorMsg && <p className="text-xs text-red-400 mt-0.5">{errorMsg}</p>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {!demoMode && (
            <select
              value={selectedAdAccountId}
              onChange={(e) => void onChangeAdAccount(e.target.value)}
              disabled={loadingAdAccounts || adAccounts.length === 0}
              className="max-w-[260px] px-3 py-2 rounded-xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              title={adAccounts.length === 0 ? 'Nenhuma conta encontrada' : 'Selecione a conta de anuncio'}
            >
              <option value="" disabled>
                {loadingAdAccounts ? 'Carregando contas...' : adAccounts.length === 0 ? 'Nenhuma conta encontrada' : 'Selecione a conta'}
              </option>
              {adAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {(a.name ? `${a.name} - ` : '') + a.id}
                </option>
              ))}
            </select>
          )}

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
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/25 text-indigo-400 text-sm font-semibold hover:bg-indigo-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar
          </button>
        </div>
      </div>

      <div className="rounded-2xl p-5 border border-[hsl(var(--border))]" style={{ background: 'hsl(220 18% 7%)' }}>
        <h3 className="text-sm font-bold text-[hsl(var(--foreground))] mb-4 flex items-center gap-2">
          <span className="w-1 h-4 rounded-full bg-indigo-400 inline-block" />
          Leads vs Gasto (
          {datePreset === 'last_7d'
            ? 'últimos 7 dias'
            : datePreset === 'last_30d'
              ? 'últimos 30 dias'
              : datePreset === 'this_month'
                ? 'este mês'
                : datePreset === 'last_month'
                  ? 'mês passado'
                  : dateSince && dateUntil
                    ? `${dateSince} → ${dateUntil}`
                    : 'período'}
          ){demoMode ? ' (demo)' : ''}
        </h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={demoMode ? mockComparisonData : comparisonData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
              <Tooltip cursor={{ fill: 'hsl(var(--secondary))' }} />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Bar dataKey="metaSpend" name="Gasto (R$)" fill="#6366F1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="metaLeads" name="Leads" fill="#10B981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

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

              <div className="flex items-center gap-2">
                <span className="text-xs text-[hsl(var(--muted-foreground))]">Período:</span>
                <select
                  value={datePreset}
                  onChange={(e) => setDatePreset(e.target.value as any)}
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
                      onChange={(e) => setDateSince(e.target.value)}
                      className="px-3 py-2 bg-[hsl(var(--input))] border border-[hsl(var(--border))] rounded-md text-sm text-[hsl(var(--foreground))] shadow-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                    />
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">até</span>
                    <input
                      type="date"
                      value={dateUntil}
                      onChange={(e) => setDateUntil(e.target.value)}
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
            *Hook Rate: estimativa baseada em video views (3s) / impressões. Hold Rate: estimativa baseada em video views (15s/ThruPlay) / impressões (apenas anúncios em vídeo).
          </div>
          <div>
            *IDC: média dos scores (Resultados, C/Res e CTR) normalizados entre os itens desta tabela. Classificação: Ótimo/Bom/Regular/Ruim por faixas de IDC.
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
                      ? 'Para salvar, digite um nome e clique em “Salvar”.'
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
    </div>
  );
};
