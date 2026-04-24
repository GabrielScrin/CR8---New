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
  timestamp: string; // ISO 8601
  permalink: string;
  reach: number | null;
  impressions: number | null;
  saved: number | null;
  shares: number | null;
  videoViews: number | null;
  commentsCount: number | null;
  likeCount: number | null;
  totalInteractions: number | null; // likes + comments + shares + saves
}

const extractInsightValue = (item: any): number | null => {
  const value =
    item?.total_value?.value ??
    item?.values?.[0]?.value ??
    item?.value ??
    null;

  return typeof value === 'number' ? value : null;
};

async function fetchMediaInsights(
  mediaId: string,
  token: string,
  mediaProductType: string,
  isVideo: boolean,
): Promise<Pick<IgMedia, 'reach' | 'impressions' | 'saved' | 'shares' | 'videoViews'>> {
  const empty = { reach: null, impressions: null, saved: null, shares: null, videoViews: null };

  try {
    const normalizedProductType = String(mediaProductType || '').toUpperCase();
    const result = { ...empty };
    const metrics = ['reach'];

    if (normalizedProductType === 'FEED') metrics.push('impressions');
    if (normalizedProductType !== 'STORY') metrics.push('saved');
    if (normalizedProductType === 'FEED' || normalizedProductType === 'REEL' || normalizedProductType === 'REELS') metrics.push('shares');
    if (isVideo) metrics.push(normalizedProductType === 'REELS' ? 'views' : 'video_views');

    for (const metric of metrics) {
      try {
        const json = await fetchGraphJson(
          `${GRAPH_BASE}/${mediaId}/insights?metric=${metric}&access_token=${token}`,
        );

        for (const item of json.data ?? []) {
          const value = extractInsightValue(item);

          if (item.name === 'reach') result.reach = value;
          if (item.name === 'impressions') result.impressions = value;
          if (item.name === 'saved') result.saved = value;
          if (item.name === 'shares') result.shares = value;
          if (item.name === 'video_views' || item.name === 'views') result.videoViews = value;
        }
      } catch {
        // Alguns tipos de mídia não suportam todas as métricas. Mantemos as demais.
      }
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
        setError('Token de autenticaÃ§Ã£o nÃ£o encontrado. Reconecte sua conta Facebook.');
        return;
      }

      const mediaListJson = await fetchGraphJson(
        `${GRAPH_BASE}/${igUserId}/media` +
          `?fields=id,caption,comments_count,like_count,media_type,media_product_type,media_url,thumbnail_url,timestamp,permalink` +
          `&limit=25` +
          `&access_token=${token}`,
      );

      const rawItems: any[] = mediaListJson.data ?? [];

      const withInsights: IgMedia[] = await Promise.all(
        rawItems.map(async (item): Promise<IgMedia> => {
          const isVideo = item.media_type === 'VIDEO';
          const commentsCount = typeof item.comments_count === 'number' ? item.comments_count : null;
          const likeCount = typeof item.like_count === 'number' ? item.like_count : null;
          const insights = await fetchMediaInsights(item.id, token, item.media_product_type ?? '', isVideo);
          const totalInteractions = [likeCount, commentsCount, insights.saved, insights.shares]
            .filter((value): value is number => typeof value === 'number')
            .reduce((sum, value) => sum + value, 0);

          return {
            id: item.id,
            caption: item.caption ?? '',
            mediaType: item.media_type as IgMediaType,
            mediaProductType: item.media_product_type ?? 'FEED',
            mediaUrl: item.media_url ?? '',
            thumbnailUrl: item.thumbnail_url ?? item.media_url ?? '',
            timestamp: item.timestamp ?? '',
            permalink: item.permalink ?? '',
            reach: insights.reach,
            impressions: insights.impressions,
            saved: insights.saved,
            shares: insights.shares,
            videoViews: insights.videoViews,
            commentsCount,
            likeCount,
            totalInteractions,
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
