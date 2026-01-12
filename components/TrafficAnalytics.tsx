import React, { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, ExternalLink, Filter, RefreshCw } from 'lucide-react';
import { AdMetric } from '../types';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

interface TrafficAnalyticsProps {
  companyId?: string;
}

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
  },
];

const mockComparisonData = [
  { name: 'Seg', impacted: 4000, lastClick: 2400 },
  { name: 'Ter', impacted: 3000, lastClick: 1398 },
  { name: 'Qua', impacted: 2000, lastClick: 9800 },
  { name: 'Qui', impacted: 2780, lastClick: 3908 },
  { name: 'Sex', impacted: 1890, lastClick: 4800 },
  { name: 'Sab', impacted: 2390, lastClick: 3800 },
  { name: 'Dom', impacted: 3490, lastClick: 4300 },
];

const META_GRAPH_VERSION: string = (import.meta as any)?.env?.VITE_META_GRAPH_VERSION ?? 'v19.0';
const META_AD_ACCOUNT_ID_ENV: string = (import.meta as any)?.env?.VITE_META_AD_ACCOUNT_ID ?? '';

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

const extractLeadsFromActions = (actions: any[] | undefined) => {
  if (!Array.isArray(actions)) return undefined;
  const leadActions = actions.filter((a) => typeof a?.action_type === 'string' && a.action_type.includes('lead'));
  if (leadActions.length === 0) return undefined;
  return leadActions.reduce((sum, a) => sum + parseNumber(a.value), 0);
};

const extractRoas = (purchaseRoas: any[] | undefined) => {
  if (!Array.isArray(purchaseRoas) || purchaseRoas.length === 0) return undefined;
  return purchaseRoas.reduce((sum, r) => sum + parseNumber(r.value), 0);
};

export const TrafficAnalytics: React.FC<TrafficAnalyticsProps> = ({ companyId }) => {
  const [ads, setAds] = useState<AdMetric[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const demoMode = !isSupabaseConfigured();

  const resolveAdAccountId = async () => {
    const envId = normalizeAdAccountId(META_AD_ACCOUNT_ID_ENV);
    if (envId) return envId;

    let query = supabase.from('companies').select('meta_ad_account_id');
    if (companyId) query = query.eq('id', companyId);

    const { data, error } = await query.limit(1).maybeSingle();
    if (error) throw error;
    return normalizeAdAccountId(data?.meta_ad_account_id ?? '');
  };

  const fetchAds = async () => {
    setErrorMsg(null);

    if (demoMode) {
      setAds(mockAds);
      return;
    }

    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const providerToken = session?.provider_token;
      if (!providerToken) {
        setAds([]);
        setErrorMsg('Para carregar dados reais, faca login com Facebook (escopo ads_read).');
        return;
      }

      const adAccountId = await resolveAdAccountId();
      if (!adAccountId) {
        setAds([]);
        setErrorMsg('Faltou configurar o Meta Ad Account ID (act_...) na empresa.');
        return;
      }

      const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${adAccountId}/insights`);
      url.searchParams.set('level', 'ad');
      url.searchParams.set('fields', 'ad_id,ad_name,impressions,spend,cpc,ctr,actions,purchase_roas');
      url.searchParams.set('date_preset', 'last_7d');
      url.searchParams.set('limit', '50');
      url.searchParams.set('access_token', providerToken);

      const res = await fetch(url.toString());
      const json = await res.json();
      if (!res.ok || json?.error) {
        const msg = json?.error?.message || `Erro ao buscar insights (${res.status})`;
        throw new Error(msg);
      }

      const mapped: AdMetric[] = (json.data ?? []).map((row: any) => ({
        id: row.ad_id,
        adName: row.ad_name ?? `Ad ${row.ad_id}`,
        adId: row.ad_id,
        thumbnail: 'https://picsum.photos/50/50',
        status: 'active',
        spend: parseNumber(row.spend),
        impressions: Math.floor(parseNumber(row.impressions)),
        cpc: parseNumber(row.cpc) || undefined,
        ctr: parseNumber(row.ctr) || undefined,
        roas: extractRoas(row.purchase_roas),
        leads: extractLeadsFromActions(row.actions),
      }));

      setAds(mapped);
      if (mapped.length === 0) setErrorMsg('Sem dados de anuncios nesse periodo.');
    } catch (e: any) {
      console.error(e);
      setAds([]);
      setErrorMsg(e?.message || 'Erro ao carregar dados da Meta.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Analise de Trafego</h2>
          {errorMsg && <p className="text-sm text-red-600 mt-1">{errorMsg}</p>}
        </div>

        <div className="flex space-x-2">
          <button
            onClick={fetchAds}
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

      {demoMode && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold mb-4 text-gray-700">Comparacao (demo)</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mockComparisonData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
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
                <Bar dataKey="impacted" name="Impactadas" fill="#6366F1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="lastClick" name="Last Click" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10"
                >
                  Anuncio
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Gasto
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  CPC
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  CTR
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ROAS
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Leads
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Impressoes
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {ads.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-sm text-gray-400">
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {ad.cpc != null ? `R$ ${ad.cpc.toFixed(2)}` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {ad.ctr != null ? `${ad.ctr.toFixed(2)}%` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{ad.roas != null ? ad.roas.toFixed(2) : '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{ad.leads ?? '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{ad.impressions.toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-gray-100 bg-gray-50 text-xs text-gray-500">Periodo padrao: ultimos 7 dias.</div>
      </div>
    </div>
  );
};

