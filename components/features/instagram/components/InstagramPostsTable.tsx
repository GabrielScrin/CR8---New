import React, { useState, useMemo } from 'react';
import { ExternalLink, Image, Film, LayoutGrid, Clapperboard, RefreshCw, AlertCircle, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { IgMedia, IgMediaType } from '../hooks/useInstagramMedia';

// ── Utilitários ─────────────────────────────────────────────────────────────

function effectiveType(m: IgMedia): string {
  if (m.mediaType === 'VIDEO' && m.mediaProductType === 'REEL') return 'REEL';
  return m.mediaType;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

const fmt = (n: number | null): string => {
  if (n === null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString('pt-BR');
};

// ── Tipo badge ───────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  IMAGE:          { label: 'Imagem',    icon: Image,       color: 'hsl(220 100% 65%)', bg: 'hsl(220 100% 65% / 0.12)' },
  VIDEO:          { label: 'Vídeo',     icon: Film,        color: '#a855f7',            bg: '#a855f720' },
  CAROUSEL_ALBUM: { label: 'Carrossel', icon: LayoutGrid,  color: '#ec4899',            bg: '#ec489920' },
  REEL:           { label: 'Reel',      icon: Clapperboard, color: '#f59e0b',           bg: '#f59e0b20' },
};

const TypeBadge: React.FC<{ type: string }> = ({ type }) => {
  const cfg = TYPE_CONFIG[type] ?? TYPE_CONFIG.IMAGE;
  const Icon = cfg.icon;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ color: cfg.color, background: cfg.bg }}
    >
      <Icon className="w-2.5 h-2.5" />
      {cfg.label}
    </span>
  );
};

// ── Tipos de filtro / ordenação ──────────────────────────────────────────────

type FilterType = 'ALL' | IgMediaType | 'REEL';

type SortKey = 'timestamp' | 'reach' | 'impressions' | 'likeCount' | 'commentsCount' | 'saved';

interface SortState {
  key: SortKey;
  dir: 'asc' | 'desc';
}

// ── Cabeçalho de coluna ordenável ────────────────────────────────────────────

interface SortHeaderProps {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
}

const SortHeader: React.FC<SortHeaderProps> = ({ label, sortKey, sort, onSort }) => {
  const active = sort.key === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className="flex items-center gap-0.5 text-xs font-semibold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
    >
      {label}
      {active
        ? sort.dir === 'desc'
          ? <ArrowDown className="w-3 h-3" />
          : <ArrowUp className="w-3 h-3" />
        : <ArrowUpDown className="w-3 h-3 opacity-30" />}
    </button>
  );
};

// ── Linha de shimmer ─────────────────────────────────────────────────────────

const ShimmerRow: React.FC = () => (
  <tr>
    <td className="px-3 py-2.5">
      <div className="w-10 h-10 rounded-lg animate-shimmer" />
    </td>
    <td className="px-3 py-2.5">
      <div className="h-3.5 w-32 rounded animate-shimmer" />
    </td>
    <td className="px-3 py-2.5">
      <div className="h-5 w-16 rounded-full animate-shimmer" />
    </td>
    {[...Array(5)].map((_, i) => (
      <td key={i} className="px-3 py-2.5 text-right">
        <div className="h-3.5 w-10 rounded animate-shimmer ml-auto" />
      </td>
    ))}
    <td className="px-3 py-2.5">
      <div className="w-6 h-6 rounded animate-shimmer mx-auto" />
    </td>
  </tr>
);

// ── Componente principal ─────────────────────────────────────────────────────

interface InstagramPostsTableProps {
  media: IgMedia[];
  loading: boolean;
  error: string | null;
  onReload: () => void;
}

export const InstagramPostsTable: React.FC<InstagramPostsTableProps> = ({
  media,
  loading,
  error,
  onReload,
}) => {
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [sort, setSort] = useState<SortState>({ key: 'timestamp', dir: 'desc' });

  const handleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
        : { key, dir: 'desc' },
    );
  };

  // Filtros disponíveis com contagem
  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: media.length };
    for (const m of media) {
      const t = effectiveType(m);
      c[t] = (c[t] ?? 0) + 1;
    }
    return c;
  }, [media]);

  const FILTER_TABS: { id: FilterType; label: string }[] = [
    { id: 'ALL',           label: 'Todos' },
    { id: 'IMAGE',         label: 'Imagem' },
    { id: 'VIDEO',         label: 'Vídeo' },
    { id: 'CAROUSEL_ALBUM',label: 'Carrossel' },
    { id: 'REEL',          label: 'Reel' },
  ].filter((f) => f.id === 'ALL' || (counts[f.id] ?? 0) > 0);

  const filtered = useMemo(() => {
    const items =
      filter === 'ALL'
        ? media
        : media.filter((m) => effectiveType(m) === filter);

    return [...items].sort((a, b) => {
      let va: number, vb: number;
      if (sort.key === 'timestamp') {
        va = new Date(a.timestamp).getTime();
        vb = new Date(b.timestamp).getTime();
      } else {
        va = a[sort.key] ?? -1;
        vb = b[sort.key] ?? -1;
      }
      return sort.dir === 'desc' ? vb - va : va - vb;
    });
  }, [media, filter, sort]);

  return (
    <div>
      {/* Cabeçalho com filtros */}
      <div className="px-6 mb-4 flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="w-0.5 h-5 rounded-full bg-gradient-to-b from-violet-500 to-purple-400 inline-block mr-2 align-middle" />
          <span className="text-[15px] font-bold text-[hsl(var(--foreground))]">Posts</span>
          {!loading && (
            <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">({media.length} mais recentes)</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {FILTER_TABS.map(({ id, label }) => {
            const active = filter === id;
            const cfg = id !== 'ALL' ? TYPE_CONFIG[id] : null;
            return (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className="px-2.5 py-1 rounded-full text-xs font-medium border transition-all"
                style={{
                  borderColor: active ? (cfg?.color ?? 'hsl(var(--foreground))') : 'hsl(var(--border))',
                  background: active ? (cfg ? `${cfg.color}20` : 'hsl(var(--foreground) / 0.08)') : 'transparent',
                  color: active ? (cfg?.color ?? 'hsl(var(--foreground))') : 'hsl(var(--muted-foreground))',
                }}
              >
                {label}
                {counts[id] != null && (
                  <span className="ml-1 opacity-60">{counts[id]}</span>
                )}
              </button>
            );
          })}

          <button
            onClick={onReload}
            disabled={loading}
            className="ml-1 p-1.5 rounded-lg text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Erro */}
      {error && (
        <div className="mx-6 mb-4 rounded-xl p-3 bg-red-500/10 border border-red-500/20 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      {/* Tabela */}
      <div className="px-6 pb-6 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="border-b border-[hsl(var(--border))]">
              <th className="px-3 py-2 text-left w-14" />
              <th className="px-3 py-2 text-left text-xs font-semibold text-[hsl(var(--muted-foreground))]">Legenda</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-[hsl(var(--muted-foreground))]">Tipo</th>
              <th className="px-3 py-2 text-right">
                <SortHeader label="Data" sortKey="timestamp" sort={sort} onSort={handleSort} />
              </th>
              <th className="px-3 py-2 text-right">
                <SortHeader label="Alcance" sortKey="reach" sort={sort} onSort={handleSort} />
              </th>
              <th className="px-3 py-2 text-right">
                <SortHeader label="Impr." sortKey="impressions" sort={sort} onSort={handleSort} />
              </th>
              <th className="px-3 py-2 text-right">
                <SortHeader label="Curtidas" sortKey="likeCount" sort={sort} onSort={handleSort} />
              </th>
              <th className="px-3 py-2 text-right">
                <SortHeader label="Coments." sortKey="commentsCount" sort={sort} onSort={handleSort} />
              </th>
              <th className="px-3 py-2 text-right">
                <SortHeader label="Salvos" sortKey="saved" sort={sort} onSort={handleSort} />
              </th>
              <th className="px-3 py-2 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[hsl(var(--border))]">
            {loading
              ? Array.from({ length: 6 }).map((_, i) => <ShimmerRow key={i} />)
              : filtered.map((m) => {
                  const type = effectiveType(m);
                  const thumb = m.thumbnailUrl || m.mediaUrl;

                  return (
                    <tr
                      key={m.id}
                      className="hover:bg-[hsl(var(--secondary))/40] transition-colors group"
                    >
                      {/* Thumbnail */}
                      <td className="px-3 py-2.5">
                        {thumb ? (
                          <div
                            className="w-10 h-10 rounded-lg overflow-hidden bg-[hsl(var(--secondary))] flex-shrink-0"
                          >
                            <img
                              src={thumb}
                              alt=""
                              className="w-full h-full object-cover"
                              loading="lazy"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-[hsl(var(--secondary))]" />
                        )}
                      </td>

                      {/* Caption */}
                      <td className="px-3 py-2.5 max-w-[180px]">
                        <p className="text-xs text-[hsl(var(--foreground))] line-clamp-2 leading-relaxed">
                          {m.caption || <span className="text-[hsl(var(--muted-foreground))] italic">sem legenda</span>}
                        </p>
                      </td>

                      {/* Tipo */}
                      <td className="px-3 py-2.5">
                        <TypeBadge type={type} />
                      </td>

                      {/* Data */}
                      <td className="px-3 py-2.5 text-right text-xs text-[hsl(var(--muted-foreground))] tabular-nums whitespace-nowrap">
                        {formatDate(m.timestamp)}
                      </td>

                      {/* Alcance */}
                      <td className="px-3 py-2.5 text-right text-xs font-semibold text-[hsl(var(--foreground))] tabular-nums">
                        {fmt(m.reach)}
                      </td>

                      {/* Impressões */}
                      <td className="px-3 py-2.5 text-right text-xs text-[hsl(var(--foreground))] tabular-nums">
                        {fmt(m.impressions)}
                      </td>

                      {/* Curtidas */}
                      <td className="px-3 py-2.5 text-right text-xs text-[hsl(var(--foreground))] tabular-nums">
                        {fmt(m.likeCount)}
                      </td>

                      {/* Comentários */}
                      <td className="px-3 py-2.5 text-right text-xs text-[hsl(var(--foreground))] tabular-nums">
                        {fmt(m.commentsCount)}
                      </td>

                      {/* Salvos */}
                      <td className="px-3 py-2.5 text-right text-xs text-[hsl(var(--foreground))] tabular-nums">
                        {fmt(m.saved)}
                      </td>

                      {/* Link externo */}
                      <td className="px-3 py-2.5 text-center">
                        <a
                          href={m.permalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center w-6 h-6 rounded opacity-0 group-hover:opacity-100 transition-opacity text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </td>
                    </tr>
                  );
                })}

            {/* Estado vazio */}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-xs text-[hsl(var(--muted-foreground))]">
                  Nenhum post encontrado para o filtro selecionado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
