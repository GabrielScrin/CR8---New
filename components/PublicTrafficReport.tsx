import React, { useEffect, useState } from 'react';
import { getSupabaseAnonKey, getSupabaseUrl } from '../lib/supabase';

interface PublicTrafficReportProps {
  publicId: string;
}

type ReportSummary = {
  totalSpend: number;
  totalResults: number;
  totalImpressions: number;
  totalClicks: number;
  totalReach?: number;
  avgCPR: number | null;
  avgCPC: number | null;
  avgCPM: number | null;
  avgCTR: number | null;
};

type TimeseriesPoint = {
  name: string;
  metaSpend: number;
  metaLeads: number;
};

type ReportItem = {
  id: string;
  name: string;
  spend: number;
  results?: number;
  resultLabel?: string;
  costPerResult?: number;
  impressions: number;
  reach?: number;
  clicks?: number;
  ctr?: number;
  cpm?: number;
  hookRate?: number;
  holdRate?: number;
  idc?: number;
  classification?: string;
  status?: string;
  tags?: string[];
};

type ReportData = {
  level: string;
  adAccountId?: string;
  summary: ReportSummary;
  timeseries: TimeseriesPoint[];
  items: ReportItem[];
  topCreatives: ReportItem[];
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

const fmt = (n: number, opts?: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat('pt-BR', opts).format(n);

const fmtBrl = (n: number) =>
  fmt(n, { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtPct = (n: number | undefined, digits = 1) =>
  n != null ? `${(n * 100).toFixed(digits)}%` : '-';

const classLabel = (c?: string) =>
  c === 'otimo' ? 'Otimo' : c === 'bom' ? 'Bom' : c === 'regular' ? 'Regular' : c === 'ruim' ? 'Ruim' : '-';

const classColor = (c?: string) =>
  c === 'otimo'
    ? '#10b981'
    : c === 'bom'
      ? '#6366f1'
      : c === 'regular'
        ? '#f59e0b'
        : c === 'ruim'
          ? '#ef4444'
          : '#6b7280';

// Simple sparkline SVG for timeseries
const Sparkline: React.FC<{ data: TimeseriesPoint[]; dataKey: 'metaSpend' | 'metaLeads'; color: string }> = ({
  data,
  dataKey,
  color,
}) => {
  if (data.length < 2) return null;
  const values = data.map((d) => d[dataKey]);
  const max = Math.max(...values, 1);
  const w = 120;
  const h = 40;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * (h - 4) - 2}`)
    .join(' ');
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

// IDC bar visual
const IdcBar: React.FC<{ value: number; color: string }> = ({ value, color }) => (
  <div className="flex items-center gap-2">
    <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${Math.min(value, 100)}%`, background: color }} />
    </div>
    <span className="text-xs font-bold tabular-nums" style={{ color }}>{value}</span>
  </div>
);

export const PublicTrafficReport: React.FC<PublicTrafficReportProps> = ({ publicId }) => {
  const [report, setReport] = useState<TrafficReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const anonKey = getSupabaseAnonKey();
    const baseUrl = getSupabaseUrl();
    if (!anonKey || !baseUrl) {
      setError('Supabase nao configurado.');
      setLoading(false);
      return;
    }

    const url = `${baseUrl}/rest/v1/traffic_reports?public_id=eq.${encodeURIComponent(publicId)}&select=id,public_id,title,period_start,period_end,report_data,created_at&limit=1`;

    fetch(url, {
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${anonKey}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
    })
      .then((r) => r.json())
      .then((data: any) => {
        const rows = Array.isArray(data) ? data : [];
        if (rows.length === 0) {
          setError('Relatorio nao encontrado.');
        } else {
          setReport(rows[0] as TrafficReport);
        }
      })
      .catch(() => setError('Erro ao carregar relatorio.'))
      .finally(() => setLoading(false));
  }, [publicId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Carregando relatorio...</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center mx-auto mb-4">
            <span className="text-red-400 text-xl">!</span>
          </div>
          <h3 className="text-base font-semibold text-gray-800">Relatorio nao encontrado</h3>
          <p className="text-sm text-gray-500 mt-1">{error ?? 'O link pode ter expirado ou ser invalido.'}</p>
        </div>
      </div>
    );
  }

  const d = report.report_data;
  const s = d.summary;
  const timeseries = d.timeseries ?? [];
  const items = d.items ?? [];
  const topCreatives = d.topCreatives ?? items.slice(0, 5);
  const levelLabel = d.level === 'campaign' ? 'Campanha' : d.level === 'adset' ? 'Conjunto' : 'Anuncio';

  const totalSpendTs = timeseries.reduce((acc, t) => acc + t.metaSpend, 0);
  const totalLeadsTs = timeseries.reduce((acc, t) => acc + t.metaLeads, 0);

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .page-break { page-break-before: always; }
          body { background: white; }
          .print-card { box-shadow: none !important; border: 1px solid #e5e7eb !important; }
        }
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        body { font-family: 'Inter', system-ui, sans-serif; }
      `}</style>

      {/* Top bar */}
      <div className="no-print sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <span className="text-white text-xs font-black">CR8</span>
          </div>
          <span className="text-sm font-semibold text-gray-700">Relatorio de Trafego</span>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors"
        >
          Baixar PDF
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        {/* Header */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 print-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center">
                  <span className="text-white text-[9px] font-black">CR8</span>
                </div>
                <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">Relatorio de Trafego</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 leading-tight">{report.title}</h1>
              <p className="text-sm text-gray-500 mt-1">
                {report.period_start} ate {report.period_end} &bull; Nivel: {levelLabel}
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xs text-gray-400">Gerado em</div>
              <div className="text-sm font-medium text-gray-600">
                {new Date(report.created_at).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Investimento', value: fmtBrl(s.totalSpend), sub: '', color: '#6366f1' },
            { label: s.totalResults > 0 ? 'Resultados' : 'Impressoes', value: s.totalResults > 0 ? fmt(s.totalResults) : fmt(s.totalImpressions), sub: s.avgCPR != null ? `Custo/res: ${fmtBrl(s.avgCPR)}` : '', color: '#10b981' },
            { label: 'CPM', value: s.avgCPM != null ? fmtBrl(s.avgCPM) : '-', sub: `${fmt(s.totalImpressions)} impr.`, color: '#f59e0b' },
            { label: 'CTR', value: s.avgCTR != null ? `${s.avgCTR.toFixed(2)}%` : '-', sub: s.avgCPC != null ? `CPC: ${fmtBrl(s.avgCPC)}` : '', color: '#8b5cf6' },
          ].map((card) => (
            <div key={card.label} className="bg-white rounded-2xl border border-gray-200 p-5 print-card">
              <div className="text-xs text-gray-400 font-medium mb-1">{card.label}</div>
              <div className="text-2xl font-bold" style={{ color: card.color }}>{card.value}</div>
              {card.sub && <div className="text-xs text-gray-400 mt-0.5">{card.sub}</div>}
            </div>
          ))}
        </div>

        {/* Timeseries chart (SVG-based for PDF) */}
        {timeseries.length > 1 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 print-card">
            <h2 className="text-base font-bold text-gray-800 mb-5">Evolucao Diaria</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs text-gray-400 font-medium pb-2 pr-4">Data</th>
                    <th className="text-right text-xs text-gray-400 font-medium pb-2 pr-4">Gasto</th>
                    <th className="text-right text-xs text-gray-400 font-medium pb-2 pr-4">Leads</th>
                    <th className="text-right text-xs text-gray-400 font-medium pb-2">CPL</th>
                  </tr>
                </thead>
                <tbody>
                  {timeseries.map((row, i) => {
                    const cpl = row.metaLeads > 0 ? row.metaSpend / row.metaLeads : null;
                    return (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 pr-4 text-gray-700 font-medium">{row.name}</td>
                        <td className="py-2 pr-4 text-right text-gray-600">{fmtBrl(row.metaSpend)}</td>
                        <td className="py-2 pr-4 text-right text-gray-600">{row.metaLeads > 0 ? fmt(row.metaLeads) : '-'}</td>
                        <td className="py-2 text-right text-gray-600">{cpl != null ? fmtBrl(cpl) : '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200">
                    <td className="pt-2 pr-4 text-xs font-bold text-gray-500">Total</td>
                    <td className="pt-2 pr-4 text-right text-sm font-bold text-indigo-600">{fmtBrl(totalSpendTs)}</td>
                    <td className="pt-2 pr-4 text-right text-sm font-bold text-emerald-600">{totalLeadsTs > 0 ? fmt(totalLeadsTs) : '-'}</td>
                    <td className="pt-2 text-right text-sm font-bold text-gray-600">
                      {totalLeadsTs > 0 ? fmtBrl(totalSpendTs / totalLeadsTs) : '-'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Mini sparklines */}
            <div className="mt-5 flex gap-8">
              <div>
                <div className="text-xs text-gray-400 mb-1">Gasto diario</div>
                <Sparkline data={timeseries} dataKey="metaSpend" color="#6366f1" />
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">Leads diarios</div>
                <Sparkline data={timeseries} dataKey="metaLeads" color="#10b981" />
              </div>
            </div>
          </div>
        )}

        {/* Top Creatives */}
        {topCreatives.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 print-card">
            <h2 className="text-base font-bold text-gray-800 mb-1">Melhores Criativos</h2>
            <p className="text-xs text-gray-400 mb-5">Classificados pelo Indice de Criativo (IDC) — combina resultados, custo, CTR, Hook Rate e Hold Rate</p>
            <div className="space-y-3">
              {topCreatives.map((cr, i) => {
                const col = classColor(cr.classification);
                return (
                  <div key={cr.id} className="flex items-start gap-4 p-4 rounded-xl border border-gray-100 hover:border-gray-200 transition-colors">
                    {/* Rank */}
                    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white"
                         style={{ background: i < 3 ? col : '#9ca3af' }}>
                      {i + 1}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-800 truncate">{cr.name}</div>
                      <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
                        <span>Gasto: <strong className="text-gray-700">{fmtBrl(cr.spend)}</strong></span>
                        {cr.results != null && (
                          <span>{cr.resultLabel ?? 'Resultados'}: <strong className="text-gray-700">{fmt(cr.results)}</strong></span>
                        )}
                        {cr.costPerResult != null && (
                          <span>Custo/res: <strong className="text-gray-700">{fmtBrl(cr.costPerResult)}</strong></span>
                        )}
                        {cr.ctr != null && (
                          <span>CTR: <strong className="text-gray-700">{cr.ctr.toFixed(2)}%</strong></span>
                        )}
                        {cr.hookRate != null && (
                          <span>Hook: <strong className="text-gray-700">{fmtPct(cr.hookRate)}</strong></span>
                        )}
                        {cr.holdRate != null && (
                          <span>Hold: <strong className="text-gray-700">{fmtPct(cr.holdRate)}</strong></span>
                        )}
                      </div>
                      {cr.idc != null && (
                        <div className="mt-2 max-w-[180px]">
                          <IdcBar value={cr.idc} color={col} />
                        </div>
                      )}
                    </div>
                    {/* Classification badge */}
                    <div className="shrink-0">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: `${col}18`, color: col }}>
                        {classLabel(cr.classification)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* All campaigns/items table */}
        {items.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden print-card page-break">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-800">Detalhamento por {levelLabel}</h2>
              <p className="text-xs text-gray-400 mt-0.5">{items.length} {d.level === 'campaign' ? 'campanhas' : d.level === 'adset' ? 'conjuntos' : 'anuncios'} no periodo</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left text-xs text-gray-400 font-semibold uppercase tracking-wider px-4 py-3">Nome</th>
                    <th className="text-right text-xs text-gray-400 font-semibold uppercase tracking-wider px-4 py-3">Gasto</th>
                    <th className="text-right text-xs text-gray-400 font-semibold uppercase tracking-wider px-4 py-3">Resultados</th>
                    <th className="text-right text-xs text-gray-400 font-semibold uppercase tracking-wider px-4 py-3">Custo/Res</th>
                    <th className="text-right text-xs text-gray-400 font-semibold uppercase tracking-wider px-4 py-3">CTR</th>
                    {items.some((r) => r.hookRate != null) && (
                      <th className="text-right text-xs text-gray-400 font-semibold uppercase tracking-wider px-4 py-3">Hook</th>
                    )}
                    {items.some((r) => r.holdRate != null) && (
                      <th className="text-right text-xs text-gray-400 font-semibold uppercase tracking-wider px-4 py-3">Hold</th>
                    )}
                    <th className="text-center text-xs text-gray-400 font-semibold uppercase tracking-wider px-4 py-3">IDC</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row, i) => {
                    const col = classColor(row.classification);
                    return (
                      <tr key={row.id} className={`border-b border-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-800 text-xs leading-tight max-w-[200px] truncate">{row.name}</div>
                          {row.tags && row.tags.length > 0 && (
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {row.tags.slice(0, 2).map((t) => (
                                <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{t}</span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 tabular-nums text-xs">{fmtBrl(row.spend)}</td>
                        <td className="px-4 py-3 text-right text-gray-600 tabular-nums text-xs">
                          {row.results != null ? `${fmt(row.results)} ${row.resultLabel ?? ''}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 tabular-nums text-xs">
                          {row.costPerResult != null ? fmtBrl(row.costPerResult) : '-'}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 tabular-nums text-xs">
                          {row.ctr != null ? `${row.ctr.toFixed(2)}%` : '-'}
                        </td>
                        {items.some((r) => r.hookRate != null) && (
                          <td className="px-4 py-3 text-right text-gray-600 tabular-nums text-xs">
                            {fmtPct(row.hookRate)}
                          </td>
                        )}
                        {items.some((r) => r.holdRate != null) && (
                          <td className="px-4 py-3 text-right text-gray-600 tabular-nums text-xs">
                            {fmtPct(row.holdRate)}
                          </td>
                        )}
                        <td className="px-4 py-3">
                          {row.idc != null ? (
                            <div className="flex items-center justify-center gap-1">
                              <div className="w-16 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${Math.min(row.idc, 100)}%`, background: col }} />
                              </div>
                              <span className="text-xs font-bold tabular-nums" style={{ color: col }}>{row.idc}</span>
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
        )}

        {/* Footer */}
        <div className="text-center py-4">
          <p className="text-xs text-gray-400">
            Relatorio gerado pelo CR8 &bull; Sistema Operacional de Trafego
          </p>
          <p className="text-xs text-gray-300 mt-0.5">
            Periodo: {report.period_start} ate {report.period_end}
          </p>
        </div>
      </div>
    </div>
  );
};
