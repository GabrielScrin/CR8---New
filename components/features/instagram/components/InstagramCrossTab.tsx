import React, { useState } from 'react';
import { GitMerge, MessageCircle, Users, Image, Film, LayoutGrid, Clapperboard, Clock, ChevronDown, ChevronUp, RefreshCw, AlertCircle } from 'lucide-react';
import { IgCrossData, IgPostWithChats, IgLinkedChat } from '../hooks/useInstagramCross';

// ── Utilitários ─────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

// ── Tipo de mídia ────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  IMAGE:          { label: 'Imagem',    icon: Image,        color: 'hsl(220 100% 65%)' },
  VIDEO:          { label: 'Vídeo',     icon: Film,         color: '#a855f7' },
  CAROUSEL_ALBUM: { label: 'Carrossel', icon: LayoutGrid,   color: '#ec4899' },
  REEL:           { label: 'Reel',      icon: Clapperboard, color: '#f59e0b' },
};

function effectiveType(mediaType: string, mediaProductType: string): string {
  if (mediaType === 'VIDEO' && mediaProductType === 'REEL') return 'REEL';
  return mediaType;
}

// ── Card de resumo KPI ───────────────────────────────────────────────────────

const KpiChip: React.FC<{ label: string; value: number | string; color: string }> = ({ label, value, color }) => (
  <div className="flex flex-col items-center px-5 py-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
    <span className="text-[22px] font-extrabold tabular-nums" style={{ color }}>{value}</span>
    <span className="text-[11px] text-[hsl(var(--muted-foreground))] mt-0.5 text-center">{label}</span>
  </div>
);

// ── Lista de conversas vinculadas ────────────────────────────────────────────

const ChatList: React.FC<{ chats: IgLinkedChat[] }> = ({ chats }) => (
  <div className="mt-3 space-y-2">
    {chats.map((c) => (
      <div
        key={c.chatId}
        className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-[hsl(var(--secondary))]"
      >
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[hsl(var(--primary))] to-violet-500 flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="text-[10px] font-bold text-white">
            {(c.leadName ?? '?').charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[hsl(var(--foreground))] truncate">
              {c.leadName ?? 'Lead sem nome'}
            </span>
            <span className="text-[10px] text-[hsl(var(--muted-foreground))] flex items-center gap-1 whitespace-nowrap flex-shrink-0">
              <Clock className="w-3 h-3" />
              {c.hoursAfterPost}h depois · {formatDateTime(c.createdAt)}
            </span>
          </div>
          {c.lastMessage && (
            <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-0.5 truncate">
              {c.lastMessage}
            </p>
          )}
        </div>
      </div>
    ))}
  </div>
);

// ── Card de post com cruzamento ──────────────────────────────────────────────

const PostCrossCard: React.FC<{ item: IgPostWithChats }> = ({ item }) => {
  const [expanded, setExpanded] = useState(false);
  const { post, chats } = item;
  const type = effectiveType(post.mediaType, post.mediaProductType);
  const cfg = TYPE_CONFIG[type] ?? TYPE_CONFIG.IMAGE;
  const Icon = cfg.icon;
  const hasChats = chats.length > 0;
  const thumb = post.thumbnailUrl || post.mediaUrl;

  return (
    <div className={`rounded-xl border transition-colors ${hasChats ? 'border-[hsl(var(--border))] bg-[hsl(var(--card))]' : 'border-[hsl(var(--border))/50] bg-[hsl(var(--card))/50]'}`}>
      <div
        className={`flex items-start gap-3 p-3 ${hasChats ? 'cursor-pointer' : ''}`}
        onClick={() => hasChats && setExpanded((v) => !v)}
      >
        {/* Thumbnail */}
        <div className="w-12 h-12 rounded-lg overflow-hidden bg-[hsl(var(--secondary))] flex-shrink-0">
          {thumb ? (
            <img
              src={thumb}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Icon className="w-5 h-5 text-[hsl(var(--muted-foreground))]" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{ color: cfg.color, background: `${cfg.color}20` }}
            >
              <Icon className="w-2.5 h-2.5" />
              {cfg.label}
            </span>
            <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
              {formatDate(post.timestamp)}
            </span>
          </div>
          <p className="text-xs text-[hsl(var(--foreground))] line-clamp-1">
            {post.caption || <span className="italic text-[hsl(var(--muted-foreground))]">sem legenda</span>}
          </p>

          {/* Métricas rápidas */}
          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-[hsl(var(--muted-foreground))] tabular-nums">
            {post.reach != null && <span>👁 {post.reach.toLocaleString('pt-BR')} alcance</span>}
            {post.likeCount > 0 && <span>❤️ {post.likeCount.toLocaleString('pt-BR')}</span>}
          </div>
        </div>

        {/* Badge de conversas */}
        <div className="flex flex-col items-center flex-shrink-0">
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center ${hasChats ? 'bg-emerald-500/15' : 'bg-[hsl(var(--secondary))]'}`}
          >
            <MessageCircle
              className="w-4 h-4"
              style={{ color: hasChats ? '#10b981' : 'hsl(var(--muted-foreground))' }}
            />
          </div>
          <span
            className="text-[11px] font-bold mt-0.5 tabular-nums"
            style={{ color: hasChats ? '#10b981' : 'hsl(var(--muted-foreground))' }}
          >
            {chats.length}
          </span>
        </div>

        {/* Chevron */}
        {hasChats && (
          <div className="flex-shrink-0 self-center">
            {expanded
              ? <ChevronUp className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
              : <ChevronDown className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />}
          </div>
        )}
      </div>

      {/* Lista de conversas (expandível) */}
      {hasChats && expanded && (
        <div className="px-3 pb-3">
          <ChatList chats={chats} />
        </div>
      )}
    </div>
  );
};

// ── Componente principal ─────────────────────────────────────────────────────

interface InstagramCrossTabProps {
  data: IgCrossData;
  loading: boolean;
  error: string | null;
  onReload: () => void;
}

export const InstagramCrossTab: React.FC<InstagramCrossTabProps> = ({
  data,
  loading,
  error,
  onReload,
}) => {
  const [showAll, setShowAll] = useState(false);

  const visiblePosts = showAll
    ? data.posts
    : data.posts.filter((p) => p.chats.length > 0);

  return (
    <div className="pt-5 pb-8 px-6 flex flex-col gap-5">

      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <div className="w-0.5 h-5 rounded-full bg-gradient-to-b from-emerald-500 to-teal-400 inline-block mr-2 align-middle" />
          <span className="text-[15px] font-bold text-[hsl(var(--foreground))]">Cruzamento com Leads</span>
          <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">
            conversas abertas em até {data.windowHours}h após o post
          </span>
        </div>
        <button
          onClick={onReload}
          disabled={loading}
          className="p-1.5 rounded-lg text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Erro */}
      {error && (
        <div className="rounded-xl p-3 bg-red-500/10 border border-red-500/20 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      {/* KPIs de resumo */}
      {loading ? (
        <div className="grid grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl animate-shimmer" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <KpiChip label="Posts analisados" value={data.totalPosts} color="hsl(var(--foreground))" />
          <KpiChip label="Posts com leads" value={data.postsWithLeads} color="#10b981" />
          <KpiChip label="Conversas geradas" value={data.totalLeads} color="#a855f7" />
        </div>
      )}

      {/* Barra divisória + toggle */}
      <div className="flex items-center gap-3">
        <div className="flex-1 border-t border-[hsl(var(--border))]" />
        <button
          onClick={() => setShowAll((v) => !v)}
          className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors whitespace-nowrap"
        >
          {showAll
            ? `Mostrar só posts com leads (${data.postsWithLeads})`
            : `Mostrar todos os posts (${data.totalPosts})`}
        </button>
        <div className="flex-1 border-t border-[hsl(var(--border))]" />
      </div>

      {/* Lista de posts */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl animate-shimmer" />
          ))}
        </div>
      ) : visiblePosts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[hsl(var(--secondary))] flex items-center justify-center mb-3">
            <GitMerge className="w-6 h-6 text-[hsl(var(--muted-foreground))] opacity-40" />
          </div>
          <p className="text-sm font-medium text-[hsl(var(--foreground))] mb-1">
            Nenhum lead vinculado ainda
          </p>
          <p className="text-xs text-[hsl(var(--muted-foreground))] max-w-xs">
            Quando alguém enviar uma DM no Instagram em até {data.windowHours}h após um post,
            a conversa aparecerá aqui vinculada ao conteúdo.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visiblePosts.map((item) => (
            <PostCrossCard key={item.post.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
};
