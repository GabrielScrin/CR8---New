import React from 'react';
import { Instagram, RefreshCw, Users } from 'lucide-react';
import { IgPeriod } from '../hooks/useInstagramProfile';

const PERIOD_OPTIONS: { value: IgPeriod; label: string }[] = [
  { value: '7d',  label: '7 dias' },
  { value: '14d', label: '14 dias' },
  { value: '30d', label: '30 dias' },
];

interface InstagramHeaderProps {
  profilePicture?: string;
  username?: string;
  followersCount?: number;
  mediaCount?: number;
  period: IgPeriod;
  onPeriodChange: (p: IgPeriod) => void;
  loading: boolean;
  onReload: () => void;
}

const fmt = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `${(n / 1_000).toFixed(1)}k`
    : String(n);

export const InstagramHeader: React.FC<InstagramHeaderProps> = ({
  profilePicture,
  username,
  followersCount,
  mediaCount,
  period,
  onPeriodChange,
  loading,
  onReload,
}) => (
  <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-[hsl(var(--border))]">
    {/* Perfil */}
    <div className="flex items-center gap-3">
      {profilePicture ? (
        <img
          src={profilePicture}
          alt={username}
          className="w-10 h-10 rounded-full object-cover ring-2"
          style={{ ringColor: 'hsl(var(--border))' }}
        />
      ) : (
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg,#f09433,#dc2743,#bc1888)' }}
        >
          <Instagram className="w-5 h-5 text-white" />
        </div>
      )}

      <div>
        {loading && !username ? (
          <div className="h-4 w-28 rounded animate-shimmer mb-1" />
        ) : (
          <p className="text-sm font-bold text-[hsl(var(--foreground))]">
            @{username || '—'}
          </p>
        )}
        <div className="flex items-center gap-3 mt-0.5">
          {loading && followersCount == null ? (
            <div className="h-3 w-20 rounded animate-shimmer" />
          ) : (
            <>
              <span className="text-xs text-[hsl(var(--muted-foreground))]">
                <span className="font-semibold text-[hsl(var(--foreground))]">
                  {followersCount != null ? fmt(followersCount) : '—'}
                </span>{' '}
                seguidores
              </span>
              <span className="text-[hsl(var(--border))]">·</span>
              <span className="text-xs text-[hsl(var(--muted-foreground))]">
                <span className="font-semibold text-[hsl(var(--foreground))]">
                  {mediaCount != null ? fmt(mediaCount) : '—'}
                </span>{' '}
                posts
              </span>
            </>
          )}
        </div>
      </div>
    </div>

    {/* Controles */}
    <div className="flex items-center gap-2">
      {/* Seletor de período */}
      <div className="flex rounded-lg overflow-hidden border border-[hsl(var(--border))]">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onPeriodChange(opt.value)}
            className="px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              background: period === opt.value ? 'hsl(var(--primary))' : 'transparent',
              color: period === opt.value ? 'white' : 'hsl(var(--muted-foreground))',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Reload */}
      <button
        onClick={onReload}
        disabled={loading}
        className="p-2 rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors disabled:opacity-40"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
      </button>
    </div>
  </div>
);
