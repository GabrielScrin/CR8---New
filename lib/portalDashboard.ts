import { getSupabaseAnonKey, getSupabaseUrl } from './supabase';

const post = async <T>(body: Record<string, unknown>): Promise<T> => {
  const url = `${getSupabaseUrl()}/functions/v1/portal-dashboard`;
  const key = getSupabaseAnonKey();
  const res = await fetch(url, {
    method: 'POST',
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload?.ok === false) throw new Error(String(payload?.error ?? 'Falha ao carregar dashboard.'));
  return payload as T;
};

export type DashboardBootstrap = {
  id: string;
  name: string;
  clientName: string | null;
  metaAdAccountId: string;
  metaAdAccountName: string;
  instagramBusinessAccountId: string | null;
  instagramUsername: string | null;
  instagramProfile: {
    username: string;
    name: string;
    followersCount: number;
    mediaCount: number;
    profilePictureUrl: string;
  } | null;
};

export type MetaSummary = {
  spend: number; impressions: number; reach: number; clicks: number;
  linkClicks: number; ctr: number; cpc: number; cpm: number;
  frequency: number; results: number; messagesStarted: number;
  leadForms: number; siteLeads: number; profileVisits: number; followers: number;
};

export type DailyPoint = { date: string; spend: number; results: number };

export type Campaign = {
  id: string; name: string; spend: number; impressions: number; reach: number;
  clicks: number; linkClicks: number; ctr: number; cpc: number; cpm: number;
  frequency: number; results: number;
  leadForms: number; messagesStarted: number; siteLeads: number;
  profileVisits: number; followers: number;
};

export type InstagramMedia = {
  id: string; caption: string; mediaType: string; mediaProductType: string;
  mediaUrl: string; thumbnailUrl: string; timestamp: string; permalink: string;
  reach: number | null; saved: number | null; shares: number | null;
  videoViews: number | null; commentsCount: number | null;
  likeCount: number | null; totalInteractions: number | null;
};

export type DashboardData = {
  dateFrom: string; dateTo: string;
  prevDateFrom: string; prevDateTo: string;
  meta: {
    available: boolean; reason?: string;
    summary: MetaSummary;
    timeseries: DailyPoint[];
    campaigns: Campaign[];
  };
  prevMeta: { available: boolean; summary: MetaSummary };
  instagram: {
    available: boolean; reason?: string;
    profile: DashboardBootstrap['instagramProfile'];
    summary: {
      totalReach: number; totalViews: number;
      totalProfileViews: number; totalFollowerGain: number; totalAccountsEngaged: number;
    };
    series: Array<{ date: string; dateIso: string; reach: number }>;
    media: InstagramMedia[];
  };
  prevInstagram: {
    available: boolean;
    summary: { totalReach: number; totalViews: number; totalProfileViews: number; totalFollowerGain: number; totalAccountsEngaged: number };
  };
};

export type DashboardWeekly = {
  periodStart: string; periodEnd: string;
  summary: string; highlights: string[]; risks: string[]; next_week: string[];
  meta: { spend: number; impressions: number; reach: number; results: number; ctr: number; cpc: number; campaigns: number };
  instagram: { totalReach: number; totalViews: number; totalProfileViews: number; totalFollowerGain: number };
};

export const fetchDashboardBootstrap = (token: string) =>
  post<DashboardBootstrap & { ok: true }>({ section: 'bootstrap', token });

export const fetchDashboardData = (params: {
  token: string; dateFrom: string; dateTo: string; campaignIds?: string[];
}) =>
  post<DashboardData & { ok: true }>({
    section: 'data', token: params.token,
    date_from: params.dateFrom, date_to: params.dateTo,
    campaign_ids: params.campaignIds ?? [],
  });

export const fetchDashboardWeekly = (token: string) =>
  post<DashboardWeekly & { ok: true }>({ section: 'weekly', token });
