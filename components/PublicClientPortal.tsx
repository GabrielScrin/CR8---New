import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CalendarRange,
  ChevronDown,
  ExternalLink,
  Filter,
  Instagram,
  LineChart as LineChartIcon,
  Loader2,
  RefreshCw,
  WalletCards,
} from 'lucide-react';
import {
  fetchClientPortalBootstrap,
  fetchClientPortalOverview,
  fetchClientPortalWeeklyDetail,
  fetchClientPortalWeeklyList,
  type ClientPortalBootstrap,
  type ClientPortalOverview,
  type WeeklyReportDetail,
  type WeeklyReportListItem,
} from '../lib/clientPortal';

type PublicClientPortalProps = {
  token: string;
};

const brl = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(value ?? 0);

const int = (value: number) => new Intl.NumberFormat('pt-BR').format(Math.round(value ?? 0));
const pct = (value: number, digits = 1) => `${(value ?? 0).toFixed(digits)}%`;

const isoToLabel = (iso: string) => {
  if (!iso) return '';
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
};

const safeThemeColor = (value: string | null | undefined, fallback: string) => {
  const color = String(value ?? '').trim();
  if (!/^#?[0-9a-fA-F]{3,8}$/.test(color)) return fallback;
  return color.startsWith('#') ? color : `#${color}`;
};

const metricCard = (
  label: string,
  value: string,
  hint: string,
  accent: string,
) => (
  <div
    className="rounded-[24px] border border-white/10 p-5 shadow-[0_20px_60px_-28px_rgba(0,0,0,0.65)]"
    style={{ background: 'linear-gradient(180deg, rgba(15,18,26,0.96), rgba(8,10,16,0.96))' }}
  >
    <div className="mb-3 flex items-center justify-between">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">{label}</div>
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: accent, boxShadow: `0 0 24px ${accent}` }} />
    </div>
    <div className="text-[30px] font-black tracking-[-0.04em] text-white">{value}</div>
    <div className="mt-2 text-xs text-white/45">{hint}</div>
  </div>
);

const emptyWeeklyReport: WeeklyReportDetail | null = null;

export const PublicClientPortal: React.FC<PublicClientPortalProps> = ({ token }) => {
  const [bootstrap, setBootstrap] = useState<ClientPortalBootstrap | null>(null);
  const [overview, setOverview] = useState<ClientPortalOverview | null>(null);
  const [weeklyItems, setWeeklyItems] = useState<WeeklyReportListItem[]>([]);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReportDetail | null>(emptyWeeklyReport);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedWeeklyId, setSelectedWeeklyId] = useState('');
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  const [campaignFilterOpen, setCampaignFilterOpen] = useState(false);
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [loadingWeekly, setLoadingWeekly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    let alive = true;
    setLoadingBootstrap(true);
    setError(null);

    fetchClientPortalBootstrap(token)
      .then((payload) => {
        if (!alive) return;
        setBootstrap(payload);
        setWeeklyItems(payload.weekly ?? []);
        setSelectedCompanyId(payload.selectedCompanyId);

        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 6);
        setDateFrom(start.toISOString().slice(0, 10));
        setDateTo(end.toISOString().slice(0, 10));

        const firstWeekly = payload.weekly?.[0]?.id ?? '';
        setSelectedWeeklyId(firstWeekly);
      })
      .catch((fetchError: any) => {
        if (!alive) return;
        setError(fetchError?.message ?? 'Falha ao abrir o portal do cliente.');
      })
      .finally(() => {
        if (alive) setLoadingBootstrap(false);
      });

    return () => {
      alive = false;
    };
  }, [token]);

  useEffect(() => {
    if (!selectedCompanyId || !dateFrom || !dateTo) return;
    let alive = true;
    setLoadingOverview(true);
    setError(null);

    fetchClientPortalOverview({
      token,
      companyId: selectedCompanyId,
      dateFrom,
      dateTo,
      campaignIds: selectedCampaignIds,
    })
      .then((payload) => {
        if (!alive) return;
        setOverview(payload);
      })
      .catch((fetchError: any) => {
        if (!alive) return;
        setError(fetchError?.message ?? 'Falha ao carregar o dashboard.');
      })
      .finally(() => {
        if (alive) setLoadingOverview(false);
      });

    return () => {
      alive = false;
    };
  }, [token, selectedCompanyId, dateFrom, dateTo, selectedCampaignIds]);

  useEffect(() => {
    if (!selectedCompanyId) return;
    let alive = true;
    setLoadingWeekly(true);

    fetchClientPortalWeeklyList(token, selectedCompanyId)
      .then((payload) => {
        if (!alive) return;
        setWeeklyItems(payload.items ?? []);
        const preferred = payload.items.some((item) => item.id === selectedWeeklyId) ? selectedWeeklyId : payload.items[0]?.id ?? '';
        setSelectedWeeklyId(preferred);
      })
      .catch((fetchError: any) => {
        if (!alive) return;
        setError(fetchError?.message ?? 'Falha ao carregar o histórico semanal.');
      })
      .finally(() => {
        if (alive) setLoadingWeekly(false);
      });

    return () => {
      alive = false;
    };
  }, [token, selectedCompanyId]);

  useEffect(() => {
    if (!selectedCompanyId || !selectedWeeklyId) {
      setWeeklyReport(emptyWeeklyReport);
      return;
    }

    let alive = true;
    fetchClientPortalWeeklyDetail(token, selectedCompanyId, selectedWeeklyId)
      .then((payload) => {
        if (!alive) return;
        setWeeklyReport(payload.report);
      })
      .catch((fetchError: any) => {
        if (!alive) return;
        setError(fetchError?.message ?? 'Falha ao carregar o relatório semanal.');
      });

    return () => {
      alive = false;
    };
  }, [token, selectedCompanyId, selectedWeeklyId]);

  const selectedCompany = useMemo(
    () => bootstrap?.companies.find((item) => item.id === selectedCompanyId) ?? bootstrap?.companies[0] ?? null,
    [bootstrap, selectedCompanyId],
  );

  const accent = safeThemeColor(selectedCompany?.brandPrimaryColor, '#4f8cff');
  const accentSoft = `${accent}40`;

  const campaignOptions = useMemo(() => {
    const metaOptions = (overview?.overview.meta.campaigns ?? []).map((campaign) => ({
      id: `meta:${campaign.id}`,
      label: `Meta · ${campaign.name}`,
    }));
    const googleOptions = (overview?.overview.googleAds.campaigns ?? []).map((campaign) => ({
      id: `google:${campaign.id}`,
      label: `Google · ${campaign.name}`,
    }));
    return [...metaOptions, ...googleOptions];
  }, [overview]);

  const toggleCampaign = (campaignId: string) => {
    setSelectedCampaignIds((current) =>
      current.includes(campaignId) ? current.filter((item) => item !== campaignId) : [...current, campaignId],
    );
  };

  const combinedSeries = useMemo(() => {
    const base = new Map<string, { date: string; metaSpend: number; metaResults: number; googleSpend: number; googleResults: number }>();
    for (const row of overview?.overview.meta.timeseries ?? []) {
      base.set(row.date, {
        date: isoToLabel(row.date),
        metaSpend: row.spend,
        metaResults: row.results,
        googleSpend: 0,
        googleResults: 0,
      });
    }
    for (const row of overview?.overview.googleAds.timeseries ?? []) {
      const existing = base.get(row.date) ?? {
        date: isoToLabel(row.date),
        metaSpend: 0,
        metaResults: 0,
        googleSpend: 0,
        googleResults: 0,
      };
      existing.googleSpend = row.spend;
      existing.googleResults = row.results;
      base.set(row.date, existing);
    }
    return Array.from(base.values());
  }, [overview]);

  if (loadingBootstrap) {
    return (
      <div className="min-h-screen bg-[#05070d] text-white flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-white/65">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando portal do cliente...
        </div>
      </div>
    );
  }

  if (error && !bootstrap) {
    return (
      <div className="min-h-screen bg-[#05070d] text-white flex items-center justify-center px-6">
        <div className="max-w-md rounded-[28px] border border-white/10 bg-white/5 p-8 text-center">
          <div className="text-lg font-bold">Portal indisponível</div>
          <div className="mt-3 text-sm text-white/60">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#05070d] text-white" style={{ backgroundImage: 'radial-gradient(circle at top left, rgba(79,140,255,0.18), transparent 28%), radial-gradient(circle at top right, rgba(16,185,129,0.12), transparent 24%)' }}>
      <div className="mx-auto max-w-[1440px] px-4 pb-12 pt-5 sm:px-6 lg:px-8">
        <div className="sticky top-0 z-20 mb-6 rounded-[30px] border border-white/10 bg-[#080b13]/85 p-4 backdrop-blur-xl shadow-[0_28px_80px_-38px_rgba(0,0,0,0.75)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-[20px] border border-white/10 bg-white/5 overflow-hidden">
                {selectedCompany?.brandLogoUrl ? (
                  <img src={selectedCompany.brandLogoUrl} alt={selectedCompany.brandName ?? selectedCompany.name} className="h-10 w-10 object-contain" />
                ) : (
                  <LineChartIcon className="h-6 w-6" style={{ color: accent }} />
                )}
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">Portal do Cliente</div>
                <h1 className="mt-1 text-[28px] font-black tracking-[-0.05em]">
                  {selectedCompany?.brandName ?? selectedCompany?.name ?? bootstrap?.portal.name}
                </h1>
                <div className="mt-1 text-sm text-white/55">{bootstrap?.portal.name}</div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:flex xl:flex-wrap xl:items-center">
              <label className="flex min-w-[220px] items-center gap-3 rounded-[18px] border border-white/10 bg-white/5 px-3 py-2.5">
                <WalletCards className="h-4 w-4 text-white/40" />
                <select
                  value={selectedCompanyId}
                  onChange={(event) => {
                    setSelectedCompanyId(event.target.value);
                    setSelectedCampaignIds([]);
                    setCampaignFilterOpen(false);
                  }}
                  className="w-full bg-transparent text-sm font-medium outline-none"
                >
                  {bootstrap?.companies.map((company) => (
                    <option key={company.id} value={company.id} className="bg-[#0d1119]">
                      {company.brandName ?? company.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-3 rounded-[18px] border border-white/10 bg-white/5 px-3 py-2.5">
                <CalendarRange className="h-4 w-4 text-white/40" />
                <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="bg-transparent text-sm outline-none" />
                <span className="text-white/35">até</span>
                <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="bg-transparent text-sm outline-none" />
              </label>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setCampaignFilterOpen((open) => !open)}
                  className="flex min-w-[220px] items-center justify-between gap-3 rounded-[18px] border border-white/10 bg-white/5 px-3 py-2.5 text-left"
                >
                  <span className="flex items-center gap-3">
                    <Filter className="h-4 w-4 text-white/40" />
                    <span className="text-sm font-medium">
                      {selectedCampaignIds.length > 0 ? `${selectedCampaignIds.length} campanhas filtradas` : 'Todas as campanhas'}
                    </span>
                  </span>
                  <ChevronDown className={`h-4 w-4 text-white/40 transition-transform ${campaignFilterOpen ? 'rotate-180' : ''}`} />
                </button>

                {campaignFilterOpen && (
                  <div className="absolute right-0 top-[calc(100%+0.75rem)] z-30 w-[360px] max-w-[92vw] rounded-[22px] border border-white/10 bg-[#0b1019] p-3 shadow-[0_28px_80px_-38px_rgba(0,0,0,0.9)]">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Campanhas</div>
                      <button type="button" onClick={() => setSelectedCampaignIds([])} className="text-xs text-white/55 hover:text-white">
                        Limpar
                      </button>
                    </div>
                    <div className="max-h-72 space-y-2 overflow-auto pr-1">
                      {campaignOptions.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-white/45">
                          Sem campanhas para o período atual.
                        </div>
                      ) : (
                        campaignOptions.map((option) => (
                          <label key={option.id} className="flex items-start gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2.5 text-sm">
                            <input
                              type="checkbox"
                              checked={selectedCampaignIds.includes(option.id)}
                              onChange={() => toggleCampaign(option.id)}
                              className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent"
                            />
                            <span className="leading-5 text-white/78">{option.label}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedCampaignIds([]);
                  setCampaignFilterOpen(false);
                }}
                className="inline-flex items-center justify-center gap-2 rounded-[18px] border px-3 py-2.5 text-sm font-semibold transition-colors"
                style={{ borderColor: accentSoft, color: accent, background: 'rgba(255,255,255,0.03)' }}
              >
                <RefreshCw className={`h-4 w-4 ${loadingOverview ? 'animate-spin' : ''}`} />
                Atualizar
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-[24px] border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_420px]">
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {metricCard('Meta Investido', brl(overview?.overview.meta.summary.spend ?? 0), overview?.overview.meta.available ? 'Mídia Meta no período' : overview?.overview.meta.reason ?? 'Não configurado', accent)}
              {metricCard('Google Investido', brl(overview?.overview.googleAds.summary.spend ?? 0), overview?.overview.googleAds.available ? 'Mídia Google Ads no período' : overview?.overview.googleAds.reason ?? 'Não configurado', '#34d399')}
              {metricCard('Leads / Conversões', int((overview?.overview.meta.summary.results ?? 0) + (overview?.overview.googleAds.summary.conversions ?? 0)), 'Meta + Google Ads', '#f59e0b')}
              {metricCard('Receita CRM', brl(overview?.overview.business.revenue ?? 0), `${int(overview?.overview.business.won ?? 0)} ganhos no CRM`, '#f472b6')}
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <div className="rounded-[28px] border border-white/10 p-5" style={{ background: 'linear-gradient(180deg, rgba(12,16,24,0.96), rgba(8,10,16,0.98))' }}>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Mídia Paga</div>
                    <div className="mt-1 text-xl font-black tracking-[-0.04em]">Evolução diária</div>
                  </div>
                  {loadingOverview && <Loader2 className="h-4 w-4 animate-spin text-white/50" />}
                </div>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={combinedSeries}>
                      <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                        contentStyle={{ background: '#0d1320', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 18, color: '#fff' }}
                      />
                      <Bar dataKey="metaSpend" fill={accent} name="Meta Spend" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="googleSpend" fill="#34d399" name="Google Spend" radius={[6, 6, 0, 0]} />
                      <Line type="monotone" dataKey="metaResults" stroke="#f59e0b" strokeWidth={2.5} dot={false} name="Meta Resultados" />
                      <Line type="monotone" dataKey="googleResults" stroke="#f472b6" strokeWidth={2.5} dot={false} name="Google Conversões" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-[28px] border border-white/10 p-5" style={{ background: 'linear-gradient(180deg, rgba(12,16,24,0.96), rgba(8,10,16,0.98))' }}>
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ background: 'linear-gradient(135deg,#f09433,#dc2743,#bc1888)' }}>
                    <Instagram className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Instagram</div>
                    <div className="mt-0.5 text-lg font-black tracking-[-0.04em]">
                      {overview?.overview.instagram.profile?.username ? `@${overview.overview.instagram.profile.username}` : 'Instagram'}
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {metricCard('Alcance', int(overview?.overview.instagram.summary.totalReach ?? 0), 'Contas alcançadas', '#fb7185')}
                  {metricCard('Views', int(overview?.overview.instagram.summary.totalViews ?? 0), 'Visualizações totais', '#f59e0b')}
                  {metricCard('Perfil', int(overview?.overview.instagram.summary.totalProfileViews ?? 0), 'Visitas ao perfil', '#38bdf8')}
                  {metricCard('Seguidores', int(overview?.overview.instagram.summary.totalFollowerGain ?? 0), 'Saldo de seguidores', '#34d399')}
                </div>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <div className="rounded-[28px] border border-white/10 p-5" style={{ background: 'linear-gradient(180deg, rgba(12,16,24,0.96), rgba(8,10,16,0.98))' }}>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Meta + Google Ads</div>
                    <div className="mt-1 text-xl font-black tracking-[-0.04em]">Campanhas do período</div>
                  </div>
                  <div className="text-xs text-white/45">{campaignOptions.length} campanhas listadas</div>
                </div>
                <div className="overflow-hidden rounded-[22px] border border-white/8">
                  <div className="grid grid-cols-[minmax(0,1.6fr)_0.6fr_0.55fr_0.55fr] gap-3 bg-white/[0.04] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                    <div>Campanha</div>
                    <div>Invest.</div>
                    <div>CTR</div>
                    <div>Resultados</div>
                  </div>
                  <div className="max-h-[390px] overflow-auto">
                    {[...(overview?.overview.meta.campaigns ?? []).map((campaign) => ({
                      key: `meta:${campaign.id}`,
                      label: `Meta · ${campaign.name}`,
                      spend: campaign.spend,
                      ctr: campaign.ctr,
                      results: campaign.results,
                    })), ...(overview?.overview.googleAds.campaigns ?? []).map((campaign) => ({
                      key: `google:${campaign.id}`,
                      label: `Google · ${campaign.name}`,
                      spend: campaign.spend,
                      ctr: campaign.ctr,
                      results: campaign.conversions,
                    }))].map((campaign) => (
                      <button
                        key={campaign.key}
                        type="button"
                        onClick={() => toggleCampaign(campaign.key)}
                        className={`grid w-full grid-cols-[minmax(0,1.6fr)_0.6fr_0.55fr_0.55fr] gap-3 border-t border-white/6 px-4 py-3 text-left transition-colors hover:bg-white/[0.03] ${
                          selectedCampaignIds.includes(campaign.key) ? 'bg-white/[0.05]' : ''
                        }`}
                      >
                        <div className="min-w-0 truncate text-sm font-medium text-white/88">{campaign.label}</div>
                        <div className="text-sm text-white/75">{brl(campaign.spend)}</div>
                        <div className="text-sm text-white/75">{pct(campaign.ctr)}</div>
                        <div className="text-sm text-white/75">{int(campaign.results)}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-white/10 p-5" style={{ background: 'linear-gradient(180deg, rgba(12,16,24,0.96), rgba(8,10,16,0.98))' }}>
                <div className="mb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Instagram</div>
                  <div className="mt-1 text-xl font-black tracking-[-0.04em]">Conteúdos recentes</div>
                </div>
                <div className="grid gap-3">
                  {(overview?.overview.instagram.media ?? []).slice(0, 4).map((media) => (
                    <a
                      key={media.id}
                      href={media.permalink || undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="grid grid-cols-[76px_minmax(0,1fr)] gap-3 rounded-[22px] border border-white/8 bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.05]"
                    >
                      <img src={media.thumbnailUrl || media.mediaUrl} alt="" className="h-[76px] w-[76px] rounded-[18px] object-cover" />
                      <div className="min-w-0">
                        <div className="line-clamp-2 text-sm font-medium text-white/86">{media.caption || 'Conteúdo sem legenda'}</div>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-white/48">
                          <span>Reach {int(media.reach ?? 0)}</span>
                          <span>Interações {int(media.totalInteractions ?? 0)}</span>
                          <span className="inline-flex items-center gap-1">
                            Abrir <ExternalLink className="h-3 w-3" />
                          </span>
                        </div>
                      </div>
                    </a>
                  ))}
                  {(overview?.overview.instagram.media ?? []).length === 0 && (
                    <div className="rounded-[22px] border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/45">
                      Nenhum conteúdo disponível para esta conta.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 p-5" style={{ background: 'linear-gradient(180deg, rgba(12,16,24,0.96), rgba(8,10,16,0.98))' }}>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Instagram</div>
                  <div className="mt-1 text-xl font-black tracking-[-0.04em]">Alcance diário</div>
                </div>
                <div className="text-xs text-white/45">{overview?.overview.instagram.profile?.followersCount ? `${int(overview.overview.instagram.profile.followersCount)} seguidores atuais` : 'Conta conectada'}</div>
              </div>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={overview?.overview.instagram.series ?? []}>
                    <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: '#0d1320', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 18, color: '#fff' }} />
                    <Line type="monotone" dataKey="reach" stroke="#fb7185" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[28px] border border-white/10 p-5" style={{ background: 'linear-gradient(180deg, rgba(12,16,24,0.96), rgba(8,10,16,0.98))' }}>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Relatório Semanal</div>
                  <div className="mt-1 text-xl font-black tracking-[-0.04em]">Histórico automático</div>
                </div>
                {loadingWeekly && <Loader2 className="h-4 w-4 animate-spin text-white/50" />}
              </div>

              <div className="space-y-2">
                {weeklyItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedWeeklyId(item.id)}
                    className={`w-full rounded-[22px] border px-4 py-3 text-left transition-colors ${
                      selectedWeeklyId === item.id ? 'border-white/20 bg-white/[0.06]' : 'border-white/8 bg-white/[0.03] hover:bg-white/[0.05]'
                    }`}
                  >
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                      {item.periodStart} até {item.periodEnd}
                    </div>
                    <div className="mt-2 text-sm text-white/80">{item.summary ?? 'Semana gerada automaticamente.'}</div>
                  </button>
                ))}

                {weeklyItems.length === 0 && (
                  <div className="rounded-[22px] border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/45">
                    Nenhum relatório semanal salvo para esta conta ainda.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 p-5" style={{ background: 'linear-gradient(180deg, rgba(12,16,24,0.96), rgba(8,10,16,0.98))' }}>
              <div className="mb-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Semana selecionada</div>
                <div className="mt-1 text-xl font-black tracking-[-0.04em]">
                  {weeklyReport ? `${weeklyReport.period_start} até ${weeklyReport.period_end}` : 'Selecione uma semana'}
                </div>
              </div>

              {weeklyReport ? (
                <div className="space-y-5">
                  <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4 text-sm leading-6 text-white/82">
                    {weeklyReport.summary ?? 'Resumo indisponível para esta semana.'}
                  </div>

                  <div className="grid gap-4">
                    <div>
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Highlights</div>
                      <div className="space-y-2">
                        {(weeklyReport.highlights ?? []).map((item) => (
                          <div key={item} className="rounded-[18px] border border-emerald-500/15 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-100">
                            {item}
                          </div>
                        ))}
                        {(weeklyReport.highlights ?? []).length === 0 && (
                          <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white/45">Sem highlights registrados.</div>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Riscos</div>
                      <div className="space-y-2">
                        {(weeklyReport.risks ?? []).map((item) => (
                          <div key={item} className="rounded-[18px] border border-amber-500/15 bg-amber-500/8 px-4 py-3 text-sm text-amber-100">
                            {item}
                          </div>
                        ))}
                        {(weeklyReport.risks ?? []).length === 0 && (
                          <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white/45">Sem riscos destacados.</div>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Próxima semana</div>
                      <div className="space-y-2">
                        {(weeklyReport.next_week ?? []).map((item) => (
                          <div key={item} className="rounded-[18px] border px-4 py-3 text-sm" style={{ borderColor: accentSoft, background: `${accent}12`, color: '#eff6ff' }}>
                            {item}
                          </div>
                        ))}
                        {(weeklyReport.next_week ?? []).length === 0 && (
                          <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white/45">Sem ações sugeridas.</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-[22px] border border-dashed border-white/10 px-4 py-10 text-center text-sm text-white/45">
                  Selecione um relatório semanal para ver o resumo completo.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
