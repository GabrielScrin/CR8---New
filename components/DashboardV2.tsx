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
import { resolveMetaToken } from '../lib/metaToken';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

interface DashboardProps {
  companyId?: string;
  variant?: 'agency' | 'client';
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

const formatCurrency = (value: number | null, currency: string = 'BRL') => {
  if (value == null || !Number.isFinite(value)) return '-';
  const c = (currency || 'BRL').toUpperCase();
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: c }).format(value);
  } catch {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  }
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

// ── Count-up animation hook ────────────────────────────────────────────────

const useCountUp = (to: number | null, durationMs = 900): number => {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (to == null || !Number.isFinite(to) || to === 0) {
      setVal(to ?? 0);
      return;
    }
    let startTime: number | null = null;
    let rafId: number;
    const tick = (now: number) => {
      if (startTime === null) startTime = now;
      const t = Math.min((now - startTime) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3); // cubic ease-out
      setVal(eased * to);
      if (t < 1) rafId = requestAnimationFrame(tick);
      else setVal(to);
    };
    setVal(0);
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [to]);
  return val;
};

interface KpiAnimValueProps {
  rawValue: number | null;
  format: (n: number) => string;
  loading: boolean;
}

const KpiAnimValue: React.FC<KpiAnimValueProps> = ({ rawValue, format, loading }) => {
  const animated = useCountUp(rawValue ?? null);
  if (loading || rawValue == null) {
    return <div className="h-8 w-24 rounded-md animate-shimmer" />;
  }
  return (
    <p className="text-[26px] font-extrabold tracking-tight text-[hsl(var(--foreground))] leading-none tabular-nums">
      {format(animated)}
    </p>
  );
};

// ── Component ──────────────────────────────────────────────────────────────

export const DashboardV2: React.FC<DashboardProps> = ({ companyId, variant = 'agency' }) => {
  const backendReady = isSupabaseConfigured();
  const [period, setPeriod] = useState<Period>('7d');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState<string | null>(null);
  const [metaAdAccountId, setMetaAdAccountId] = useState<string | null>(null);
  const [companyCurrency, setCompanyCurrency] = useState<string>('BRL');
  const [companyMediaBalance, setCompanyMediaBalance] = useState<number | null>(null);
  const [companyFeePercent, setCompanyFeePercent] = useState<number | null>(null);
  const [companyFeeFixed, setCompanyFeeFixed] = useState<number | null>(null);

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
      setCompanyCurrency('BRL');
      setCompanyMediaBalance(null);
      setCompanyFeePercent(null);
      setCompanyFeeFixed(null);
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
        supabase
          .from('companies')
          .select('name,brand_name,meta_ad_account_id,currency,media_balance,agency_fee_percent,agency_fee_fixed')
          .eq('id', companyId)
          .maybeSingle(),
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

      setCompanyName((company as any)?.brand_name ?? company?.name ?? null);
      setMetaAdAccountId(company?.meta_ad_account_id ?? null);
      setCompanyCurrency((company as any)?.currency ?? 'BRL');
      setCompanyMediaBalance(
        (company as any)?.media_balance != null ? (Number((company as any).media_balance) || 0) : null,
      );
      setCompanyFeePercent(
        (company as any)?.agency_fee_percent != null ? Number((company as any).agency_fee_percent) : null,
      );
      setCompanyFeeFixed((company as any)?.agency_fee_fixed != null ? Number((company as any).agency_fee_fixed) : null);

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
      const providerToken = await resolveMetaToken(companyId ?? null);
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

  const feeEstimate = useMemo(() => {
    const pct = companyFeePercent != null && Number.isFinite(companyFeePercent) ? companyFeePercent : null;
    const fixed = companyFeeFixed != null && Number.isFinite(companyFeeFixed) ? companyFeeFixed : null;
    const spendN = spend != null && Number.isFinite(spend) ? spend : null;

    const fromPct = pct != null && spendN != null ? (spendN * pct) / 100 : null;
    const total = (fromPct ?? 0) + (fixed ?? 0);

    if ((pct == null || spendN == null) && fixed == null) return null;
    return { fromPct, fixed, total };
  }, [companyFeeFixed, companyFeePercent, spend]);

  const mediaBalanceAfter = useMemo(() => {
    if (companyMediaBalance == null || !Number.isFinite(companyMediaBalance)) return null;
    if (spend == null || !Number.isFinite(spend)) return null;
    return companyMediaBalance - spend;
  }, [companyMediaBalance, spend]);

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

  // Accent color strip per KPI index
  const kpiAccents = [
    'from-[hsl(var(--primary))] to-[hsl(220_80%_65%)]',
    'from-[hsl(var(--accent))] to-[hsl(160_70%_55%)]',
    'from-purple-500 to-violet-400',
    'from-emerald-500 to-teal-400',
  ];

  const SectionHeader = ({ title, sub, badge }: { title: string; sub?: string; badge?: React.ReactNode }) => (
    <div className="flex items-center justify-between gap-3 mb-5">
      <div className="flex items-center gap-3">
        <div className="w-0.5 h-5 rounded-full bg-gradient-to-b from-[hsl(var(--primary))] to-[hsl(var(--accent))]" />
        <div>
          <h3 className="text-[15px] font-bold tracking-tight text-[hsl(var(--foreground))]">{title}</h3>
          {sub && <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-0.5">{sub}</p>}
        </div>
      </div>
      {badge}
    </div>
  );

  return (
    <div className="space-y-5 pb-4">
      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between gap-4"
      >
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-[hsl(var(--foreground))]">
            {companyName ?? 'Dashboard'}
          </h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
            {companyName ? 'Visão geral · tráfego & CRM' : 'Visão geral das suas métricas'}
          </p>
          {errorMsg && (
            <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 shrink-0" /> {errorMsg}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[hsl(var(--secondary))] border border-[hsl(var(--border))]">
          {(['24h', '7d', '30d'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                period === p
                  ? 'bg-[hsl(var(--primary))] text-white shadow-sm shadow-[hsl(var(--primary))]/30'
                  : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
              }`}
            >
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
      </motion.div>

      {!backendReady && (
        <div className="cr8-card p-4 border-dashed">
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Configure <code className="text-[hsl(var(--primary))]">VITE_SUPABASE_URL</code> e{' '}
            <code className="text-[hsl(var(--primary))]">VITE_SUPABASE_ANON_KEY</code> para ver dados reais.
          </p>
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            title: 'Gasto',
            rawValue: spend,
            format: (n: number) => formatCurrency(n, companyCurrency),
            change: spendChange,
            icon: <DollarSign className="h-4 w-4" />,
          },
          {
            title: 'Leads',
            rawValue: totalLeads,
            format: (n: number) => formatNumber(Math.round(n)),
            change: totalLeadsChange,
            icon: <Users className="h-4 w-4" />,
          },
          {
            title: 'CPL médio',
            rawValue: cpl,
            format: (n: number) => formatCurrency(n, companyCurrency),
            change: null,
            icon: <Activity className="h-4 w-4" />,
          },
          {
            title: 'Vendas (won)',
            rawValue: wonLeads,
            format: (n: number) => formatNumber(Math.round(n)),
            change: wonLeadsChange,
            icon: <Megaphone className="h-4 w-4" />,
          },
        ].map((kpi, index) => {
          const isPositive = (kpi.change ?? 0) >= 0;
          const showChange = kpi.change != null && Number.isFinite(kpi.change);
          return (
            <motion.div
              key={kpi.title}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className="cr8-card p-4 relative overflow-hidden group cursor-default"
            >
              {/* top accent line */}
              <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${kpiAccents[index]} opacity-80`} />

              <div className="flex items-start justify-between gap-2 mb-3">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
                  {kpi.title}
                </span>
                <span className={`p-1.5 rounded-md bg-gradient-to-br ${kpiAccents[index]} bg-opacity-10 text-white`}>
                  {kpi.icon}
                </span>
              </div>

              <KpiAnimValue rawValue={kpi.rawValue ?? null} format={kpi.format} loading={loading} />

              <div className="mt-2.5 flex items-center gap-1.5">
                {showChange ? (
                  <span
                    className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-md ${
                      isPositive
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-red-500/15 text-red-400'
                    }`}
                  >
                    {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {formatPct(kpi.change)}
                  </span>
                ) : null}
                {showChange && (
                  <span className="text-[11px] text-[hsl(var(--muted-foreground))]">vs anterior</span>
                )}
                {!showChange && kpi.change == null && (
                  <span className="text-[11px] text-[hsl(var(--muted-foreground))]">período: {PERIOD_LABEL[period]}</span>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ── Chart + Top Campaigns ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.12 }}
          className="cr8-card p-5 lg:col-span-2"
        >
          <SectionHeader
            title="Gasto vs Leads"
            sub={`Período: ${PERIOD_LABEL[period]}${metaAdAccountId ? ` · ${metaAdAccountId}` : ''}`}
          />

          {loading ? (
            <div className="h-[280px] w-full rounded-lg animate-shimmer" />
          ) : !hasSeriesData ? (
            <div className="h-[280px] flex flex-col items-center justify-center gap-2 text-[hsl(var(--muted-foreground))]">
              <Activity className="h-8 w-8 opacity-20" />
              <span className="text-sm">Sem dados para o período</span>
            </div>
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="spendGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="hsl(220 100% 52%)" />
                      <stop offset="100%" stopColor="hsl(240 80% 65%)" />
                    </linearGradient>
                    <linearGradient id="leadsGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="hsl(153 75% 43%)" />
                      <stop offset="100%" stopColor="hsl(180 70% 50%)" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} opacity={0.5} />
                  <XAxis
                    dataKey="label"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: any) => formatCurrency(Number(v) || 0, companyCurrency)}
                    width={72}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    tickFormatter={(v: any) => formatNumber(Number(v) || 0)}
                    width={36}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '10px',
                      boxShadow: '0 12px 28px rgba(0,0,0,0.5)',
                      fontSize: '12px',
                    }}
                    labelStyle={{ color: 'hsl(var(--popover-foreground))', fontWeight: 600 }}
                    formatter={(value: any, name: string) => {
                      const n = Number(value) || 0;
                      if (name === 'spend') return [formatCurrency(n, companyCurrency), 'Gasto'];
                      if (name === 'leads') return [formatNumber(n), 'Leads'];
                      return [n, name];
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    height={28}
                    formatter={(v: any) => (
                      <span style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))' }}>
                        {v === 'spend' ? 'Gasto' : 'Leads'}
                      </span>
                    )}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="spend"
                    stroke="url(#spendGrad)"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="leads"
                    stroke="url(#leadsGrad)"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.18 }}
          className="cr8-card p-5"
        >
          <SectionHeader title="Top Campanhas" sub="Meta Ads" />

          {loading ? (
            <div className="space-y-2.5">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-11 w-full rounded-lg animate-shimmer" />
              ))}
            </div>
          ) : topCampaigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-[hsl(var(--muted-foreground))]">
              <Megaphone className="h-6 w-6 opacity-20" />
              <span className="text-xs">Sem campanhas com gasto</span>
            </div>
          ) : (
            <motion.div
              variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
              initial="hidden"
              animate="visible"
              className="space-y-1.5"
            >
              {topCampaigns.map((c, idx) => (
                <motion.div
                  key={c.id}
                  variants={{ hidden: { opacity: 0, x: -12 }, visible: { opacity: 1, x: 0 } }}
                  transition={{ duration: 0.25 }}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/30 transition-colors group"
                >
                  <span className="text-[10px] font-black text-[hsl(var(--muted-foreground))] w-4 shrink-0 group-hover:text-[hsl(var(--primary))] transition-colors">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate text-[hsl(var(--foreground))]">{c.name}</p>
                    <p className="text-[10px] text-[hsl(var(--muted-foreground))] truncate mt-0.5">
                      {formatNumber(c.results)} resultados
                    </p>
                  </div>
                  <p className="text-xs font-bold text-[hsl(var(--foreground))] shrink-0">
                    {formatCurrency(c.spend, companyCurrency)}
                  </p>
                </motion.div>
              ))}
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* ── Financeiro (agency only) ── */}
      {variant !== 'client' && (
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="cr8-card p-5"
        >
          <SectionHeader
            title="Financeiro"
            sub="Saldo de mídia e fee por empresa"
            badge={
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border))]">
                {companyCurrency || 'BRL'}
              </span>
            }
          />

          <div className="grid gap-3 md:grid-cols-3">
            {[
              {
                label: 'Saldo de mídia',
                value: loading ? null : formatCurrency(companyMediaBalance, companyCurrency),
                hint: 'Defina em Configurações → Financeiro',
                color: 'from-[hsl(var(--primary))]/10 to-transparent',
              },
              {
                label: 'Fee estimado',
                value: loading ? null : feeEstimate ? formatCurrency(feeEstimate.total, companyCurrency) : '-',
                hint: `${companyFeePercent != null && Number.isFinite(companyFeePercent) ? `${companyFeePercent}%` : '--'}${companyFeeFixed != null && Number.isFinite(companyFeeFixed) ? ` + ${formatCurrency(companyFeeFixed, companyCurrency)}` : ''}`,
                color: 'from-purple-500/10 to-transparent',
              },
              {
                label: 'Saldo pós-gasto',
                value: loading ? null : formatCurrency(mediaBalanceAfter, companyCurrency),
                hint: 'Saldo de mídia − gasto do período',
                color: 'from-emerald-500/10 to-transparent',
              },
            ].map((item) => (
              <div
                key={item.label}
                className={`rounded-xl border border-[hsl(var(--border))] bg-gradient-to-br ${item.color} bg-[hsl(var(--secondary))] p-4`}
              >
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
                  {item.label}
                </p>
                {item.value == null ? (
                  <div className="h-7 w-28 rounded-md animate-shimmer mt-2" />
                ) : (
                  <p className="text-xl font-extrabold text-[hsl(var(--foreground))] mt-1.5 tracking-tight">
                    {item.value}
                  </p>
                )}
                <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">{item.hint}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Top Canais + Últimos Leads ── */}
      {variant !== 'client' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.22 }}
            className="cr8-card p-5"
          >
            <SectionHeader title="Top Canais" sub={`Leads no período · ${PERIOD_LABEL[period]}`} />

            {loading ? (
              <div className="space-y-2.5">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-10 w-full rounded-lg animate-shimmer" />
                ))}
              </div>
            ) : topChannels.length === 0 ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))] py-6 text-center">Nenhum lead no período.</p>
            ) : (
              <motion.div
                variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
                initial="hidden"
                animate="visible"
                className="space-y-1.5"
              >
                {topChannels.map((c, idx) => {
                  const ui = sourceUi[c.source] ?? sourceUi.manual;
                  const total = topChannels.reduce((sum, it) => sum + it.count, 0) || 0;
                  const pct = total ? (c.count / total) * 100 : 0;
                  return (
                    <motion.div
                      key={c.source}
                      variants={{ hidden: { opacity: 0, x: -12 }, visible: { opacity: 1, x: 0 } }}
                      transition={{ duration: 0.25 }}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[hsl(var(--secondary))] border border-[hsl(var(--border))]"
                    >
                      <span className="text-[10px] font-black text-[hsl(var(--muted-foreground))] w-3 shrink-0">
                        {idx + 1}
                      </span>
                      <div className={`h-7 w-7 rounded-lg flex items-center justify-center text-xs shrink-0 ${ui.color}`}>
                        {ui.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[hsl(var(--foreground))]">{ui.label}</p>
                        <div className="w-full bg-[hsl(var(--muted))] rounded-full h-1 mt-1 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.6, delay: idx * 0.05 }}
                            className="bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--accent))] h-1"
                          />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-bold text-[hsl(var(--foreground))]">{formatNumber(c.count)}</p>
                        <p className="text-[10px] text-[hsl(var(--muted-foreground))]">{pct.toFixed(0)}%</p>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.26 }}
            className="cr8-card p-5"
          >
            <SectionHeader
              title="Últimos Leads"
              badge={<span className="text-[10px] text-[hsl(var(--muted-foreground))]">CRM & Vendas</span>}
            />

            {loading ? (
              <div className="space-y-2.5">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-10 w-full rounded-lg animate-shimmer" />
                ))}
              </div>
            ) : recentLeads.length === 0 ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))] py-6 text-center">Nenhum lead ainda.</p>
            ) : (
              <motion.div
                variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
                initial="hidden"
                animate="visible"
                className="space-y-1.5"
              >
                {recentLeads.map((l) => {
                  const src = normalizeLeadSource(l.source);
                  const ui = sourceUi[src] ?? sourceUi.manual;
                  return (
                    <motion.div
                      key={l.id}
                      variants={{ hidden: { opacity: 0, x: -12 }, visible: { opacity: 1, x: 0 } }}
                      transition={{ duration: 0.25 }}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/30 transition-colors group"
                    >
                      <div className={`h-7 w-7 rounded-lg flex items-center justify-center text-xs shrink-0 ${ui.color}`}>
                        {ui.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate text-[hsl(var(--foreground))]">
                          {l.name || '(sem nome)'}
                        </p>
                        <p className="text-[10px] text-[hsl(var(--muted-foreground))] truncate">{ui.label}</p>
                      </div>
                      <span className="text-[10px] text-[hsl(var(--muted-foreground))] whitespace-nowrap">
                        {timeAgoPt(l.created_at)}
                      </span>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </motion.div>
        </div>
      )}

      {/* ── Alertas ── */}
      {variant !== 'client' && (
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="cr8-card p-5"
        >
          <SectionHeader
            title="Alertas"
            badge={
              alertCounts.total > 0 ? (
                <span className="h-5 min-w-5 px-1.5 rounded-full bg-red-500/20 text-red-300 text-[10px] font-bold flex items-center justify-center border border-red-500/20">
                  {alertCounts.total}
                </span>
              ) : undefined
            }
          />

          {loading ? (
            <div className="space-y-2.5">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-12 w-full rounded-lg animate-shimmer" />
              ))}
            </div>
          ) : (
            <div className="space-y-1.5">
              {alerts.map((a) => (
                <div
                  key={a.id}
                  className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border ${
                    a.type === 'error'
                      ? 'bg-red-500/8 border-red-500/25'
                      : a.type === 'warning'
                        ? 'bg-yellow-500/8 border-yellow-500/25'
                        : a.type === 'info'
                          ? 'bg-blue-500/8 border-blue-500/25'
                          : 'bg-emerald-500/8 border-emerald-500/25'
                  }`}
                >
                  <span className="mt-0.5 shrink-0">
                    <AlertIcon type={a.type} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[hsl(var(--foreground))]">{a.title}</p>
                    <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-0.5">{a.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* ── Footer note ── */}
      <div className="px-1 flex items-center justify-between gap-4 text-[10px] text-[hsl(var(--muted-foreground))]">
        <span>CPL = Gasto ÷ Leads · "Resultados" Meta considera leads + conversas</span>
        <span>
          Receita (won):{' '}
          <span className="text-[hsl(var(--foreground))] font-semibold">{formatCurrency(revenue, companyCurrency)}</span>
          {revenueChange != null && Number.isFinite(revenueChange) ? ` (${formatPct(revenueChange)} vs anterior)` : ''}
        </span>
      </div>
    </div>
  );
};
