import React, { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, ExternalLink, Filter, RefreshCw } from 'lucide-react';
import { AdMetric } from '../types';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

interface TrafficAnalyticsProps {
  companyId?: string;
}

type MetaLevel = 'campaign' | 'adset' | 'ad';
type TrafficTab = 'meta' | 'platform';

const mockAds: AdMetric[] = [
  {
    id: '1',
    adName: 'Video depoimento - Topo de funil',
    adId: '23849102938',
    thumbnail: 'https://picsum.photos/50/50',
    status: 'active',
    spend: 1250,
    impressions: 15400,
    cpc: 2.15,
    ctr: 1.8,
    roas: 2.4,
    leads: 142,
    cpa: 8.8,
    hookRate: 0.4,
    holdRate: 0.2,
    scores: [
      { label: 'L', value: 90 },
      { label: 'C', value: 85 },
    ],
    classification: 'winner',
    tags: ['Quente', 'Prova Social'],
  },
  {
    id: '2',
    adName: 'Carrossel oferta - Remarketing',
    adId: '23849102939',
    thumbnail: 'https://picsum.photos/51/51',
    status: 'active',
    spend: 890,
    impressions: 8200,
    cpc: 3.1,
    ctr: 2.2,
    roas: 1.6,
    leads: 89,
    cpa: 10,
    hookRate: 0.32,
    holdRate: 0.18,
    scores: [
      { label: 'L', value: 78 },
      { label: 'C', value: 74 },
    ],
    classification: 'neutral',
    tags: ['Em teste'],
  },
  {
    id: '3',
    adName: 'Imagem estatica - Prova social',
    adId: '23849102940',
    thumbnail: 'https://picsum.photos/52/52',
    status: 'paused',
    spend: 400,
    impressions: 2100,
    cpc: 4.9,
    ctr: 0.7,
    roas: 0.4,
    leads: 12,
    cpa: 33.3,
    scores: [{ label: 'L', value: 40 }],
    classification: 'loser',
    tags: ['Revisar'],
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

const META_GRAPH_VERSION: string = import.meta.env.VITE_META_GRAPH_VERSION ?? 'v19.0';
const META_AD_ACCOUNT_ID_ENV: string = import.meta.env.VITE_META_AD_ACCOUNT_ID ?? '';
const META_SCOPES: string = import.meta.env.VITE_FACEBOOK_SCOPES ?? 'public_profile ads_read';

const normalizeAdAccountId = (id: string) => {
  const trimmed = id.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('act_') ? trimmed : `act_${trimmed.replace(/^act_/, '')}`;
};

const parseNumber = (value: unknown) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number.parseFloat(value);
  return 0;
};

const extractActionSum = (actions: any[] | undefined, matcher: (actionType: string) => boolean) => {
  if (!Array.isArray(actions)) return undefined;
  const matches = actions.filter((a) => typeof a?.action_type === 'string' && matcher(a.action_type));
  if (matches.length === 0) return undefined;
  return matches.reduce((sum, a) => sum + parseNumber(a.value), 0);
};

const extractLeadsFromActions = (actions: any[] | undefined) =>
  extractActionSum(actions, (t) => t.includes('lead') || t === 'onsite_conversion.lead_grouped');

const extractVideo3s = (actions: any[] | undefined) =>
  extractActionSum(actions, (t) => t === 'video_view' || t.includes('video_view') || t === 'video_view_3s');

const extractVideo15s = (actions: any[] | undefined) =>
  extractActionSum(actions, (t) => t === 'video_view_15s' || t.includes('video_view_15s'));

const extractRoas = (purchaseRoas: any[] | undefined) => {
  if (!Array.isArray(purchaseRoas) || purchaseRoas.length === 0) return undefined;
  return purchaseRoas.reduce((sum, r) => sum + parseNumber(r.value), 0);
};

type MetaAdAccount = {
  id: string; // ex: "act_123..."
  name?: string;
  account_id?: string;
  currency?: string;
  account_status?: number;
};

const normalizeScopes = (scopes: string) => {
  const parts = scopes
    .split(/[,\s]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set(parts)).join(' ');
};

const facebookScopes = normalizeScopes(META_SCOPES);

export const TrafficAnalytics: React.FC<TrafficAnalyticsProps> = ({ companyId }) => {
  const [ads, setAds] = useState<AdMetric[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [adAccounts, setAdAccounts] = useState<MetaAdAccount[]>([]);
  const [selectedAdAccountId, setSelectedAdAccountId] = useState<string>('');
  const [loadingAdAccounts, setLoadingAdAccounts] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<MetaLevel>('ad');
  const [activeTab, setActiveTab] = useState<TrafficTab>('meta');
  const [comparisonData, setComparisonData] = useState<any[]>([]);

  const demoMode = !isSupabaseConfigured();

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

  const getProviderToken = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.provider_token ?? null;
  };

  const fetchAllAdAccounts = async (providerToken: string) => {
    const results: MetaAdAccount[] = [];
    let nextUrl: string | null = null;

    const buildFirstUrl = () => {
      const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/me/adaccounts`);
      url.searchParams.set('fields', 'id,name,account_id,currency,account_status');
      url.searchParams.set('limit', '50');
      url.searchParams.set('access_token', providerToken);
      return url.toString();
    };

    for (let page = 0; page < 5; page += 1) {
      const url = nextUrl ?? buildFirstUrl();
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok || json?.error) {
        const msg = json?.error?.message || `Erro ao listar contas de anuncio (${res.status})`;
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

  const fetchAds = async (overrideAdAccountId?: string) => {
    setErrorMsg(null);
    setNeedsReauth(false);

    if (demoMode) {
      setAds(mockAds);
      setComparisonData(mockComparisonData);
      return;
    }

    setLoading(true);
    try {
      const providerToken = await getProviderToken();
      if (!providerToken) {
        setAds([]);
        setNeedsReauth(true);
        setErrorMsg('Para carregar dados reais, faca login com Facebook (escopo ads_read).');
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

      if (!adAccountId) {
        setAds([]);
        setErrorMsg(
          accounts.length === 0
            ? 'Nenhuma conta de anuncio encontrada para esse usuario do Facebook.'
            : 'Selecione uma conta de anuncio para ver os dados.',
        );
        return;
      }

      if (adAccountId !== selectedAdAccountId) setSelectedAdAccountId(adAccountId);
      if (companyId && dbId !== adAccountId) {
        try {
          await persistSelectedAdAccount(adAccountId);
        } catch (e) {
          console.warn('Nao foi possivel salvar meta_ad_account_id na empresa.', e);
        }
      }

      // Timeseries (chart)
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
      }

      const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${adAccountId}/insights`);
      url.searchParams.set('level', selectedLevel);

      const commonFields = 'impressions,spend,cpc,ctr,actions,purchase_roas';
      const entityFields =
        selectedLevel === 'campaign'
          ? 'campaign_id,campaign_name'
          : selectedLevel === 'adset'
            ? 'adset_id,adset_name'
            : 'ad_id,ad_name,quality_ranking,engagement_rate_ranking,conversion_rate_ranking';
      const videoFields = selectedLevel === 'ad' ? ',video_3_sec_watched_actions,video_15_sec_watched_actions' : '';
      url.searchParams.set('fields', `${entityFields},${commonFields}${videoFields}`);
      url.searchParams.set('date_preset', 'last_7d');
      url.searchParams.set('limit', '50');
      url.searchParams.set('access_token', providerToken);

      const res = await fetch(url.toString());
      const json = await res.json();
      if (!res.ok || json?.error) {
        const msg = json?.error?.message || `Erro ao buscar insights (${res.status})`;
        const metaError = json?.error;
        const err: any = new Error(msg);
        err.metaError = metaError;
        throw err;
      }

      const mapped: AdMetric[] = (json.data ?? []).map((row: any) => {
        const entityId =
          selectedLevel === 'campaign' ? row.campaign_id : selectedLevel === 'adset' ? row.adset_id : row.ad_id;
        const entityName =
          selectedLevel === 'campaign'
            ? row.campaign_name
            : selectedLevel === 'adset'
              ? row.adset_name
              : row.ad_name;

        const impressions = Math.floor(parseNumber(row.impressions));
        const spend = parseNumber(row.spend);
        const leads = extractLeadsFromActions(row.actions);
        const cpa = leads && leads > 0 ? spend / leads : undefined;
        const ctr = parseNumber(row.ctr) || undefined;
        const roas = extractRoas(row.purchase_roas);

        const video3s = extractVideo3s(row.video_3_sec_watched_actions);
        const video15s = extractVideo15s(row.video_15_sec_watched_actions);
        const hookRate = impressions > 0 && video3s != null ? video3s / impressions : undefined;
        const holdRate = impressions > 0 && video15s != null ? video15s / impressions : undefined;

        const scoreLanding = cpa != null ? Math.max(0, Math.min(100, Math.round(100 - cpa * 2))) : undefined;
        const scoreCreative = ctr != null ? Math.max(0, Math.min(100, Math.round(ctr * 30))) : undefined;
        const scores = [
          ...(scoreLanding != null ? [{ label: 'L', value: scoreLanding }] : []),
          ...(scoreCreative != null ? [{ label: 'C', value: scoreCreative }] : []),
        ];

        const classification: AdMetric['classification'] =
          leads != null && leads >= 10 && (roas == null ? (cpa != null && cpa <= 20) : roas >= 1.5)
            ? 'winner'
            : spend >= 50 && (leads ?? 0) === 0
              ? 'loser'
              : 'neutral';

        const tags: string[] = [];
        const nameLower = String(entityName ?? '').toLowerCase();
        if (classification === 'winner') tags.push('Quente');
        if (nameLower.includes('depoimento') || nameLower.includes('prova')) tags.push('Prova Social');
        if (tags.length === 0) tags.push('Em teste');

        return {
          id: String(entityId),
          adName: entityName ?? `${selectedLevel} ${entityId}`,
          adId: String(entityId),
          thumbnail: 'https://picsum.photos/50/50',
          status: 'active',
          spend,
          impressions,
          cpc: parseNumber(row.cpc) || undefined,
          ctr,
          roas,
          leads,
          cpa,
          hookRate,
          holdRate,
          scores: scores.length ? scores : undefined,
          classification,
          tags,
        };
      });

      setAds(mapped);
      if (mapped.length === 0) setErrorMsg('Sem dados de anuncios nesse periodo.');
    } catch (e: any) {
      console.error(e);
      setAds([]);

      const metaCode = e?.metaError?.code;
      const metaSubcode = e?.metaError?.error_subcode;
      if (metaCode === 200) {
        setNeedsReauth(true);
        setErrorMsg(
          'Sem permissao ads_read para acessar essa conta de anuncio. Clique em "Reautorizar Facebook" e aceite as permissoes, ou selecione outra conta.',
        );
      } else if (metaCode || metaSubcode) {
        setErrorMsg(`${e?.message || 'Erro ao carregar dados da Meta.'} (code: ${metaCode ?? '-'}, subcode: ${metaSubcode ?? '-'})`);
      } else {
        setErrorMsg(e?.message || 'Erro ao carregar dados da Meta.');
      }
    } finally {
      setLoading(false);
      setLoadingAdAccounts(false);
    }
  };

  useEffect(() => {
    if (demoMode) {
      setAds(mockAds);
      setComparisonData(mockComparisonData);
      return;
    }
    void fetchAds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, selectedLevel, activeTab]);

  const onChangeAdAccount = async (id: string) => {
    const normalized = normalizeAdAccountId(id);
    if (!normalized) return;
    setSelectedAdAccountId(normalized);
    try {
      await persistSelectedAdAccount(normalized);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message || 'Nao foi possivel salvar a conta de anuncio na empresa.');
    }
    await fetchAds(normalized);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Analise de Trafego Deep Dive</h2>
          {errorMsg && <p className="text-sm text-red-600 mt-1">{errorMsg}</p>}
          {!demoMode && adAccounts.length > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              Conta selecionada: <span className="font-medium">{selectedAdAccountId || '(nenhuma)'}</span>
            </p>
          )}
        </div>

        <div className="flex space-x-2 items-center">
          {!demoMode && (
            <select
              value={selectedAdAccountId}
              onChange={(e) => void onChangeAdAccount(e.target.value)}
              disabled={loadingAdAccounts || adAccounts.length === 0}
              className="max-w-[340px] px-3 py-2 bg-white border border-gray-300 rounded-md text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
              className="px-3 py-2 bg-indigo-600 text-white rounded-md text-sm hover:bg-indigo-700 shadow-sm"
            >
              Reautorizar Facebook
            </button>
          )}
          <button
            onClick={() => void fetchAds()}
            className="flex items-center px-3 py-2 bg-white border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50 shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          <button className="flex items-center px-3 py-2 bg-white border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50 shadow-sm">
            <Filter className="w-4 h-4 mr-2" />
            Filtros
          </button>
          <button className="flex items-center px-3 py-2 bg-indigo-600 text-white rounded-md text-sm hover:bg-indigo-700 shadow-sm">
            <Download className="w-4 h-4 mr-2" />
            Exportar
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold mb-4 text-gray-700">
          Vendas/Leads (Meta) vs Gasto (ultimos 7 dias){demoMode ? ' (demo)' : ''}
        </h3>
        {!demoMode && comparisonData.length === 0 && (
          <p className="text-sm text-gray-400 mb-3">Sem dados suficientes para montar o grafico ainda.</p>
        )}
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={demoMode ? mockComparisonData : comparisonData}
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280' }} />
              <Tooltip
                cursor={{ fill: '#F3F4F6' }}
                contentStyle={{
                  borderRadius: '8px',
                  border: 'none',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                }}
              />
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
              Performance (Meta)
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
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Nivel:</span>
              <select
                value={selectedLevel}
                onChange={(e) => setSelectedLevel(e.target.value as MetaLevel)}
                className="px-3 py-2 bg-white border border-gray-300 rounded-md text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="campaign">Campanhas</option>
                <option value="adset">Conjuntos</option>
                <option value="ad">Anuncios</option>
              </select>
            </div>
          )}
        </div>

        {activeTab === 'platform' ? (
          <div className="p-6 text-sm text-gray-500">
            Integração de plataforma (Hotmart/Monetizze/Google/UTMs) entra na Fase 1.5/2. Por enquanto o Deep Dive mostra os dados do Gerenciador (Meta).
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10"
                    >
                      {selectedLevel === 'campaign' ? 'Campanha' : selectedLevel === 'adset' ? 'Conjunto' : 'Anuncio'}
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Spend
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Leads
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      CPA
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Hook Rate
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Hold Rate
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Scores
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Classificacao
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Etiquetas
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {ads.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-6 py-10 text-center text-sm text-gray-400">
                        {demoMode ? 'Sem dados.' : 'Sem dados reais para mostrar ainda.'}
                      </td>
                    </tr>
                  ) : (
                    ads.map((ad) => (
                      <tr key={ad.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap sticky left-0 bg-white z-10">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10">
                              <img className="h-10 w-10 rounded object-cover" src={ad.thumbnail} alt="" />
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">{ad.adName}</div>
                              <div className="text-xs text-gray-500 flex items-center">
                                ID: {ad.adId}
                                <ExternalLink className="w-3 h-3 ml-1 cursor-pointer hover:text-indigo-500" />
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              ad.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {ad.status === 'active' ? 'Ativo' : 'Pausado'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">R$ {ad.spend.toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{ad.leads ?? '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{ad.cpa != null ? `R$ ${ad.cpa.toFixed(2)}` : '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{ad.hookRate != null ? `${(ad.hookRate * 100).toFixed(0)}%` : '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{ad.holdRate != null ? `${(ad.holdRate * 100).toFixed(0)}%` : '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div className="flex gap-2">
                            {(ad.scores ?? []).map((s) => (
                              <span key={s.label} className="px-2 py-0.5 rounded bg-green-100 text-green-800 text-xs font-medium">
                                {s.label}:{s.value}
                              </span>
                            ))}
                            {!ad.scores?.length && '-'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {ad.classification === 'winner' ? (
                            <span className="px-2 py-0.5 rounded bg-green-100 text-green-800 text-xs font-semibold">Winner</span>
                          ) : ad.classification === 'loser' ? (
                            <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 text-xs font-semibold">Loser</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-800 text-xs font-semibold">Neutro</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div className="flex gap-2 flex-wrap">
                            {(ad.tags ?? []).map((t) => (
                              <span key={t} className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs">
                                {t}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-gray-100 bg-gray-50 text-xs text-gray-500">
              *Hook Rate: estimativa baseada em video views (3s) / impressoes. Hold Rate: estimativa baseada em video views (15s) / impressoes.
            </div>
          </>
        )}
      </div>

    </div>
  );
};
