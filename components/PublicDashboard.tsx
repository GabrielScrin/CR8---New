import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  CalendarRange,
  ChevronDown,
  ExternalLink,
  FileText,
  Filter,
  Grid3X3,
  Instagram,
  LayoutDashboard,
  Loader2,
  Minus,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import {
  DashboardBootstrap,
  DashboardData,
  DashboardWeekly,
  MetaSummary,
  fetchDashboardBootstrap,
  fetchDashboardData,
  fetchDashboardWeekly,
} from '../lib/portalDashboard';

type Tab = 'campanhas' | 'instagram' | 'relatorio';
type ViewMode = 'performance' | 'distribuicao';
type SortKey = 'spend' | 'leads' | 'msgs' | 'ctr' | 'cpc';
type InstagramView = 'overview' | 'content';

const brl = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  }).format(value ?? 0);

const num = (value: number) =>
  new Intl.NumberFormat('pt-BR').format(Math.round(value ?? 0));

const pct = (value: number, digits = 1) => `${(value ?? 0).toFixed(digits)}%`;
const isoLabel = (value: string) => `${value.slice(8, 10)}/${value.slice(5, 7)}`;

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
  const [viewMode, setViewMode] = useState<ViewMode>('performance');
  const [instagramView, setInstagramView] = useState<InstagramView>('overview');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [campaignIds, setCampaignIds] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('spend');
  const [loadingBoot, setLoadingBoot] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [loadingWeekly, setLoadingWeekly] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);

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
        const end = new Date();
        const start = new Date(end);
        start.setDate(start.getDate() - 29);
        setDateFrom(start.toISOString().slice(0, 10));
        setDateTo(end.toISOString().slice(0, 10));
      })
      .catch((error) => setErrorMsg(error?.message ?? 'Dashboard indisponível.'))
      .finally(() => setLoadingBoot(false));
  }, [token]);

  const loadData = useCallback(() => {
    if (!dateFrom || !dateTo) return;

    setLoadingData(true);
    setErrorMsg(null);

    fetchDashboardData({ token, dateFrom, dateTo, campaignIds })
      .then((payload) => {
        setData(payload);
        const summary = payload.meta?.summary;
        if (summary && (summary.leadForms > 0 || summary.siteLeads > 0 || summary.messagesStarted > 0)) {
          setViewMode('performance');
        } else if (summary?.reach) {
          setViewMode('distribuicao');
        }
      })
      .catch((error) => setErrorMsg(error?.message ?? 'Erro ao carregar dados.'))
      .finally(() => setLoadingData(false));
  }, [campaignIds, dateFrom, dateTo, token]);

  useEffect(() => {
    if (dateFrom && dateTo) loadData();
  }, [dateFrom, dateTo, loadData]);

  useEffect(() => {
    if (tab !== 'relatorio' || weekly || loadingWeekly) return;

    setLoadingWeekly(true);
    fetchDashboardWeekly(token)
      .then(setWeekly)
      .catch((error) => setErrorMsg(error?.message ?? 'Erro ao carregar relatório.'))
      .finally(() => setLoadingWeekly(false));
  }, [loadingWeekly, tab, token, weekly]);

  const meta = data?.meta;
  const prevMeta = data?.prevMeta;
  const ig = data?.instagram;
  const prevIg = data?.prevInstagram;
  const metrics = useCampaignMetrics(meta?.summary, prevMeta?.summary);
  const igProfile = ig?.profile ?? bootstrap?.instagramProfile;
  const clientLabel = bootstrap?.clientName || bootstrap?.metaAdAccountName || 'Dashboard';

  const campaigns = useMemo(() => {
    const list = meta?.campaigns ?? [];
    return [...list].sort((a, b) => {
      if (sortKey === 'leads') return (b.leadForms + b.siteLeads) - (a.leadForms + a.siteLeads);
      if (sortKey === 'msgs') return b.messagesStarted - a.messagesStarted;
      if (sortKey === 'ctr') return b.ctr - a.ctr;
      if (sortKey === 'cpc') return a.cpc - b.cpc;
      return b.spend - a.spend;
    });
  }, [meta?.campaigns, sortKey]);

  const maxSpend = useMemo(() => Math.max(...campaigns.map((item) => item.spend), 1), [campaigns]);
  const campaignOptions = useMemo(
    () => (meta?.campaigns ?? []).map((item) => ({ id: `meta:${item.id}`, label: item.name })),
    [meta?.campaigns],
  );

  const toggleCampaign = (id: string) =>
    setCampaignIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

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
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <KpiCard label="Valor Investido" value={brl(metrics?.spend ?? 0)} delta={delta(metrics?.spend ?? 0, metrics?.prevSpend ?? 0)} accent="#6366f1" hint="vs período anterior" />
                <KpiCard label="Alcance" value={num(metrics?.reach ?? 0)} delta={delta(metrics?.reach ?? 0, metrics?.prevReach ?? 0)} accent="#a855f7" />
                <KpiCard label="Impressões" value={num(metrics?.impressions ?? 0)} delta={delta(metrics?.impressions ?? 0, metrics?.prevImpressions ?? 0)} accent="#8b5cf6" />
                <KpiCard label="Frequência" value={(metrics?.frequency ?? 0).toFixed(2)} accent="#64748b" />
              </div>
            </div>

            {(metrics?.hasConversions || (metrics?.profileVisits ?? 0) > 0 || (metrics?.followers ?? 0) > 0) ? (
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
                  {(metrics?.profileVisits ?? 0) > 0 ? (
                    <KpiCard label="Visitas ao Perfil" value={num(metrics?.profileVisits ?? 0)} accent="#f59e0b" />
                  ) : null}
                  {(metrics?.followers ?? 0) > 0 ? (
                    <KpiCard label="Novos Seguidores" value={num(metrics?.followers ?? 0)} accent="#f43f5e" />
                  ) : null}
                </div>
              </div>
            ) : null}

            <div>
              <SectionLabel>Métricas de Entrega</SectionLabel>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <KpiCard label="CTR Médio" value={pct(metrics?.ctr ?? 0)} delta={delta(metrics?.ctr ?? 0, metrics?.prevCtr ?? 0)} accent="#06b6d4" />
                <KpiCard label="Cliques no Link" value={num(metrics?.linkClicks ?? 0)} delta={delta(metrics?.linkClicks ?? 0, metrics?.prevLinkClicks ?? 0)} accent="#3b82f6" />
                <KpiCard label="Vis. Pág. Destino" value={num(metrics?.landingPageViews ?? 0)} delta={delta(metrics?.landingPageViews ?? 0, metrics?.prevLandingPageViews ?? 0)} accent="#10b981" />
                <KpiCard label="Connect Rate" value={pct(metrics?.connectRate ?? 0)} accent="#10b981" hint="LPV / cliques no link" />
                <KpiCard label="CPM Médio" value={brl(metrics?.cpm ?? 0)} delta={delta(metrics?.cpm ?? 0, metrics?.prevCpm ?? 0)} accent="#a855f7" invertDelta />
                <KpiCard label="CPC Médio" value={brl(metrics?.cpc ?? 0)} accent="#f59e0b" invertDelta />
                <KpiCard label="Visitas ao Perfil" value={num(metrics?.profileVisits ?? 0)} delta={delta(metrics?.profileVisits ?? 0, metrics?.prevProfileVisits ?? 0)} accent="#f43f5e" />
                <KpiCard label="Resultados" value={num(metrics?.results ?? 0)} accent="#38bdf8" />
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
                <KpiCard label="Visitas ao Perfil" value={num(metrics?.profileVisits ?? 0)} delta={delta(metrics?.profileVisits ?? 0, metrics?.prevProfileVisits ?? 0)} accent="#f43f5e" />
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
                <KpiCard label="Connect Rate" value={pct(metrics?.connectRate ?? 0)} accent="#10b981" hint="LPV / cliques no link" />
                <KpiCard label="Resultados" value={num(metrics?.results ?? 0)} accent="#06b6d4" />
              </div>
            </div>
          </>
        )}

        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">Evolução Diária</div>
              <div className="mt-1 text-base font-black text-white">Investimento, Leads &amp; Mensagens</div>
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
                <Area yAxisId="conv" type="monotone" dataKey="leads" stroke="#10b981" strokeWidth={2} fill="url(#gLeads)" name="Leads" dot={false} />
                <Area yAxisId="conv" type="monotone" dataKey="messages" stroke="#38bdf8" strokeWidth={2} fill="url(#gMsgs)" name="Mensagens" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">Meta Ads</div>
              <div className="mt-0.5 text-base font-black text-white">Campanhas do período</div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3 text-[10px]">
              <span className="hidden uppercase tracking-wider text-white/30 sm:block">Ordenar</span>
              {(['spend', 'leads', 'msgs', 'ctr'] as SortKey[]).map((item) => {
                const labels: Record<SortKey, string> = { spend: 'Invest.', leads: 'Leads', msgs: 'Msgs', ctr: 'CTR', cpc: 'CPC' };
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setSortKey(item)}
                    className={`font-bold uppercase tracking-[0.15em] transition-colors ${
                      sortKey === item ? 'text-indigo-400' : 'text-white/30 hover:text-white/60'
                    }`}
                  >
                    {labels[item]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="divide-y divide-white/[0.04]">
            {campaigns.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-white/30">
                {loadingData ? 'Carregando campanhas...' : 'Nenhuma campanha no período.'}
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
                        <div className="truncate text-sm font-semibold text-white/90">{campaign.name}</div>
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
                              <div className="text-[10px] uppercase tracking-wider text-white/30">Vídeo</div>
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
        </div>
      </div>
    );
  };

  const InstagramTab = () => (
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
                <KpiCard label="Views" value={num(ig.summary.totalViews)} delta={delta(ig.summary.totalViews, prevIg?.summary.totalViews ?? 0)} accent="#f59e0b" />
                <KpiCard label="Visitas ao Perfil" value={num(ig.summary.totalProfileViews)} delta={delta(ig.summary.totalProfileViews, prevIg?.summary.totalProfileViews ?? 0)} accent="#38bdf8" />
                <KpiCard label="Novos Seguidores" value={num(ig.summary.totalFollowerGain)} delta={delta(ig.summary.totalFollowerGain, prevIg?.summary.totalFollowerGain ?? 0)} accent="#34d399" />
              </div>

              {ig.series.some((item) => item.reach > 0) ? (
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
                  <div className="mb-5 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">Instagram Orgânico</div>
                      <div className="mt-1 text-base font-black text-white">Alcance diário</div>
                    </div>
                    {igProfile?.followersCount ? <div className="text-xs text-white/40">{num(igProfile.followersCount)} seguidores</div> : null}
                  </div>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={ig.series}>
                        <GradientDefs />
                        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Area type="monotone" dataKey="reach" stroke="#f43f5e" strokeWidth={2} fill="url(#gReach)" name="Alcance" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : null}
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
          <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">
            <div className="border-b border-white/[0.06] px-5 py-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">Conteúdo</div>
              <div className="mt-0.5 text-base font-black text-white">Publicações recentes</div>
            </div>
            <div className="grid grid-cols-1 divide-y divide-white/[0.04] sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-3">
              {(ig?.media ?? []).slice(0, 9).map((media) => (
                <a
                  key={media.id}
                  href={media.permalink || undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-start gap-3 p-4 transition-colors hover:bg-white/[0.03]"
                >
                  <img src={media.thumbnailUrl || media.mediaUrl} alt="" className="h-16 w-16 shrink-0 rounded-xl border border-white/10 object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-xs font-medium leading-relaxed text-white/75">{media.caption || 'Sem legenda'}</div>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 text-[10px] text-white/35">
                      {media.reach != null ? <span>Alcance {num(media.reach)}</span> : null}
                      {media.totalInteractions != null ? <span>Inter. {num(media.totalInteractions)}</span> : null}
                      {media.videoViews != null ? <span>Views {num(media.videoViews)}</span> : null}
                      <span className="inline-flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <ExternalLink className="h-2.5 w-2.5" /> Abrir
                      </span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
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

  const RelatorioTab = () => (
    <div className="space-y-6">
      {loadingWeekly ? (
        <div className="flex h-40 items-center justify-center text-white/40">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Gerando relatório...
        </div>
      ) : weekly ? (
        <>
          {weekly.trafficReport?.publicId ? (
            <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
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
              <iframe
                src={`/traffic-report/${weekly.trafficReport.publicId}`}
                title="Relatório de tráfego"
                className="h-[1200px] w-full bg-[#06080d]"
              />
            </div>
          ) : null}

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
    <div className="min-h-screen text-white" style={{ background: 'linear-gradient(160deg,#070810 0%,#090b14 60%,#07080e 100%)' }}>
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
              <label className="hidden items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-xs sm:flex">
                <CalendarRange className="h-3.5 w-3.5 text-white/40" />
                <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="w-28 bg-transparent text-white/80 outline-none" />
                <Minus className="h-3 w-3 text-white/25" />
                <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="w-28 bg-transparent text-white/80 outline-none" />
              </label>

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

      <footer className="mt-8 border-t border-white/[0.04] py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6">
          <span className="text-[10px] font-mono text-white/20">Powered by CR8</span>
          <span className="text-[10px] text-white/20">{dateFrom} → {dateTo}</span>
        </div>
      </footer>
    </div>
  );
};
