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
  date: string;          // "DD/MM"
  dateIso: string;       // "YYYY-MM-DD"
  dayOfWeek: number;     // 0=Dom ... 6=Sáb
  reach: number;
  views: number;         // equivalente a impressões na nova API
  followerDelta: number; // follows_and_unfollows (ganho líquido por dia)
  accountsEngaged: number;
}

// Dados de audiência
export interface IgAudienceCity {
  city: string;
  count: number;
}

export interface IgAudienceAge {
  range: string;
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
  // KPIs totais do período
  totalReach: number;
  totalViews: number;
  totalProfileViews: number;
  totalFollowerGain: number;
  totalAccountsEngaged: number;
}

// ── Utilitários de data ──────────────────────────────────────────────────────

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
  return new Date(isoDate).getDay();
}

function endTimeToIso(endTime: string): string {
  return endTime.substring(0, 10);
}

// ── Parsers ──────────────────────────────────────────────────────────────────

// follows_and_unfollows pode retornar { follows: N, unfollows: N } ou número
function extractValue(raw: any): number {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'object' && raw !== null) {
    return Number(raw.follows ?? 0) - Number(raw.unfollows ?? 0);
  }
  return 0;
}

function parseTimeSeries(
  dataArr: any[],
  keys: string[],
): Record<string, Record<string, number>> {
  const map: Record<string, Record<string, number>> = {};
  for (const k of keys) map[k] = {};

  for (const metric of dataArr) {
    const name: string = metric.name;
    if (!map[name]) continue;
    for (const point of metric.values ?? []) {
      const iso = endTimeToIso(point.end_time);
      map[name][iso] = (map[name][iso] ?? 0) + extractValue(point.value);
    }
  }

  return map;
}

// Parseia follower_demographics (novo formato com breakdowns)
function parseDemographics(dataArr: any[]): {
  cities: IgAudienceCity[];
  ageGroups: IgAudienceAge[];
  gender: IgAudienceGender | null;
} {
  let cities: IgAudienceCity[] = [];
  const ageMap: Record<string, { male: number; female: number }> = {};
  let totalMale = 0, totalFemale = 0, totalUnknown = 0;

  for (const metric of dataArr) {
    const breakdowns: any[] = metric?.total_value?.breakdowns ?? [];

    for (const bd of breakdowns) {
      const keys: string[] = bd.dimension_keys ?? [];
      const results: any[] = bd.results ?? [];

      if (keys.length === 1 && keys[0] === 'city') {
        cities = results
          .map((r) => ({ city: String(r.dimension_values?.[0] ?? ''), count: Number(r.value ?? 0) }))
          .filter((c) => c.city)
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
      }

      if (keys.includes('age') && keys.includes('gender')) {
        const ageIdx = keys.indexOf('age');
        const genderIdx = keys.indexOf('gender');

        for (const r of results) {
          const age = String(r.dimension_values?.[ageIdx] ?? '');
          const gender = String(r.dimension_values?.[genderIdx] ?? '').toUpperCase();
          const count = Number(r.value ?? 0);
          if (!age) continue;
          if (!ageMap[age]) ageMap[age] = { male: 0, female: 0 };
          if (gender === 'M') { ageMap[age].male += count; totalMale += count; }
          else if (gender === 'F') { ageMap[age].female += count; totalFemale += count; }
          else totalUnknown += count;
        }
      }
    }
  }

  const ageGroups: IgAudienceAge[] = Object.entries(ageMap)
    .map(([range, { male, female }]) => ({ range, male, female, total: male + female }))
    .sort((a, b) => (parseInt(a.range) || 0) - (parseInt(b.range) || 0));

  const genderTotal = totalMale + totalFemale + totalUnknown;
  const gender: IgAudienceGender | null = genderTotal > 0
    ? { male: totalMale, female: totalFemale, unknown: totalUnknown, total: genderTotal }
    : null;

  return { cities, ageGroups, gender };
}

// ── Hook principal ───────────────────────────────────────────────────────────

export function useInstagramProfile(igUserId: string | null, period: IgPeriod) {
  const [data, setData] = useState<IgProfileData>({
    profile: null,
    series: [],
    cities: [],
    ageGroups: [],
    gender: null,
    totalReach: 0,
    totalViews: 0,
    totalProfileViews: 0,
    totalFollowerGain: 0,
    totalAccountsEngaged: 0,
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
      const base = `&access_token=${token}`;

      const [profileJson, seriesJson, profileViewsJson, demoCityJson, demoAgeJson] =
        await Promise.all([

          // 1. Perfil básico
          fetchGraphJson(
            `${GRAPH_BASE}/${igUserId}` +
            `?fields=username,name,biography,followers_count,follows_count,media_count,profile_picture_url,website` +
            base,
          ),

          // 2. Série temporal diária
          fetchGraphJson(
            `${GRAPH_BASE}/${igUserId}/insights` +
            `?metric=reach,views,follows_and_unfollows,accounts_engaged` +
            `&period=day&since=${since}&until=${until}` +
            base,
          ),

          // 3. Visitas ao perfil — total do período
          fetchGraphJson(
            `${GRAPH_BASE}/${igUserId}/insights` +
            `?metric=profile_views&metric_type=total_value&period=day` +
            `&since=${since}&until=${until}` +
            base,
          ).catch(() => ({ data: [] })),

          // 4. Demográfico — cidades
          fetchGraphJson(
            `${GRAPH_BASE}/${igUserId}/insights` +
            `?metric=follower_demographics&metric_type=total_value&period=lifetime&breakdown=city` +
            base,
          ).catch(() => ({ data: [] })),

          // 5. Demográfico — idade × gênero
          fetchGraphJson(
            `${GRAPH_BASE}/${igUserId}/insights` +
            `?metric=follower_demographics&metric_type=total_value&period=lifetime&breakdown=age,gender` +
            base,
          ).catch(() => ({ data: [] })),
        ]);

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

      // ── Série temporal ────────────────────────────────────────────────────
      const seriesKeys = ['reach', 'views', 'follows_and_unfollows', 'accounts_engaged'];
      const metricsMap = parseTimeSeries(seriesJson.data ?? [], seriesKeys);

      const allDates = Array.from(
        new Set([...Object.keys(metricsMap.reach), ...Object.keys(metricsMap.views)]),
      ).sort();

      const series: IgDailyPoint[] = allDates.map((iso) => ({
        date: formatDate(iso),
        dateIso: iso,
        dayOfWeek: dayOfWeek(iso),
        reach: metricsMap.reach[iso] ?? 0,
        views: metricsMap.views[iso] ?? 0,
        followerDelta: metricsMap.follows_and_unfollows[iso] ?? 0,
        accountsEngaged: metricsMap.accounts_engaged[iso] ?? 0,
      }));

      const totalReach = series.reduce((s, p) => s + p.reach, 0);
      const totalViews = series.reduce((s, p) => s + p.views, 0);
      const totalFollowerGain = series.reduce((s, p) => s + p.followerDelta, 0);
      const totalAccountsEngaged = series.reduce((s, p) => s + p.accountsEngaged, 0);

      // ── Visitas ao perfil (total_value) ────────────────────────────────────
      let totalProfileViews = 0;
      for (const m of profileViewsJson.data ?? []) {
        if (m.total_value?.value != null) {
          totalProfileViews += Number(m.total_value.value);
        } else if (Array.isArray(m.values)) {
          totalProfileViews += m.values.reduce((s: number, v: any) => s + extractValue(v.value), 0);
        }
      }

      // ── Demográficos ───────────────────────────────────────────────────────
      const { cities, ageGroups, gender } = parseDemographics([
        ...((demoCityJson.data ?? []) as any[]),
        ...((demoAgeJson.data ?? []) as any[]),
      ]);

      setData({
        profile, series, cities, ageGroups, gender,
        totalReach, totalViews, totalProfileViews, totalFollowerGain, totalAccountsEngaged,
      });
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
