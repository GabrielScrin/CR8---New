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

type ReportData = {
  clientName: string;
  agencyName: string;
  level: string;
  periodCurrent: { label: string; start: string; end: string };
  periodPrevious: { label: string; start: string; end: string } | null;
  current: PeriodSummary;
  previous: PeriodSummary | null;
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

// ─── Helpers ───────────────────────────────────────────────────────────────

const n2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nInt = (v: number) => Math.round(v).toLocaleString('pt-BR');
const brl = (v: number) => `R$\u00a0${n2(v)}`;
const pct = (v: number, d = 1) => `${v.toFixed(d)}%`;

const delta = (cur: number, prev: number, invert = false) => {
  if (!prev) return { label: '\u2014', cls: 'neutral' };
  const d = ((cur - prev) / prev) * 100;
  const positive = invert ? d < 0 : d > 0;
  const sign = d > 0 ? '+' : '';
  return { label: `${sign}${d.toFixed(1)}%`, cls: positive ? 'pos' : d === 0 ? 'neutral' : 'neg' };
};

const IDC_COLORS: Record<string, string> = {
  great: '#22c55e',
  good: '#f59e0b',
  ok: '#f97316',
  bad: '#ef4444',
};

const rankEmojis = ['1', '2', '3', '4', '5', '6', '7', '8'];

// ─── Component ─────────────────────────────────────────────────────────────

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
    fetch(url, {
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${anonKey}`,
        accept: 'application/json',
      },
    })
      .then((r) => r.json())
      .then((data: any) => {
        const rows = Array.isArray(data) ? data : [];
        if (rows.length === 0) setError('Relatorio nao encontrado.');
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

  // ── Loading ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#06080d', fontFamily: 'DM Sans, system-ui, sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 32, height: 32, border: '2px solid #1e2733', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ color: '#4d5a6e', fontSize: 13 }}>Carregando relatorio...</p>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#06080d', fontFamily: 'DM Sans, system-ui, sans-serif' }}>
        <div style={{ textAlign: 'center', maxWidth: 320 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>404</div>
          <h3 style={{ color: '#e8edf5', fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Relatorio nao encontrado</h3>
          <p style={{ color: '#4d5a6e', fontSize: 13 }}>{error ?? 'O link pode ter expirado ou ser invalido.'}</p>
        </div>
      </div>
    );
  }

  const d = report.report_data;
  const c = d.current;
  const p = d.previous;
  const timeseries = d.timeseries ?? [];
  const topAds = d.topAds ?? [];
  const campaigns = d.campaigns ?? [];
  const levelLabel = d.level === 'campaign' ? 'Campanha' : d.level === 'adset' ? 'Conjunto' : 'Anuncio';
  const hasVideo = topAds.some((a) => a.hookRate > 0);

  const agencyInitials = (d.agencyName || 'CR').substring(0, 2).toUpperCase();

  // ── KPI cards ──────────────────────────────────────────────────────────
  const kpis: { label: string; val: string; d: ReturnType<typeof delta>; prev: string; color: string }[] = [
    { label: 'Investimento', val: brl(c.invest), d: delta(c.invest, p?.invest ?? 0, true), prev: p ? brl(p.invest) : '', color: 'blue' },
    { label: 'Impressoes', val: nInt(c.impressions), d: delta(c.impressions, p?.impressions ?? 0), prev: p ? nInt(p.impressions) : '', color: 'yellow' },
    { label: 'Alcance', val: nInt(c.reach), d: delta(c.reach, p?.reach ?? 0), prev: p ? nInt(p.reach) : '', color: 'green' },
    { label: 'CTR', val: pct(c.ctr), d: delta(c.ctr, p?.ctr ?? 0), prev: p ? pct(p.ctr) : '', color: 'green' },
    { label: c.resultLabel, val: nInt(c.results), d: delta(c.results, p?.results ?? 0), prev: p ? nInt(p.results) : '', color: 'red' },
    { label: 'Custo/' + c.resultLabel, val: c.costPerResult ? brl(c.costPerResult) : '-', d: c.costPerResult && p?.costPerResult ? delta(c.costPerResult, p.costPerResult, true) : { label: '-', cls: 'neutral' }, prev: p?.costPerResult ? brl(p.costPerResult) : '', color: 'purple' },
    { label: 'CPC', val: brl(c.cpc), d: delta(c.cpc, p?.cpc ?? 0, true), prev: p ? brl(p.cpc) : '', color: 'teal' },
    { label: 'CPM', val: brl(c.cpm), d: delta(c.cpm, p?.cpm ?? 0, true), prev: p ? brl(p.cpm) : '', color: 'purple' },
    { label: 'Frequencia', val: c.frequency.toFixed(2), d: delta(c.frequency, p?.frequency ?? 0, true), prev: p ? p.frequency.toFixed(2) : '', color: 'yellow' },
  ];

  // ── Comparison rows ────────────────────────────────────────────────────
  const compRows: { label: string; cur: string; prev: string; d: ReturnType<typeof delta> }[] = p
    ? [
        { label: 'Investimento', cur: brl(c.invest), prev: brl(p.invest), d: delta(c.invest, p.invest, true) },
        { label: 'Impressoes', cur: nInt(c.impressions), prev: nInt(p.impressions), d: delta(c.impressions, p.impressions) },
        { label: 'Alcance', cur: nInt(c.reach), prev: nInt(p.reach), d: delta(c.reach, p.reach) },
        { label: 'Cliques no Link', cur: nInt(c.linkClicks), prev: nInt(p.linkClicks), d: delta(c.linkClicks, p.linkClicks) },
        { label: 'CTR', cur: pct(c.ctr), prev: pct(p.ctr), d: delta(c.ctr, p.ctr) },
        { label: 'CPC', cur: brl(c.cpc), prev: brl(p.cpc), d: delta(c.cpc, p.cpc, true) },
        { label: 'CPM', cur: brl(c.cpm), prev: brl(p.cpm), d: delta(c.cpm, p.cpm, true) },
        { label: 'Frequencia', cur: c.frequency.toFixed(2), prev: p.frequency.toFixed(2), d: delta(c.frequency, p.frequency, true) },
        { label: c.resultLabel, cur: nInt(c.results), prev: nInt(p.results), d: delta(c.results, p.results) },
      ]
    : [];

  return (
    <div style={{ background: '#06080d', color: '#e8edf5', minHeight: '100vh', fontFamily: "'DM Sans', system-ui, sans-serif", WebkitFontSmoothing: 'antialiased' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        @media print {
          .no-print { display: none !important; }
          .page-break { page-break-before: always; }
          body { background: #fff !important; color: #000 !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin { to{transform:rotate(360deg)} }
      `}</style>

      {/* ── Topbar (no-print) ─────────────────────────────────────────── */}
      <div className="no-print" style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0d1117', borderBottom: '1px solid #1e2733', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg,#3b82f6,#6366f1)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11, color: '#fff' }}>{agencyInitials}</div>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#8a95a8' }}>Relatorio de Trafego</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={copyLink} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, background: 'transparent', border: '1px solid #253040', color: copied ? '#22c55e' : '#8a95a8', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
            {copied ? 'Copiado!' : 'Copiar link'}
          </button>
          <button onClick={() => window.print()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, background: '#3b82f6', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Baixar PDF
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 60px' }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{ position: 'relative', padding: '48px 0 36px', borderBottom: '1px solid #1e2733', marginBottom: 40, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -60, left: -40, width: 400, height: 300, background: 'radial-gradient(ellipse,rgba(59,130,246,0.12) 0%,transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, background: 'linear-gradient(135deg,#3b82f6,#6366f1)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, color: '#fff' }}>{agencyInitials}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#8a95a8', lineHeight: 1, marginBottom: 3 }}>{d.agencyName}</div>
                <div style={{ fontSize: 11, color: '#4d5a6e', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Relatorio de Performance</div>
              </div>
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 20, fontSize: 11, fontWeight: 600, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              <span style={{ width: 6, height: 6, background: '#3b82f6', borderRadius: '50%', animation: 'pulse 2s infinite', display: 'inline-block' }} />
              Relatorio Semanal
            </div>
          </div>
          <div style={{ marginTop: 24, fontSize: 38, fontWeight: 800, lineHeight: 1.1, letterSpacing: -1, background: 'linear-gradient(135deg,#e8edf5 40%,#8a95a8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{d.clientName}</div>
          <div style={{ marginTop: 10, fontSize: 15, color: '#8a95a8', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <strong style={{ color: '#e8edf5' }}>{d.periodCurrent.label}</strong>
            {d.periodPrevious && (
              <>
                <span style={{ display: 'inline-block', width: 20, height: 1, background: '#253040', verticalAlign: 'middle' }} />
                Comparado com {d.periodPrevious.label}
              </>
            )}
          </div>
        </div>

        {/* ── Acoes (no-print) ──────────────────────────────────────────── */}
        <div className="no-print" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 36 }}>
          <button onClick={() => window.print()} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 10, background: '#3b82f6', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Baixar PDF
          </button>
          <button onClick={copyLink} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 10, background: 'transparent', border: '1px solid #253040', color: '#8a95a8', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            {copied ? 'Link copiado!' : 'Copiar Link para WhatsApp'}
          </button>
        </div>

        {/* ── KPIs ──────────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#4d5a6e', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            Metricas Gerais
            <span style={{ flex: 1, height: 1, background: '#1e2733', display: 'block' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
            {kpis.map((k) => (
              <div key={k.label} style={{ background: '#0d1117', border: '1px solid #1e2733', borderRadius: 14, padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: k.color === 'blue' ? 'linear-gradient(90deg,#3b82f6,#6366f1)' : k.color === 'green' ? 'linear-gradient(90deg,#22c55e,#14b8a6)' : k.color === 'red' ? 'linear-gradient(90deg,#ef4444,#f97316)' : k.color === 'purple' ? 'linear-gradient(90deg,#a855f7,#ec4899)' : k.color === 'teal' ? 'linear-gradient(90deg,#14b8a6,#22c55e)' : 'linear-gradient(90deg,#f59e0b,#f97316)' }} />
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#4d5a6e', marginBottom: 8 }}>{k.label}</div>
                <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, letterSpacing: -0.5, color: '#e8edf5', marginBottom: 6 }}>{k.val}</div>
                {p && k.d.label !== '-' && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 6, background: k.d.cls === 'pos' ? 'rgba(34,197,94,0.12)' : k.d.cls === 'neg' ? 'rgba(239,68,68,0.12)' : 'rgba(138,149,168,0.12)', color: k.d.cls === 'pos' ? '#22c55e' : k.d.cls === 'neg' ? '#ef4444' : '#8a95a8' }}>
                    {k.d.cls === 'pos' ? '\u25b2' : k.d.cls === 'neg' ? '\u25bc' : '\u2014'} {k.d.label}
                  </div>
                )}
                {p && k.prev && <div style={{ fontSize: 10, color: '#4d5a6e', marginTop: 4, fontFamily: 'monospace' }}>vs {k.prev}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* ── Funil ─────────────────────────────────────────────────────── */}
        {c.impressions > 0 && (
          <div style={{ marginBottom: 40 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#4d5a6e', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              Funil de conversao
              <span style={{ flex: 1, height: 1, background: '#1e2733', display: 'block' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { label: 'Investimento', val: brl(c.invest), sub: 'base' },
                { label: 'Impressoes', val: nInt(c.impressions), sub: c.invest > 0 ? `${((c.impressions / c.invest) * 100).toFixed(0)}/R$` : '' },
                { label: 'Alcance', val: nInt(c.reach), sub: c.impressions > 0 ? `${((c.reach / c.impressions) * 100).toFixed(1)}% imp.` : '' },
                { label: 'Cliques', val: nInt(c.clicks), sub: c.reach > 0 ? `${((c.clicks / c.reach) * 100).toFixed(2)}% alc.` : '' },
                { label: 'Link Clicks', val: nInt(c.linkClicks), sub: c.clicks > 0 ? `${((c.linkClicks / c.clicks) * 100).toFixed(1)}% cliques` : '' },
                ...(c.results > 0 ? [{ label: c.resultLabel, val: nInt(c.results), sub: c.linkClicks > 0 ? `${((c.results / c.linkClicks) * 100).toFixed(2)}% link` : '' }] : []),
              ].map((step, i, arr) => (
                <React.Fragment key={step.label}>
                  <div style={{ flex: 1, minWidth: 90, background: '#0d1117', border: '1px solid #1e2733', borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#4d5a6e', marginBottom: 6 }}>{step.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#e8edf5', letterSpacing: -0.5, lineHeight: 1 }}>{step.val}</div>
                    {step.sub && <div style={{ fontSize: 10, color: '#4d5a6e', marginTop: 3, fontFamily: 'monospace' }}>{step.sub}</div>}
                  </div>
                  {i < arr.length - 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', color: '#4d5a6e', fontSize: 16, paddingTop: 22, flexShrink: 0 }}>\u203a</div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {/* ── Comparativo de periodo ────────────────────────────────────── */}
        {compRows.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#4d5a6e', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              Comparativo de periodo
              <span style={{ flex: 1, height: 1, background: '#1e2733', display: 'block' }} />
            </div>
            <div style={{ background: '#0d1117', border: '1px solid #1e2733', borderRadius: 14, padding: '20px 24px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#e8edf5', marginBottom: 16 }}>
                {d.periodCurrent.label} vs {d.periodPrevious?.label}
              </div>
              {/* header */}
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #1e2733' }}>
                <div style={{ width: 120, flexShrink: 0 }} />
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                  <div style={{ padding: '0 12px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#3b82f6' }}>Atual</div>
                  <div style={{ padding: '0 12px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#4d5a6e' }}>Anterior</div>
                </div>
                <div style={{ width: 80 }} />
              </div>
              {compRows.map((r) => (
                <div key={r.label} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#4d5a6e', width: 120, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{r.label}</div>
                  <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                    <div style={{ padding: '8px 12px', fontSize: 13, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: '#e8edf5', borderLeft: '2px solid #3b82f6' }}>{r.cur}</div>
                    <div style={{ padding: '8px 12px', fontSize: 13, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: '#8a95a8', borderLeft: '2px solid #1e2733' }}>{r.prev}</div>
                  </div>
                  <div style={{ width: 80, textAlign: 'right', fontSize: 12, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: r.d.cls === 'pos' ? '#22c55e' : r.d.cls === 'neg' ? '#ef4444' : '#8a95a8' }}>{r.d.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Melhores Criativos ────────────────────────────────────────── */}
        {topAds.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#4d5a6e', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              Melhores Criativos — IDC
              <span style={{ flex: 1, height: 1, background: '#1e2733', display: 'block' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topAds.map((ad, i) => {
                const idcColor = IDC_COLORS[ad.idcClass] ?? '#8a95a8';
                const hookPct = Math.round(ad.hookRate * 100);
                const holdPct = Math.round(ad.holdRate * 100);
                return (
                  <div key={ad.id} style={{ background: '#0d1117', border: '1px solid #1e2733', borderRadius: 14, padding: '18px 20px', display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', transition: 'border-color 0.2s' }}>
                    {/* Rank */}
                    <div style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0, background: i === 0 ? 'linear-gradient(135deg,#f59e0b,#d97706)' : i === 1 ? 'linear-gradient(135deg,#94a3b8,#64748b)' : i === 2 ? 'linear-gradient(135deg,#c2855f,#a05a3a)' : '#141921', color: i < 3 ? '#fff' : '#8a95a8', border: i >= 3 ? '1px solid #253040' : 'none' }}>
                      {rankEmojis[i] ?? i + 1}
                    </div>
                    {/* Thumb */}
                    <div style={{ width: 44, height: 44, background: '#141921', borderRadius: 8, border: '1px solid #1e2733', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                      {ad.thumbnailUrl && !ad.thumbnailUrl.startsWith('data:') ? (
                        <img src={ad.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : '\ud83c\udfa5'}
                    </div>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontWeight: 700, color: '#e8edf5', fontSize: 13, marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 300 }}>{ad.name}</div>
                      <div style={{ fontSize: 11, color: '#4d5a6e', marginBottom: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 300 }}>{ad.campaign} &bull; {brl(ad.spend)} &bull; {ad.results} {ad.resultLabel}</div>
                      {hasVideo && (
                        <div style={{ display: 'flex', gap: 16 }}>
                          {[
                            { label: 'HOOK', pct: hookPct, maxScale: 50, gradient: 'linear-gradient(90deg,#3b82f6,#a855f7)' },
                            { label: 'HOLD', pct: holdPct, maxScale: 25, gradient: 'linear-gradient(90deg,#14b8a6,#22c55e)' },
                          ].map((m) => (
                            <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 9, fontWeight: 700, color: '#4d5a6e', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{m.label}</span>
                              <div style={{ width: 60, height: 6, background: '#141921', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${Math.min(100, (m.pct / m.maxScale) * 100)}%`, background: m.gradient, borderRadius: 3 }} />
                              </div>
                              <span style={{ fontSize: 11, fontWeight: 700, color: m.pct >= (m.label === 'HOOK' ? 20 : 8) ? '#22c55e' : m.pct >= (m.label === 'HOOK' ? 10 : 4) ? '#f59e0b' : '#ef4444', fontFamily: 'DM Mono, monospace' }}>{m.pct}%</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* IDC + metricas */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>
                      <div style={{ width: 48, height: 48, borderRadius: '50%', border: `2px solid ${idcColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', background: `${idcColor}18` }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: idcColor, fontFamily: 'DM Mono, monospace', lineHeight: 1 }}>{ad.idc}</span>
                        <span style={{ fontSize: 8, color: idcColor, fontWeight: 600, textTransform: 'uppercase' }}>IDC</span>
                      </div>
                      {[
                        { label: 'CTR', val: pct(ad.ctr, 1) },
                        { label: 'CPC', val: brl(ad.cpc) },
                        { label: 'CPM', val: brl(ad.cpm) },
                      ].map((m) => (
                        <div key={m.label} style={{ textAlign: 'center', padding: '6px 10px', background: '#141921', border: '1px solid #1e2733', borderRadius: 8, minWidth: 52 }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: '#4d5a6e', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{m.label}</div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: '#e8edf5', fontFamily: 'DM Mono, monospace', lineHeight: 1 }}>{m.val}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Tabela de campanhas ───────────────────────────────────────── */}
        {campaigns.length > 0 && (
          <div className="page-break" style={{ marginBottom: 40 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#4d5a6e', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              Detalhamento por {levelLabel}
              <span style={{ flex: 1, height: 1, background: '#1e2733', display: 'block' }} />
            </div>
            <div style={{ background: '#0d1117', border: '1px solid #1e2733', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#141921' }}>
                      {['Nome', 'Status', 'Gasto', 'Alcance', c.resultLabel, 'Custo/Res', 'CTR', 'CPM', ...(hasVideo ? ['Hook', 'Hold'] : []), 'IDC'].map((h) => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#4d5a6e', borderBottom: '1px solid #1e2733', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((camp, i) => {
                      const idcColor = IDC_COLORS[camp.classification === 'otimo' ? 'great' : camp.classification === 'bom' ? 'good' : camp.classification === 'regular' ? 'ok' : 'bad'] ?? '#4d5a6e';
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid #1e2733' }}>
                          <td style={{ padding: '13px 14px', maxWidth: 200 }}>
                            <div style={{ fontWeight: 600, color: '#e8edf5', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{camp.name}</div>
                          </td>
                          <td style={{ padding: '13px 14px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: camp.status === 'active' ? 'rgba(34,197,94,0.12)' : 'rgba(138,149,168,0.12)', color: camp.status === 'active' ? '#22c55e' : '#8a95a8' }}>
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                              {camp.status === 'active' ? 'Ativo' : 'Pausado'}
                            </span>
                          </td>
                          <td style={{ padding: '13px 14px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#8a95a8', whiteSpace: 'nowrap' }}>{brl(camp.spend)}</td>
                          <td style={{ padding: '13px 14px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#8a95a8', whiteSpace: 'nowrap' }}>{nInt(camp.reach)}</td>
                          <td style={{ padding: '13px 14px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#8a95a8' }}>
                            <div>{camp.results}</div>
                            <div style={{ fontSize: 10, color: '#4d5a6e' }}>{camp.resultLabel}</div>
                          </td>
                          <td style={{ padding: '13px 14px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#8a95a8', whiteSpace: 'nowrap' }}>{camp.costPerResult > 0 ? brl(camp.costPerResult) : '-'}</td>
                          <td style={{ padding: '13px 14px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: camp.ctr >= 5 ? '#22c55e' : '#8a95a8', whiteSpace: 'nowrap' }}>{pct(camp.ctr)}</td>
                          <td style={{ padding: '13px 14px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#8a95a8', whiteSpace: 'nowrap' }}>{brl(camp.cpm)}</td>
                          {hasVideo && <td style={{ padding: '13px 14px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: camp.hookRate != null && camp.hookRate * 100 >= 20 ? '#22c55e' : '#8a95a8', whiteSpace: 'nowrap' }}>{camp.hookRate != null ? pct(camp.hookRate * 100) : '-'}</td>}
                          {hasVideo && <td style={{ padding: '13px 14px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: camp.holdRate != null && camp.holdRate * 100 >= 8 ? '#22c55e' : '#8a95a8', whiteSpace: 'nowrap' }}>{camp.holdRate != null ? pct(camp.holdRate * 100) : '-'}</td>}
                          <td style={{ padding: '13px 14px' }}>
                            {camp.idc != null ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ width: 40, height: 5, background: '#141921', borderRadius: 3, overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${Math.min(camp.idc, 100)}%`, background: idcColor, borderRadius: 3 }} />
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 800, color: idcColor, fontFamily: 'DM Mono, monospace' }}>{camp.idc}</span>
                              </div>
                            ) : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── Timeseries ────────────────────────────────────────────────── */}
        {timeseries.length > 1 && (
          <div style={{ marginBottom: 40 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#4d5a6e', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              Evolucao Diaria
              <span style={{ flex: 1, height: 1, background: '#1e2733', display: 'block' }} />
            </div>
            <div style={{ background: '#0d1117', border: '1px solid #1e2733', borderRadius: 14, overflow: 'hidden' }}>
              {/* Bar chart for spend */}
              <div style={{ padding: '20px 24px 8px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#e8edf5', marginBottom: 16 }}>Gasto diario</div>
                {(() => {
                  const maxSpend = Math.max(...timeseries.map((t) => t.metaSpend), 1);
                  return timeseries.map((t, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                      <div style={{ fontSize: 11, color: '#8a95a8', width: 50, flexShrink: 0, whiteSpace: 'nowrap' }}>{t.name}</div>
                      <div style={{ flex: 1, height: 22, background: '#141921', borderRadius: 5, overflow: 'hidden', position: 'relative' }}>
                        <div style={{ height: '100%', width: `${(t.metaSpend / maxSpend) * 100}%`, background: 'linear-gradient(90deg,#3b82f6,#6366f1)', borderRadius: 5, display: 'flex', alignItems: 'center', padding: '0 8px', minWidth: 40 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{brl(t.metaSpend)}</span>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: t.metaLeads > 0 ? '#22c55e' : '#4d5a6e', width: 60, textAlign: 'right', fontFamily: 'DM Mono, monospace', flexShrink: 0 }}>
                        {t.metaLeads > 0 ? `${t.metaLeads} res.` : '-'}
                      </div>
                    </div>
                  ));
                })()}
              </div>
              {/* Totals */}
              <div style={{ padding: '12px 24px 16px', borderTop: '1px solid #1e2733', display: 'flex', gap: 24 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#4d5a6e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Total gasto</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#3b82f6', fontFamily: 'DM Mono, monospace' }}>{brl(timeseries.reduce((s, t) => s + t.metaSpend, 0))}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#4d5a6e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Total resultados</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#22c55e', fontFamily: 'DM Mono, monospace' }}>{timeseries.reduce((s, t) => s + t.metaLeads, 0)}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid #1e2733', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ fontSize: 12, color: '#4d5a6e', display: 'flex', alignItems: 'center', gap: 8 }}>
            Gerado pelo{' '}
            <span style={{ color: '#3b82f6', fontWeight: 700 }}>{d.agencyName}</span>
            {' '}&bull;{' '}
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11 }}>CR8 Traffic OS</span>
          </div>
          <div style={{ fontSize: 11, color: '#4d5a6e', textAlign: 'right', fontFamily: 'DM Mono, monospace' }}>
            {d.periodCurrent.start} ate {d.periodCurrent.end}
          </div>
        </div>

      </div>
    </div>
  );
};
