import React, { useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, CartesianGrid,
  XAxis, YAxis, Tooltip,
} from 'recharts';
import { IgDailyPoint } from '../hooks/useInstagramProfile';

type MetricKey = 'reach' | 'views' | 'followerDelta' | 'accountsEngaged';

const METRICS: { key: MetricKey; label: string; color: string }[] = [
  { key: 'reach',           label: 'Alcance',           color: 'hsl(220 100% 65%)' },
  { key: 'views',           label: 'Visualizações',      color: '#a855f7' },
  { key: 'accountsEngaged', label: 'Contas Engajadas',   color: '#ec4899' },
  { key: 'followerDelta',   label: 'Seguidores',         color: '#10b981' },
];

interface InstagramReachChartProps {
  series: IgDailyPoint[];
  loading: boolean;
}

const fmtY = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n);

export const InstagramReachChart: React.FC<InstagramReachChartProps> = ({ series, loading }) => {
  const [active, setActive] = useState<Set<MetricKey>>(new Set(['reach']));

  const toggle = (key: MetricKey) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="px-6 pb-5">
        <div className="h-5 w-48 rounded animate-shimmer mb-4" />
        <div className="h-52 w-full rounded-xl animate-shimmer" />
      </div>
    );
  }

  if (series.length === 0) {
    return (
      <div className="px-6 pb-5">
        <p className="text-xs text-[hsl(var(--muted-foreground))]">Sem dados de alcance para o período.</p>
      </div>
    );
  }

  return (
    <div className="px-6 pb-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="w-0.5 h-5 rounded-full bg-gradient-to-b from-[hsl(var(--primary))] to-violet-500 inline-block mr-2 align-middle" />
          <span className="text-[15px] font-bold text-[hsl(var(--foreground))]">Métricas diárias</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => toggle(m.key)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all"
              style={{
                borderColor: active.has(m.key) ? m.color : 'hsl(var(--border))',
                background: active.has(m.key) ? `${m.color}20` : 'transparent',
                color: active.has(m.key) ? m.color : 'hsl(var(--muted-foreground))',
              }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: active.has(m.key) ? m.color : 'hsl(var(--border))' }}
              />
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={series} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={fmtY}
          />
          <Tooltip
            contentStyle={{
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}
            formatter={(value: number, name: string) => [value.toLocaleString('pt-BR'), name]}
          />
          {METRICS.filter((m) => active.has(m.key)).map((m) => (
            <Line
              key={m.key}
              type="monotone"
              dataKey={m.key}
              name={m.label}
              stroke={m.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: m.color }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
