import React, { useEffect, useMemo, useState } from 'react';
import { Activity, DollarSign, TrendingUp, Users } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

interface DashboardProps {
  companyId?: string;
}

type Point = { name: string; leads: number; sales: number };

const demoData: Point[] = [
  { name: '01', leads: 400, sales: 240 },
  { name: '05', leads: 300, sales: 139 },
  { name: '10', leads: 200, sales: 980 },
  { name: '15', leads: 278, sales: 390 },
  { name: '20', leads: 189, sales: 480 },
  { name: '25', leads: 239, sales: 380 },
  { name: '30', leads: 349, sales: 430 },
];

const formatDay = (d: Date) => `${String(d.getDate()).padStart(2, '0')}`;

export const Dashboard: React.FC<DashboardProps> = ({ companyId }) => {
  const demoMode = !isSupabaseConfigured();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [chartData, setChartData] = useState<Point[]>(demoData);
  const [totalLeads, setTotalLeads] = useState<number | null>(null);
  const [wonLeads, setWonLeads] = useState<number | null>(null);
  const [revenue, setRevenue] = useState<number | null>(null);

  const startIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);

  const load = async () => {
    setErrorMsg(null);

    if (demoMode) {
      setTotalLeads(2543);
      setWonLeads(124);
      setRevenue(45200);
      setChartData(demoData);
      return;
    }

    if (!companyId) {
      setTotalLeads(null);
      setWonLeads(null);
      setRevenue(null);
      setChartData([]);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('status,value,created_at,company_id')
        .eq('company_id', companyId)
        .gte('created_at', startIso)
        .limit(5000);

      if (error) throw error;

      const rows = data ?? [];
      const total = rows.length;
      const won = rows.filter((r: any) => r.status === 'won').length;
      const rev = rows
        .filter((r: any) => r.status === 'won')
        .reduce((sum: number, r: any) => sum + (typeof r.value === 'number' ? r.value : Number(r.value) || 0), 0);

      setTotalLeads(total);
      setWonLeads(won);
      setRevenue(rev);

      const buckets = new Map<string, { leads: number; sales: number }>();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (let i = 0; i < 30; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - (29 - i));
        const key = d.toISOString().slice(0, 10);
        buckets.set(key, { leads: 0, sales: 0 });
      }

      for (const r of rows as any[]) {
        const key = String(r.created_at).slice(0, 10);
        const b = buckets.get(key);
        if (!b) continue;
        b.leads += 1;
        if (r.status === 'won') b.sales += 1;
      }

      const points: Point[] = Array.from(buckets.entries()).map(([key, v]) => ({
        name: formatDay(new Date(key)),
        leads: v.leads,
        sales: v.sales,
      }));

      setChartData(points);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message || 'Erro ao carregar dashboard.');
      setChartData([]);
      setTotalLeads(null);
      setWonLeads(null);
      setRevenue(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const kpiValue = (value: number | null, formatter?: (n: number) => string) => {
    if (loading) return '...';
    if (value == null) return '-';
    return formatter ? formatter(value) : String(value);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-800">Visao Geral</h2>
        {errorMsg && <p className="text-sm text-red-600 mt-1">{errorMsg}</p>}
        {!demoMode && !companyId && <p className="text-sm text-gray-500 mt-1">Selecione/crie uma empresa para ver dados reais.</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-blue-100 p-3 rounded-lg">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <span className="text-gray-400 text-sm font-medium flex items-center">
              <TrendingUp className="w-3 h-3 mr-1" /> {demoMode ? '+12%' : ''}
            </span>
          </div>
          <h3 className="text-gray-500 text-sm font-medium">Total de Leads (30d)</h3>
          <p className="text-2xl font-bold text-gray-900">{kpiValue(totalLeads)}</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-green-100 p-3 rounded-lg">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
            <span className="text-gray-400 text-sm font-medium flex items-center">
              <TrendingUp className="w-3 h-3 mr-1" /> {demoMode ? '+8%' : ''}
            </span>
          </div>
          <h3 className="text-gray-500 text-sm font-medium">Receita (won) (30d)</h3>
          <p className="text-2xl font-bold text-gray-900">{kpiValue(revenue, (n) => `R$ ${Math.round(n).toLocaleString()}`)}</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-purple-100 p-3 rounded-lg">
              <Activity className="w-6 h-6 text-purple-600" />
            </div>
            <span className="text-gray-400 text-sm font-medium flex items-center">{demoMode ? '-2%' : ''}</span>
          </div>
          <h3 className="text-gray-500 text-sm font-medium">Vendas (won) (30d)</h3>
          <p className="text-2xl font-bold text-gray-900">{kpiValue(wonLeads)}</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-orange-100 p-3 rounded-lg">
              <Users className="w-6 h-6 text-orange-600" />
            </div>
            <span className="text-gray-400 text-sm font-medium flex items-center">{demoMode ? '+5%' : ''}</span>
          </div>
          <h3 className="text-gray-500 text-sm font-medium">Empresa</h3>
          <p className="text-2xl font-bold text-gray-900">{demoMode ? '124' : companyId ? '1' : '-'}</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold mb-6 text-gray-700">Leads vs Vendas (30d)</h3>
        <div className="h-80 w-full">
          {chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-gray-400">Sem dados para o periodo.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#82ca9d" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="#9CA3AF" />
                <YAxis stroke="#9CA3AF" />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: 'none',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  }}
                />
                <Area type="monotone" dataKey="leads" stroke="#8884d8" fillOpacity={1} fill="url(#colorLeads)" />
                <Area type="monotone" dataKey="sales" stroke="#82ca9d" fillOpacity={1} fill="url(#colorSales)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};

