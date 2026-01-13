import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  DollarSign,
  Megaphone,
  TrendingDown,
  Users,
} from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

interface DashboardProps {
  companyId?: string;
}

type Period = '24h' | '7d' | '30d';
type TimePoint = { label: string; fullKey: string; leads: number; spend: number };

type LeadRow = {
  id: string;
  name: string | null;
  source: string | null;
  status: string | null;
  value: number | null;
  created_at: string;
  last_interaction_at: string | null;
};

type MetaInsightsRow = {
  date_start?: string;
  spend?: string;
  actions?: Array<{ action_type: string; value: string }>;
  objective?: string;
  campaign_id?: string;
  campaign_name?: string;
};

type TopCampaign = {
  id: string;
  name: string;
  spend: number;
  results: number;
  objective?: string;
};

type AlertType = 'error' | 'warning' | 'info' | 'success';
type Alert = { id: string; type: AlertType; title: string; description: string };

const META_GRAPH_VERSION: string = import.meta.env.VITE_META_GRAPH_VERSION ?? 'v19.0';

const PERIOD_LABEL: Record<Period, string> = {
  '24h': '24h',
  '7d': '7d',
  '30d': '30d',
};

const periodToMs = (period: Period) => {
  if (period === '24h') return 24 * 60 * 60 * 1000;
  if (period === '7d') return 7 * 24 * 60 * 60 * 1000;
  return 30 * 24 * 60 * 60 * 1000;
};

const asNumber = (v: unknown) => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  return NaN;
};

const formatCurrency = (value: number | null) => {
  if (value == null || !Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const formatNumber = (value: number | null) => {
  if (value == null || !Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('pt-BR').format(value);
};

const formatPct = (value: number | null) => {
  if (value == null || !Number.isFinite(value)) return '-';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
};

const timeAgoPt = (iso: string) => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return `há ${diffD}d`;
};

const normalizeLeadSource = (raw: string | null | undefined) => {
  const s = (raw ?? '').toLowerCase();
  if (!s) return 'manual';
  if (s.includes('whats')) return 'whatsapp';
  if (s.includes('insta')) return 'instagram_dm';
  if (s.includes('messenger')) return 'facebook_messenger';
  if (s.includes('meta') || s.includes('facebook')) return 'meta_ads';
  if (s.includes('google')) return 'google_ads';
  if (s.includes('landing') || s.includes('form')) return 'form';
  if (s.includes('site') || s.includes('website')) return 'website';
  if (s.includes('telefone') || s.includes('phone')) return 'phone';
  if (s.includes('mail') || s.includes('email')) return 'email';
  return 'manual';
};

const leadLikeActionTypes = new Set([
  'lead',
  'offsite_conversion.fb_pixel_lead',
  'onsite_conversion.lead_grouped',
  'messaging_conversation_started',
  'messaging_conversation_started_7d',
  'onsite_conversion.messaging_conversation_started_7d',
]);

const extractLeadLikeActions = (actions: MetaInsightsRow['actions']): number => {
  if (!actions) return 0;
  let sum = 0;
  for (const a of actions) {
    if (!a?.action_type || !leadLikeActionTypes.has(a.action_type)) continue;
    const n = asNumber(a.value);
    if (Number.isFinite(n)) sum += n;
  }
  return sum;
};

const calcChangePct = (current: number, previous: number) => {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

export const DashboardV2: React.FC<DashboardProps> = ({ companyId }) => {
  const backendReady = isSupabaseConfigured();
  const [period, setPeriod] = useState<Period>('7d');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState<string | null>(null);
  const [metaAdAccountId, setMetaAdAccountId] = useState<string | null>(null);

  const [totalLeads, setTotalLeads] = useState<number | null>(null);
  const [totalLeadsChange, setTotalLeadsChange] = useState<number | null>(null);
  const [wonLeads, setWonLeads] = useState<number | null>(null);
  const [wonLeadsChange, setWonLeadsChange] = useState<number | null>(null);
  const [revenue, setRevenue] = useState<number | null>(null);
  const [revenueChange, setRevenueChange] = useState<number | null>(null);
  const [spend, setSpend] = useState<number | null>(null);
  const [spendChange, setSpendChange] = useState<number | null>(null);
  const [cpl, setCpl] = useState<number | null>(null);

  const [series, setSeries] = useState<TimePoint[]>([]);
  const [topChannels, setTopChannels] = useState<Array<{ source: string; count: number }>>([]);
  const [recentLeads, setRecentLeads] = useState<LeadRow[]>([]);
  const [topCampaigns, setTopCampaigns] = useState<TopCampaign[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const range = useMemo(() => {
    const now = new Date();
    const duration = periodToMs(period);
    const startCurrent = new Date(now.getTime() - duration);
    const startPrevious = new Date(now.getTime() - duration * 2);
    return { startCurrent, startPrevious, duration };
  }, [period]);

  const buildSeries = (rows: LeadRow[], spendByKey: Map<string, number>) => {
    const points = new Map<string, TimePoint>();

    const addPoint = (fullKey: string, label: string) => {
      if (!points.has(fullKey)) points.set(fullKey, { fullKey, label, leads: 0, spend: 0 });
      return points.get(fullKey)!;
    };

    if (period === '24h') {
      for (let i = 0; i < 24; i++) {
        const d = new Date(range.startCurrent.getTime() + i * 60 * 60 * 1000);
        const key = d.toISOString().slice(0, 13); // YYYY-MM-DDTHH
        addPoint(key, `${String(d.getHours()).padStart(2, '0')}h`);
      }

      for (const r of rows) {
        const key = new Date(r.created_at).toISOString().slice(0, 13);
        const p = points.get(key);
        if (p) p.leads += 1;
      }

      for (const [isoDay, v] of spendByKey.entries()) {
        const hourKey = `${isoDay}T00`;
        const p = points.get(hourKey);
        if (p) p.spend = v;
      }
    } else {
      const days = period === '7d' ? 7 : 30;
      for (let i = 0; i < days; i++) {
        const d = new Date(range.startCurrent.getTime() + i * 24 * 60 * 60 * 1000);
        const isoDay = d.toISOString().slice(0, 10);
        addPoint(isoDay, `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`);
      }

      for (const r of rows) {
        const isoDay = new Date(r.created_at).toISOString().slice(0, 10);
        const p = points.get(isoDay);
        if (p) p.leads += 1;
      }

      for (const [isoDay, v] of spendByKey.entries()) {
        const p = points.get(isoDay);
        if (p) p.spend = v;
      }
    }

    return Array.from(points.values()).sort((a, b) => a.fullKey.localeCompare(b.fullKey));
  };

  const getFacebookProviderToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.provider_token ?? null;
  };

  const fetchMetaSpend = async (adAccountId: string, providerToken: string) => {
    const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${adAccountId}/insights`);
    url.searchParams.set('level', 'account');
    url.searchParams.set('fields', 'spend,actions,date_start');
    url.searchParams.set('limit', '60');
    url.searchParams.set('access_token', providerToken);

    if (period === '24h') {
      url.searchParams.set('date_preset', 'today');
    } else {
      url.searchParams.set('time_increment', '1');
      url.searchParams.set('date_preset', period === '7d' ? 'last_7d' : 'last_30d');
    }

    const res = await fetch(url.toString());
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message || `Erro Meta Insights (${res.status})`);

    const rows: MetaInsightsRow[] = Array.isArray(json?.data) ? json.data : [];
    let totalSpend = 0;
    const spendByKey = new Map<string, number>();

    for (const r of rows) {
      const spendN = Number(r?.spend ?? '0') || 0;
      totalSpend += spendN;
      const k = r?.date_start;
      if (k) spendByKey.set(k, (spendByKey.get(k) ?? 0) + spendN);
    }

    return { totalSpend, spendByKey };
  };

  const fetchMetaSpendPrevious = async (adAccountId: string, providerToken: string) => {
    const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${adAccountId}/insights`);
    url.searchParams.set('level', 'account');
    url.searchParams.set('fields', 'spend');
    url.searchParams.set('limit', '10');
    url.searchParams.set('access_token', providerToken);

    if (period === '24h') {
      const until = new Date(range.startCurrent);
      const since = new Date(until.getTime() - 24 * 60 * 60 * 1000);
      url.searchParams.set('time_range', JSON.stringify({ since: since.toISOString().slice(0, 10), until: until.toISOString().slice(0, 10) }));
    } else {
      url.searchParams.set('time_range', JSON.stringify({ since: range.startPrevious.toISOString().slice(0, 10), until: range.startCurrent.toISOString().slice(0, 10) }));
    }

    const res = await fetch(url.toString());
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message || `Erro Meta Insights (${res.status})`);

    const rows: MetaInsightsRow[] = Array.isArray(json?.data) ? json.data : [];
    return rows.reduce((sum, r) => sum + (Number(r?.spend ?? '0') || 0), 0);
  };

  const fetchTopCampaigns = async (adAccountId: string, providerToken: string) => {
    const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${adAccountId}/insights`);
    url.searchParams.set('level', 'campaign');
    url.searchParams.set('fields', 'campaign_id,campaign_name,objective,spend,actions');
    url.searchParams.set('limit', '50');
    url.searchParams.set('access_token', providerToken);
    url.searchParams.set('date_preset', period === '7d' ? 'last_7d' : period === '30d' ? 'last_30d' : 'today');

    const res = await fetch(url.toString());
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message || `Erro Meta Campaigns (${res.status})`);

    const rows: MetaInsightsRow[] = Array.isArray(json?.data) ? json.data : [];
    return rows
      .map((r) => ({
        id: r.campaign_id ?? '',
        name: r.campaign_name ?? '(sem nome)',
        spend: Number(r?.spend ?? '0') || 0,
        results: extractLeadLikeActions(r.actions),
        objective: r.objective,
      }))
      .filter((c) => c.id && c.spend > 0)
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 5);
  };

  const load = async () => {
    setErrorMsg(null);
    setAlerts([]);

    if (!backendReady) {
      setErrorMsg('Supabase não está configurado (faltando VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
      setCompanyName(null);
      setMetaAdAccountId(null);
      setTotalLeads(null);
      setWonLeads(null);
      setRevenue(null);
      setSpend(null);
      setCpl(null);
      setSeries([]);
      setTopChannels([]);
      setRecentLeads([]);
      setTopCampaigns([]);
      return;
    }

    if (!companyId) return;

    setLoading(true);
    try {
      const [{ data: company }, { data: leadsRange, error: leadsError }, { data: recent }] = await Promise.all([
        supabase.from('companies').select('name,meta_ad_account_id').eq('id', companyId).maybeSingle(),
        supabase
          .from('leads')
          .select('id,name,source,status,value,created_at,last_interaction_at')
          .eq('company_id', companyId)
          .gte('created_at', range.startPrevious.toISOString())
          .order('created_at', { ascending: false })
          .limit(20000),
        supabase
          .from('leads')
          .select('id,name,source,status,value,created_at,last_interaction_at')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      if (leadsError) throw leadsError;

      setCompanyName(company?.name ?? null);
      setMetaAdAccountId(company?.meta_ad_account_id ?? null);

      const rows: LeadRow[] = (leadsRange ?? []) as any;
      const currentRows = rows.filter((r) => new Date(r.created_at).getTime() >= range.startCurrent.getTime());
      const previousRows = rows.filter((r) => new Date(r.created_at).getTime() < range.startCurrent.getTime());

      const currentTotal = currentRows.length;
      const previousTotal = previousRows.length;
      const currentWon = currentRows.filter((r) => r.status === 'won').length;
      const previousWon = previousRows.filter((r) => r.status === 'won').length;
      const currentRevenue = currentRows
        .filter((r) => r.status === 'won')
        .reduce((sum, r) => sum + (typeof r.value === 'number' ? r.value : Number(r.value) || 0), 0);
      const previousRevenue = previousRows
        .filter((r) => r.status === 'won')
        .reduce((sum, r) => sum + (typeof r.value === 'number' ? r.value : Number(r.value) || 0), 0);

      setTotalLeads(currentTotal);
      setWonLeads(currentWon);
      setRevenue(currentRevenue);
      setTotalLeadsChange(calcChangePct(currentTotal, previousTotal));
      setWonLeadsChange(calcChangePct(currentWon, previousWon));
      setRevenueChange(calcChangePct(currentRevenue, previousRevenue));

      const channelCounts = new Map<string, number>();
      for (const r of currentRows) {
        const key = normalizeLeadSource(r.source);
        channelCounts.set(key, (channelCounts.get(key) ?? 0) + 1);
      }
      setTopChannels(
        Array.from(channelCounts.entries())
          .map(([source, count]) => ({ source, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5),
      );

      setRecentLeads(((recent ?? []) as any) ?? []);

      const nextAlerts: Alert[] = [];
      const providerToken = await getFacebookProviderToken();
      const adAccountId = company?.meta_ad_account_id ?? null;

      let spendByKey = new Map<string, number>();
      let spendNow: number | null = null;

      if (!adAccountId) {
        nextAlerts.push({
          id: 'no-meta',
          type: 'info',
          title: 'Conta de anúncios não conectada',
          description: 'Defina `meta_ad_account_id` na empresa para ver gasto e campanhas.',
        });
      } else if (!providerToken) {
        nextAlerts.push({
          id: 'no-token',
          type: 'warning',
          title: 'Reconectar Meta',
          description: 'Faça login novamente com Facebook para acessar as métricas de tráfego.',
        });
      } else {
        try {
          const spendRes = await fetchMetaSpend(adAccountId, providerToken);
          spendNow = spendRes.totalSpend;
          spendByKey = spendRes.spendByKey;
          setSpend(spendNow);

          try {
            const prev = await fetchMetaSpendPrevious(adAccountId, providerToken);
            setSpendChange(calcChangePct(spendNow, prev));
          } catch {
            setSpendChange(null);
          }

          setCpl(currentTotal > 0 ? spendNow / currentTotal : null);

          try {
            setTopCampaigns(await fetchTopCampaigns(adAccountId, providerToken));
          } catch {
            setTopCampaigns([]);
          }
        } catch (e: any) {
          setSpend(null);
          setSpendChange(null);
          setCpl(null);
          setTopCampaigns([]);
          nextAlerts.push({
            id: 'meta-error',
            type: 'warning',
            title: 'Erro ao ler Meta Insights',
            description: e?.message || 'Verifique permissões `ads_read` e acesso à conta de anúncios.',
          });
        }
      }

      setSeries(buildSeries(currentRows, spendByKey));

      const lastLeadIso = (recent?.[0] as any)?.created_at as string | undefined;
      if (!lastLeadIso) {
        nextAlerts.push({
          id: 'no-leads-ever',
          type: 'warning',
          title: 'Nenhum lead ainda',
          description: 'Envie leads via webhook ou crie manualmente no CRM.',
        });
      } else {
        const daysSinceLast = Math.floor((Date.now() - new Date(lastLeadIso).getTime()) / (24 * 60 * 60 * 1000));
        if (daysSinceLast >= 3) {
          nextAlerts.push({
            id: 'no-recent-leads',
            type: 'warning',
            title: 'Sem leads recentes',
            description: 'Nenhum lead capturado nos últimos 3 dias.',
          });
        }
      }

      const now = Date.now();
      const pendingFollowUp = rows.filter((r) => {
        const status = r.status ?? 'new';
        if (status === 'won' || status === 'lost') return false;
        const createdAt = new Date(r.created_at).getTime();
        if (now - createdAt < 2 * 24 * 60 * 60 * 1000) return false;
        if (!r.last_interaction_at) return true;
        const last = new Date(r.last_interaction_at).getTime();
        return now - last >= 2 * 24 * 60 * 60 * 1000;
      }).length;

      if (pendingFollowUp > 0) {
        nextAlerts.push({
          id: 'pending-followup',
          type: 'warning',
          title: `${pendingFollowUp} leads aguardando follow-up`,
          description: 'Leads com mais de 2 dias sem atualização.',
        });
      }

      const conversionRate = currentTotal > 0 ? (currentWon / currentTotal) * 100 : 0;
      if (currentTotal >= 10 && conversionRate < 2) {
        nextAlerts.push({
          id: 'low-conv',
          type: 'error',
          title: 'Taxa de conversão baixa',
          description: `Apenas ${conversionRate.toFixed(1)}% de leads viraram venda no período.`,
        });
      }

      if (nextAlerts.length === 0) {
        nextAlerts.push({ id: 'ok', type: 'success', title: 'Tudo em ordem!', description: 'Nenhum alerta no momento.' });
      }

      setAlerts(nextAlerts);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message || 'Erro ao carregar dashboard.');
      setSeries([]);
      setTotalLeads(null);
      setWonLeads(null);
      setRevenue(null);
      setSpend(null);
      setCpl(null);
      setTopChannels([]);
      setRecentLeads([]);
      setTopCampaigns([]);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, period]);

  const hasSeriesData = series.some((p) => p.leads > 0 || p.spend > 0);

  const alertCounts = useMemo(() => {
    const error = alerts.filter((a) => a.type === 'error').length;
    const warning = alerts.filter((a) => a.type === 'warning').length;
    return { error, warning, total: error + warning };
  }, [alerts]);

  const sourceUi: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    whatsapp: { label: 'WhatsApp', color: 'bg-green-500/20 text-green-400', icon: <Users className="h-4 w-4" /> },
    instagram_dm: { label: 'Instagram', color: 'bg-pink-500/20 text-pink-400', icon: <Users className="h-4 w-4" /> },
    facebook_messenger: { label: 'Messenger', color: 'bg-blue-500/20 text-blue-400', icon: <Users className="h-4 w-4" /> },
    form: { label: 'Form', color: 'bg-[hsl(var(--primary))]/20 text-[hsl(var(--primary))]', icon: <Users className="h-4 w-4" /> },
    website: { label: 'Website', color: 'bg-cyan-500/20 text-cyan-300', icon: <Users className="h-4 w-4" /> },
    phone: { label: 'Telefone', color: 'bg-yellow-500/20 text-yellow-300', icon: <Users className="h-4 w-4" /> },
    email: { label: 'E-mail', color: 'bg-[hsl(var(--accent))]/20 text-[hsl(var(--accent))]', icon: <Users className="h-4 w-4" /> },
    meta_ads: { label: 'Meta Ads', color: 'bg-blue-600/20 text-blue-300', icon: <Megaphone className="h-4 w-4" /> },
    google_ads: { label: 'Google Ads', color: 'bg-yellow-600/20 text-yellow-300', icon: <Megaphone className="h-4 w-4" /> },
    manual: { label: 'Manual', color: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]', icon: <Users className="h-4 w-4" /> },
  };

  const AlertIcon = ({ type }: { type: AlertType }) => {
    if (type === 'error') return <TrendingDown className="h-4 w-4 text-red-400 mt-0.5" />;
    if (type === 'warning') return <Clock className="h-4 w-4 text-yellow-300 mt-0.5" />;
    if (type === 'info') return <AlertTriangle className="h-4 w-4 text-blue-300 mt-0.5" />;
    return <Activity className="h-4 w-4 text-emerald-300 mt-0.5" />;
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex items-start justify-between gap-4"
      >
        <div>
          <h2 className="text-3xl font-extrabold text-[hsl(var(--foreground))]">Dashboard</h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
            {companyName ? `Visão geral de ${companyName}` : 'Visão geral das suas métricas'}
          </p>
          {errorMsg && <p className="text-sm text-red-400 mt-2">{errorMsg}</p>}
        </div>

        <div className="flex items-center gap-2">
          {(['24h', '7d', '30d'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                period === p
                  ? 'bg-[hsl(var(--primary))] text-white border-[hsl(var(--primary))]'
                  : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]'
              }`}
            >
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
      </motion.div>

      {!backendReady && (
        <div className="cr8-card p-6">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` para ver dados reais.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          {
            title: `Gasto (${PERIOD_LABEL[period]})`,
            value: loading ? '...' : formatCurrency(spend),
            change: spendChange,
            icon: <DollarSign className="h-5 w-5 text-white" />,
            iconBg: 'bg-[hsl(var(--primary))]',
          },
          {
            title: `Leads (${PERIOD_LABEL[period]})`,
            value: loading ? '...' : formatNumber(totalLeads),
            change: totalLeadsChange,
            icon: <Users className="h-5 w-5 text-white" />,
            iconBg: 'bg-[hsl(var(--accent))]',
          },
          {
            title: `CPL médio (${PERIOD_LABEL[period]})`,
            value: loading ? '...' : formatCurrency(cpl),
            change: null,
            icon: <Activity className="h-5 w-5 text-white" />,
            iconBg: 'bg-purple-600',
          },
          {
            title: `Vendas (won) (${PERIOD_LABEL[period]})`,
            value: loading ? '...' : formatNumber(wonLeads),
            change: wonLeadsChange,
            icon: <Megaphone className="h-5 w-5 text-white" />,
            iconBg: 'bg-emerald-600',
          },
        ].map((kpi, index) => {
          const isPositive = (kpi.change ?? 0) >= 0;
          const showChange = kpi.change != null && Number.isFinite(kpi.change);
          return (
            <motion.div
              key={kpi.title}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: index * 0.06 }}
              className="cr8-card p-5 relative overflow-hidden"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">{kpi.title}</p>
                  <p className="text-3xl font-extrabold mt-2 text-[hsl(var(--foreground))]">{kpi.value}</p>
                </div>
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${kpi.iconBg}`}>{kpi.icon}</div>
              </div>

              <div className="mt-2 text-sm flex items-center gap-1 text-[hsl(var(--muted-foreground))]">
                {showChange ? (
                  <span
                    className={`inline-flex items-center gap-1 font-semibold ${
                      isPositive ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {isPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                    {formatPct(kpi.change)}
                  </span>
                ) : (
                  <span>&nbsp;</span>
                )}
                {showChange && <span>vs período anterior</span>}
              </div>

              <div className={`absolute bottom-0 left-0 right-0 h-1 ${kpi.iconBg} opacity-70`} />
            </motion.div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.15 }}
          className="cr8-card p-5 lg:col-span-2"
        >
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-lg font-bold text-[hsl(var(--foreground))]">Gasto vs Leads</h3>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Período: {PERIOD_LABEL[period]}</p>
            </div>
            {metaAdAccountId && (
              <span className="text-xs text-[hsl(var(--muted-foreground))]">Conta: {metaAdAccountId}</span>
            )}
          </div>

          {loading ? (
            <div className="h-[320px] w-full rounded-lg animate-pulse bg-[hsl(var(--muted))]" />
          ) : !hasSeriesData ? (
            <div className="h-[320px] flex items-center justify-center text-sm text-[hsl(var(--muted-foreground))]">
              Sem dados para o período
            </div>
          ) : (
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: any) => formatCurrency(Number(v) || 0)}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    tickFormatter={(v: any) => formatNumber(Number(v) || 0)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '10px',
                      boxShadow: '0 8px 20px rgba(0,0,0,0.45)',
                    }}
                    labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
                    formatter={(value: any, name: string) => {
                      const n = Number(value) || 0;
                      if (name === 'spend') return [formatCurrency(n), 'Gasto'];
                      if (name === 'leads') return [formatNumber(n), 'Leads'];
                      return [n, name];
                    }}
                  />
                  <Legend verticalAlign="top" height={24} formatter={(v: any) => (v === 'spend' ? 'Gasto' : 'Leads')} />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="spend"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="leads"
                    stroke="hsl(var(--accent))"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.2 }}
          className="cr8-card p-5"
        >
          <h3 className="text-lg font-bold text-[hsl(var(--foreground))] mb-4">Top campanhas (Meta)</h3>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 w-full rounded-lg animate-pulse bg-[hsl(var(--muted))]" />
              ))}
            </div>
          ) : topCampaigns.length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Sem campanhas com gasto no período.</p>
          ) : (
            <div className="space-y-2">
              {topCampaigns.map((c, idx) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))] transition-colors"
                >
                  <div className="h-8 w-8 rounded-lg bg-[hsl(var(--primary))]/20 text-[hsl(var(--primary))] flex items-center justify-center text-xs font-bold">
                    #{idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate text-[hsl(var(--foreground))]">{c.name}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))] truncate">
                      Resultados: {formatNumber(c.results)} • {c.objective || '—'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-[hsl(var(--foreground))]">{formatCurrency(c.spend)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.25 }}
          className="cr8-card p-5"
        >
          <h3 className="text-lg font-bold text-[hsl(var(--foreground))] mb-4">Top canais</h3>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 w-full rounded-lg animate-pulse bg-[hsl(var(--muted))]" />
              ))}
            </div>
          ) : topChannels.length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Nenhum lead no período.</p>
          ) : (
            <div className="space-y-2">
              {topChannels.map((c, idx) => {
                const ui = sourceUi[c.source] ?? sourceUi.manual;
                const total = topChannels.reduce((sum, it) => sum + it.count, 0) || 0;
                const pct = total ? (c.count / total) * 100 : 0;
                return (
                  <div key={c.source} className="flex items-center gap-3 p-3 rounded-lg bg-[hsl(var(--secondary))] border border-[hsl(var(--border))]">
                    <div className="h-8 w-8 rounded-lg bg-[hsl(var(--primary))]/20 text-[hsl(var(--primary))] flex items-center justify-center text-xs font-bold">
                      #{idx + 1}
                    </div>
                    <div className={`h-9 w-9 rounded-full flex items-center justify-center ${ui.color}`}>{ui.icon}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[hsl(var(--foreground))]">{ui.label}</p>
                      <div className="w-full bg-[hsl(var(--muted))] rounded-full h-1.5 mt-1 overflow-hidden">
                        <div className="bg-[hsl(var(--primary))] h-1.5" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-[hsl(var(--foreground))]">{formatNumber(c.count)}</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">{pct.toFixed(0)}%</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.3 }}
          className="cr8-card p-5"
        >
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="text-lg font-bold text-[hsl(var(--foreground))]">Últimos leads</h3>
            <span className="text-xs text-[hsl(var(--muted-foreground))]">CRM & Vendas</span>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-12 w-full rounded-lg animate-pulse bg-[hsl(var(--muted))]" />
              ))}
            </div>
          ) : recentLeads.length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Nenhum lead ainda.</p>
          ) : (
            <div className="space-y-2">
              {recentLeads.map((l) => {
                const src = normalizeLeadSource(l.source);
                const ui = sourceUi[src] ?? sourceUi.manual;
                return (
                  <div
                    key={l.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))] transition-colors"
                  >
                    <div className={`h-9 w-9 rounded-full flex items-center justify-center ${ui.color}`}>{ui.icon}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate text-[hsl(var(--foreground))]">{l.name || '(sem nome)'}</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))] truncate">{ui.label}</p>
                    </div>
                    <div className="text-xs text-[hsl(var(--muted-foreground))] whitespace-nowrap">{timeAgoPt(l.created_at)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.35 }}
        className="cr8-card p-5"
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="text-lg font-bold text-[hsl(var(--foreground))]">Alertas</h3>
          {alertCounts.total > 0 && (
            <span className="h-6 min-w-6 px-2 rounded-full bg-red-500/20 text-red-200 text-xs flex items-center justify-center font-bold">
              {alertCounts.total}
            </span>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-14 w-full rounded-lg animate-pulse bg-[hsl(var(--muted))]" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map((a) => (
              <div
                key={a.id}
                className={`flex items-start gap-3 p-3 rounded-lg border ${
                  a.type === 'error'
                    ? 'bg-red-500/10 border-red-500/20'
                    : a.type === 'warning'
                      ? 'bg-yellow-500/10 border-yellow-500/20'
                      : a.type === 'info'
                        ? 'bg-blue-500/10 border-blue-500/20'
                        : 'bg-emerald-500/10 border-emerald-500/20'
                }`}
              >
                <AlertIcon type={a.type} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[hsl(var(--foreground))]">{a.title}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{a.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      <div className="cr8-card p-4 text-xs text-[hsl(var(--muted-foreground))]">
        <div>CPL = Gasto / Leads do período. “Resultados” (Meta) considera Leads + Conversas como lead.</div>
        <div className="mt-1">
          Receita (won): <span className="text-[hsl(var(--foreground))] font-semibold">{formatCurrency(revenue)}</span>
          {revenueChange != null && Number.isFinite(revenueChange) ? (
            <span className="ml-2">({formatPct(revenueChange)} vs período anterior)</span>
          ) : null}
        </div>
      </div>
    </div>
  );
};
