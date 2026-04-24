import React from 'react';
import { IgMedia } from '../hooks/useInstagramMedia';

const TYPE_META: Record<string, { label: string; color: string }> = {
  IMAGE: { label: 'Imagem', color: 'hsl(220 100% 65%)' },
  VIDEO: { label: 'Video', color: '#a855f7' },
  CAROUSEL_ALBUM: { label: 'Carrossel', color: '#ec4899' },
  REEL: { label: 'Reel', color: '#f59e0b' },
};

function effectiveType(m: IgMedia): string {
  if (m.mediaType === 'VIDEO' && m.mediaProductType === 'REEL') return 'REEL';
  return m.mediaType;
}

interface ChartPoint {
  type: string;
  label: string;
  color: string;
  totalReach: number;
  totalConsumption: number;
  totalInteractions: number;
  count: number;
}

function getConsumptionLabel(type: string): string {
  return type === 'IMAGE' || type === 'CAROUSEL_ALBUM' ? 'views' : 'visualiz.';
}

function getConsumptionValue(media: IgMedia): number {
  const type = effectiveType(media);
  if (type === 'IMAGE' || type === 'CAROUSEL_ALBUM') return media.impressions ?? 0;
  return media.videoViews ?? 0;
}

function buildChartData(media: IgMedia[]): ChartPoint[] {
  const groups: Record<string, { reach: number; consumption: number; interactions: number; count: number }> = {};

  for (const m of media) {
    const t = effectiveType(m);
    if (!groups[t]) groups[t] = { reach: 0, consumption: 0, interactions: 0, count: 0 };
    groups[t].reach += m.reach ?? 0;
    groups[t].consumption += getConsumptionValue(m);
    groups[t].interactions += m.totalInteractions ?? 0;
    groups[t].count += 1;
  }

  return Object.entries(groups)
    .map(([type, { reach, consumption, interactions, count }]) => ({
      type,
      label: TYPE_META[type]?.label ?? type,
      color: TYPE_META[type]?.color ?? '#888',
      totalReach: reach,
      totalConsumption: consumption,
      totalInteractions: interactions,
      count,
    }))
    .sort((a, b) => b.totalReach - a.totalReach);
}

const fmtY = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n));

interface InstagramMediaTypeChartProps {
  media: IgMedia[];
  loading: boolean;
}

export const InstagramMediaTypeChart: React.FC<InstagramMediaTypeChartProps> = ({ media, loading }) => {
  if (loading) {
    return (
      <div className="px-6 pb-5">
        <div className="mb-4 h-5 w-56 rounded animate-shimmer" />
        <div className="h-40 w-full rounded-xl animate-shimmer" />
      </div>
    );
  }

  const data = buildChartData(media);
  if (data.length === 0) {
    return (
      <div className="px-6 pb-5">
        <p className="text-xs text-[hsl(var(--muted-foreground))]">Sem dados suficientes por tipo de midia.</p>
      </div>
    );
  }

  return (
    <div className="px-6 pb-5">
      <div className="mb-4">
        <div className="mr-2 inline-block h-5 w-0.5 align-middle rounded-full bg-gradient-to-b from-amber-500 to-orange-400" />
        <span className="text-[15px] font-bold text-[hsl(var(--foreground))]">Desempenho por tipo</span>
        <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">(totais de alcance e consumo)</span>
      </div>

      <div className="flex flex-col gap-3">
        {data.map(({ type, label, color, totalReach, totalConsumption, totalInteractions, count }) => {
          const maxVal = Math.max(...data.map((d) => Math.max(d.totalReach, d.totalConsumption)), 1);
          const consumptionLabel = getConsumptionLabel(type);

          return (
            <div key={type}>
              <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ background: color }} />
                  <span className="text-sm font-medium text-[hsl(var(--foreground))]">{label}</span>
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">({count} post{count !== 1 ? 's' : ''})</span>
                </div>
                <div className="flex items-center gap-4 text-xs tabular-nums">
                  <span className="text-[hsl(var(--muted-foreground))]">
                    <span className="font-semibold text-[hsl(var(--foreground))]">{fmtY(totalReach)}</span> alcance
                  </span>
                  <span className="text-[hsl(var(--muted-foreground))]">
                    <span className="font-semibold text-[hsl(var(--foreground))]">{fmtY(totalConsumption)}</span> {consumptionLabel}
                  </span>
                  <span className="text-[hsl(var(--muted-foreground))]">
                    <span className="font-semibold text-[hsl(var(--foreground))]">{fmtY(totalInteractions)}</span> inter.
                  </span>
                </div>
              </div>

              <div className="relative h-2 overflow-hidden rounded-full bg-[hsl(var(--secondary))]">
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${(totalConsumption / maxVal) * 100}%`, background: `${color}40` }}
                />
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${(totalReach / maxVal) * 100}%`, background: color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
