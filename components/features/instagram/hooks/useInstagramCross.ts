import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../../../../lib/supabase';
import { IgMedia } from './useInstagramMedia';

// Conversa do Instagram DM vinculada a um post orgânico
export interface IgLinkedChat {
  chatId: string;
  leadId: string | null;
  leadName: string | null;
  createdAt: string; // ISO
  lastMessage: string | null;
  hoursAfterPost: number; // horas depois da publicação do post
}

// Post enriquecido com as conversas que gerou
export interface IgPostWithChats {
  post: IgMedia;
  chats: IgLinkedChat[];
}

export interface IgCrossData {
  posts: IgPostWithChats[];
  totalPosts: number;
  postsWithLeads: number;
  totalLeads: number;
  windowHours: number;
}

const WINDOW_HOURS = 72; // janela de atribuição

export function useInstagramCross(
  companyId: string | null,
  media: IgMedia[],
  mediaLoading: boolean,
) {
  const [data, setData] = useState<IgCrossData>({
    posts: [],
    totalPosts: 0,
    postsWithLeads: 0,
    totalLeads: 0,
    windowHours: WINDOW_HOURS,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Aguarda os posts do Instagram carregarem antes de continuar
    if (!companyId || mediaLoading || media.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      // Determina o intervalo de datas coberto pelos posts
      const timestamps = media.map((m) => new Date(m.timestamp).getTime());
      const oldestPost = new Date(Math.min(...timestamps));
      // Janela de busca: desde o post mais antigo até agora + 72h para cobrir todos
      const since = oldestPost.toISOString();

      // Busca todas as conversas Instagram desta empresa no período
      const { data: chatsRaw, error: chatsError } = await supabase
        .from('chats')
        .select('id, lead_id, created_at, last_message')
        .eq('company_id', companyId)
        .eq('platform', 'instagram')
        .gte('created_at', since)
        .order('created_at', { ascending: true });

      if (chatsError) throw new Error(chatsError.message);

      const chats = chatsRaw ?? [];

      // Resolve nomes dos leads (em lote, uma só query)
      const leadIds = [...new Set(chats.map((c: any) => c.lead_id).filter(Boolean))];
      const leadNameMap: Record<string, string> = {};

      if (leadIds.length > 0) {
        const { data: leadsRaw } = await supabase
          .from('leads')
          .select('id, name')
          .in('id', leadIds);

        for (const l of leadsRaw ?? []) {
          leadNameMap[l.id] = l.name;
        }
      }

      // Cruza posts com conversas dentro da janela de 72h
      const windowMs = WINDOW_HOURS * 60 * 60 * 1000;

      const posts: IgPostWithChats[] = media.map((post) => {
        const postTime = new Date(post.timestamp).getTime();
        const windowEnd = postTime + windowMs;

        const linked: IgLinkedChat[] = chats
          .filter((c: any) => {
            const chatTime = new Date(c.created_at).getTime();
            return chatTime >= postTime && chatTime <= windowEnd;
          })
          .map((c: any) => ({
            chatId: c.id,
            leadId: c.lead_id ?? null,
            leadName: c.lead_id ? (leadNameMap[c.lead_id] ?? null) : null,
            createdAt: c.created_at,
            lastMessage: c.last_message ?? null,
            hoursAfterPost: Math.round(
              (new Date(c.created_at).getTime() - postTime) / (1000 * 60 * 60),
            ),
          }));

        return { post, chats: linked };
      });

      // Ordena: posts com mais leads primeiro
      posts.sort((a, b) => b.chats.length - a.chats.length);

      const postsWithLeads = posts.filter((p) => p.chats.length > 0).length;
      const totalLeads = posts.reduce((s, p) => s + p.chats.length, 0);

      setData({
        posts,
        totalPosts: posts.length,
        postsWithLeads,
        totalLeads,
        windowHours: WINDOW_HOURS,
      });
    } catch (err: any) {
      setError(err?.message || 'Erro ao cruzar dados.');
    } finally {
      setLoading(false);
    }
  }, [companyId, media, mediaLoading]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}
