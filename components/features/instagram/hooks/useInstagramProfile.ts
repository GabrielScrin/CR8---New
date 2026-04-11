import { useState, useEffect, useCallback } from 'react';
import { resolveIgToken, fetchGraphJson } from '../../../../lib/instagramToken';

const META_GRAPH_VERSION = import.meta.env.VITE_META_GRAPH_VERSION ?? 'v19.0';
const GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export type IgPeriod = '7d' | '14d' | '30d';

export interface IgProfile {
  username: string;
  name: string;
  biography: string;
  followersCount: number;
  followsCount: number;
  mediaCount: number;
  profilePictureUrl: string;
  website: string;
}

// Ponto de dado diário para séries temporais
export interface IgDailyPoint {
  date: string;       // "DD/MM"
  dateIso: string;    // "YYYY-MM-DD"
  dayOfWeek: number;  // 0=Dom ... 6=Sáb
  reach: number;
  impressions: number;
  profileViews: number;
  followerDelta: number; // ganho/perda de seguidores naquele dia
}

// Dados de audiência
export interface IgAudienceCity {
  city: string;
  count: number;
}

export interface IgAudienceAge {
  range: string;   // "18-24"
  male: number;
  female: number;
  total: number;
}

export interface IgAudienceGender {
  male: number;
  female: number;
  unknown: number;
  total: number;
}

export interface IgProfileData {
  profile: IgProfile | null;
  series: IgDailyPoint[];
  cities: IgAudienceCity[];
  ageGroups: IgAudienceAge[];
  gender: IgAudienceGender | null;
  // KPI totais do período
  totalReach: number;
  totalImpressions: number;
  totalProfileViews: number;
  totalFollowerGain: number;
}


function periodToDates(period: IgPeriod): { since: number; until: number } {
  const days = period === '7d' ? 7 : period === '14d' ? 14 : 30;
  const until = Math.floor(Date.now() / 1000);
  const since = until - days * 86400;
  return { since, until };
}

function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function dayOfWeek(isoDate: string): number {
  return new Date(isoDate).getDay(); // 0=Dom ... 6=Sáb
}

// Converte o end_time da API (ex: "2024-01-02T08:00:00+0000") para "YYYY-MM-DD"
function endTimeToIso(endTime: string): string {
  return endTime.substring(0, 10);
}

async function fetchDailyInsightsWithFallback(
  igUserId: string,
  token: string,
  since: number,
  until: number,
) {
  const metricSets = [
    'reach,impressions,profile_views,follower_count',
    'reach,impressions,follower_count',
  ];

  let lastError: unknown = null;
  for (const metrics of metricSets) {
    try {
      return await fetchGraphJson(
        `${GRAPH_BASE}/${igUserId}/insights` +
        `?metric=${metrics}` +
        `&period=day` +
        `&since=${since}&until=${until}` +
        `&access_token=${token}`,
      );
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError ?? new Error('Erro ao buscar insights do Instagram.');
}

export function useInstagramProfile(igUserId: string | null, period: IgPeriod) {
  const [data, setData] = useState<IgProfileData>({
    profile: null,
    series: [],
    cities: [],
    ageGroups: [],
    gender: null,
    totalReach: 0,
    totalImpressions: 0,
    totalProfileViews: 0,
    totalFollowerGain: 0,
  });
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

      const { since, until } = periodToDates(period);

      // ── Requisições em paralelo ────────────────────────────────────────────
      const [profileResult, insightsResult, audienceResult] = await Promise.allSettled([
        fetchGraphJson(
          `${GRAPH_BASE}/${igUserId}` +
          `?fields=username,name,biography,followers_count,follows_count,media_count,profile_picture_url,website` +
          `&access_token=${token}`,
        ),
        fetchDailyInsightsWithFallback(igUserId, token, since, until),
        fetchGraphJson(
          `${GRAPH_BASE}/${igUserId}/insights` +
          `?metric=audience_city,audience_gender_age` +
          `&period=lifetime` +
          `&access_token=${token}`,
        ),
      ]);

      if (profileResult.status !== 'fulfilled') {
        throw profileResult.reason;
      }

      const profileJson = profileResult.value;
      const insightsJson = insightsResult.status === 'fulfilled' ? insightsResult.value : { data: [] };
      const audienceJson = audienceResult.status === 'fulfilled' ? audienceResult.value : { data: [] };

      // ── Perfil ────────────────────────────────────────────────────────────
      const profile: IgProfile = {
        username: profileJson.username ?? '',
        name: profileJson.name ?? '',
        biography: profileJson.biography ?? '',
        followersCount: profileJson.followers_count ?? 0,
        followsCount: profileJson.follows_count ?? 0,
        mediaCount: profileJson.media_count ?? 0,
        profilePictureUrl: profileJson.profile_picture_url ?? '',
        website: profileJson.website ?? '',
      };

      // ── Insights diários → série temporal ─────────────────────────────────
      const metricsMap: Record<string, Record<string, number>> = {
        reach: {},
        impressions: {},
        profile_views: {},
        follower_count: {},
      };

      for (const metric of (insightsJson.data ?? [])) {
        const name: string = metric.name;
        if (!metricsMap[name]) continue;
        for (const point of (metric.values ?? [])) {
          const iso = endTimeToIso(point.end_time);
          metricsMap[name][iso] = (metricsMap[name][iso] ?? 0) + (point.value ?? 0);
        }
      }

      // Une todos os dias em que há pelo menos um dado
      const allDates = Array.from(
        new Set([
          ...Object.keys(metricsMap.reach),
          ...Object.keys(metricsMap.impressions),
        ]),
      ).sort();

      const series: IgDailyPoint[] = allDates.map((iso) => ({
        date: formatDate(iso),
        dateIso: iso,
        dayOfWeek: dayOfWeek(iso),
        reach: metricsMap.reach[iso] ?? 0,
        impressions: metricsMap.impressions[iso] ?? 0,
        profileViews: metricsMap.profile_views[iso] ?? 0,
        followerDelta: metricsMap.follower_count[iso] ?? 0,
      }));

      const totalReach = series.reduce((s, p) => s + p.reach, 0);
      const totalImpressions = series.reduce((s, p) => s + p.impressions, 0);
      const totalProfileViews = series.reduce((s, p) => s + p.profileViews, 0);
      const totalFollowerGain = series.reduce((s, p) => s + p.followerDelta, 0);

      // ── Audiência ─────────────────────────────────────────────────────────
      let cities: IgAudienceCity[] = [];
      let ageGroups: IgAudienceAge[] = [];
      let gender: IgAudienceGender | null = null;

      for (const metric of (audienceJson.data ?? [])) {
        if (metric.name === 'audience_city' && metric.values?.[0]?.value) {
          const raw = metric.values[0].value as Record<string, number>;
          cities = Object.entries(raw)
            .map(([city, count]) => ({ city, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
        }

        if (metric.name === 'audience_gender_age' && metric.values?.[0]?.value) {
          const raw = metric.values[0].value as Record<string, number>;

          // Agrupa por faixa etária
          const ageMap: Record<string, { male: number; female: number }> = {};
          let totalMale = 0, totalFemale = 0, totalUnknown = 0;

          for (const [key, count] of Object.entries(raw)) {
            const [genderCode, range] = key.split('.');
            if (!range) continue;
            if (!ageMap[range]) ageMap[range] = { male: 0, female: 0 };
            if (genderCode === 'M') { ageMap[range].male += count; totalMale += count; }
            else if (genderCode === 'F') { ageMap[range].female += count; totalFemale += count; }
            else { totalUnknown += count; }
          }

          ageGroups = Object.entries(ageMap)
            .map(([range, { male, female }]) => ({
              range,
              male,
              female,
              total: male + female,
            }))
            .sort((a, b) => {
              // Ordena por faixa etária numericamente
              const aStart = parseInt(a.range.split('-')[0]) || 0;
              const bStart = parseInt(b.range.split('-')[0]) || 0;
              return aStart - bStart;
            });

          const total = totalMale + totalFemale + totalUnknown;
          gender = { male: totalMale, female: totalFemale, unknown: totalUnknown, total };
        }
      }

      setData({ profile, series, cities, ageGroups, gender, totalReach, totalImpressions, totalProfileViews, totalFollowerGain });

      if (insightsResult.status !== 'fulfilled') {
        setError('Conectado, mas algumas métricas do Instagram não puderam ser carregadas com a permissão atual.');
      }
    } catch (err: any) {
      setError(err?.message || 'Erro ao buscar dados do Instagram.');
    } finally {
      setLoading(false);
    }
  }, [igUserId, period]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}
