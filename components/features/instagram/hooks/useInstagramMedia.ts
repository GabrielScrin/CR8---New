import { useState, useCallback, useEffect } from 'react';
import { resolveIgToken, fetchGraphJson } from '../../../../lib/instagramToken';

const META_GRAPH_VERSION = import.meta.env.VITE_META_GRAPH_VERSION ?? 'v19.0';
const GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export type IgMediaType = 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';

export interface IgMedia {
  id: string;
  caption: string;
  mediaType: IgMediaType;
  mediaProductType: string; // 'REEL' | 'FEED' | 'STORY'
  mediaUrl: string;
  thumbnailUrl: string;
  timestamp: string;       // ISO 8601
  permalink: string;
  likeCount: number;
  commentsCount: number;
  // Insights (null se indisponível — ex.: conta sem permissão)
  reach: number | null;
  impressions: number | null;
  saved: number | null;
  videoViews: number | null;
}

// Busca insights de uma mídia individual; retorna nulls em caso de falha
async function fetchMediaInsights(
  mediaId: string,
  token: string,
  isVideo: boolean,
): Promise<Pick<IgMedia, 'reach' | 'impressions' | 'saved' | 'videoViews'>> {
  try {
    const metrics = isVideo
      ? 'reach,impressions,saved,video_views'
      : 'reach,impressions,saved';

    const json = await fetchGraphJson(
      `${GRAPH_BASE}/${mediaId}/insights?metric=${metrics}&access_token=${token}`,
    );

    const result: Pick<IgMedia, 'reach' | 'impressions' | 'saved' | 'videoViews'> = {
      reach: null,
      impressions: null,
      saved: null,
      videoViews: null,
    };

    for (const item of json.data ?? []) {
      // A API retorna o valor direto em item.values[0].value
      const val: number = item.values?.[0]?.value ?? item.value ?? null;
      if (item.name === 'reach')        result.reach = val;
      if (item.name === 'impressions')  result.impressions = val;
      if (item.name === 'saved')        result.saved = val;
      if (item.name === 'video_views')  result.videoViews = val;
    }

    return result;
  } catch {
    return { reach: null, impressions: null, saved: null, videoViews: null };
  }
}

export function useInstagramMedia(igUserId: string | null) {
  const [media, setMedia] = useState<IgMedia[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!igUserId) return;

    setLoading(true);
    setError(null);

    try {
      const token = await resolveIgToken();
      if (!token) {
        setError('Token de autenticação não encontrado. Reconecte sua conta Facebook.');
        return;
      }

      // Busca os últimos 25 posts com metadados básicos
      const mediaListJson = await fetchGraphJson(
        `${GRAPH_BASE}/${igUserId}/media` +
        `?fields=id,caption,media_type,media_product_type,media_url,thumbnail_url,timestamp,permalink,like_count,comments_count` +
        `&limit=25` +
        `&access_token=${token}`,
      );

      const rawItems: any[] = mediaListJson.data ?? [];

      // Busca insights de todos os posts em paralelo
      const withInsights: IgMedia[] = await Promise.all(
        rawItems.map(async (item): Promise<IgMedia> => {
          const isVideo = item.media_type === 'VIDEO';
          const insights = await fetchMediaInsights(item.id, token, isVideo);

          return {
            id: item.id,
            caption: item.caption ?? '',
            mediaType: item.media_type as IgMediaType,
            mediaProductType: item.media_product_type ?? 'FEED',
            mediaUrl: item.media_url ?? '',
            thumbnailUrl: item.thumbnail_url ?? item.media_url ?? '',
            timestamp: item.timestamp ?? '',
            permalink: item.permalink ?? '',
            likeCount: item.like_count ?? 0,
            commentsCount: item.comments_count ?? 0,
            ...insights,
          };
        }),
      );

      setMedia(withInsights);
    } catch (err: any) {
      setError(err?.message || 'Erro ao buscar posts do Instagram.');
    } finally {
      setLoading(false);
    }
  }, [igUserId]);

  useEffect(() => {
    load();
  }, [load]);

  return { media, loading, error, reload: load };
}
