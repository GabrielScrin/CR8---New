import React, { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, ExternalLink, Filter, RefreshCw } from 'lucide-react';
import { AdMetric } from '../types';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

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
  const label = (text || 'CR-8').trim().slice(0, 2).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="100%" height="100%" rx="12" ry="12" fill="${bg}"/><text x="50%" y="56%" text-anchor="middle" font-size="30" font-family="Inter,system-ui,Segoe UI,Roboto,Arial" fill="${fg}">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const extractActionSum = (actions: any[] | undefined, matcher: (actionType: string) => boolean) => {
  if (!Array.isArray(actions)) return undefined;
  const matches = actions.filter((a) => typeof a?.action_type === 'string' && matcher(a.action_type));
  if (matches.length === 0) return undefined;
  return matches.reduce((sum, a) => sum + parseNumber(a.value), 0);
};

const extractLeadsFromActions = (actions: any[] | undefined) =>
  extractActionSum(actions, (t) => t.includes('lead') || t === 'onsite_conversion.lead_grouped');

const extractVideo3sFromActions = (actions: any[] | undefined) =>
  extractActionSum(actions, (t) => t === 'video_view' || t === 'video_view_3s' || t.includes('video_view'));

const extractVideo15sFromActions = (actions: any[] | undefined) =>
  extractActionSum(actions, (t) => t === 'video_view_15s' || t.includes('video_view_15s'));

const extractRoas = (purchaseRoas: any[] | undefined) => {
  if (!Array.isArray(purchaseRoas) || purchaseRoas.length === 0) return undefined;
  return purchaseRoas.reduce((sum, r) => sum + parseNumber(r.value), 0);
};

export const TrafficAnalytics: React.FC<TrafficAnalyticsProps> = ({ companyId }) => {
  const demoMode = !isSupabaseConfigured();

  const [activeTab, setActiveTab] = useState<TrafficTab>('meta');
  const [selectedLevel, setSelectedLevel] = useState<MetaLevel>('ad');
  const [comparisonData, setComparisonData] = useState<any[]>([]);

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

  const fixedColumns: TableColumn[] = useMemo(
    () => [
      {
        key: 'status',
        label: 'Status',
        render: (r) => (
          <span
            className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
              r.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
            }`}
          >
            {r.status === 'active' ? 'Ativo' : 'Pausado'}
          </span>
        ),
      },
      { key: 'spend', label: 'Investido', render: (r) => formatCurrency(r.spend) },
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
            <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-800 text-xs font-semibold">-</span>
          ),
      },
    ],
    [],
  );

  const tableColumns: TableColumn[] = useMemo(() => {
    const optional = visibleOptionalColumns.map((k) => optionalColumnsDef[k]).filter(Boolean);
    return [...fixedColumns, ...optional];
  }, [fixedColumns, optionalColumnsDef, visibleOptionalColumns]);

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
      const url = nextUrl ?? buildFirstUrl();
      const res = await fetch(url);
      const json = await res.json();
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
    if (adIds.length === 0) return new Map<string, string>();
    const ids = Array.from(new Set(adIds)).slice(0, 50);

    const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/`);
    url.searchParams.set('ids', ids.join(','));
    url.searchParams.set('fields', 'creative{thumbnail_url,image_url}');
    url.searchParams.set('access_token', providerToken);

    const res = await fetch(url.toString());
    const json = await res.json();
    if (!res.ok || json?.error) return new Map<string, string>();

    const out = new Map<string, string>();
    for (const id of ids) {
      const node = json?.[id];
      const thumb: string | undefined = node?.creative?.thumbnail_url || node?.creative?.image_url;
      if (thumb) out.set(id, thumb);
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
    const leadsValues = items.map((r) => r.leads ?? 0);
    const ctrValues = items.map((r) => r.ctr ?? 0);
    const cplValues = items.map((r) => r.cpa).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

    const minLeads = leadsValues.length ? Math.min(...leadsValues) : 0;
    const maxLeads = leadsValues.length ? Math.max(...leadsValues) : 0;
    const minCtr = ctrValues.length ? Math.min(...ctrValues) : 0;
    const maxCtr = ctrValues.length ? Math.max(...ctrValues) : 0;
    const minCpl = cplValues.length ? Math.min(...cplValues) : 0;
    const maxCpl = cplValues.length ? Math.max(...cplValues) : 0;

    return items.map((row) => {
      const leads = row.leads ?? 0;
      const cpl = row.cpa;
      const ctr = row.ctr ?? 0;

      const scoreLeads01 = normalizeHigherBetter(leads, minLeads, maxLeads);
      const scoreCpl01 = cpl != null ? normalizeLowerBetter(cpl, minCpl, maxCpl) : 0;
      const scoreCtr01 = normalizeHigherBetter(ctr, minCtr, maxCtr);

      const idc01 = (scoreLeads01 + scoreCpl01 + scoreCtr01) / 3;

      const classification: AdMetric['classification'] =
        leads === 0
          ? undefined
          : idc01 >= IDC_THRESHOLDS.otimo
            ? 'otimo'
            : idc01 >= IDC_THRESHOLDS.bom
              ? 'bom'
              : idc01 >= IDC_THRESHOLDS.regular
                ? 'regular'
                : 'ruim';

      const scores = [
        { label: 'Leads', value: Math.round(scoreLeads01 * 100) },
        { label: 'CPL', value: Math.round(scoreCpl01 * 100) },
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
      timeseriesUrl.searchParams.set('date_preset', 'last_7d');
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
            metaLeads: extractLeadsFromActions(row.actions) ?? 0,
          })),
        );
      } else {
        setComparisonData([]);
      }

      const insightsUrl = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${adAccountId}/insights`);
      insightsUrl.searchParams.set('level', selectedLevel);
      insightsUrl.searchParams.set(
        'fields',
        [
          selectedLevel === 'campaign'
            ? 'campaign_id,campaign_name'
            : selectedLevel === 'adset'
              ? 'adset_id,adset_name,campaign_id,campaign_name'
              : 'ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name',
          'impressions,reach,clicks,inline_link_clicks,cpm,frequency,spend,cpc,ctr,actions,purchase_roas',
        ].join(','),
      );
      insightsUrl.searchParams.set('date_preset', 'last_7d');
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
        const leads = extractLeadsFromActions(row.actions);
        const cpa = leads && leads > 0 ? spend / leads : undefined;
        const ctr = typeof row.ctr === 'string' || typeof row.ctr === 'number' ? parseNumber(row.ctr) : undefined;
        const roas = extractRoas(row.purchase_roas);

        const video3s = extractVideo3sFromActions(row.actions);
        const video15s = extractVideo15sFromActions(row.actions);
        const hookRate = impressions > 0 && video3s != null ? video3s / impressions : undefined;
        const holdRate = impressions > 0 && video15s != null ? video15s / impressions : undefined;

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
          status: mapMetaEffectiveStatusToLocal(effectiveStatuses.get(String(entityId))),
          spend,
          impressions,
          reach: row.reach != null ? Math.floor(parseNumber(row.reach)) : undefined,
          clicks: row.clicks != null ? Math.floor(parseNumber(row.clicks)) : undefined,
          inlineLinkClicks: row.inline_link_clicks != null ? Math.floor(parseNumber(row.inline_link_clicks)) : undefined,
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
          const thumb = thumbs.get(row.adId);
          if (thumb) row.thumbnail = thumb;
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
  }, [companyId, selectedLevel, activeTab]);

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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Análise de Tráfego Deep Dive</h2>
          {errorMsg && <p className="text-sm text-red-600 mt-1">{errorMsg}</p>}
        </div>

        <div className="flex space-x-2 items-center">
          {!demoMode && (
            <select
              value={selectedAdAccountId}
              onChange={(e) => void onChangeAdAccount(e.target.value)}
              disabled={loadingAdAccounts || adAccounts.length === 0}
              className="max-w-[340px] px-3 py-2 bg-white border border-gray-300 rounded-md text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              title={adAccounts.length === 0 ? 'Nenhuma conta encontrada' : 'Selecione a conta de anúncio'}
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
              className="px-3 py-2 bg-indigo-600 text-white rounded-md text-sm hover:bg-indigo-700 shadow-sm"
            >
              Reautorizar Facebook
            </button>
          )}

          <button
            onClick={() => void fetchTraffic()}
            className="flex items-center px-3 py-2 bg-white border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50 shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>

          <button
            onClick={openColumnsModal}
            className="flex items-center px-3 py-2 bg-white border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50 shadow-sm"
          >
            <Filter className="w-4 h-4 mr-2" />
            Colunas
          </button>

          <button
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="flex items-center px-3 py-2 bg-indigo-600 text-white rounded-md text-sm hover:bg-indigo-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4 mr-2" />
            Exportar
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold mb-4 text-gray-700">Leads (Meta) vs Gasto (últimos 7 dias){demoMode ? ' (demo)' : ''}</h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={demoMode ? mockComparisonData : comparisonData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280' }} />
              <Tooltip cursor={{ fill: '#F3F4F6' }} />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Bar dataKey="metaSpend" name="Gasto (R$)" fill="#6366F1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="metaLeads" name="Leads" fill="#10B981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 pt-4 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex gap-6 text-sm font-medium">
            <button
              type="button"
              onClick={() => setActiveTab('meta')}
              className={activeTab === 'meta' ? 'text-indigo-600 border-b-2 border-indigo-600 pb-2' : 'text-gray-500 pb-2 hover:text-gray-700'}
            >
              Performance de Anúncios
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('platform')}
              className={activeTab === 'platform' ? 'text-indigo-600 border-b-2 border-indigo-600 pb-2' : 'text-gray-500 pb-2 hover:text-gray-700'}
            >
              Dados de Plataforma
            </button>
          </div>

          {activeTab === 'meta' && (
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Nível:</span>
                <select
                  value={selectedLevel}
                  onChange={(e) => setSelectedLevel(e.target.value as MetaLevel)}
                  className="px-3 py-2 bg-white border border-gray-300 rounded-md text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="campaign">Campanhas</option>
                  <option value="adset">Conjuntos</option>
                  <option value="ad">Anúncios</option>
                </select>
              </div>

              {!demoMode && userId && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Colunas:</span>
                  <select
                    value={selectedPresetId}
                    onChange={(e) => onSelectPreset(e.target.value)}
                    className="px-3 py-2 bg-white border border-gray-300 rounded-md text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{entityLabel}</th>
                {tableColumns.map((c) => (
                  <th key={c.key} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {c.label}
                  </th>
                ))}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Etiquetas</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={tableColumns.length + 2} className="px-6 py-10 text-center text-sm text-gray-400">
                    {demoMode ? 'Sem dados.' : 'Sem dados reais para mostrar ainda.'}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <img className="h-10 w-10 rounded object-cover" src={row.thumbnail} alt="" />
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{row.adName}</div>
                          <div className="text-xs text-gray-500 flex items-center">
                            {row.subtitle ?? ''}
                            <ExternalLink
                              className="w-3 h-3 ml-1 cursor-pointer hover:text-indigo-500"
                              title={`Abrir no Ads Manager (ID: ${row.adId})`}
                              onClick={() => openInAdsManager(row.adId)}
                            />
                          </div>
                        </div>
                      </div>
                    </td>
                    {tableColumns.map((c) => (
                      <td key={c.key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {c.render(row)}
                      </td>
                    ))}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex gap-2 flex-wrap">
                        {(row.tags ?? []).map((t) => (
                          <span key={t} className="px-2 py-0.5 rounded bg-gray-100 text-gray-800 text-xs font-medium">
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

        <div className="p-4 border-t border-gray-100 bg-gray-50 text-xs text-gray-500">
          *Hook Rate: estimativa baseada em video views (3s) / impressões. Hold Rate: estimativa baseada em video views (15s) / impressões.
        </div>
      </div>

      {columnsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl border border-gray-100 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold text-gray-900">Colunas</div>
                <div className="text-xs text-gray-500">Salve visualizações por usuário (e por nível).</div>
              </div>
              <button type="button" className="text-sm text-gray-500 hover:text-gray-700" onClick={() => setColumnsModalOpen(false)}>
                Fechar
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 overflow-y-auto flex-1 min-h-0">
              <div className="space-y-5">
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Colunas fixas (sempre visíveis)</div>
                  <div className="mt-3 space-y-2">
                    {fixedColumns.map((c) => (
                      <label key={c.key} className="flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" checked disabled className="h-4 w-4" />
                        <span>{c.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Métricas opcionais</div>
                  <div className="mt-3 space-y-2">
                    {OPTIONAL_METRICS_ORDER.map((k) => {
                      const col = optionalColumnsDef[k];
                      const checked = draftOptionalColumns.includes(k);
                      return (
                        <label key={k} className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleDraftColumn(k)}
                            className="h-4 w-4"
                          />
                          <span>{col.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="space-y-5">
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Colunas selecionadas ({fixedColumns.length + draftOptionalColumns.length})
                  </div>
                  <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
                    <div className="px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">Fixas</div>
                    <div className="divide-y divide-gray-200">
                      {fixedColumns.map((c) => (
                        <div key={c.key} className="px-4 py-3 text-sm text-gray-700 flex items-center justify-between">
                          <span>{c.label}</span>
                          <span className="text-xs text-gray-400">fixa</span>
                        </div>
                      ))}
                    </div>

                    <div className="px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">Opcionais</div>
                    <div className="divide-y divide-gray-200">
                      {draftOptionalColumns.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-gray-500">Nenhuma métrica opcional selecionada.</div>
                      ) : (
                        draftOptionalColumns.map((k) => (
                          <div key={k} className="px-4 py-3 text-sm text-gray-700 flex items-center justify-between gap-3">
                            <span className="min-w-0 truncate">{optionalColumnsDef[k].label}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
                                onClick={() => moveDraftColumn(k, -1)}
                                title="Mover para cima"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
                                onClick={() => moveDraftColumn(k, 1)}
                                title="Mover para baixo"
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
                                onClick={() => toggleDraftColumn(k)}
                                title="Remover"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Nome da visualização</div>
                  <input
                    value={draftPresetName}
                    onChange={(e) => setDraftPresetName(e.target.value)}
                    placeholder={selectedPresetId === DEFAULT_PRESET_ID ? 'Ex: Meu relatório' : ''}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <div className="text-xs text-gray-500">
                    {selectedPresetId === DEFAULT_PRESET_ID
                      ? 'Para salvar, digite um nome e clique em “Salvar”.'
                      : 'Você pode salvar as mudanças nesta visualização ou salvar como uma nova.'}
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap">
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
                  className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
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
                  className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {selectedPresetId === DEFAULT_PRESET_ID ? 'Salvar' : 'Salvar como nova'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
