import React, { useEffect, useState } from 'react';
import { Eye, Radio, TrendingUp, UserPlus, BarChart2, Heart } from 'lucide-react';

const useCountUp = (to: number, durationMs = 900): number => {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!Number.isFinite(to) || to === 0) { setVal(to); return; }
    let startTime: number | null = null;
    let rafId: number;
    const tick = (now: number) => {
      if (startTime === null) startTime = now;
      const t = Math.min((now - startTime) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(eased * to);
      if (t < 1) rafId = requestAnimationFrame(tick);
      else setVal(to);
    };
    setVal(0);
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [to, durationMs]);
  return val;
};

const fmt = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString('pt-BR');
};

interface KpiCardProps {
  label: string;
  value: number | null;
  icon: React.ElementType;
  gradient: string;
  loading: boolean;
  sign?: boolean;
}

const KpiCard: React.FC<KpiCardProps> = ({ label, value, icon: Icon, gradient, loading, sign }) => {
  const animated = useCountUp(value ?? 0);

  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br ${gradient}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>

      {loading || value == null ? (
        <div className="h-8 w-20 rounded-md animate-shimmer" />
      ) : (
        <p className="text-[26px] font-extrabold tracking-tight text-[hsl(var(--foreground))] leading-none tabular-nums">
          {sign && value > 0 ? '+' : ''}{fmt(Math.round(animated))}
        </p>
      )}

      <p className="text-xs text-[hsl(var(--muted-foreground))] font-medium">{label}</p>
    </div>
  );
};

interface InstagramKPICardsProps {
  totalReach: number;
  totalViews: number;
  totalProfileViews: number;
  totalFollowerGain: number;
  totalAccountsEngaged: number;
  followersCount: number | null;
  loading: boolean;
}

export const InstagramKPICards: React.FC<InstagramKPICardsProps> = ({
  totalReach,
  totalViews,
  totalProfileViews,
  totalFollowerGain,
  totalAccountsEngaged,
  followersCount,
  loading,
}) => (
  <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 px-6 py-5">
    <KpiCard
      label="Alcance"
      value={totalReach}
      icon={Radio}
      gradient="from-[hsl(var(--primary))] to-[hsl(220_80%_65%)]"
      loading={loading}
    />
    <KpiCard
      label="Visualizações"
      value={totalViews}
      icon={Eye}
      gradient="from-violet-500 to-purple-400"
      loading={loading}
    />
    <KpiCard
      label="Visitas ao Perfil"
      value={totalProfileViews}
      icon={TrendingUp}
      gradient="from-pink-500 to-rose-400"
      loading={loading}
    />
    <KpiCard
      label="Contas Engajadas"
      value={totalAccountsEngaged}
      icon={Heart}
      gradient="from-orange-500 to-amber-400"
      loading={loading}
    />
    <KpiCard
      label="Seguidores Ganhos"
      value={totalFollowerGain}
      icon={UserPlus}
      gradient="from-emerald-500 to-teal-400"
      loading={loading}
      sign
    />
    <KpiCard
      label="Total Seguidores"
      value={followersCount}
      icon={BarChart2}
      gradient="from-amber-500 to-orange-400"
      loading={loading}
    />
  </div>
);
