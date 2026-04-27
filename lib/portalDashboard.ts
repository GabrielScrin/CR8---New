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
  serverDate?: string;
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
  leadForms: number; siteLeads: number; landingPageViews: number;
  profileVisits: number; followers: number; videoViews: number; thruplays: number;
  hookRate: number; holdRate: number;
};

export type DailyPoint = {
  date: string;
  spend: number;
  results: number;
  leads: number;
  messages: number;
  profileVisits: number;
  thruplays: number;
};

export type Campaign = {
  id: string; name: string; spend: number; impressions: number; reach: number;
  clicks: number; linkClicks: number; ctr: number; cpc: number; cpm: number;
  frequency: number; results: number;
  leadForms: number; messagesStarted: number; siteLeads: number; landingPageViews: number;
  profileVisits: number; followers: number; videoViews: number; thruplays: number;
  hookRate: number; holdRate: number;
};

export type AdBreakdownRow = {
  id: string;
  name: string;
  thumbnailUrl: string;
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
  results: number;
  leadForms: number;
  messagesStarted: number;
  siteLeads: number;
  landingPageViews: number;
  profileVisits: number;
  followers: number;
  videoViews: number;
  thruplays: number;
  hookRate: number;
  holdRate: number;
};

export type InstagramMedia = {
  id: string; caption: string; mediaType: string; mediaProductType: string;
  mediaUrl: string; thumbnailUrl: string; timestamp: string; permalink: string;
  reach: number | null; impressions: number | null; saved: number | null; shares: number | null;
  videoViews: number | null; commentsCount: number | null;
  likeCount: number | null; totalInteractions: number | null;
};

export type InstagramAudienceCity = { city: string; count: number };
export type InstagramAudienceAge = { range: string; male: number; female: number; total: number };
export type InstagramAudienceGender = { male: number; female: number; unknown: number; total: number } | null;

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
    series: Array<{ date: string; dateIso: string; reach: number; views: number; followerDelta: number; accountsEngaged: number }>;
    audience: {
      cities: InstagramAudienceCity[];
      ageGroups: InstagramAudienceAge[];
      gender: InstagramAudienceGender;
    };
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
  trafficLikeReport?: Record<string, unknown> | null;
  trafficReport: { publicId: string; title: string | null; createdAt: string } | null;
};

export type DashboardCampaignAds = {
  campaignId: string;
  campaignName: string;
  rows: AdBreakdownRow[];
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

export const fetchDashboardWeekly = (params: { token: string; dateFrom?: string; dateTo?: string }) =>
  post<DashboardWeekly & { ok: true }>({
    section: 'weekly',
    token: params.token,
    date_from: params.dateFrom,
    date_to: params.dateTo,
  });

export const fetchDashboardCampaignAds = (params: {
  token: string;
  dateFrom: string;
  dateTo: string;
  campaignId: string;
}) =>
  post<DashboardCampaignAds & { ok: true }>({
    section: 'campaign_ads',
    token: params.token,
    date_from: params.dateFrom,
    date_to: params.dateTo,
    campaign_id: params.campaignId,
  });
