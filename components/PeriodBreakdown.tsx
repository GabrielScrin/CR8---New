import { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronRight, ChevronLeft, TrendingUp, Loader2 } from 'lucide-react';
import { resolveMetaToken } from '../lib/metaToken';

type PeriodView = 'month' | 'week' | 'day';

type NativeResult = { label: string; value: number; cpr: number };

type PeriodSlot = {
  label: string;
  sublabel?: string;
  dateFrom: string;
  dateTo: string;
  spend: number;
  ctr: number;
  cpm: number;
  roas: number;
  results: NativeResult[];
  isCurrent: boolean;
  hasData: boolean;
};

interface PeriodBreakdownProps {
  companyId?: string;
  adAccountId: string;
  demoMode?: boolean;
}

const META_GRAPH_VERSION: string = (import.meta as any).env?.VITE_META_GRAPH_VERSION ?? 'v19.0';

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Ordered by priority — first match with data wins per-account
const PRIORITY_ACTIONS = [
  { type: 'lead', label: 'Leads' },
  { type: 'onsite_conversion.messaging_conversation_started_7d', label: 'Mensagens' },
  { type: 'offsite_conversion.fb_pixel_lead', label: 'Leads Site' },
  { type: 'purchase', label: 'Compras' },
  { type: 'omni_purchase', label: 'Compras' },
  { type: 'video_thruplay_watched', label: 'ThruPlays' },
  { type: 'link_click', label: 'Cliques' },
  { type: 'post_engagement', label: 'Engajamentos' },
];

const pn = (v: unknown): number => {
  const n = parseFloat(String(v ?? 0));
  return isFinite(n) ? n : 0;
};

const fmtShort = (v: number): string => {
  if (v >= 1_000_000) return `R$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$${(v / 1_000).toFixed(1)}k`;
  return `R$${v.toFixed(0)}`;
};

const fmtNum = (v: number): string =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(v);

const pad2 = (n: number) => n.toString().padStart(2, '0');
const fmt2 = (d: Date) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;

async function fetchAllPages(url: URL, maxRows = 300): Promise<any[]> {
  let all: any[] = [];
  let next: string | null = url.toString();
  while (next) {
    const res: Response = await fetch(next);
    if (!res.ok) break;
    const json: any = await res.json();
    if (json.error) break;
    all = all.concat(json.data ?? []);
    next = (json.paging?.next as string | undefined) ?? null;
    if (all.length >= maxRows) break;
  }
  return all;
}

export function PeriodBreakdown({ companyId, adAccountId, demoMode }: PeriodBreakdownProps) {
  const [rawData, setRawData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<PeriodView>('month');
  const [expanded, setExpanded] = useState(false);

  const loadData = useCallback(async () => {
    if (!adAccountId || demoMode) return;
    setLoading(true);
    setRawData([]);
    try {
      const token = await resolveMetaToken(companyId ?? null);
      if (!token) return;

      const today = new Date();
      const from = new Date(today);
      from.setDate(from.getDate() - 119); // 120 days back

      const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${adAccountId}/insights`);
      url.searchParams.set('level', 'account');
      url.searchParams.set(
        'fields',
        'date_start,spend,impressions,clicks,inline_link_clicks,ctr,cpm,actions,cost_per_action_type,video_thruplay_watched_actions,purchase_roas',
      );
      url.searchParams.set('time_increment', '1');
      url.searchParams.set('time_range', JSON.stringify({
        since: from.toISOString().slice(0, 10),
        until: today.toISOString().slice(0, 10),
      }));
      url.searchParams.set('limit', '150');
      url.searchParams.set('access_token', token);

      const rows = await fetchAllPages(url, 300);
      setRawData(rows);
    } catch {
      // silently fail — section simply shows empty state
    } finally {
      setLoading(false);
    }
  }, [adAccountId, companyId, demoMode]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const slots = useMemo((): PeriodSlot[] => {
    if (rawData.length === 0) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Build daily lookup map
    const dailyMap = new Map<string, any>();
    for (const row of rawData) {
      if (row.date_start) dailyMap.set(row.date_start as string, row);
    }

    // Find top 3 native result types with actual data across all days
    const actionTotals = new Map<string, number>();
    for (const row of rawData) {
      const actions: any[] = Array.isArray(row.actions) ? row.actions : [];
      for (const a of actions) {
        if (a.action_type && a.value) {
          actionTotals.set(a.action_type, (actionTotals.get(a.action_type) ?? 0) + pn(a.value));
        }
      }
    }
    const topActions = PRIORITY_ACTIONS.filter(a => (actionTotals.get(a.type) ?? 0) > 0).slice(0, 3);

    // Aggregate a date range into slot metrics
    const aggregate = (from: Date, to: Date) => {
      const start = from.toISOString().slice(0, 10);
      const end = to.toISOString().slice(0, 10);
      let spend = 0, impressions = 0, clicks = 0, linkClicks = 0;
      let roasNumer = 0, raosDenom = 0;
      const actionSums = new Map<string, number>();

      for (const [date, row] of dailyMap) {
        if (date < start || date > end) continue;
        const s = pn(row.spend);
        spend += s;
        impressions += pn(row.impressions);
        clicks += pn(row.clicks);
        linkClicks += pn(row.inline_link_clicks);

        const roasArr: any[] = Array.isArray(row.purchase_roas) ? row.purchase_roas : [];
        if (roasArr.length > 0 && s > 0) {
          roasNumer += pn(roasArr[0]?.value) * s;
          raosDenom += s;
        }

        const actions: any[] = Array.isArray(row.actions) ? row.actions : [];
        for (const a of actions) {
          if (!a.action_type) continue;
          actionSums.set(a.action_type, (actionSums.get(a.action_type) ?? 0) + pn(a.value));
        }
      }

      const perf = linkClicks > 0 ? linkClicks : clicks;
      const ctr = impressions > 0 ? (perf / impressions) * 100 : 0;
      const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
      const roas = raosDenom > 0 ? roasNumer / raosDenom : 0;

      const results: NativeResult[] = topActions
        .map(a => {
          const v = actionSums.get(a.type) ?? 0;
          return { label: a.label, value: Math.round(v), cpr: v > 0 ? spend / v : 0 };
        })
        .filter(r => r.value > 0);

      return { spend, ctr, cpm, roas, results, hasData: spend > 0 };
    };

    // ── MONTH view ──────────────────────────────────────────────
    if (view === 'month') {
      const count = expanded ? 8 : 4;
      const out: PeriodSlot[] = [];

      for (let i = 0; i < count; i++) {
        const mStart = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const mEnd = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);
        const effEnd = mEnd > today ? today : mEnd;

        const data = aggregate(mStart, effEnd);
        // Always include current month; skip empty past months
        if (!data.hasData && i > 0) continue;

        out.push({
          label: `${MONTH_LABELS[mStart.getMonth()]}/${mStart.getFullYear().toString().slice(2)}`,
          sublabel: `${fmt2(mStart)} – ${fmt2(effEnd)}`,
          dateFrom: mStart.toISOString().slice(0, 10),
          dateTo: effEnd.toISOString().slice(0, 10),
          isCurrent: i === 0,
          ...data,
        });
      }

      return out.reverse();
    }

    // ── WEEK view ────────────────────────────────────────────────
    if (view === 'week') {
      const dayOfWeek = today.getDay(); // 0 = Sun
      const currentSunday = new Date(today);
      currentSunday.setDate(today.getDate() - dayOfWeek);

      const WEEK_LABELS = ['Esta semana', 'Semana -1', 'Semana -2', 'Semana -3'];
      const out: PeriodSlot[] = [];

      for (let i = 0; i < 4; i++) {
        const wStart = new Date(currentSunday);
        wStart.setDate(currentSunday.getDate() - i * 7);
        const wEnd = new Date(wStart);
        wEnd.setDate(wStart.getDate() + 6);
        const effEnd = wEnd > today ? today : wEnd;

        const data = aggregate(wStart, effEnd);
        out.push({
          label: WEEK_LABELS[i],
          sublabel: `Dom ${fmt2(wStart)} – Sáb ${fmt2(wEnd)}`,
          dateFrom: wStart.toISOString().slice(0, 10),
          dateTo: effEnd.toISOString().slice(0, 10),
          isCurrent: i === 0,
          ...data,
        });
      }

      return out.reverse();
    }

    // ── DAY view ─────────────────────────────────────────────────
    const out: PeriodSlot[] = [];
    for (let i = 14; i >= 0; i--) {
      const day = new Date(today);
      day.setDate(today.getDate() - i);

      const dayName = day.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
      const data = aggregate(day, day);

      out.push({
        label: `${pad2(day.getDate())}/${pad2(day.getMonth() + 1)}`,
        sublabel: dayName,
        dateFrom: day.toISOString().slice(0, 10),
        dateTo: day.toISOString().slice(0, 10),
        isCurrent: i === 0,
        ...data,
      });
    }
    return out;
  }, [rawData, view, expanded]);

  if (!adAccountId || demoMode) return null;

  const maxSpend = Math.max(...slots.map(s => s.spend), 0.01);

  const TAB_LABELS: Record<PeriodView, string> = { month: 'Mês', week: 'Semana', day: 'Dia' };

  return (
    <div
      className="rounded-2xl border border-[hsl(var(--border))] overflow-hidden"
      style={{ background: 'hsl(220 18% 7%)' }}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="px-6 py-4 border-b border-[hsl(var(--border))] flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[hsl(var(--primary))]" />
            <span className="text-sm font-semibold text-[hsl(var(--foreground))]">Resultados por Período</span>
          </div>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5 ml-6">
            Métricas consolidadas · investimento, resultados, CTR, CPM e ROAS
          </p>
        </div>

        <div className="flex items-center gap-3">
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-[hsl(var(--muted-foreground))]" />}

          {/* Tab switcher */}
          <div className="flex gap-0.5 p-0.5 rounded-xl bg-[hsl(var(--secondary))]">
            {(['month', 'week', 'day'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => { setView(tab); if (tab !== 'month') setExpanded(false); }}
                className={`px-4 py-1.5 rounded-[10px] text-xs font-semibold transition-all ${
                  view === tab
                    ? 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm'
                    : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                }`}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────── */}
      <div className="p-5">
        {loading && slots.length === 0 ? (
          /* Skeleton */
          <div className="flex gap-3">
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                className="w-44 h-60 rounded-xl bg-[hsl(var(--secondary))] animate-pulse flex-shrink-0"
                style={{ animationDelay: `${i * 80}ms` }}
              />
            ))}
          </div>
        ) : slots.length === 0 ? (
          <div className="py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
            Nenhum dado disponível para este período.
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 -mb-1 snap-x snap-mandatory">
            {slots.map(slot => {
              const pct = (slot.spend / maxSpend) * 100;

              return (
                <div
                  key={slot.dateFrom}
                  className="flex-shrink-0 w-44 rounded-xl border snap-start transition-all duration-200 overflow-hidden"
                  style={{
                    borderColor: slot.isCurrent
                      ? 'hsl(220 100% 52% / 0.45)'
                      : 'hsl(var(--border))',
                    background: slot.isCurrent
                      ? 'linear-gradient(175deg, hsl(220 100% 52% / 0.07) 0%, hsl(220 18% 10%) 55%)'
                      : 'hsl(220 18% 10%)',
                  }}
                >
                  {/* Spend fill bar at very top */}
                  <div className="h-[2px] bg-[hsl(var(--secondary))]">
                    <div
                      className="h-full transition-all duration-700"
                      style={{
                        width: `${pct}%`,
                        background: slot.isCurrent
                          ? 'hsl(var(--primary))'
                          : 'hsl(215 20% 42%)',
                      }}
                    />
                  </div>

                  {/* Date header */}
                  <div className="px-3.5 pt-3 pb-2.5">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span
                        className="text-[13px] font-bold leading-tight"
                        style={{ color: slot.isCurrent ? 'hsl(var(--primary))' : 'hsl(var(--foreground))' }}
                      >
                        {slot.label}
                      </span>
                      {slot.isCurrent && (
                        <span
                          className="text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full flex-shrink-0"
                          style={{ background: 'hsl(220 100% 52% / 0.14)', color: 'hsl(var(--primary))' }}
                        >
                          Atual
                        </span>
                      )}
                    </div>
                    {slot.sublabel && (
                      <div className="text-[10px] text-[hsl(var(--muted-foreground))]">{slot.sublabel}</div>
                    )}
                  </div>

                  {/* ── Invest ──────────────────────────────── */}
                  <div className="px-3.5 pb-3">
                    {slot.spend > 0 ? (
                      <>
                        <div className="text-[15px] font-bold text-[hsl(var(--foreground))] tabular-nums leading-tight">
                          {fmtShort(slot.spend)}
                        </div>
                        <div className="text-[9px] font-semibold uppercase tracking-widest text-[hsl(var(--muted-foreground))] mt-0.5">
                          Investido
                        </div>
                      </>
                    ) : (
                      <div className="text-[11px] italic text-[hsl(var(--muted-foreground))]">Sem gastos</div>
                    )}
                  </div>

                  {/* ── Native results ──────────────────────── */}
                  {slot.results.length > 0 && (
                    <>
                      <div className="h-px mx-3.5 bg-[hsl(var(--border))]" />
                      <div className="px-3.5 py-2.5 space-y-2">
                        {slot.results.map((r, i) => (
                          <div key={`${r.label}-${i}`}>
                            <div className="flex items-baseline justify-between gap-1">
                              <span className="text-[9px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] truncate">
                                {r.label}
                              </span>
                              <span className="text-[13px] font-bold text-emerald-400 tabular-nums flex-shrink-0">
                                {fmtNum(r.value)}
                              </span>
                            </div>
                            {r.cpr > 0 && (
                              <div className="text-[9px] text-[hsl(var(--muted-foreground))] text-right tabular-nums mt-px">
                                {fmtShort(r.cpr)}/res.
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {/* ── Ratios: CTR / CPM / ROAS ────────────── */}
                  <div className="h-px mx-3.5 bg-[hsl(var(--border))]" />
                  <div className="px-3.5 py-2.5 pb-3.5 space-y-1.5">
                    {/* CTR */}
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[9px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">CTR</span>
                      <span
                        className="text-[11px] font-bold tabular-nums"
                        style={{
                          color: slot.ctr >= 2
                            ? '#34d399'
                            : slot.ctr >= 1
                            ? '#38bdf8'
                            : 'hsl(var(--muted-foreground))',
                        }}
                      >
                        {slot.ctr > 0 ? `${slot.ctr.toFixed(2)}%` : '—'}
                      </span>
                    </div>

                    {/* CPM */}
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[9px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">CPM</span>
                      <span className="text-[11px] font-bold tabular-nums text-amber-400">
                        {slot.cpm > 0 ? fmtShort(slot.cpm) : '—'}
                      </span>
                    </div>

                    {/* ROAS — only if account has purchase data */}
                    {slot.roas > 0 && (
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[9px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">ROAS</span>
                        <span className="text-[11px] font-bold tabular-nums text-violet-400">
                          {slot.roas.toFixed(2)}×
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* ── Expand / Collapse (months only) ─────────────── */}
            {view === 'month' && (
              <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                className="flex-shrink-0 w-14 rounded-xl border border-dashed flex flex-col items-center justify-center gap-1.5 transition-all group snap-start"
                style={{ borderColor: 'hsl(var(--border))' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'hsl(220 100% 52% / 0.35)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'hsl(var(--border))')}
              >
                {expanded ? (
                  <ChevronLeft className="w-4 h-4 text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--primary))] transition-colors" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--primary))] transition-colors" />
                )}
                <span
                  className="text-[9px] font-semibold uppercase tracking-wider text-center leading-tight transition-colors"
                  style={{ color: 'hsl(var(--muted-foreground))' }}
                >
                  {expanded ? 'Menos' : '+4\nmeses'}
                </span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
