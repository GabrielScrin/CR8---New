import React, { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  DollarSign,
  Eye,
  MousePointerClick,
  RefreshCw,
  Target,
  Zap,
} from 'lucide-react';
import { motion } from 'framer-motion';
import type { AdMetric, NativeResultType } from '../types';

interface TrafficDashboardProps {
  rows: AdMetric[];
  comparisonData: { name: string; metaSpend: number; metaLeads: number }[];
  summary?: {
    media: {
      invest: number;
      impressions: number;
      reach: number;
      clicks: number;
      linkClicks: number;
      ctr: number;
      cpc: number;
      cpm: number;
      frequency: number;
    };
    platform: {
      messagesStarted: number;
      leadForms: number;
      siteLeads: number;
      businessLeads: number;
      profileVisits: number;
      followers: number;
      videoViews: number;
      thruplays: number;
      purchases: number;
    };
    dominantNativeType: NativeResultType | null;
  } | null;
  selectedAdAccountId: string | null;
  adAccountName: string;
  datePreset: string;
  dateSince: string;
  dateUntil: string;
  loading: boolean;
  demoMode: boolean;
}

const C = {
  card:    '#0C0F1E',
  border:  'rgba(255,255,255,0.065)',
  blue:    '#3B82F6',
  emerald: '#10B981',
  amber:   '#F59E0B',
  red:     '#EF4444',
  purple:  '#8B5CF6',
  pink:    '#EC4899',
  text:    '#F1F5F9',
  sub:     '#94A3B8',
  muted:   '#475569',
};

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(v);

const fmtNum = (v: number) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(v);

const fmtPct = (v: number, d = 2) => `${(v * 100).toFixed(d)}%`;

const fmtShort = (v: number) => (v >= 1000 ? `R$${(v / 1000).toFixed(1)}k` : fmtBRL(v));

const DEMO_SERIES = [
  { name: 'Seg', metaSpend: 620, metaLeads: 28 },
  { name: 'Ter', metaSpend: 480, metaLeads: 21 },
  { name: 'Qua', metaSpend: 790, metaLeads: 44 },
  { name: 'Qui', metaSpend: 710, metaLeads: 39 },
  { name: 'Sex', metaSpend: 940, metaLeads: 58 },
  { name: 'Sáb', metaSpend: 360, metaLeads: 17 },
  { name: 'Dom', metaSpend: 290, metaLeads: 13 },
];

const DEMO_ROWS: AdMetric[] = [
  { id: '1', adId: 'c1', adName: 'Prospecção Fria',          status: 'active', spend: 2100, impressions: 108000, reach: 82000, inlineLinkClicks: 2160, ctr: 2.0, cpm: 19.4, results: 61, resultLabel: 'Leads', costPerResult: 34.4, frequency: 1.32, idc: 82, classification: 'otimo', thumbnail: '' },
  { id: '2', adId: 'c2', adName: 'Remarketing Quente',       status: 'active', spend: 1150, impressions: 52000,  reach: 33000, inlineLinkClicks: 1560, ctr: 3.0, cpm: 22.1, results: 44, resultLabel: 'Leads', costPerResult: 26.1, frequency: 1.58, idc: 75, classification: 'bom',   thumbnail: '' },
  { id: '3', adId: 'c3', adName: 'Brand Awareness',          status: 'active', spend: 720,  impressions: 61000,  reach: 57000, inlineLinkClicks: 610,  ctr: 1.0, cpm: 11.8, results: 14, resultLabel: 'Leads', costPerResult: 51.4, frequency: 1.07, idc: 55, classification: 'regular', thumbnail: '' },
  { id: '4', adId: 'c4', adName: 'Retenção Clientes',        status: 'paused', spend: 390,  impressions: 20000,  reach: 13000, inlineLinkClicks: 800,  ctr: 4.0, cpm: 19.5, results: 24, resultLabel: 'Leads', costPerResult: 16.3, frequency: 1.54, idc: 42, classification: 'regular', thumbnail: '' },
  { id: '5', adId: 'c5', adName: 'Fundo de Funil — Oferta', status: 'active', spend: 210,  impressions: 11000,  reach: 8800,  inlineLinkClicks: 150,  ctr: 1.4, cpm: 19.1, results: 7,  resultLabel: 'Leads', costPerResult: 30.0, frequency: 1.25, idc: 31, classification: 'ruim',    thumbnail: '' },
];

function SpendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#111827', border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>
      <div style={{ color: C.muted, fontSize: 11, marginBottom: 6, fontWeight: 600, letterSpacing: '0.04em' }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <div style={{ width: 6, height: 6, borderRadius: 2, background: p.color }} />
          <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>
            {p.dataKey === 'metaSpend' ? fmtBRL(p.value) : `${fmtNum(p.value)} resultados`}
          </span>
        </div>
      ))}
    </div>
  );
}

function CampTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#111827', border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>
      <div style={{ color: C.muted, fontSize: 10, marginBottom: 4 }}>{label}</div>
      <div style={{ color: C.text, fontSize: 13, fontWeight: 700 }}>{fmtBRL(payload[0]?.value ?? 0)}</div>
    </div>
  );
}

const panel = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 16,
  ...extra,
});

const sectionLabel: React.CSSProperties = {
  fontSize: 10,
  color: C.muted,
  fontWeight: 700,
  letterSpacing: '0.09em',
  textTransform: 'uppercase',
  marginBottom: 14,
};

const getSummaryResultMeta = (
  summary: NonNullable<TrafficDashboardProps['summary']>,
): { value: number; label: string } => {
  switch (summary.dominantNativeType) {
    case 'messages_started':
      return { value: summary.platform.messagesStarted, label: 'Mensagens iniciadas' };
    case 'lead_forms':
      return { value: summary.platform.leadForms, label: 'Lead Forms' };
    case 'site_leads':
      return { value: summary.platform.siteLeads, label: 'Conversoes de site' };
    case 'profile_visits':
      return { value: summary.platform.profileVisits, label: 'Visitas ao perfil' };
    case 'followers':
      return { value: summary.platform.followers, label: 'Seguidores' };
    case 'video_views':
      return { value: summary.platform.thruplays > 0 ? summary.platform.thruplays : summary.platform.videoViews, label: summary.platform.thruplays > 0 ? 'ThruPlays' : 'Views 3s' };
    case 'purchases':
      return { value: summary.platform.purchases, label: 'Compras' };
    default:
      return { value: summary.platform.businessLeads, label: 'Leads de negocio' };
  }
};

const getNativeTypeLabel = (nativeType: NativeResultType, hasThruplays = false) => {
  switch (nativeType) {
    case 'messages_started':
      return 'Mensagens iniciadas';
    case 'lead_forms':
      return 'Lead Forms';
    case 'site_leads':
      return 'Conversoes de site';
    case 'profile_visits':
      return 'Visitas ao perfil';
    case 'followers':
      return 'Seguidores';
    case 'video_views':
      return hasThruplays ? 'ThruPlays' : 'Views 3s';
    case 'purchases':
      return 'Compras';
    default:
      return 'Resultados';
  }
};

const getResultValueForType = (row: AdMetric, nativeType: NativeResultType) => {
  switch (nativeType) {
    case 'messages_started':
      return row.messagesStarted ?? 0;
    case 'lead_forms':
      return row.leadForms ?? 0;
    case 'site_leads':
      return row.siteLeads ?? 0;
    case 'profile_visits':
      return row.profileVisits ?? 0;
    case 'followers':
      return row.followers ?? 0;
    case 'video_views':
      return (row.thruplays ?? 0) > 0 ? row.thruplays ?? 0 : row.videoViews ?? 0;
    case 'purchases':
      return row.results ?? 0;
    default:
      return row.results ?? row.leads ?? 0;
  }
};

const inferRowNativeType = (row: AdMetric): NativeResultType => {
  if (row.nativeType && row.nativeType !== 'unknown') return row.nativeType;
  if ((row.messagesStarted ?? 0) > 0) return 'messages_started';
  if ((row.leadForms ?? 0) > 0) return 'lead_forms';
  if ((row.siteLeads ?? 0) > 0) return 'site_leads';
  if ((row.profileVisits ?? 0) > 0) return 'profile_visits';
  if ((row.followers ?? 0) > 0) return 'followers';
  if ((row.thruplays ?? 0) > 0 || (row.videoViews ?? 0) > 0) return 'video_views';
  return 'unknown';
};

export function TrafficDashboard({
  rows: rawRows,
  comparisonData: rawSeries,
  summary,
  selectedAdAccountId,
  datePreset,
  dateSince,
  dateUntil,
  loading,
  demoMode,
}: TrafficDashboardProps) {
  const rows   = demoMode && rawRows.length === 0   ? DEMO_ROWS   : rawRows;
  const series = demoMode && rawSeries.length === 0 ? DEMO_SERIES : rawSeries;
  const seriesResultLabel = summary ? getSummaryResultMeta(summary).label : 'Resultados';

  const dateLabel = useMemo(() => {
    if (datePreset === 'today')       return 'Hoje';
    if (datePreset === 'yesterday')   return 'Ontem';
    if (datePreset === 'today_yesterday') return 'Hoje e ontem';
    if (datePreset === 'last_7d')    return 'Últimos 7 dias';
    if (datePreset === 'last_14d')   return 'Últimos 14 dias';
    if (datePreset === 'last_28d')   return 'Últimos 28 dias';
    if (datePreset === 'last_30d')   return 'Últimos 30 dias';
    if (datePreset === 'this_week')  return 'Esta semana';
    if (datePreset === 'last_week')  return 'Semana passada';
    if (datePreset === 'this_month') return 'Este mês';
    if (datePreset === 'last_month') return 'Mês passado';
    if (dateSince && dateUntil)      return `${dateSince} → ${dateUntil}`;
    return 'Período';
  }, [datePreset, dateSince, dateUntil]);

  const m = useMemo(() => {
    const active = rows.filter((r) => r.spend > 0);
    if (!active.length) return null;

    const summaryResult = summary ? getSummaryResultMeta(summary) : null;
    const spend       = summary?.media.invest ?? active.reduce((s, r) => s + r.spend, 0);
    const impressions = summary?.media.impressions ?? active.reduce((s, r) => s + r.impressions, 0);
    const reach       = summary?.media.reach ?? active.reduce((s, r) => s + (r.reach ?? 0), 0);
    const clicks      = summary != null
      ? (summary.media.linkClicks > 0 ? summary.media.linkClicks : summary.media.clicks)
      : active.reduce((s, r) => s + (r.inlineLinkClicks ?? r.clicks ?? 0), 0);
    const results     = summaryResult?.value ?? active.reduce((s, r) => s + (r.results ?? r.leads ?? 0), 0);

    const ctr       = summary != null ? summary.media.ctr / 100 : impressions > 0 ? clicks / impressions : 0;
    const cpm       = summary?.media.cpm ?? (impressions > 0 ? (spend / impressions) * 1000 : 0);
    const cpc       = summary?.media.cpc ?? (clicks > 0 ? spend / clicks : 0);
    const cpa       = results > 0 ? spend / results : 0;
    const frequency = summary?.media.frequency ?? (reach > 0 ? impressions / reach : 0);

    const withIdc = active.filter((r) => r.idc != null);
    const avgIdc  = withIdc.length ? withIdc.reduce((s, r) => s + (r.idc ?? 0), 0) / withIdc.length : null;

    const classCount = {
      otimo:   active.filter((r) => r.classification === 'otimo').length,
      bom:     active.filter((r) => r.classification === 'bom').length,
      regular: active.filter((r) => r.classification === 'regular').length,
      ruim:    active.filter((r) => r.classification === 'ruim').length,
    };
    const hasClass = Object.values(classCount).some((v) => v > 0);

    // Group by campaign if available, else by row
    const hasCampNames = active.some((r) => r.campaignName);
    const rankMap = new Map<
      string,
      {
        name: string;
        spend: number;
        results: number;
        clicks: number;
        impressions: number;
        hasThruplays: boolean;
        typedSpend: Map<NativeResultType, number>;
        typedResults: Map<NativeResultType, number>;
        resultLabelWeights: Map<string, number>;
      }
    >();
    for (const r of active) {
      const key  = String(hasCampNames ? (r.campaignId ?? r.campaignName ?? r.adId) : r.adId);
      const name = (hasCampNames ? r.campaignName ?? 'Sem campanha' : r.adName).slice(0, 30);
      const cur  = rankMap.get(key) ?? {
        name,
        spend: 0,
        results: 0,
        clicks: 0,
        impressions: 0,
        hasThruplays: false,
        typedSpend: new Map<NativeResultType, number>(),
        typedResults: new Map<NativeResultType, number>(),
        resultLabelWeights: new Map<string, number>(),
      };
      const rowNativeType = inferRowNativeType(r);
      const rowResults = rowNativeType !== 'unknown' ? getResultValueForType(r, rowNativeType) : (r.results ?? r.leads ?? 0);
      cur.spend       += r.spend;
      cur.results     += rowResults;
      cur.clicks      += r.inlineLinkClicks ?? r.clicks ?? 0;
      cur.impressions += r.impressions;
      cur.hasThruplays = cur.hasThruplays || (r.thruplays ?? 0) > 0;
      if (rowNativeType !== 'unknown') {
        cur.typedSpend.set(rowNativeType, (cur.typedSpend.get(rowNativeType) ?? 0) + r.spend);
        cur.typedResults.set(rowNativeType, (cur.typedResults.get(rowNativeType) ?? 0) + rowResults);
      }
      if (r.resultLabel) cur.resultLabelWeights.set(r.resultLabel, (cur.resultLabelWeights.get(r.resultLabel) ?? 0) + r.spend);
      rankMap.set(key, cur);
    }
    const ranking = [...rankMap.values()]
      .map((r) => {
        const dominantType = [...r.typedSpend.entries()]
          .sort((a, b) => {
            if (b[1] !== a[1]) return b[1] - a[1];
            return (r.typedResults.get(b[0]) ?? 0) - (r.typedResults.get(a[0]) ?? 0);
          })[0]?.[0];
        const resolvedResults = dominantType != null ? (r.typedResults.get(dominantType) ?? 0) : r.results;
        return {
          ...r,
          results: resolvedResults,
          ctr: r.impressions > 0 ? r.clicks / r.impressions : 0,
          cpa: resolvedResults > 0 ? r.spend / resolvedResults : 0,
          resultLabel:
            dominantType != null
              ? getNativeTypeLabel(dominantType, dominantType === 'video_views' && r.hasThruplays)
              : [...r.resultLabelWeights.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
                summaryResult?.label ??
                'Resultados',
        };
      })
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 6);

    const labels = active.map((r) => r.resultLabel).filter(Boolean) as string[];
    const resultLabel = summaryResult?.label ?? (
      labels.length
        ? (labels.sort((a, b) => labels.filter((v) => v === b).length - labels.filter((v) => v === a).length)[0] ?? 'Resultados')
        : 'Resultados'
    );

    const withHook = active.filter((r) => r.hookRate != null);
    const avgHookRate = withHook.length ? withHook.reduce((s, r) => s + (r.hookRate ?? 0), 0) / withHook.length : null;
    const withHold = active.filter((r) => r.holdRate != null);
    const avgHoldRate = withHold.length ? withHold.reduce((s, r) => s + (r.holdRate ?? 0), 0) / withHold.length : null;
    const withRoas = active.filter((r) => (r.roas ?? 0) > 0);
    const avgRoas = withRoas.length ? withRoas.reduce((s, r) => s + (r.roas ?? 0), 0) / withRoas.length : null;

    return { spend, impressions, reach, clicks, results, ctr, cpm, cpc, cpa, frequency, avgIdc, classCount, hasClass, ranking, resultLabel, avgHookRate, avgHoldRate, avgRoas };
  }, [rows, summary]);

  const health = useMemo(() => {
    if (!m) return null;
    let score = 0; let w = 0;
    if (m.ctr > 0)       { score += Math.min(100, (m.ctr / 0.03) * 100) * 0.3; w += 0.3; }
    if (m.cpm > 0)       { score += Math.max(0, Math.min(100, 100 - ((m.cpm - 10) / 30) * 100)) * 0.2; w += 0.2; }
    if (m.frequency > 0) {
      const fs = m.frequency <= 2.5 ? 100 : m.frequency <= 4 ? 80 - ((m.frequency - 2.5) / 1.5) * 40 : Math.max(0, 40 - ((m.frequency - 4) / 2) * 40);
      score += fs * 0.2; w += 0.2;
    }
    if (m.avgIdc != null) { score += m.avgIdc * 0.3; w += 0.3; }
    return w > 0 ? Math.round(score / w) : null;
  }, [m]);

  const hColor = !health ? C.muted : health >= 70 ? C.emerald : health >= 40 ? C.amber : C.red;
  const hLabel = !health ? 'N/D' : health >= 70 ? 'Saudável' : health >= 40 ? 'Atenção' : 'Crítico';

  if (loading) {
    return (
      <div style={panel({ padding: 20 })}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ flex: '1 1 140px', height: 88, borderRadius: 14, background: 'rgba(255,255,255,0.04)' }} />
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[220, 220].map((h, i) => (
            <div key={i} style={{ height: h, borderRadius: 14, background: 'rgba(255,255,255,0.04)' }} />
          ))}
        </div>
      </div>
    );
  }

  if (!m) {
    return (
      <div style={panel({ padding: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 })}>
        <Activity size={36} color={C.muted} />
        <span style={{ color: C.muted, fontSize: 13 }}>
          {selectedAdAccountId ? 'Nenhum dado para o período. Clique em Atualizar.' : 'Selecione uma conta de anúncio.'}
        </span>
      </div>
    );
  }

  const kpis = [
    { label: 'Investimento', value: fmtBRL(m.spend),                                    sub: `${fmtNum(m.impressions)} impressões`,   icon: DollarSign,      color: C.blue    },
    { label: m.resultLabel,  value: fmtNum(m.results),                                  sub: `Alcance: ${fmtNum(m.reach)}`,           icon: Target,          color: C.emerald },
    { label: 'CPA',          value: m.cpa > 0 ? fmtBRL(m.cpa) : '—',                   sub: 'Custo por aquisição',                   icon: Zap,             color: C.purple  },
    { label: 'CTR',          value: fmtPct(m.ctr),                                      sub: `${fmtNum(m.clicks)} cliques`,           icon: MousePointerClick, color: C.amber },
    { label: 'CPM',          value: fmtBRL(m.cpm),                                      sub: 'Por mil impressões',                    icon: Eye,             color: C.pink    },
    { label: 'Frequência',   value: m.frequency.toFixed(2),                             sub: `CPC: ${fmtBRL(m.cpc)}`,                icon: RefreshCw,       color: m.frequency > 3.5 ? C.red : m.frequency > 2.5 ? C.amber : C.emerald },
  ];

  const classConfig: Record<string, { label: string; color: string }> = {
    otimo:   { label: 'Ótimo',   color: C.emerald },
    bom:     { label: 'Bom',     color: C.blue    },
    regular: { label: 'Regular', color: C.amber   },
    ruim:    { label: 'Ruim',    color: C.red     },
  };

  return (
    <div>
      {/* ── KPI Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(162px, 1fr))', gap: 10, marginBottom: 12 }}>
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.32, ease: 'easeOut' }}
              whileHover={{ y: -2, transition: { duration: 0.15 } }}
              style={panel({ padding: '16px 18px', position: 'relative', overflow: 'hidden', cursor: 'default' })}
            >
              <div style={{ position: 'absolute', top: -28, right: -28, width: 88, height: 88, borderRadius: '50%', background: `radial-gradient(circle, ${kpi.color}22 0%, transparent 70%)`, pointerEvents: 'none' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: `${kpi.color}18`, border: `1px solid ${kpi.color}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={12} color={kpi.color} />
                </div>
                <span style={{ fontSize: 10, color: C.muted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {kpi.label}
                </span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.text, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
                {kpi.value}
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{kpi.sub}</div>
            </motion.div>
          );
        })}
      </div>

      {/* ── Charts Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 10, marginBottom: 12 }}>
        {/* Area Chart */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.33, duration: 0.32, ease: 'easeOut' }}
          style={panel({ padding: 20 })}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <div style={sectionLabel}>Evolução do Gasto</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                {fmtBRL(m.spend)}
              </div>
            </div>
            <div style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: `${C.blue}18`, color: C.blue, border: `1px solid ${C.blue}30`, fontWeight: 600, whiteSpace: 'nowrap' }}>
              {dateLabel}{demoMode ? ' · demo' : ''}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={168}>
            <AreaChart data={series} margin={{ top: 5, right: 0, left: -22, bottom: 8 }}>
              <defs>
                <linearGradient id="tdGs" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={C.blue}    stopOpacity={0.22} />
                  <stop offset="95%" stopColor={C.blue}    stopOpacity={0}    />
                </linearGradient>
                <linearGradient id="tdGl" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={C.emerald} stopOpacity={0.22} />
                  <stop offset="95%" stopColor={C.emerald} stopOpacity={0}    />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                interval={0}
                angle={-35}
                textAnchor="end"
                height={44}
                tickMargin={8}
                tick={{ fill: C.muted, fontSize: 10 }}
                tickFormatter={(value) => (typeof value === 'string' ? value.split('/')[0] : value)}
              />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: C.muted, fontSize: 10 }} tickFormatter={(v) => `R$${v}`} />
              <Tooltip content={<SpendTooltip />} />
              <Area type="monotone" dataKey="metaSpend" stroke={C.blue}    strokeWidth={2} fill="url(#tdGs)" dot={false} activeDot={{ r: 4, fill: C.blue    }} />
              <Area type="monotone" dataKey="metaLeads" stroke={C.emerald} strokeWidth={2} fill="url(#tdGl)" dot={false} activeDot={{ r: 4, fill: C.emerald }} />
            </AreaChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
            {[{ color: C.blue, label: 'Gasto (R$)' }, { color: C.emerald, label: seriesResultLabel }].map((l) => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color }} />
                <span style={{ fontSize: 11, color: C.muted }}>{l.label}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Campaign Ranking */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.39, duration: 0.32, ease: 'easeOut' }}
          style={panel({ padding: 20 })}
        >
          <div style={sectionLabel}>Top por Investimento</div>
          <ResponsiveContainer width="100%" height={196}>
            <BarChart layout="vertical" data={m.ranking} margin={{ top: 0, right: 6, left: 0, bottom: 0 }}>
              <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: C.muted, fontSize: 9 }} tickFormatter={fmtShort} />
              <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: C.sub, fontSize: 9 }} width={108} />
              <Tooltip content={<CampTooltip />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
              <Bar dataKey="spend" radius={[0, 5, 5, 0]}>
                {m.ranking.map((_, i) => (
                  <Cell key={i} fill={`rgba(59,130,246,${1 - i * 0.12})`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* ── Performance Row ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.44, duration: 0.32, ease: 'easeOut' }}
        style={{ ...panel({ padding: 20 }), marginBottom: 12 }}
      >
        <div style={sectionLabel}>Desempenho por Campanha</div>
        <div style={{ display: 'grid', gridTemplateColumns: m.avgHookRate != null || m.avgHoldRate != null || m.avgRoas != null ? '1fr 230px' : '1fr', gap: 24 }}>

          {/* Tabela de campanhas */}
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 88px 92px 88px 52px', gap: 8, paddingBottom: 8, borderBottom: `1px solid ${C.border}`, marginBottom: 2 }}>
              {['Campanha', 'Investido', 'Resultado', 'CPA', 'CTR'].map((h) => (
                <span key={h} style={{ fontSize: 10, color: C.muted, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</span>
              ))}
            </div>
            {(() => {
              const bestCpa = [...m.ranking].filter((c) => c.cpa > 0).sort((a, b) => a.cpa - b.cpa)[0]?.cpa ?? 0;
              const maxSpend = m.ranking[0]?.spend ?? 1;
              return m.ranking.map((camp, i) => {
                const cpaColor = camp.cpa === 0 ? C.muted : camp.cpa <= bestCpa * 1.3 ? C.emerald : camp.cpa <= bestCpa * 2 ? C.amber : C.red;
                const spendPct = (camp.spend / maxSpend) * 100;
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 88px 92px 88px 52px', gap: 8, padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 12, color: C.text, fontWeight: 500, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {camp.name}
                      </div>
                      <div style={{ height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 1, overflow: 'hidden' }}>
                        <div style={{ width: `${spendPct}%`, height: '100%', background: C.blue, borderRadius: 1 }} />
                      </div>
                    </div>
                    <span style={{ fontSize: 12, color: C.sub, fontVariantNumeric: 'tabular-nums' }}>{fmtBRL(camp.spend)}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{fmtNum(camp.results)}</div>
                      <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.2 }}>{camp.resultLabel}</div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: cpaColor, fontVariantNumeric: 'tabular-nums' }}>{camp.cpa > 0 ? fmtBRL(camp.cpa) : '—'}</span>
                    <span style={{ fontSize: 12, color: C.sub, fontVariantNumeric: 'tabular-nums' }}>{fmtPct(camp.ctr)}</span>
                  </div>
                );
              });
            })()}
          </div>

          {/* Métricas de vídeo / ROAS */}
          {(m.avgHookRate != null || m.avgHoldRate != null || m.avgRoas != null) && (
            <div style={{ borderLeft: `1px solid ${C.border}`, paddingLeft: 24 }}>
              <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: 16 }}>
                Vídeo & ROAS
              </div>

              {m.avgHookRate != null && (() => {
                const pct = m.avgHookRate * 100;
                const color = pct >= 30 ? C.emerald : pct >= 20 ? C.amber : C.red;
                return (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 12, color: C.sub }}>Hook Rate</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{pct.toFixed(1)}%</span>
                    </div>
                    <div style={{ height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                      <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, pct / 50 * 100)}%` }} transition={{ delay: 0.6, duration: 0.5 }}
                        style={{ height: '100%', background: color, borderRadius: 3 }} />
                    </div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>Meta: ≥ 30%</div>
                  </div>
                );
              })()}

              {m.avgHoldRate != null && (() => {
                const pct = m.avgHoldRate * 100;
                const color = pct >= 15 ? C.emerald : pct >= 8 ? C.amber : C.red;
                return (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 12, color: C.sub }}>Hold Rate</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{pct.toFixed(1)}%</span>
                    </div>
                    <div style={{ height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                      <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, pct / 25 * 100)}%` }} transition={{ delay: 0.65, duration: 0.5 }}
                        style={{ height: '100%', background: color, borderRadius: 3 }} />
                    </div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>Meta: ≥ 15%</div>
                  </div>
                );
              })()}

              {m.avgRoas != null && (() => {
                const color = m.avgRoas >= 3 ? C.emerald : m.avgRoas >= 1.5 ? C.amber : C.red;
                return (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 12, color: C.sub }}>ROAS médio</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{m.avgRoas.toFixed(2)}x</span>
                    </div>
                    <div style={{ height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                      <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, (m.avgRoas / 5) * 100)}%` }} transition={{ delay: 0.7, duration: 0.5 }}
                        style={{ height: '100%', background: color, borderRadius: 3 }} />
                    </div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>Meta: ≥ 3x</div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Bottom Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.72fr', gap: 10 }}>
        {/* Creative Health */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.46, duration: 0.32, ease: 'easeOut' }}
          style={panel({ padding: 20 })}
        >
          <div style={sectionLabel}>Qualidade dos Criativos</div>
          {m.hasClass ? (
            <>
              {(['otimo', 'bom', 'regular', 'ruim'] as const).map((key, ki) => {
                const { label, color } = classConfig[key];
                const count = m.classCount[key];
                const total = Object.values(m.classCount).reduce((a, b) => a + b, 0);
                const pct   = total > 0 ? count / total : 0;
                return (
                  <div key={key} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 12, color, fontWeight: 500 }}>{label}</span>
                      <span style={{ fontSize: 12, color: C.sub, fontVariantNumeric: 'tabular-nums' }}>
                        {count}&nbsp;<span style={{ color: C.muted }}>({(pct * 100).toFixed(0)}%)</span>
                      </span>
                    </div>
                    <div style={{ height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct * 100}%` }}
                        transition={{ delay: 0.56 + ki * 0.07, duration: 0.5, ease: 'easeOut' }}
                        style={{ height: '100%', background: color, borderRadius: 3 }}
                      />
                    </div>
                  </div>
                );
              })}
              {m.avgIdc != null && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: C.muted }}>IDC médio</span>
                  <span style={{ fontSize: 17, fontWeight: 700, color: m.avgIdc >= 70 ? C.emerald : m.avgIdc >= 50 ? C.amber : C.red, fontVariantNumeric: 'tabular-nums' }}>
                    {m.avgIdc.toFixed(0)}<span style={{ fontSize: 11, fontWeight: 400, color: C.muted }}>/100</span>
                  </span>
                </div>
              )}
            </>
          ) : (
            <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.55 }}>
              Selecione o nível <strong style={{ color: C.sub }}>Anúncio</strong> e atualize para ver a qualidade dos criativos (IDC).
            </div>
          )}
        </motion.div>

        {/* Efficiency Table */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.52, duration: 0.32, ease: 'easeOut' }}
          style={panel({ padding: 20 })}
        >
          <div style={sectionLabel}>Eficiência da Conta</div>
          {[
            { label: 'Alcance',    value: fmtNum(m.reach),       accent: C.blue    },
            { label: 'Impressões', value: fmtNum(m.impressions),  accent: C.purple  },
            { label: 'Cliques',    value: fmtNum(m.clicks),       accent: C.emerald },
            { label: 'CTR',        value: fmtPct(m.ctr),          accent: C.amber   },
            { label: 'CPC médio',  value: fmtBRL(m.cpc),          accent: C.pink    },
            { label: 'CPM',        value: fmtBRL(m.cpm),          accent: C.blue    },
          ].map((item) => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 3, height: 14, borderRadius: 2, background: item.accent, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: C.sub }}>{item.label}</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{item.value}</span>
            </div>
          ))}
        </motion.div>

        {/* Health Score */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.58, duration: 0.32, ease: 'easeOut' }}
          style={panel({ padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 })}
        >
          <div style={sectionLabel}>Saúde da Conta</div>
          <div style={{ position: 'relative', width: 112, height: 112 }}>
            <svg viewBox="0 0 112 112" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="56" cy="56" r="46" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
              <circle
                cx="56" cy="56" r="46"
                fill="none"
                stroke={hColor}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${((health ?? 0) / 100) * 289.03} 289.03`}
                style={{ transition: 'stroke-dasharray 1.2s ease 0.6s' }}
              />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 27, fontWeight: 700, color: hColor, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                {health ?? '—'}
              </div>
              <div style={{ fontSize: 10, color: C.muted }}>/100</div>
            </div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: hColor }}>{hLabel}</div>
          <div style={{ fontSize: 10, color: C.muted, textAlign: 'center', lineHeight: 1.6, maxWidth: 130 }}>
            CTR · CPM · Frequência · Qualidade criativa
          </div>
        </motion.div>
      </div>
    </div>
  );
}
