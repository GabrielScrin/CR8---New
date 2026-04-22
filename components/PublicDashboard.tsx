import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Area, AreaChart, CartesianGrid,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  ArrowDownRight, ArrowUpRight, BarChart2, CalendarRange,
  ChevronDown, ExternalLink, FileText, Filter,
  Instagram, Loader2, Minus, RefreshCw, TrendingUp,
} from 'lucide-react';
import {
  DashboardBootstrap, DashboardData, DashboardWeekly, MetaSummary,
  fetchDashboardBootstrap, fetchDashboardData, fetchDashboardWeekly,
} from '../lib/portalDashboard';

type Tab = 'campanhas' | 'instagram' | 'relatorio';
type ViewMode = 'performance' | 'distribuicao';
type SortKey = 'spend' | 'leads' | 'msgs' | 'ctr' | 'cpc';

// ── Formatters ─────────────────────────────────────────────────────────────────
const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(v ?? 0);
const num = (v: number) => new Intl.NumberFormat('pt-BR').format(Math.round(v ?? 0));
const pct = (v: number, d = 1) => `${(v ?? 0).toFixed(d)}%`;
const isoLabel = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;

const delta = (curr: number, prev: number): number | null => {
  if (!prev || !curr) return null;
  return ((curr - prev) / prev) * 100;
};

// ── Gradient defs ──────────────────────────────────────────────────────────────
const GradientDefs = () => (
  <defs>
    <linearGradient id="gSpend" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
      <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
    </linearGradient>
    <linearGradient id="gResults" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
    </linearGradient>
    <linearGradient id="gReach" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.4} />
      <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
    </linearGradient>
  </defs>
);

// ── Delta badge ─────────────────────────────────────────────────────────────────
const DeltaBadge: React.FC<{ pct: number | null; invert?: boolean }> = ({ pct: value, invert }) => {
  if (value === null) return <span className="text-[11px] text-white/30">—</span>;
  const positive = invert ? value < 0 : value >= 0;
  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight;
  const cls = positive ? 'text-emerald-400' : 'text-rose-400';
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${cls}`}>
      <Icon className="h-3 w-3" />
      {Math.abs(value).toFixed(1)}%
    </span>
  );
};

// ── KPI Card ────────────────────────────────────────────────────────────────────
const KpiCard: React.FC<{
  label: string; value: string; delta?: number | null; accent: string;
  hint?: string; sub?: string; invertDelta?: boolean;
}> = ({ label, value, delta: d, accent, hint, sub, invertDelta }) => (
  <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 backdrop-blur-sm">
    <div
      className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full opacity-15 blur-3xl"
      style={{ background: accent }}
    />
    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40 mb-3">{label}</div>
    <div className="text-[26px] font-black tracking-tight text-white leading-none">{value}</div>
    {sub && <div className="mt-1 text-[11px] text-white/45">{sub}</div>}
    <div className="mt-2.5 flex items-center gap-2">
      {d !== undefined && d !== null && <DeltaBadge pct={d} invert={invertDelta} />}
      {hint && <span className="text-[10px] text-white/30">{hint}</span>}
    </div>
  </div>
);

// ── Chart tooltip ───────────────────────────────────────────────────────────────
const ChartTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#111827] px-3 py-2.5 text-xs shadow-2xl">
      <div className="text-white/50 mb-1.5 font-semibold">{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-white/70">{p.name}:</span>
          <span className="text-white font-bold">
            {String(p.name).toLowerCase().includes('invest')
              ? brl(p.value)
              : num(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

// ── Section divider label ───────────────────────────────────────────────────────
const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/25 mb-3">{children}</div>
);

// ── View toggle ─────────────────────────────────────────────────────────────────
const ViewToggle: React.FC<{ value: ViewMode; onChange: (v: ViewMode) => void }> = ({ value, onChange }) => (
  <div className="inline-flex rounded-xl border border-white/[0.07] overflow-hidden text-xs">
    {(['performance', 'distribuicao'] as ViewMode[]).map((mode) => (
      <button
        key={mode}
        type="button"
        onClick={() => onChange(mode)}
        className={`px-4 py-2 font-semibold transition-all ${
          value === mode
            ? 'bg-indigo-600 text-white'
            : 'text-white/40 hover:text-white/70 bg-transparent'
        }`}
      >
        {mode === 'performance' ? 'Desempenho' : 'Distribuição'}
      </button>
    ))}
  </div>
);

// ── Smart campaign summary ──────────────────────────────────────────────────────
const useCampaignMetrics = (summary: MetaSummary | undefined, prevSummary: MetaSummary | undefined) => {
  return useMemo(() => {
    if (!summary) return null;
    const s = summary;
    const p = prevSummary;

    const totalLeads = s.leadForms + s.siteLeads;
    const cpl = totalLeads > 0 ? s.spend / totalLeads : 0;
    const cpm_msg = s.messagesStarted > 0 ? s.spend / s.messagesStarted : 0;
    const connectRate = s.linkClicks > 0 ? (s.messagesStarted / s.linkClicks) * 100 : 0;
    const pageViewRate = s.linkClicks > 0 ? (s.siteLeads / s.linkClicks) * 100 : 0;

    const hasLeads = totalLeads > 0;
    const hasMsgs = s.messagesStarted > 0;
    const hasSiteLeads = s.siteLeads > 0;
    const hasLeadForms = s.leadForms > 0;
    const hasConversions = hasLeads || hasMsgs;

    const prevTotalLeads = p ? p.leadForms + p.siteLeads : 0;

    return {
      ...s,
      totalLeads,
      cpl,
      cpm_msg,
      connectRate,
      pageViewRate,
      hasLeads,
      hasMsgs,
      hasSiteLeads,
      hasLeadForms,
      hasConversions,
      prevSpend: p?.spend ?? 0,
      prevReach: p?.reach ?? 0,
      prevImpressions: p?.impressions ?? 0,
      prevLeads: prevTotalLeads,
      prevMsgs: p?.messagesStarted ?? 0,
      prevLeadForms: p?.leadForms ?? 0,
      prevLinkClicks: p?.linkClicks ?? 0,
      prevCtr: p?.ctr ?? 0,
      prevCpm: p?.cpm ?? 0,
    };
  }, [summary, prevSummary]);
};

// ── Main component ──────────────────────────────────────────────────────────────
export const PublicDashboard: React.FC<{ token: string }> = ({ token }) => {
  const [bootstrap, setBootstrap] = useState<DashboardBootstrap | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [weekly, setWeekly] = useState<DashboardWeekly | null>(null);
  const [tab, setTab] = useState<Tab>('campanhas');
  const [viewMode, setViewMode] = useState<ViewMode>('performance');
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
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    setLoadingBoot(true);
    fetchDashboardBootstrap(token)
      .then((b) => {
        setBootstrap(b);
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 29);
        setDateFrom(start.toISOString().slice(0, 10));
        setDateTo(end.toISOString().slice(0, 10));
      })
      .catch((e) => setErrorMsg(e?.message ?? 'Dashboard indisponível.'))
      .finally(() => setLoadingBoot(false));
  }, [token]);

  const loadData = useCallback(() => {
    if (!dateFrom || !dateTo) return;
    setLoadingData(true);
    setErrorMsg(null);
    fetchDashboardData({ token, dateFrom, dateTo, campaignIds })
      .then((d) => {
        setData(d);
        // Auto-detect view mode based on conversion data
        const s = d.meta?.summary;
        if (s && (s.leadForms > 0 || s.siteLeads > 0 || s.messagesStarted > 0)) {
          setViewMode('performance');
        } else if (s && s.reach > 0) {
          setViewMode('distribuicao');
        }
      })
      .catch((e) => setErrorMsg(e?.message ?? 'Erro ao carregar dados.'))
      .finally(() => setLoadingData(false));
  }, [token, dateFrom, dateTo, campaignIds]);

  useEffect(() => { if (dateFrom && dateTo) loadData(); }, [loadData]);

  useEffect(() => {
    if (tab !== 'relatorio' || weekly || loadingWeekly) return;
    setLoadingWeekly(true);
    fetchDashboardWeekly(token)
      .then(setWeekly)
      .catch((e) => setErrorMsg(e?.message ?? 'Erro ao carregar relatório.'))
      .finally(() => setLoadingWeekly(false));
  }, [tab, token, weekly, loadingWeekly]);

  const meta = data?.meta;
  const prev = data?.prevMeta;
  const ig = data?.instagram;
  const prevIg = data?.prevInstagram;
  const metrics = useCampaignMetrics(meta?.summary, prev?.summary);

  const campaigns = useMemo(() => {
    const list = meta?.campaigns ?? [];
    return [...list].sort((a, b) => {
      if (sortKey === 'leads') return (b.leadForms + b.siteLeads) - (a.leadForms + a.siteLeads);
      if (sortKey === 'msgs') return b.messagesStarted - a.messagesStarted;
      if (sortKey === 'ctr') return b.ctr - a.ctr;
      if (sortKey === 'cpc') return a.cpc - b.cpc;
      return b.spend - a.spend;
    });
  }, [meta, sortKey]);

  const maxSpend = useMemo(() => Math.max(...campaigns.map((c) => c.spend), 1), [campaigns]);

  const campaignOptions = useMemo(() =>
    (meta?.campaigns ?? []).map((c) => ({ id: `meta:${c.id}`, label: c.name })),
    [meta]);

  const toggleCampaign = (id: string) =>
    setCampaignIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const igProfile = data?.instagram?.profile ?? bootstrap?.instagramProfile;

  if (loadingBoot) {
    return (
      <div className="min-h-screen bg-[#070810] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
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
      <div className="min-h-screen bg-[#070810] flex items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <div className="text-4xl mb-4 opacity-20">⚠</div>
          <h1 className="text-lg font-bold text-white mb-2">Dashboard indisponível</h1>
          <p className="text-sm text-white/50">{errorMsg}</p>
        </div>
      </div>
    );
  }

  const clientLabel = bootstrap?.clientName || bootstrap?.metaAdAccountName || 'Dashboard';

  // ── Campanhas Tab ─────────────────────────────────────────────────────────────
  const CampanhasTab = () => {
    const isPerf = viewMode === 'performance';

    return (
      <div className="space-y-6">
        {/* View Toggle */}
        <div className="flex items-center justify-between">
          <ViewToggle value={viewMode} onChange={setViewMode} />
          {loadingData && (
            <div className="flex items-center gap-1.5 text-xs text-white/40">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Atualizando...
            </div>
          )}
        </div>

        {isPerf ? (
          /* ── DESEMPENHO ────────────────────────────────────────────────── */
          <>
            {/* Row 1 — Investimento base */}
            <div>
              <SectionLabel>Investimento &amp; Alcance</SectionLabel>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiCard
                  label="Valor Investido"
                  value={brl(metrics?.spend ?? 0)}
                  delta={delta(metrics?.spend ?? 0, metrics?.prevSpend ?? 0)}
                  accent="#6366f1"
                  hint="vs período anterior"
                />
                <KpiCard
                  label="Alcance"
                  value={num(metrics?.reach ?? 0)}
                  delta={delta(metrics?.reach ?? 0, metrics?.prevReach ?? 0)}
                  accent="#a855f7"
                />
                <KpiCard
                  label="Impressões"
                  value={num(metrics?.impressions ?? 0)}
                  delta={delta(metrics?.impressions ?? 0, metrics?.prevImpressions ?? 0)}
                  accent="#8b5cf6"
                />
                <KpiCard
                  label="Frequência"
                  value={(metrics?.frequency ?? 0).toFixed(2)}
                  accent="#64748b"
                />
              </div>
            </div>

            {/* Row 2 — Resultados por tipo */}
            {(metrics?.hasConversions || (metrics?.profileVisits ?? 0) > 0 || (metrics?.followers ?? 0) > 0) && (
              <div>
                <SectionLabel>Resultados por tipo</SectionLabel>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {(metrics?.hasLeadForms || metrics?.hasLeads) && (
                    <KpiCard
                      label="Leads / Formulários"
                      value={num(metrics?.leadForms ?? 0)}
                      delta={delta(metrics?.leadForms ?? 0, metrics?.prevLeadForms ?? 0)}
                      accent="#10b981"
                      sub={metrics?.leadForms ? `CPL ${brl((metrics?.spend ?? 0) / metrics.leadForms)}` : undefined}
                    />
                  )}
                  {metrics?.hasSiteLeads && (
                    <KpiCard
                      label="Leads no Site"
                      value={num(metrics?.siteLeads ?? 0)}
                      accent="#34d399"
                      sub={metrics?.siteLeads ? `CPL ${brl((metrics?.spend ?? 0) / metrics.siteLeads)}` : undefined}
                    />
                  )}
                  {metrics?.hasMsgs && (
                    <KpiCard
                      label="Mensagens Iniciadas"
                      value={num(metrics?.messagesStarted ?? 0)}
                      delta={delta(metrics?.messagesStarted ?? 0, metrics?.prevMsgs ?? 0)}
                      accent="#38bdf8"
                      sub={metrics?.messagesStarted ? `Custo/msg ${brl((metrics?.spend ?? 0) / metrics.messagesStarted)}` : undefined}
                    />
                  )}
                  {(metrics?.profileVisits ?? 0) > 0 && (
                    <KpiCard
                      label="Visitas ao Perfil"
                      value={num(metrics?.profileVisits ?? 0)}
                      accent="#f59e0b"
                    />
                  )}
                  {(metrics?.followers ?? 0) > 0 && (
                    <KpiCard
                      label="Novos Seguidores"
                      value={num(metrics?.followers ?? 0)}
                      accent="#f43f5e"
                    />
                  )}
                </div>
              </div>
            )}

            {/* Row 3 — Métricas de entrega */}
            <div>
              <SectionLabel>Métricas de Entrega</SectionLabel>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiCard
                  label="CTR Médio"
                  value={pct(metrics?.ctr ?? 0)}
                  delta={delta(metrics?.ctr ?? 0, metrics?.prevCtr ?? 0)}
                  accent="#06b6d4"
                />
                <KpiCard
                  label="Cliques no Link"
                  value={num(metrics?.linkClicks ?? 0)}
                  delta={delta(metrics?.linkClicks ?? 0, metrics?.prevLinkClicks ?? 0)}
                  accent="#3b82f6"
                />
                <KpiCard
                  label="CPM Médio"
                  value={brl(metrics?.cpm ?? 0)}
                  delta={delta(metrics?.cpm ?? 0, metrics?.prevCpm ?? 0)}
                  accent="#a855f7"
                  invertDelta
                />
                {(metrics?.connectRate ?? 0) > 0 && (
                  <KpiCard
                    label="Connect Rate"
                    value={pct(metrics?.connectRate ?? 0)}
                    accent="#10b981"
                    hint="msgs / cliques no link"
                  />
                )}
                {(metrics?.connectRate ?? 0) === 0 && (
                  <KpiCard
                    label="CPC Médio"
                    value={brl(metrics?.cpc ?? 0)}
                    accent="#f59e0b"
                    invertDelta
                  />
                )}
              </div>
            </div>
          </>
        ) : (
          /* ── DISTRIBUIÇÃO ──────────────────────────────────────────────── */
          <>
            <div>
              <SectionLabel>Alcance &amp; Cobertura</SectionLabel>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiCard
                  label="Total Investido"
                  value={brl(metrics?.spend ?? 0)}
                  delta={delta(metrics?.spend ?? 0, metrics?.prevSpend ?? 0)}
                  accent="#6366f1"
                  hint="vs período anterior"
                />
                <KpiCard
                  label="Alcance Total"
                  value={num(metrics?.reach ?? 0)}
                  delta={delta(metrics?.reach ?? 0, metrics?.prevReach ?? 0)}
                  accent="#a855f7"
                />
                <KpiCard
                  label="Impressões"
                  value={num(metrics?.impressions ?? 0)}
                  delta={delta(metrics?.impressions ?? 0, metrics?.prevImpressions ?? 0)}
                  accent="#8b5cf6"
                />
                <KpiCard
                  label="Frequência"
                  value={(metrics?.frequency ?? 0).toFixed(2)}
                  accent="#64748b"
                />
              </div>
            </div>
            <div>
              <SectionLabel>Engajamento</SectionLabel>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiCard
                  label="Cliques no Link"
                  value={num(metrics?.linkClicks ?? 0)}
                  delta={delta(metrics?.linkClicks ?? 0, metrics?.prevLinkClicks ?? 0)}
                  accent="#3b82f6"
                />
                <KpiCard
                  label="CTR Médio"
                  value={pct(metrics?.ctr ?? 0)}
                  delta={delta(metrics?.ctr ?? 0, metrics?.prevCtr ?? 0)}
                  accent="#06b6d4"
                />
                <KpiCard
                  label="CPM Médio"
                  value={brl(metrics?.cpm ?? 0)}
                  delta={delta(metrics?.cpm ?? 0, metrics?.prevCpm ?? 0)}
                  accent="#f59e0b"
                  invertDelta
                />
                {(metrics?.profileVisits ?? 0) > 0 ? (
                  <KpiCard label="Visitas ao Perfil" value={num(metrics?.profileVisits ?? 0)} accent="#f43f5e" />
                ) : (
                  <KpiCard label="CPC Médio" value={brl(metrics?.cpc ?? 0)} accent="#f43f5e" invertDelta />
                )}
              </div>
            </div>
          </>
        )}

        {/* Evolução diária */}
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">Evolução Diária</div>
              <div className="text-base font-black text-white mt-1">Investimento &amp; Resultados</div>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={meta?.timeseries?.map((p) => ({ ...p, date: isoLabel(p.date) })) ?? []}>
                <GradientDefs />
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="spend" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="results" orientation="right" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area yAxisId="spend" type="monotone" dataKey="spend" stroke="#6366f1" strokeWidth={2} fill="url(#gSpend)" name="Investimento" dot={false} />
                <Area yAxisId="results" type="monotone" dataKey="results" stroke="#10b981" strokeWidth={2} fill="url(#gResults)" name="Resultados" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Campaign table */}
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">Meta Ads</div>
              <div className="text-base font-black text-white mt-0.5">Campanhas do período</div>
            </div>
            <div className="flex items-center gap-3 text-[10px] flex-wrap justify-end">
              <span className="text-white/30 uppercase tracking-wider hidden sm:block">Ordenar</span>
              {(['spend', 'leads', 'msgs', 'ctr'] as SortKey[]).map((k) => {
                const labels: Record<SortKey, string> = { spend: 'Invest.', leads: 'Leads', msgs: 'Msgs', ctr: 'CTR', cpc: 'CPC' };
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSortKey(k)}
                    className={`font-bold uppercase tracking-[0.15em] transition-colors ${sortKey === k ? 'text-indigo-400' : 'text-white/30 hover:text-white/60'}`}
                  >
                    {labels[k]}
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
            ) : campaigns.map((c) => {
              const campLeads = c.leadForms + c.siteLeads;
              const campCpl = campLeads > 0 ? c.spend / campLeads : 0;
              const campCpmMsg = c.messagesStarted > 0 ? c.spend / c.messagesStarted : 0;
              return (
                <div key={c.id} className="px-5 py-4 hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-start justify-between gap-4 mb-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-white/90 truncate">{c.name}</div>
                    </div>
                    <div className="flex items-center gap-4 text-xs shrink-0 flex-wrap justify-end">
                      <div className="text-right">
                        <div className="text-white/30 text-[10px] uppercase tracking-wider">Invest.</div>
                        <div className="text-white font-bold">{brl(c.spend)}</div>
                      </div>
                      {campLeads > 0 && (
                        <div className="text-right">
                          <div className="text-white/30 text-[10px] uppercase tracking-wider">Leads</div>
                          <div className="text-emerald-400 font-bold">{num(campLeads)}</div>
                          {campCpl > 0 && <div className="text-white/40 text-[10px]">CPL {brl(campCpl)}</div>}
                        </div>
                      )}
                      {c.messagesStarted > 0 && (
                        <div className="text-right">
                          <div className="text-white/30 text-[10px] uppercase tracking-wider">Msgs</div>
                          <div className="text-sky-400 font-bold">{num(c.messagesStarted)}</div>
                          {campCpmMsg > 0 && <div className="text-white/40 text-[10px]">{brl(campCpmMsg)}/msg</div>}
                        </div>
                      )}
                      {campLeads === 0 && c.messagesStarted === 0 && (
                        <div className="text-right">
                          <div className="text-white/30 text-[10px] uppercase tracking-wider">Alcance</div>
                          <div className="text-white/80 font-bold">{num(c.reach)}</div>
                        </div>
                      )}
                      <div className="text-right">
                        <div className="text-white/30 text-[10px] uppercase tracking-wider">CTR</div>
                        <div className="text-white/80 font-bold">{pct(c.ctr)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-white/30 text-[10px] uppercase tracking-wider">CPM</div>
                        <div className="text-white/80 font-bold">{brl(c.cpm)}</div>
                      </div>
                    </div>
                  </div>
                  <div className="h-1 rounded-full bg-white/[0.04] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-indigo-500/70 transition-all duration-500"
                      style={{ width: `${Math.round((c.spend / maxSpend) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // ── Instagram Tab ──────────────────────────────────────────────────────────────
  const InstagramTab = () => (
    <div className="space-y-6">
      {igProfile && (
        <div className="flex items-center gap-5 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-6 py-5">
          {igProfile.profilePictureUrl ? (
            <img src={igProfile.profilePictureUrl} alt="" className="h-16 w-16 rounded-full object-cover border-2 border-white/10 shrink-0" />
          ) : (
            <div className="h-16 w-16 rounded-full shrink-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#f09433,#dc2743,#bc1888)' }}>
              <Instagram className="h-7 w-7 text-white" />
            </div>
          )}
          <div>
            <div className="text-xl font-black tracking-tight text-white">@{igProfile.username}</div>
            <div className="text-sm text-white/40 mt-0.5">{igProfile.name}</div>
            <div className="flex gap-5 mt-2 text-xs">
              <span><strong className="text-white">{num(igProfile.followersCount)}</strong><span className="text-white/40 ml-1">seguidores</span></span>
              <span><strong className="text-white">{num(igProfile.mediaCount)}</strong><span className="text-white/40 ml-1">publicações</span></span>
            </div>
          </div>
        </div>
      )}

      {ig?.available ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Alcance" value={num(ig.summary.totalReach)} delta={delta(ig.summary.totalReach, prevIg?.summary.totalReach ?? 0)} accent="#f43f5e" hint="vs período anterior" />
            <KpiCard label="Views" value={num(ig.summary.totalViews)} delta={delta(ig.summary.totalViews, prevIg?.summary.totalViews ?? 0)} accent="#f59e0b" />
            <KpiCard label="Visitas ao Perfil" value={num(ig.summary.totalProfileViews)} delta={delta(ig.summary.totalProfileViews, prevIg?.summary.totalProfileViews ?? 0)} accent="#38bdf8" />
            <KpiCard label="Novos Seguidores" value={num(ig.summary.totalFollowerGain)} delta={delta(ig.summary.totalFollowerGain, prevIg?.summary.totalFollowerGain ?? 0)} accent="#34d399" />
          </div>

          {ig.series.some((s) => s.reach > 0) && (
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
              <div className="mb-5">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">Instagram Orgânico</div>
                <div className="text-base font-black text-white mt-1">Alcance diário</div>
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
          )}
        </>
      ) : ig?.reason && !igProfile ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-5 py-4 text-sm text-amber-300">
          Métricas de insights indisponíveis: {ig.reason}
        </div>
      ) : null}

      {(ig?.media ?? []).length > 0 && (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06]">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">Conteúdo</div>
            <div className="text-base font-black text-white mt-0.5">Publicações recentes</div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.04]">
            {(ig?.media ?? []).slice(0, 6).map((m) => (
              <a
                key={m.id}
                href={m.permalink || undefined}
                target="_blank"
                rel="noreferrer"
                className="group flex items-start gap-3 p-4 hover:bg-white/[0.03] transition-colors"
              >
                <img
                  src={m.thumbnailUrl || m.mediaUrl}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-xl object-cover border border-white/10"
                />
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-xs font-medium text-white/75 leading-relaxed">{m.caption || 'Sem legenda'}</div>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 text-[10px] text-white/35">
                    {m.reach != null && <span>Alcance {num(m.reach)}</span>}
                    {m.totalInteractions != null && <span>Inter. {num(m.totalInteractions)}</span>}
                    <span className="inline-flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ExternalLink className="h-2.5 w-2.5" /> Abrir
                    </span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {!igProfile && !ig?.available && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Instagram className="h-10 w-10 text-white/15 mb-3" />
          <p className="text-sm text-white/40">Instagram não configurado para este portal.</p>
        </div>
      )}
    </div>
  );

  // ── Relatório Tab ──────────────────────────────────────────────────────────────
  const RelatorioTab = () => (
    <div className="space-y-6">
      {loadingWeekly ? (
        <div className="flex items-center justify-center h-40 text-white/40">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Gerando relatório...
        </div>
      ) : weekly ? (
        <>
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-6 py-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30 mb-1">Período analisado</div>
            <div className="text-xl font-black text-white">{weekly.periodStart} → {weekly.periodEnd}</div>
            <p className="mt-3 text-sm text-white/60 leading-relaxed">{weekly.summary}</p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Investimento" value={brl(weekly.meta.spend)} delta={null} accent="#6366f1" hint="últimos 7 dias" />
            <KpiCard label="Resultados" value={num(weekly.meta.results)} delta={null} accent="#10b981" />
            <KpiCard label="Alcance" value={num(weekly.meta.reach)} delta={null} accent="#f59e0b" />
            <KpiCard label="Alcance IG" value={num(weekly.instagram.totalReach)} delta={null} accent="#f43f5e" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400/70 mb-3">✦ Destaques</div>
              <div className="space-y-2.5">
                {(weekly.highlights ?? []).map((h, i) => (
                  <div key={i} className="text-sm text-emerald-100/80 leading-relaxed pl-3 border-l-2 border-emerald-500/30">{h}</div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/70 mb-3">⚠ Atenção</div>
              <div className="space-y-2.5">
                {(weekly.risks ?? []).map((r, i) => (
                  <div key={i} className="text-sm text-amber-100/80 leading-relaxed pl-3 border-l-2 border-amber-500/30">{r}</div>
                ))}
                {(weekly.risks ?? []).length === 0 && <div className="text-sm text-white/30">Sem alertas.</div>}
              </div>
            </div>
            <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.04] p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-400/70 mb-3">→ Próxima semana</div>
              <div className="space-y-2.5">
                {(weekly.next_week ?? []).map((n, i) => (
                  <div key={i} className="text-sm text-indigo-100/80 leading-relaxed pl-3 border-l-2 border-indigo-500/30">{n}</div>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center h-40 text-white/30 text-sm">Sem relatório disponível.</div>
      )}
    </div>
  );

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'campanhas', label: 'Campanhas', icon: BarChart2 },
    { id: 'instagram', label: 'Instagram', icon: Instagram },
    { id: 'relatorio', label: 'Relatório Semanal', icon: FileText },
  ];

  return (
    <div
      className="min-h-screen text-white"
      style={{ background: 'linear-gradient(160deg,#070810 0%,#090b14 60%,#07080e 100%)' }}
    >
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-indigo-600/10 blur-3xl" />
        <div className="absolute top-0 right-0 h-64 w-64 rounded-full bg-violet-600/8 blur-3xl" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#070810]/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex items-center justify-between h-14 gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-7 w-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                <TrendingUp className="h-4 w-4 text-indigo-400" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-black truncate">{clientLabel}</div>
                {bootstrap?.instagramUsername && (
                  <div className="text-[10px] text-white/35 truncate">@{bootstrap.instagramUsername}</div>
                )}
              </div>
            </div>

            <nav className="hidden md:flex items-center gap-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    tab === t.id ? 'bg-white/8 text-white' : 'text-white/40 hover:text-white/70 hover:bg-white/4'
                  }`}
                >
                  <t.icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              ))}
            </nav>

            <div className="flex items-center gap-2 shrink-0">
              <label className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/[0.07] bg-white/[0.03] text-xs">
                <CalendarRange className="h-3.5 w-3.5 text-white/40" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="bg-transparent text-white/80 outline-none w-28"
                />
                <Minus className="h-3 w-3 text-white/25" />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="bg-transparent text-white/80 outline-none w-28"
                />
              </label>

              <div ref={filterRef} className="relative">
                <button
                  type="button"
                  onClick={() => setFilterOpen((o) => !o)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                    campaignIds.length > 0
                      ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300'
                      : 'border-white/[0.07] bg-white/[0.03] text-white/50 hover:text-white/70'
                  }`}
                >
                  <Filter className="h-3.5 w-3.5" />
                  {campaignIds.length > 0 ? `${campaignIds.length} filtro${campaignIds.length > 1 ? 's' : ''}` : 'Filtrar'}
                  <ChevronDown className={`h-3 w-3 transition-transform ${filterOpen ? 'rotate-180' : ''}`} />
                </button>
                {filterOpen && (
                  <div className="absolute right-0 top-[calc(100%+6px)] z-40 w-72 rounded-2xl border border-white/10 bg-[#0d1018] shadow-2xl py-2">
                    <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06]">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">Campanhas</span>
                      {campaignIds.length > 0 && (
                        <button type="button" onClick={() => setCampaignIds([])} className="text-[10px] text-indigo-400 hover:text-indigo-300">Limpar</button>
                      )}
                    </div>
                    <div className="max-h-60 overflow-y-auto py-1">
                      {campaignOptions.length === 0 ? (
                        <div className="px-4 py-3 text-xs text-white/30">Sem campanhas disponíveis.</div>
                      ) : campaignOptions.map((c) => (
                        <label key={c.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            checked={campaignIds.includes(c.id)}
                            onChange={() => toggleCampaign(c.id)}
                            className="h-3.5 w-3.5 rounded border-white/20 bg-transparent accent-indigo-500"
                          />
                          <span className="text-xs text-white/70 truncate">{c.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={loadData}
                className="p-1.5 rounded-lg border border-white/[0.07] bg-white/[0.03] text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-all"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingData ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="md:hidden flex items-center gap-1 pb-2 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  tab === t.id ? 'bg-white/8 text-white' : 'text-white/40 hover:text-white/70'
                }`}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {errorMsg && (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 mt-4">
          <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-xs text-red-300">{errorMsg}</div>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
        {tab === 'campanhas' && <CampanhasTab />}
        {tab === 'instagram' && <InstagramTab />}
        {tab === 'relatorio' && <RelatorioTab />}
      </main>

      <footer className="border-t border-white/[0.04] mt-8 py-4">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 flex items-center justify-between">
          <span className="text-[10px] text-white/20 font-mono">Powered by CR8</span>
          <span className="text-[10px] text-white/20">{dateFrom} → {dateTo}</span>
        </div>
      </footer>
    </div>
  );
};
