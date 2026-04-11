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
  // Insights por post (null se indisponível)
  reach: number | null;
  saved: number | null;
  videoViews: number | null;
  totalInteractions: number | null; // likes + comments + shares + saves (via insights)
}

// Métricas suportadas por tipo (impressions removida a partir da v22.0)
async function fetchMediaInsights(
  mediaId: string,
  token: string,
  isVideo: boolean,
): Promise<Pick<IgMedia, 'reach' | 'saved' | 'videoViews' | 'totalInteractions'>> {
  const empty = { reach: null, saved: null, videoViews: null, totalInteractions: null };
  try {
    const metrics = isVideo
      ? 'reach,saved,video_views,total_interactions'
      : 'reach,saved,total_interactions';

    const json = await fetchGraphJson(
      `${GRAPH_BASE}/${mediaId}/insights?metric=${metrics}&access_token=${token}`,
    );

    const result = { ...empty };

    for (const item of json.data ?? []) {
      // A API retorna o valor em item.values[0].value (série) ou item.value (simples)
      const val: number = item.values?.[0]?.value ?? item.value ?? null;
      if (item.name === 'reach')              result.reach = val;
      if (item.name === 'saved')              result.saved = val;
      if (item.name === 'video_views')        result.videoViews = val;
      if (item.name === 'total_interactions') result.totalInteractions = val;
    }

    return result;
  } catch {
    return empty;
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

      const mediaListJson = await fetchGraphJson(
        `${GRAPH_BASE}/${igUserId}/media` +
        `?fields=id,caption,media_type,media_product_type,media_url,thumbnail_url,timestamp,permalink` +
        `&limit=25` +
        `&access_token=${token}`,
      );

      const rawItems: any[] = mediaListJson.data ?? [];

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
