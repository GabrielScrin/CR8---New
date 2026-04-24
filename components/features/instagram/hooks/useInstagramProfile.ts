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

export interface IgDailyPoint {
  date: string;
  dateIso: string;
  dayOfWeek: number;
  reach: number;
  views: number;
  followerDelta: number;
  accountsEngaged: number;
}

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
  totalReach: number;
  totalViews: number;
  totalProfileViews: number;
  totalFollowerGain: number;
  totalAccountsEngaged: number;
}

function periodToDates(period: IgPeriod): { since: number; until: number } {
  const days = period === '7d' ? 7 : period === '14d' ? 14 : 30;
  const until = Math.floor(Date.now() / 1000);
  const since = until - days * 86400;
  return { since, until };
}

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function dayOfWeek(isoDate: string): number {
  return new Date(isoDate).getDay();
}

function endTimeToIso(endTime: string): string {
  return endTime.substring(0, 10);
}

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
  for (const key of keys) map[key] = {};

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

function extractMetricTotal(dataArr: any[], metricName: string): number {
  const metric = (dataArr ?? []).find((item: any) => item?.name === metricName);
  if (!metric) return 0;

  if (metric.total_value?.value != null) {
    return Number(metric.total_value.value);
  }

  if (Array.isArray(metric.values)) {
    return metric.values.reduce((sum: number, point: any) => sum + extractValue(point.value), 0);
  }

  return 0;
}

function extractMetricSeries(dataArr: any[], metricName: string): Record<string, number> {
  const metric = (dataArr ?? []).find((item: any) => item?.name === metricName);
  if (!metric || !Array.isArray(metric.values)) return {};

  return metric.values.reduce((acc: Record<string, number>, point: any) => {
    const iso = endTimeToIso(String(point?.end_time ?? ''));
    if (!iso) return acc;
    acc[iso] = extractValue(point?.value);
    return acc;
  }, {});
}

function parseDemographics(dataArr: any[]): {
  cities: IgAudienceCity[];
  ageGroups: IgAudienceAge[];
  gender: IgAudienceGender | null;
} {
  let cities: IgAudienceCity[] = [];
  const ageMap: Record<string, { male: number; female: number }> = {};
  let totalMale = 0;
  let totalFemale = 0;
  let totalUnknown = 0;

  for (const metric of dataArr) {
    const breakdowns: any[] = metric?.total_value?.breakdowns ?? [];

    for (const breakdown of breakdowns) {
      const keys: string[] = breakdown.dimension_keys ?? [];
      const results: any[] = breakdown.results ?? [];

      if (keys.length === 1 && keys[0] === 'city') {
        cities = results
          .map((result) => ({
            city: String(result.dimension_values?.[0] ?? ''),
            count: Number(result.value ?? 0),
          }))
          .filter((city) => city.city)
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
      }

      if (keys.includes('age') && keys.includes('gender')) {
        const ageIdx = keys.indexOf('age');
        const genderIdx = keys.indexOf('gender');

        for (const result of results) {
          const age = String(result.dimension_values?.[ageIdx] ?? '');
          const gender = String(result.dimension_values?.[genderIdx] ?? '').toUpperCase();
          const count = Number(result.value ?? 0);

          if (!age) continue;
          if (!ageMap[age]) ageMap[age] = { male: 0, female: 0 };

          if (gender === 'M') {
            ageMap[age].male += count;
            totalMale += count;
          } else if (gender === 'F') {
            ageMap[age].female += count;
            totalFemale += count;
          } else {
            totalUnknown += count;
          }
        }
      }
    }
  }

  const ageGroups: IgAudienceAge[] = Object.entries(ageMap)
    .map(([range, { male, female }]) => ({ range, male, female, total: male + female }))
    .sort((a, b) => (parseInt(a.range, 10) || 0) - (parseInt(b.range, 10) || 0));

  const genderTotal = totalMale + totalFemale + totalUnknown;
  const gender: IgAudienceGender | null = genderTotal > 0
    ? { male: totalMale, female: totalFemale, unknown: totalUnknown, total: genderTotal }
    : null;

  return { cities, ageGroups, gender };
}

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
        setError('Token de autenticacao nao encontrado. Reconecte sua conta Facebook.');
        return;
      }

      const { since, until } = periodToDates(period);
      const base = `&access_token=${token}`;

      const [profileJson, reachJson, totalsJson, followerCountJson, demoCityJson, demoAgeJson] =
        await Promise.all([
          fetchGraphJson(
            `${GRAPH_BASE}/${igUserId}` +
            `?fields=username,name,biography,followers_count,follows_count,media_count,profile_picture_url,website` +
            base,
          ),
          fetchGraphJson(
            `${GRAPH_BASE}/${igUserId}/insights` +
            `?metric=reach` +
            `&period=day&since=${since}&until=${until}` +
            base,
          ),
          fetchGraphJson(
            `${GRAPH_BASE}/${igUserId}/insights` +
            `?metric=views,profile_views,follows_and_unfollows,accounts_engaged` +
            `&metric_type=total_value&period=day` +
            `&since=${since}&until=${until}` +
            base,
          ),
          fetchGraphJson(
            `${GRAPH_BASE}/${igUserId}/insights` +
            `?metric=follower_count` +
            `&period=day&since=${since}&until=${until}` +
            base,
          ).catch(() => ({ data: [] })),
          fetchGraphJson(
            `${GRAPH_BASE}/${igUserId}/insights` +
            `?metric=follower_demographics&metric_type=total_value&period=lifetime&breakdown=city` +
            base,
          ).catch(() => ({ data: [] })),
          fetchGraphJson(
            `${GRAPH_BASE}/${igUserId}/insights` +
            `?metric=follower_demographics&metric_type=total_value&period=lifetime&breakdown=age,gender` +
            base,
          ).catch(() => ({ data: [] })),
        ]);

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

      const metricsMap = parseTimeSeries(reachJson.data ?? [], ['reach']);
      const followerSeries = extractMetricSeries(followerCountJson.data ?? [], 'follower_count');
      const allDates = Object.keys(metricsMap.reach).sort();

      const series: IgDailyPoint[] = allDates.map((iso) => ({
        date: formatDate(iso),
        dateIso: iso,
        dayOfWeek: dayOfWeek(iso),
        reach: metricsMap.reach[iso] ?? 0,
        // The newer Meta format returns these metrics only as total_value for the period.
        views: 0,
        followerDelta: followerSeries[iso] ?? 0,
        accountsEngaged: 0,
      }));

      const totalReach = series.reduce((sum, point) => sum + point.reach, 0);
      const totalViews = extractMetricTotal(totalsJson.data ?? [], 'views');
      const totalProfileViews = extractMetricTotal(totalsJson.data ?? [], 'profile_views');
      const totalFollowerGain = Object.values(followerSeries).reduce((sum, value) => sum + value, 0);
      const totalAccountsEngaged = extractMetricTotal(totalsJson.data ?? [], 'accounts_engaged');

      const { cities, ageGroups, gender } = parseDemographics([
        ...((demoCityJson.data ?? []) as any[]),
        ...((demoAgeJson.data ?? []) as any[]),
      ]);

      setData({
        profile,
        series,
        cities,
        ageGroups,
        gender,
        totalReach,
        totalViews,
        totalProfileViews,
        totalFollowerGain,
        totalAccountsEngaged,
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
