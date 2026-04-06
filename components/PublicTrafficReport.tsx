import React, { useEffect, useState } from 'react';
import { getSupabaseAnonKey, getSupabaseUrl } from '../lib/supabase';

interface PublicTrafficReportProps {
  publicId: string;
}

type PeriodSummary = {
  invest: number;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
  results: number;
  resultLabel: string;
  costPerResult?: number;
  profileVisits?: number;
  followers?: number;
};

type PlatformSummary = {
  videoViews: number;
  thruplays: number;
  profileVisits: number;
  followers: number;
  messagesStarted: number;
  leadForms: number;
  siteLeads: number;
  businessLeads: number;
};

type BusinessSummary = {
  crmLeads: number;
  won: number;
  revenue: number;
  pendingFollowup: number;
  leadSignals: number;
};

type ObjectiveMetric = {
  key: string;
  label: string;
  current: number;
  previous: number;
  layer: 'platform' | 'business';
};

type TopAd = {
  id: string;
  name: string;
  campaign: string;
  spend: number;
  impressions: number;
  reach: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
  results: number;
  resultLabel: string;
  hookRate: number;
  holdRate: number;
  idc: number;
  idcClass: string;
  thumbnailUrl?: string;
};

type CampaignRow = {
  name: string;
  status: 'active' | 'paused';
  spend: number;
  reach: number;
  impressions: number;
  results: number;
  resultLabel: string;
  costPerResult: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
  hookRate?: number;
  holdRate?: number;
  idc?: number;
  classification?: string;
};

type TimeseriesPoint = { name: string; metaSpend: number; metaLeads: number };
type LayeredBlock = { media: PeriodSummary; platform: PlatformSummary; business: BusinessSummary };
type ReportData = {
  schemaVersion?: number;
  clientName: string;
  agencyName: string;
  level: string;
  periodCurrent: { label: string; start: string; end: string };
  periodPrevious: { label: string; start: string; end: string } | null;
  current: PeriodSummary;
  previous: PeriodSummary | null;
  currentLayers?: LayeredBlock;
  previousLayers?: LayeredBlock | null;
  activeObjectives?: ObjectiveMetric[];
  timeseries: TimeseriesPoint[];
  campaigns: CampaignRow[];
  topAds: TopAd[];
  insights: string[];
  actionItems: string[];
};

type TrafficReport = {
  id: string;
  public_id: string;
  title: string;
  period_start: string;
  period_end: string;
  report_data: ReportData;
  created_at: string;
};

type MetricCard = {
  label: string;
  current: number;
  previous: number;
  format: 'currency' | 'integer' | 'percent' | 'decimal';
  color: 'blue' | 'green' | 'red' | 'purple' | 'teal' | 'yellow';
  invert?: boolean;
};

const EMPTY_MEDIA: PeriodSummary = { invest: 0, impressions: 0, reach: 0, clicks: 0, linkClicks: 0, ctr: 0, cpc: 0, cpm: 0, frequency: 0, results: 0, resultLabel: 'Resultados' };
const EMPTY_PLATFORM: PlatformSummary = { videoViews: 0, thruplays: 0, profileVisits: 0, followers: 0, messagesStarted: 0, leadForms: 0, siteLeads: 0, businessLeads: 0 };
const EMPTY_BUSINESS: BusinessSummary = { crmLeads: 0, won: 0, revenue: 0, pendingFollowup: 0, leadSignals: 0 };
const IDC_COLORS: Record<string, string> = { great: '#22c55e', good: '#f59e0b', ok: '#f97316', bad: '#ef4444' };

const n2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nInt = (v: number) => Math.round(v).toLocaleString('pt-BR');
const brl = (v: number) => `R$\u00a0${n2(v)}`;
const pct = (v: number, d = 1) => `${v.toFixed(d)}%`;
const fmtDate = (iso: string) => (iso && iso.split('-').length === 3 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);
const MONTHS_PT = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const fmtLongDate = (iso: string) => (iso && iso.split('-').length === 3 ? `${parseInt(iso.slice(8, 10), 10)} de ${MONTHS_PT[parseInt(iso.slice(5, 7), 10) - 1] ?? iso.slice(5, 7)} de ${iso.slice(0, 4)}` : iso);
const accent = (color: MetricCard['color']) => ({ blue: 'linear-gradient(90deg,#3b82f6,#6366f1)', green: 'linear-gradient(90deg,#22c55e,#14b8a6)', red: 'linear-gradient(90deg,#ef4444,#f97316)', purple: 'linear-gradient(90deg,#a855f7,#ec4899)', teal: 'linear-gradient(90deg,#14b8a6,#22c55e)', yellow: 'linear-gradient(90deg,#f59e0b,#f97316)' }[color]);
const objectiveColor = (label: string): MetricCard['color'] => {
  const lower = label.toLowerCase();
  if (lower.includes('crm') || lower.includes('won')) return 'green';
  if (lower.includes('mens')) return 'teal';
  if (lower.includes('lead') || lower.includes('site')) return 'red';
  if (lower.includes('perfil') || lower.includes('seguidor')) return 'blue';
  return 'yellow';
};
const delta = (cur: number, prev: number, invert = false) => {
  if (!prev) return { label: '-', cls: 'neutral' as const };
  const value = ((cur - prev) / prev) * 100;
  const good = invert ? value < 0 : value > 0;
  return { label: `${value > 0 ? '+' : ''}${value.toFixed(1)}%`, cls: good ? 'pos' : value === 0 ? 'neutral' : 'neg' as const };
};
const formatMetric = (value: number, format: MetricCard['format']) => (format === 'currency' ? brl(value) : format === 'percent' ? pct(value) : format === 'decimal' ? value.toFixed(2) : nInt(value));

const SectionTitle: React.FC<{ label: string }> = ({ label }) => (
  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#4d5a6e', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
    {label}
    <span style={{ flex: 1, height: 1, background: '#1e2733', display: 'block' }} />
  </div>
);

const MetricGrid: React.FC<{ items: MetricCard[]; hasPrevious: boolean }> = ({ items, hasPrevious }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
    {items.map((item) => {
      const d = delta(item.current, item.previous, item.invert);
      return (
        <div key={item.label} style={{ background: '#0d1117', border: '1px solid #1e2733', borderRadius: 14, padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: accent(item.color) }} />
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#4d5a6e', marginBottom: 8 }}>{item.label}</div>
          <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, letterSpacing: -0.5, color: '#e8edf5', marginBottom: 6 }}>{formatMetric(item.current, item.format)}</div>
          {hasPrevious && d.label !== '-' && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 6, background: d.cls === 'pos' ? 'rgba(34,197,94,0.12)' : d.cls === 'neg' ? 'rgba(239,68,68,0.12)' : 'rgba(138,149,168,0.12)', color: d.cls === 'pos' ? '#22c55e' : d.cls === 'neg' ? '#ef4444' : '#8a95a8' }}>{d.cls === 'pos' ? '\u25b2' : d.cls === 'neg' ? '\u25bc' : '\u2014'} {d.label}</div>}
          {hasPrevious && item.previous > 0 && <div style={{ fontSize: 10, color: '#4d5a6e', marginTop: 4, fontFamily: 'monospace' }}>vs {formatMetric(item.previous, item.format)}</div>}
        </div>
      );
    })}
  </div>
);

export const PublicTrafficReport: React.FC<PublicTrafficReportProps> = ({ publicId }) => {
  const [report, setReport] = useState<TrafficReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const anonKey = getSupabaseAnonKey();
    const baseUrl = getSupabaseUrl();
    if (!anonKey || !baseUrl) {
      setError('Supabase nao configurado.');
      setLoading(false);
      return;
    }
    const url = `${baseUrl}/rest/v1/traffic_reports?public_id=eq.${encodeURIComponent(publicId)}&select=*&limit=1`;
    fetch(url, { headers: { apikey: anonKey, authorization: `Bearer ${anonKey}`, accept: 'application/json' } })
      .then((r) => r.json())
      .then((json: any) => {
        const rows = Array.isArray(json) ? json : [];
        if (!rows.length) setError('Relatorio nao encontrado.');
        else setReport(rows[0] as TrafficReport);
      })
      .catch(() => setError('Erro ao carregar relatorio.'))
      .finally(() => setLoading(false));
  }, [publicId]);

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#06080d', color: '#4d5a6e', fontFamily: 'DM Sans, system-ui, sans-serif' }}>Carregando relatorio...</div>;
  }
  if (error || !report) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#06080d', color: '#e8edf5', fontFamily: 'DM Sans, system-ui, sans-serif' }}>{error ?? 'Relatorio nao encontrado.'}</div>;
  }

  const d = report.report_data;
  const isLayered = (d.schemaVersion ?? 1) >= 2 && Boolean(d.currentLayers);
  const currentMedia = d.currentLayers?.media ?? d.current ?? EMPTY_MEDIA;
  const previousMedia = d.previousLayers?.media ?? d.previous ?? null;
  const currentPlatform = d.currentLayers?.platform ?? { ...EMPTY_PLATFORM, profileVisits: d.current?.profileVisits ?? 0, followers: d.current?.followers ?? 0, businessLeads: d.current?.results ?? 0 };
  const previousPlatform = d.previousLayers?.platform ?? (d.previous ? { ...EMPTY_PLATFORM, profileVisits: d.previous.profileVisits ?? 0, followers: d.previous.followers ?? 0, businessLeads: d.previous.results ?? 0 } : null);
  const currentBusiness = d.currentLayers?.business ?? { ...EMPTY_BUSINESS, leadSignals: d.current?.results ?? 0 };
  const previousBusiness = d.previousLayers?.business ?? (d.previous ? { ...EMPTY_BUSINESS, leadSignals: d.previous.results ?? 0 } : null);
  const campaigns = d.campaigns ?? [];
  const topAds = d.topAds ?? [];
  const timeseries = d.timeseries ?? [];
  const hasPrevious = Boolean(d.periodPrevious);
  const hasVideo = topAds.some((ad) => ad.hookRate > 0);
  const levelLabel = d.level === 'campaign' ? 'Campanha' : d.level === 'adset' ? 'Conjunto' : 'Anuncio';
  const agencyInitials = (d.agencyName || 'CR').substring(0, 2).toUpperCase();

  const activeObjectives = (() => {
    if (Array.isArray(d.activeObjectives) && d.activeObjectives.length) return d.activeObjectives;
    const fallback: ObjectiveMetric[] = [];
    if (currentPlatform.profileVisits > 0) fallback.push({ key: 'profileVisits', label: 'Visitas ao perfil', current: currentPlatform.profileVisits, previous: previousPlatform?.profileVisits ?? 0, layer: 'platform' });
    if (currentPlatform.followers > 0) fallback.push({ key: 'followers', label: 'Seguidores', current: currentPlatform.followers, previous: previousPlatform?.followers ?? 0, layer: 'platform' });
    if (currentBusiness.leadSignals > 0) fallback.push({ key: 'leadSignals', label: 'Leads de negocio', current: currentBusiness.leadSignals, previous: previousBusiness?.leadSignals ?? 0, layer: 'business' });
    return fallback;
  })();

  const mediaCards: MetricCard[] = [
    { label: 'Investimento', current: currentMedia.invest, previous: previousMedia?.invest ?? 0, format: 'currency', invert: true, color: 'blue' },
    { label: 'Impressoes', current: currentMedia.impressions, previous: previousMedia?.impressions ?? 0, format: 'integer', color: 'yellow' },
    { label: 'Alcance', current: currentMedia.reach, previous: previousMedia?.reach ?? 0, format: 'integer', color: 'green' },
    { label: 'Cliques no link', current: currentMedia.linkClicks, previous: previousMedia?.linkClicks ?? 0, format: 'integer', color: 'teal' },
    { label: 'CTR', current: currentMedia.ctr, previous: previousMedia?.ctr ?? 0, format: 'percent', color: 'green' },
    { label: 'CPC', current: currentMedia.cpc, previous: previousMedia?.cpc ?? 0, format: 'currency', invert: true, color: 'teal' },
    { label: 'CPM', current: currentMedia.cpm, previous: previousMedia?.cpm ?? 0, format: 'currency', invert: true, color: 'purple' },
    { label: 'Frequencia', current: currentMedia.frequency, previous: previousMedia?.frequency ?? 0, format: 'decimal', invert: true, color: 'yellow' },
  ];

  const platformCards: MetricCard[] = activeObjectives.filter((item) => item.layer === 'platform').map((item) => ({ label: item.label, current: item.current, previous: item.previous, format: 'integer', color: objectiveColor(item.label) }));
  const businessCards = [
    { label: 'Leads de negocio', current: currentBusiness.leadSignals, previous: previousBusiness?.leadSignals ?? 0, format: 'integer', color: 'red' },
    { label: 'Leads no CRM', current: currentBusiness.crmLeads, previous: previousBusiness?.crmLeads ?? 0, format: 'integer', color: 'green' },
    { label: 'Ganhos', current: currentBusiness.won, previous: previousBusiness?.won ?? 0, format: 'integer', color: 'green' },
    { label: 'Receita', current: currentBusiness.revenue, previous: previousBusiness?.revenue ?? 0, format: 'currency', color: 'purple' },
    { label: 'Follow-up pendente', current: currentBusiness.pendingFollowup, previous: previousBusiness?.pendingFollowup ?? 0, format: 'integer', invert: true, color: 'yellow' },
  ] satisfies MetricCard[];
  const filteredBusinessCards: MetricCard[] = businessCards.filter((item) => item.current > 0 || item.previous > 0 || item.label === 'Leads de negocio');

  const comparisonRows: MetricCard[] = [
    { label: 'Investimento', current: currentMedia.invest, previous: previousMedia?.invest ?? 0, format: 'currency', invert: true, color: 'blue' },
    { label: 'Impressoes', current: currentMedia.impressions, previous: previousMedia?.impressions ?? 0, format: 'integer', color: 'yellow' },
    { label: 'Alcance', current: currentMedia.reach, previous: previousMedia?.reach ?? 0, format: 'integer', color: 'green' },
    { label: 'Cliques no link', current: currentMedia.linkClicks, previous: previousMedia?.linkClicks ?? 0, format: 'integer', color: 'teal' },
    { label: 'Leads de negocio', current: currentBusiness.leadSignals, previous: previousBusiness?.leadSignals ?? 0, format: 'integer', color: 'red' },
    { label: 'Leads no CRM', current: currentBusiness.crmLeads, previous: previousBusiness?.crmLeads ?? 0, format: 'integer', color: 'green' },
    { label: 'Receita', current: currentBusiness.revenue, previous: previousBusiness?.revenue ?? 0, format: 'currency', color: 'purple' },
  ];

  return (
    <div style={{ background: '#06080d', color: '#e8edf5', minHeight: '100vh', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');*{box-sizing:border-box}@media print{.no-print{display:none!important}.page-break{page-break-before:always}body{background:#fff!important;color:#000!important}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`}</style>
      <div className="no-print" style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0d1117', borderBottom: '1px solid #1e2733', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ width: 28, height: 28, background: 'linear-gradient(135deg,#3b82f6,#6366f1)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11 }}>{agencyInitials}</div><span style={{ fontSize: 13, fontWeight: 600, color: '#8a95a8' }}>Relatorio de Trafego</span></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={copyLink} style={{ padding: '8px 14px', borderRadius: 8, background: 'transparent', border: '1px solid #253040', color: copied ? '#22c55e' : '#8a95a8', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{copied ? 'Copiado!' : 'Copiar link'}</button>
          <button onClick={() => window.print()} style={{ padding: '8px 14px', borderRadius: 8, background: '#3b82f6', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Baixar PDF</button>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 60px' }}>
        <div style={{ position: 'relative', padding: '48px 0 36px', borderBottom: '1px solid #1e2733', marginBottom: 40 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, background: 'linear-gradient(135deg,#3b82f6,#6366f1)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16 }}>{agencyInitials}</div>
              <div><div style={{ fontSize: 14, fontWeight: 600, color: '#8a95a8', marginBottom: 3 }}>{d.agencyName}</div><div style={{ fontSize: 11, color: '#4d5a6e', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{isLayered ? 'Relatorio de Midia + Negocio' : 'Relatorio de Performance'}</div></div>
            </div>
            <div style={{ fontSize: 11, color: '#4d5a6e', fontFamily: 'DM Mono, monospace' }}>Gerado em: {fmtLongDate(report.created_at?.slice(0, 10) ?? d.periodCurrent.end)}</div>
          </div>
          <div style={{ marginTop: 24, fontSize: 38, fontWeight: 800, lineHeight: 1.1, letterSpacing: -1 }}>{d.clientName}</div>
          <div style={{ marginTop: 10, fontSize: 15, color: '#8a95a8' }}><strong style={{ color: '#e8edf5' }}>{fmtDate(d.periodCurrent.start)} a {fmtDate(d.periodCurrent.end)}</strong>{d.periodPrevious ? `  |  Comparado com ${fmtDate(d.periodPrevious.start)} a ${fmtDate(d.periodPrevious.end)}` : ''}</div>
        </div>

        <div className="no-print" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 36 }}>
          <button onClick={() => window.print()} style={{ padding: '10px 18px', borderRadius: 10, background: '#3b82f6', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Baixar PDF</button>
          <button onClick={copyLink} style={{ padding: '10px 18px', borderRadius: 10, background: 'transparent', border: '1px solid #253040', color: '#8a95a8', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{copied ? 'Link copiado!' : 'Copiar Link para WhatsApp'}</button>
        </div>

        <SectionTitle label="Midia universal" />
        <MetricGrid items={mediaCards} hasPrevious={hasPrevious} />

        {platformCards.length > 0 && <><div style={{ height: 40 }} /><SectionTitle label="Objetivos ativos na semana" /><MetricGrid items={platformCards} hasPrevious={hasPrevious} /></>}
        {filteredBusinessCards.length > 0 && <><div style={{ height: 40 }} /><SectionTitle label="Resultados de negocio" /><MetricGrid items={filteredBusinessCards} hasPrevious={hasPrevious} /></>}

        {currentMedia.impressions > 0 && (
          <div style={{ marginTop: 40, marginBottom: 40 }}>
            <SectionTitle label="Jornada da semana" />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[{ label: 'Investimento', val: brl(currentMedia.invest), sub: 'base', hi: false }, { label: 'Impressoes', val: nInt(currentMedia.impressions), sub: currentMedia.invest > 0 ? `${((currentMedia.impressions / currentMedia.invest) * 100).toFixed(0)}/R$` : '', hi: false }, { label: 'Alcance', val: nInt(currentMedia.reach), sub: currentMedia.impressions > 0 ? `${((currentMedia.reach / currentMedia.impressions) * 100).toFixed(1)}% imp.` : '', hi: false }, { label: 'Cliques', val: nInt(currentMedia.clicks), sub: currentMedia.reach > 0 ? `${((currentMedia.clicks / currentMedia.reach) * 100).toFixed(2)}% alc.` : '', hi: false }, { label: 'Cliques no link', val: nInt(currentMedia.linkClicks), sub: currentMedia.clicks > 0 ? `${((currentMedia.linkClicks / currentMedia.clicks) * 100).toFixed(1)}% cliques` : '', hi: false }, ...(currentBusiness.leadSignals > 0 ? [{ label: 'Leads de negocio', val: nInt(currentBusiness.leadSignals), sub: 'Mensagens + lead forms + site + CRM', hi: true }] : [])].map((step, i, arr) => <React.Fragment key={step.label}><div style={{ flex: 1, minWidth: 90, background: step.hi ? 'rgba(34,197,94,0.06)' : '#0d1117', border: `1px solid ${step.hi ? 'rgba(34,197,94,0.3)' : '#1e2733'}`, borderRadius: 12, padding: '14px 16px' }}><div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: step.hi ? '#22c55e' : '#4d5a6e', marginBottom: 6 }}>{step.label}</div><div style={{ fontSize: 20, fontWeight: 800, color: step.hi ? '#22c55e' : '#e8edf5', lineHeight: 1 }}>{step.val}</div>{step.sub && <div style={{ fontSize: 10, color: '#4d5a6e', marginTop: 3, fontFamily: 'monospace' }}>{step.sub}</div>}</div>{i < arr.length - 1 && <div style={{ display: 'flex', alignItems: 'center', color: '#4d5a6e', paddingTop: 22 }}>{'>'}</div>}</React.Fragment>)}
            </div>
          </div>
        )}

        {hasPrevious && (
          <div style={{ marginBottom: 40 }}>
            <SectionTitle label="Comparativo de periodo" />
            <div style={{ background: '#0d1117', border: '1px solid #1e2733', borderRadius: 14, padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #1e2733' }}>
                <div style={{ width: 160, fontSize: 10, fontWeight: 700, color: '#4d5a6e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Metrica</div>
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                  <div style={{ padding: '0 12px', fontSize: 10, fontWeight: 700, color: '#4d5a6e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Atual</div>
                  <div style={{ padding: '0 12px', fontSize: 10, fontWeight: 700, color: '#4d5a6e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Anterior</div>
                </div>
                <div style={{ width: 80, textAlign: 'right', fontSize: 10, fontWeight: 700, color: '#4d5a6e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Variacao</div>
              </div>
              {comparisonRows.map((row) => { const dlt = delta(row.current, row.previous, row.invert); return <div key={row.label} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}><div style={{ width: 160, fontSize: 10, fontWeight: 700, color: '#4d5a6e', textTransform: 'uppercase' }}>{row.label}</div><div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr' }}><div style={{ padding: '8px 12px', fontSize: 13, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: '#e8edf5', borderLeft: '2px solid #3b82f6' }}>{formatMetric(row.current, row.format)}</div><div style={{ padding: '8px 12px', fontSize: 13, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: '#8a95a8', borderLeft: '2px solid #1e2733' }}>{formatMetric(row.previous, row.format)}</div></div><div style={{ width: 80, textAlign: 'right', fontSize: 12, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: dlt.cls === 'pos' ? '#22c55e' : dlt.cls === 'neg' ? '#ef4444' : '#8a95a8' }}>{dlt.label}</div></div>; })}
            </div>
          </div>
        )}

        {topAds.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <SectionTitle label="Melhores criativos - IDC" />
            {(() => {
              const grouped = new Map<string, TopAd[]>();
              for (const ad of topAds) {
                const key = ad.campaign || 'Sem campanha';
                if (!grouped.has(key)) grouped.set(key, []);
                grouped.get(key)!.push(ad);
              }
              return Array.from(grouped.entries()).map(([campaignName, ads]) => {
                const champion = ads[0];
                const runners = ads.slice(1);
                const champColor = IDC_COLORS[champion.idcClass] ?? '#8a95a8';
                const hasThumb = (ad: TopAd) => ad.thumbnailUrl && !ad.thumbnailUrl.startsWith('data:') && ad.thumbnailUrl.startsWith('http');
                return (
                  <div key={campaignName} style={{ marginBottom: 28 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#c5d0de', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{campaignName}</span>
                      <span style={{ flex: 1, height: 1, background: '#1e2733', display: 'block', minWidth: 20 }} />
                    </div>
                    <div style={{ background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 14, padding: '18px 20px', marginBottom: 8, display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <div style={{ width: 80, height: 80, background: '#141921', borderRadius: 10, border: '2px solid rgba(245,158,11,0.3)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>{hasThumb(champion) ? <img src={champion.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : 'AD'}</div>
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                          <span style={{ padding: '3px 8px', borderRadius: 6, background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', fontSize: 9, fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Anuncio campeao</span>
                          <span style={{ padding: '3px 8px', borderRadius: 6, background: `${champColor}18`, border: `1px solid ${champColor}44`, fontSize: 10, fontWeight: 700, color: champColor, fontFamily: 'DM Mono, monospace' }}>IDC {champion.idc}</span>
                        </div>
                        <div style={{ fontWeight: 700, color: '#e8edf5', fontSize: 14, marginBottom: 4, lineHeight: 1.3 }}>{champion.name}</div>
                        <div style={{ fontSize: 12, color: '#8a95a8', marginBottom: 10 }}>{brl(champion.spend)} &bull; <span style={{ color: '#22c55e', fontWeight: 700 }}>{champion.results} {champion.resultLabel}</span> &bull; Custo/res: {champion.results > 0 ? brl(champion.spend / champion.results) : '-'}</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{[{ label: 'CTR', value: pct(champion.ctr, 1) }, { label: 'CPC', value: brl(champion.cpc) }, ...(champion.frequency > 0 ? [{ label: 'Freq.', value: champion.frequency.toFixed(2) }] : []), ...(champion.hookRate > 0 ? [{ label: 'Hook', value: pct(champion.hookRate * 100, 1) }] : []), ...(champion.holdRate > 0 ? [{ label: 'Hold', value: pct(champion.holdRate * 100, 1) }] : [])].map((item) => <div key={item.label} style={{ padding: '4px 10px', background: '#141921', border: '1px solid #1e2733', borderRadius: 6 }}><span style={{ fontSize: 9, color: '#4d5a6e', fontWeight: 700, textTransform: 'uppercase', marginRight: 4 }}>{item.label}</span><span style={{ fontSize: 12, color: '#e8edf5', fontWeight: 700, fontFamily: 'DM Mono, monospace' }}>{item.value}</span></div>)}</div>
                      </div>
                    </div>
                    {runners.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: `repeat(${runners.length}, 1fr)`, gap: 8 }}>{runners.map((ad, index) => { const color = IDC_COLORS[ad.idcClass] ?? '#8a95a8'; return <div key={ad.id} style={{ background: '#0d1117', border: '1px solid #1e2733', borderRadius: 12, padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'flex-start' }}><div style={{ width: 52, height: 52, background: '#141921', borderRadius: 8, border: '1px solid #1e2733', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{hasThumb(ad) ? <img src={ad.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : 'AD'}</div><div style={{ flex: 1, minWidth: 0 }}><div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}><span style={{ width: 18, height: 18, borderRadius: 5, background: '#141921', border: '1px solid #253040', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#8a95a8', flexShrink: 0 }}>{index + 2}</span><span style={{ fontSize: 9, fontWeight: 700, color, fontFamily: 'DM Mono, monospace' }}>IDC {ad.idc}</span></div><div style={{ fontWeight: 600, color: '#c5d0de', fontSize: 12, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ad.name}</div><div style={{ fontSize: 11, color: '#8a95a8' }}>{brl(ad.spend)} &bull; <span style={{ color: '#22c55e' }}>{ad.results} {ad.resultLabel}</span></div><div style={{ fontSize: 10, color: '#4d5a6e', marginTop: 3 }}>CTR {pct(ad.ctr, 1)} &bull; CPC {brl(ad.cpc)}{ad.hookRate > 0 ? ` - Hook ${pct(ad.hookRate * 100, 1)}` : ''}</div></div></div>; })}</div>}
                  </div>
                );
              });
            })()}
          </div>
        )}

        {campaigns.length > 0 && (
          <div className="page-break" style={{ marginBottom: 40 }}>
            <SectionTitle label={`Detalhamento por ${levelLabel}`} />
            <div style={{ background: '#0d1117', border: '1px solid #1e2733', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: '#141921' }}>{['Nome', 'Status', 'Gasto', 'Alcance', 'Resultado nativo', 'Custo/Res', 'CTR', 'CPM', 'Freq.', ...(hasVideo ? ['Hook', 'Hold'] : []), 'IDC'].map((h) => <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#4d5a6e', borderBottom: '1px solid #1e2733', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {campaigns.map((camp, i) => {
                      const idcColor = IDC_COLORS[camp.classification === 'otimo' ? 'great' : camp.classification === 'bom' ? 'good' : camp.classification === 'regular' ? 'ok' : 'bad'] ?? '#4d5a6e';
                      return <tr key={i} style={{ borderBottom: '1px solid #1e2733' }}><td style={{ padding: '13px 14px', maxWidth: 200 }}><div style={{ fontWeight: 600, color: '#e8edf5', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{camp.name}</div></td><td style={{ padding: '13px 14px' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: camp.status === 'active' ? 'rgba(34,197,94,0.12)' : 'rgba(138,149,168,0.12)', color: camp.status === 'active' ? '#22c55e' : '#8a95a8' }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />{camp.status === 'active' ? 'Ativo' : 'Pausado'}</span></td><td style={{ padding: '13px 14px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#8a95a8', whiteSpace: 'nowrap' }}>{brl(camp.spend)}</td><td style={{ padding: '13px 14px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#8a95a8', whiteSpace: 'nowrap' }}>{nInt(camp.reach)}</td><td style={{ padding: '13px 14px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#8a95a8' }}><div>{camp.results}</div><div style={{ fontSize: 10, color: '#4d5a6e' }}>{camp.resultLabel}</div></td><td style={{ padding: '13px 14px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#8a95a8', whiteSpace: 'nowrap' }}>{camp.costPerResult > 0 ? brl(camp.costPerResult) : '-'}</td><td style={{ padding: '13px 14px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: camp.ctr >= 5 ? '#22c55e' : '#8a95a8', whiteSpace: 'nowrap' }}>{pct(camp.ctr)}</td><td style={{ padding: '13px 14px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#8a95a8', whiteSpace: 'nowrap' }}>{brl(camp.cpm)}</td><td style={{ padding: '13px 14px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: camp.frequency > 3 ? '#f59e0b' : '#8a95a8', whiteSpace: 'nowrap' }}>{camp.frequency > 0 ? camp.frequency.toFixed(2) : '-'}</td>{hasVideo && <td style={{ padding: '13px 14px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: camp.hookRate != null && camp.hookRate * 100 >= 20 ? '#22c55e' : '#8a95a8', whiteSpace: 'nowrap' }}>{camp.hookRate != null ? pct(camp.hookRate * 100) : '-'}</td>}{hasVideo && <td style={{ padding: '13px 14px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: camp.holdRate != null && camp.holdRate * 100 >= 8 ? '#22c55e' : '#8a95a8', whiteSpace: 'nowrap' }}>{camp.holdRate != null ? pct(camp.holdRate * 100) : '-'}</td>}<td style={{ padding: '13px 14px' }}>{camp.idc != null ? <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 40, height: 5, background: '#141921', borderRadius: 3, overflow: 'hidden' }}><div style={{ height: '100%', width: `${Math.min(camp.idc, 100)}%`, background: idcColor, borderRadius: 3 }} /></div><span style={{ fontSize: 11, fontWeight: 800, color: idcColor, fontFamily: 'DM Mono, monospace' }}>{camp.idc}</span></div> : '-'}</td></tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {campaigns.length > 1 && campaigns.some((camp) => camp.spend > 0) && (
          <div style={{ marginBottom: 40 }}>
            <SectionTitle label="Distribuicao de investimento" />
            <div style={{ background: '#0d1117', border: '1px solid #1e2733', borderRadius: 14, padding: '20px 24px' }}>
              {(() => {
                const totalSpend = campaigns.reduce((sum, camp) => sum + camp.spend, 0);
                const sorted = [...campaigns].filter((camp) => camp.spend > 0).sort((a, b) => b.spend - a.spend);
                const colors = ['#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#f97316', '#f59e0b', '#14b8a6', '#22c55e'];
                return sorted.map((camp, i) => { const percentage = totalSpend > 0 ? (camp.spend / totalSpend) * 100 : 0; const color = colors[i % colors.length]; return <div key={`${camp.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} /><div style={{ fontSize: 11, color: '#8a95a8', minWidth: 160, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{camp.name}</div><div style={{ flex: 1, height: 18, background: '#141921', borderRadius: 4, overflow: 'hidden' }}><div style={{ height: '100%', width: `${percentage}%`, background: color, opacity: 0.85, borderRadius: 4 }} /></div><div style={{ fontSize: 12, fontWeight: 700, color, fontFamily: 'DM Mono, monospace', minWidth: 80, textAlign: 'right', flexShrink: 0 }}>{brl(camp.spend)} <span style={{ fontSize: 10, color: '#4d5a6e', fontWeight: 500 }}>({percentage.toFixed(1)}%)</span></div></div>; });
              })()}
            </div>
          </div>
        )}

        {(d.insights?.length > 0 || d.actionItems?.length > 0) && (
          <div style={{ marginBottom: 40 }}>
            <SectionTitle label="Analise e plano de acao - IA" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
              {d.insights?.length > 0 && <div style={{ background: '#0d1117', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 14, padding: '20px 24px' }}><div style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Insights</div><ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>{d.insights.map((item, i) => <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}><span style={{ width: 18, height: 18, borderRadius: 5, background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#3b82f6', flexShrink: 0, marginTop: 2 }}>{i + 1}</span><span style={{ fontSize: 13, color: '#c5d0de', lineHeight: 1.55 }}>{item}</span></li>)}</ul></div>}
              {d.actionItems?.length > 0 && <div style={{ background: '#0d1117', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 14, padding: '20px 24px' }}><div style={{ fontSize: 12, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Plano de acao</div><ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>{d.actionItems.map((item, i) => <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}><span style={{ width: 18, height: 18, borderRadius: 5, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#22c55e', flexShrink: 0, marginTop: 2 }}>{i + 1}</span><span style={{ fontSize: 13, color: '#c5d0de', lineHeight: 1.55 }}>{item}</span></li>)}</ul></div>}
            </div>
          </div>
        )}

        {timeseries.length > 1 && (
          <div style={{ marginBottom: 40 }}>
            <SectionTitle label="Evolucao diaria" />
            <div style={{ background: '#0d1117', border: '1px solid #1e2733', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px 8px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#e8edf5', marginBottom: 16 }}>Gasto diario e sinais de lead</div>
                {(() => { const maxSpend = Math.max(...timeseries.map((t) => t.metaSpend), 1); return timeseries.map((t, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}><div style={{ fontSize: 11, color: '#8a95a8', width: 50, flexShrink: 0 }}>{t.name}</div><div style={{ flex: 1, height: 22, background: '#141921', borderRadius: 5, overflow: 'hidden' }}><div style={{ height: '100%', width: `${(t.metaSpend / maxSpend) * 100}%`, background: 'linear-gradient(90deg,#3b82f6,#6366f1)', borderRadius: 5, display: 'flex', alignItems: 'center', padding: '0 8px', minWidth: 40 }}><span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{brl(t.metaSpend)}</span></div></div><div style={{ fontSize: 11, fontWeight: 700, color: t.metaLeads > 0 ? '#22c55e' : '#4d5a6e', width: 80, textAlign: 'right', fontFamily: 'DM Mono, monospace', flexShrink: 0 }}>{t.metaLeads > 0 ? `${t.metaLeads} sinais` : '-'}</div></div>); })()}
              </div>
              <div style={{ padding: '12px 24px 16px', borderTop: '1px solid #1e2733', display: 'flex', gap: 24 }}><div><div style={{ fontSize: 10, color: '#4d5a6e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Total gasto</div><div style={{ fontSize: 20, fontWeight: 800, color: '#3b82f6', fontFamily: 'DM Mono, monospace' }}>{brl(timeseries.reduce((s, t) => s + t.metaSpend, 0))}</div></div><div><div style={{ fontSize: 10, color: '#4d5a6e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Total sinais</div><div style={{ fontSize: 20, fontWeight: 800, color: '#22c55e', fontFamily: 'DM Mono, monospace' }}>{timeseries.reduce((s, t) => s + t.metaLeads, 0)}</div></div></div>
            </div>
          </div>
        )}

        <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid #1e2733' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: '#4d5a6e' }}>Relatorio gerado pelo <span style={{ color: '#3b82f6', fontWeight: 700 }}>{d.agencyName}</span> &bull; <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11 }}>CR8 Sistema Operacional de Trafego</span></div>
            <div style={{ fontSize: 11, color: '#4d5a6e', textAlign: 'right', fontFamily: 'DM Mono, monospace' }}>Periodo: {fmtDate(d.periodCurrent.start)} ate {fmtDate(d.periodCurrent.end)}</div>
          </div>
          <div style={{ fontSize: 11, color: '#4d5a6e', fontFamily: 'DM Mono, monospace' }}>Gerado em: {fmtLongDate(report.created_at?.slice(0, 10) ?? d.periodCurrent.end)}</div>
        </div>
      </div>
    </div>
  );
};
