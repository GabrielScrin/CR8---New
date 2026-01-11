import React, { useState, useEffect } from 'react';
import { AdMetric } from '../types';
import { ArrowUpRight, ArrowDownRight, Filter, Download, ExternalLink, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const mockAds: AdMetric[] = [
  {
    id: '1',
    adName: 'Vídeo Depoimento - Topo de Funil',
    adId: '23849102938',
    thumbnail: 'https://picsum.photos/50/50',
    status: 'active',
    leads: 142,
    spend: 1250.00,
    cpa: 8.80,
    cpi: 2.10,
    impressions: 15400,
    hookRate: '32%',
    holdRate: '15%',
    tags: ['Consciência', 'Frio'],
    scoreLead: 85,
    scoreCPL: 90,
    scoreCTR: 75,
    classification: 'Winner'
  },
  {
    id: '2',
    adName: 'Carrossel Oferta - Remarketing',
    adId: '23849102939',
    thumbnail: 'https://picsum.photos/51/51',
    status: 'active',
    leads: 89,
    spend: 890.00,
    cpa: 10.00,
    cpi: 3.50,
    impressions: 8200,
    hookRate: '28%',
    holdRate: '12%',
    tags: ['Oferta', 'Quente'],
    scoreLead: 92,
    scoreCPL: 70,
    scoreCTR: 88,
    classification: 'Test'
  },
  {
    id: '3',
    adName: 'Imagem Estática - Prova Social',
    adId: '23849102940',
    thumbnail: 'https://picsum.photos/52/52',
    status: 'paused',
    leads: 12,
    spend: 400.00,
    cpa: 33.33,
    cpi: 5.20,
    impressions: 2100,
    hookRate: '12%',
    holdRate: '5%',
    tags: ['Consciência'],
    scoreLead: 40,
    scoreCPL: 20,
    scoreCTR: 30,
    classification: 'Loser'
  }
];

const mockComparisonData = [
  { name: 'Seg', impacted: 4000, lastClick: 2400 },
  { name: 'Ter', impacted: 3000, lastClick: 1398 },
  { name: 'Qua', impacted: 2000, lastClick: 9800 },
  { name: 'Qui', impacted: 2780, lastClick: 3908 },
  { name: 'Sex', impacted: 1890, lastClick: 4800 },
  { name: 'Sáb', impacted: 2390, lastClick: 3800 },
  { name: 'Dom', impacted: 3490, lastClick: 4300 },
];

export const TrafficAnalytics: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'ads' | 'platforms'>('ads');
  const [ads, setAds] = useState<AdMetric[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAds = async () => {
    if (!isSupabaseConfigured()) {
        setAds(mockAds);
        return;
    }
    
    setLoading(true);
    try {
        const { data, error } = await supabase.from('ad_metrics').select('*');
        if (error) {
            console.error(error);
            setAds(mockAds);
        } else {
             const mappedAds: AdMetric[] = data.map((d: any) => ({
                id: d.id,
                adName: d.ad_name,
                adId: d.ad_id,
                thumbnail: d.thumbnail || 'https://picsum.photos/50/50',
                status: d.status,
                leads: d.leads,
                spend: d.spend,
                cpa: d.cpa,
                cpi: d.cpi,
                impressions: d.impressions,
                hookRate: d.hook_rate,
                holdRate: d.hold_rate,
                tags: d.tags || [],
                scoreLead: d.score_lead,
                scoreCPL: d.score_cpl,
                scoreCTR: d.score_ctr,
                classification: d.classification
            }));
            setAds(mappedAds.length > 0 ? mappedAds : mockAds);
        }
    } catch (e) {
        console.error(e);
        setAds(mockAds);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    fetchAds();
  }, []);

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-100';
    if (score >= 50) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Análise de Tráfego Deep Dive</h2>
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

      {/* Comparison Chart */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold mb-4 text-gray-700">Vendas Impactadas (Meta/Google) vs Last Click (Hotmart/Monetizze)</h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={mockComparisonData}
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB"/>
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#6B7280'}} />
              <YAxis axisLine={false} tickLine={false} tick={{fill: '#6B7280'}} />
              <Tooltip cursor={{fill: '#F3F4F6'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'}} />
              <Legend wrapperStyle={{paddingTop: '20px'}} />
              <Bar dataKey="impacted" name="Impactadas (Gerenciador)" fill="#6366F1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="lastClick" name="Last Click (Plataforma)" fill="#10B981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detailed Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex space-x-4">
                <button 
                    onClick={() => setActiveTab('ads')}
                    className={`pb-2 text-sm font-medium ${activeTab === 'ads' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500'}`}
                >
                    Performance de Anúncios
                </button>
                <button 
                    onClick={() => setActiveTab('platforms')}
                    className={`pb-2 text-sm font-medium ${activeTab === 'platforms' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500'}`}
                >
                    Dados de Plataforma
                </button>
            </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10">Anúncio</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Spend</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Leads</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CPA</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hook Rate</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hold Rate</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Scores</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Classificação</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Etiquetas</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {ads.map((ad) => (
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
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${ad.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {ad.status === 'active' ? 'Ativo' : 'Pausado'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    R$ {ad.spend.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {ad.leads}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    R$ {ad.cpa.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                    {ad.hookRate}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {ad.holdRate}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex space-x-1">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${getScoreColor(ad.scoreLead)}`} title="Lead Score">L:{ad.scoreLead}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${getScoreColor(ad.scoreCTR)}`} title="CTR Score">C:{ad.scoreCTR}</span>
                    </div>
                  </td>
                   <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-bold rounded border ${
                        ad.classification === 'Winner' ? 'bg-green-50 text-green-700 border-green-200' :
                        ad.classification === 'Loser' ? 'bg-red-50 text-red-700 border-red-200' :
                        'bg-blue-50 text-blue-700 border-blue-200'
                    }`}>
                      {ad.classification}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-wrap gap-1">
                        {ad.tags.map(tag => (
                            <span key={tag} className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                {tag}
                            </span>
                        ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-gray-100 bg-gray-50 text-xs text-gray-500">
            *Hook Rate: % de pessoas que pararam para ver o vídeo (3s/Impr). Hold Rate: % de retenção até 15s.
        </div>
      </div>
    </div>
  );
};