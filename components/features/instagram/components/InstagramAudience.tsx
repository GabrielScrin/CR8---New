import React from 'react';
import { IgAudienceAge, IgAudienceCity, IgAudienceGender } from '../hooks/useInstagramProfile';

interface InstagramAudienceProps {
  cities: IgAudienceCity[];
  ageGroups: IgAudienceAge[];
  gender: IgAudienceGender | null;
  loading: boolean;
}

const pct = (part: number, total: number) =>
  total > 0 ? ((part / total) * 100).toFixed(1) : '0.0';

export const InstagramAudience: React.FC<InstagramAudienceProps> = ({
  cities,
  ageGroups,
  gender,
  loading,
}) => {
  const noData = !loading && cities.length === 0 && ageGroups.length === 0;

  if (noData) {
    return (
      <div className="px-6 pb-6">
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          Dados de audiência indisponíveis — são necessários pelo menos 100 seguidores.
        </p>
      </div>
    );
  }

  const maxCityCount = cities[0]?.count ?? 1;
  const totalAge = ageGroups.reduce((s, a) => s + a.total, 0) || 1;

  return (
    <div className="px-6 pb-6 grid grid-cols-1 lg:grid-cols-3 gap-6">

      {/* Cidades */}
      <div className="lg:col-span-1">
        <div className="mb-3">
          <div className="w-0.5 h-5 rounded-full bg-gradient-to-b from-amber-500 to-orange-400 inline-block mr-2 align-middle" />
          <span className="text-[15px] font-bold text-[hsl(var(--foreground))]">Top Cidades</span>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-8 rounded animate-shimmer" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {cities.map(({ city, count }) => (
              <div key={city}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs text-[hsl(var(--foreground))] truncate max-w-[70%]">{city}</span>
                  <span className="text-xs text-[hsl(var(--muted-foreground))] tabular-nums">
                    {count.toLocaleString('pt-BR')}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-[hsl(var(--secondary))] overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(count / maxCityCount) * 100}%`,
                      background: 'linear-gradient(90deg, hsl(220 100% 65%), #a855f7)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Faixa etária */}
      <div className="lg:col-span-1">
        <div className="mb-3">
          <div className="w-0.5 h-5 rounded-full bg-gradient-to-b from-violet-500 to-purple-400 inline-block mr-2 align-middle" />
          <span className="text-[15px] font-bold text-[hsl(var(--foreground))]">Faixa Etária</span>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 rounded animate-shimmer" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {ageGroups.map(({ range, male, female, total }) => (
              <div key={range}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs text-[hsl(var(--foreground))]">{range}</span>
                  <span className="text-xs text-[hsl(var(--muted-foreground))] tabular-nums">
                    {pct(total, totalAge)}%
                  </span>
                </div>
                {/* Barra dividida M/F */}
                <div className="h-1.5 rounded-full bg-[hsl(var(--secondary))] overflow-hidden flex">
                  <div
                    className="h-full"
                    style={{
                      width: `${pct(male, total)}%`,
                      background: 'hsl(220 100% 65%)',
                    }}
                  />
                  <div
                    className="h-full"
                    style={{
                      width: `${pct(female, total)}%`,
                      background: '#ec4899',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Gênero */}
      <div className="lg:col-span-1">
        <div className="mb-3">
          <div className="w-0.5 h-5 rounded-full bg-gradient-to-b from-pink-500 to-rose-400 inline-block mr-2 align-middle" />
          <span className="text-[15px] font-bold text-[hsl(var(--foreground))]">Gênero</span>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 rounded animate-shimmer" />
            ))}
          </div>
        ) : gender ? (
          <div className="space-y-3">
            {[
              { label: 'Masculino', value: gender.male, color: 'hsl(220 100% 65%)' },
              { label: 'Feminino',  value: gender.female, color: '#ec4899' },
              { label: 'Não identificado', value: gender.unknown, color: 'hsl(var(--muted-foreground))' },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-[hsl(var(--foreground))]">{label}</span>
                  <span className="text-xs font-semibold tabular-nums" style={{ color }}>
                    {pct(value, gender.total)}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[hsl(var(--secondary))] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct(value, gender.total)}%`, background: color }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Sem dados de gênero.</p>
        )}
      </div>
    </div>
  );
};
