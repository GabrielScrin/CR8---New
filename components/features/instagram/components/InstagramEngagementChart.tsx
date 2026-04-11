import React from 'react';
import {
  ResponsiveContainer, BarChart, Bar, CartesianGrid,
  XAxis, YAxis, Tooltip,
} from 'recharts';
import { IgDailyPoint } from '../hooks/useInstagramProfile';

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

interface DowPoint {
  day: string;
  reach: number;
  impressions: number;
}

function aggregateByDow(series: IgDailyPoint[]): DowPoint[] {
  const map: Record<number, { reach: number; impressions: number; count: number }> = {};
  for (let i = 0; i < 7; i++) map[i] = { reach: 0, impressions: 0, count: 0 };

  for (const p of series) {
    map[p.dayOfWeek].reach += p.reach;
    map[p.dayOfWeek].impressions += p.impressions;
    map[p.dayOfWeek].count += 1;
  }

  return DAY_LABELS.map((day, i) => ({
    day,
    reach: map[i].count > 0 ? Math.round(map[i].reach / map[i].count) : 0,
    impressions: map[i].count > 0 ? Math.round(map[i].impressions / map[i].count) : 0,
  }));
}

const fmtY = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n);

interface InstagramEngagementChartProps {
  series: IgDailyPoint[];
  loading: boolean;
}

export const InstagramEngagementChart: React.FC<InstagramEngagementChartProps> = ({ series, loading }) => {
  const dowData = aggregateByDow(series);

  if (loading) {
    return (
      <div className="px-6 pb-5">
        <div className="h-5 w-48 rounded animate-shimmer mb-4" />
        <div className="h-44 w-full rounded-xl animate-shimmer" />
      </div>
    );
  }

  const hasData = dowData.some((d) => d.reach > 0);

  return (
    <div className="px-6 pb-5">
      <div className="mb-4">
        <div className="w-0.5 h-5 rounded-full bg-gradient-to-b from-pink-500 to-rose-400 inline-block mr-2 align-middle" />
        <span className="text-[15px] font-bold text-[hsl(var(--foreground))]">Alcance por dia da semana</span>
        <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">(média do período)</span>
      </div>

      {!hasData ? (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">Sem dados suficientes para o período.</p>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={dowData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
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
            <Bar
              dataKey="reach"
              name="Alcance (média)"
              fill="hsl(220 100% 65%)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};
