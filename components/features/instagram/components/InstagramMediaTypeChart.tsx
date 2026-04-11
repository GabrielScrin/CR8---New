import React from 'react';
import {
  ResponsiveContainer, BarChart, Bar, CartesianGrid,
  XAxis, YAxis, Tooltip, Legend,
} from 'recharts';
import { IgMedia } from '../hooks/useInstagramMedia';

// Rótulos e cores por tipo de mídia
const TYPE_META: Record<string, { label: string; color: string }> = {
  IMAGE:           { label: 'Imagem',    color: 'hsl(220 100% 65%)' },
  VIDEO:           { label: 'Vídeo',     color: '#a855f7' },
  CAROUSEL_ALBUM:  { label: 'Carrossel', color: '#ec4899' },
  REEL:            { label: 'Reel',      color: '#f59e0b' },
};

// Detecta o "tipo efetivo" da mídia (diferencia Reel de Vídeo comum)
function effectiveType(m: IgMedia): string {
  if (m.mediaType === 'VIDEO' && m.mediaProductType === 'REEL') return 'REEL';
  return m.mediaType;
}

interface ChartPoint {
  type: string;
  label: string;
  color: string;
  avgReach: number;
  avgImpressions: number;
  count: number;
}

function buildChartData(media: IgMedia[]): ChartPoint[] {
  const groups: Record<string, { reach: number; impressions: number; count: number }> = {};

  for (const m of media) {
    const t = effectiveType(m);
    if (!groups[t]) groups[t] = { reach: 0, impressions: 0, count: 0 };
    groups[t].reach       += m.reach ?? 0;
    groups[t].impressions += m.impressions ?? 0;
    groups[t].count       += 1;
  }

  return Object.entries(groups)
    .map(([type, { reach, impressions, count }]) => ({
      type,
      label:          TYPE_META[type]?.label ?? type,
      color:          TYPE_META[type]?.color ?? '#888',
      avgReach:       count > 0 ? Math.round(reach / count) : 0,
      avgImpressions: count > 0 ? Math.round(impressions / count) : 0,
      count,
    }))
    .sort((a, b) => b.avgReach - a.avgReach);
}

const fmtY = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n);

interface InstagramMediaTypeChartProps {
  media: IgMedia[];
  loading: boolean;
}

export const InstagramMediaTypeChart: React.FC<InstagramMediaTypeChartProps> = ({ media, loading }) => {
  if (loading) {
    return (
      <div className="px-6 pb-5">
        <div className="h-5 w-56 rounded animate-shimmer mb-4" />
        <div className="h-40 w-full rounded-xl animate-shimmer" />
      </div>
    );
  }

  const data = buildChartData(media);
  if (data.length === 0) {
    return (
      <div className="px-6 pb-5">
        <p className="text-xs text-[hsl(var(--muted-foreground))]">Sem dados suficientes por tipo de mídia.</p>
      </div>
    );
  }

  // Usa os dados como está — cada barra já tem sua cor pelo tipo
  // Precisamos de barras com cores individuais; usamos Cell via composição customizada
  return (
    <div className="px-6 pb-5">
      <div className="mb-4">
        <div className="w-0.5 h-5 rounded-full bg-gradient-to-b from-amber-500 to-orange-400 inline-block mr-2 align-middle" />
        <span className="text-[15px] font-bold text-[hsl(var(--foreground))]">Desempenho por tipo</span>
        <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">(média de alcance e impressões)</span>
      </div>

      <div className="flex flex-col gap-3">
        {data.map(({ type, label, color, avgReach, avgImpressions, count }) => {
          const maxVal = Math.max(...data.map((d) => d.avgImpressions), 1);
          return (
            <div key={type}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                    style={{ background: color }}
                  />
                  <span className="text-sm font-medium text-[hsl(var(--foreground))]">{label}</span>
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">({count} post{count !== 1 ? 's' : ''})</span>
                </div>
                <div className="flex items-center gap-4 text-xs tabular-nums">
                  <span className="text-[hsl(var(--muted-foreground))]">
                    <span className="font-semibold text-[hsl(var(--foreground))]">{fmtY(avgReach)}</span> alcance
                  </span>
                  <span className="text-[hsl(var(--muted-foreground))]">
                    <span className="font-semibold text-[hsl(var(--foreground))]">{fmtY(avgImpressions)}</span> impr.
                  </span>
                </div>
              </div>
              {/* Barra dupla: reach (sólido) + impressões (translúcido) */}
              <div className="h-2 rounded-full bg-[hsl(var(--secondary))] overflow-hidden relative">
                {/* Fundo = impressões */}
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${(avgImpressions / maxVal) * 100}%`, background: `${color}40` }}
                />
                {/* Frente = alcance */}
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${(avgReach / maxVal) * 100}%`, background: color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
