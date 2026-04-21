import { getSupabaseAnonKey, getSupabaseUrl } from './supabase';

export type ClientPortalCompany = {
  id: string;
  name: string;
  brandName: string | null;
  brandLogoUrl: string | null;
  brandPrimaryColor: string | null;
  displayOrder: number;
};

export type WeeklyReportListItem = {
  id: string;
  periodStart: string;
  periodEnd: string;
  summary: string | null;
  createdAt: string;
};

export type ClientPortalBootstrap = {
  portal: {
    id: string;
    name: string;
    publicToken: string;
    defaultCompanyId: string;
    themePayload: Record<string, unknown>;
  };
  companies: ClientPortalCompany[];
  selectedCompanyId: string;
  weekly: WeeklyReportListItem[];
};

export type ClientPortalOverview = {
  portal: {
    id: string;
    name: string;
    themePayload: Record<string, unknown>;
    company: ClientPortalCompany;
  };
  filters: {
    companyId: string;
    dateFrom: string;
    dateTo: string;
    campaignIds: string[];
  };
  overview: {
    meta: {
      available: boolean;
      reason?: string;
      adAccountId?: string | null;
      accountName?: string | null;
      summary: {
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
        messagesStarted: number;
        leadForms: number;
        siteLeads: number;
        profileVisits: number;
        followers: number;
      };
      timeseries: Array<{ date: string; spend: number; results: number }>;
      campaigns: Array<{
        id: string;
        name: string;
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
      }>;
    };
    googleAds: {
      available: boolean;
      reason?: string;
      customerId?: string | null;
      currencyCode?: string | null;
      summary: {
        spend: number;
        impressions: number;
        clicks: number;
        conversions: number;
        conversionValue: number;
        ctr: number;
        cpc: number;
        cpm: number;
      };
      timeseries: Array<{ date: string; spend: number; results: number }>;
      campaigns: Array<{
        id: string;
        name: string;
        status: string;
        spend: number;
        impressions: number;
        clicks: number;
        conversions: number;
        conversionValue: number;
        ctr: number;
        cpc: number;
        cpm: number;
      }>;
    };
    instagram: {
      available: boolean;
      reason?: string;
      profile: {
        username: string;
        name: string;
        followersCount: number;
        mediaCount: number;
        profilePictureUrl: string;
      } | null;
      summary: {
        totalReach: number;
        totalViews: number;
        totalProfileViews: number;
        totalFollowerGain: number;
        totalAccountsEngaged: number;
      };
      series: Array<{ date: string; dateIso: string; reach: number }>;
      media: Array<{
        id: string;
        caption: string;
        mediaType: string;
        mediaProductType: string;
        mediaUrl: string;
        thumbnailUrl: string;
        timestamp: string;
        permalink: string;
        reach: number | null;
        saved: number | null;
        shares: number | null;
        videoViews: number | null;
        commentsCount: number | null;
        likeCount: number | null;
        totalInteractions: number | null;
      }>;
    };
    business: {
      crmLeads: number;
      won: number;
      revenue: number;
      pendingFollowup: number;
    };
  };
};

export type WeeklyReportDetail = {
  id: string;
  company_id: string;
  period_start: string;
  period_end: string;
  metrics: Record<string, unknown>;
  summary: string | null;
  highlights: string[] | null;
  risks: string[] | null;
  next_week: string[] | null;
  created_at: string;
  updated_at: string;
};

const postClientPortal = async <T>(body: Record<string, unknown>): Promise<T> => {
  const baseUrl = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  const response = await fetch(`${baseUrl}/functions/v1/client-portal`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(String(payload?.error ?? 'Falha ao carregar portal do cliente.'));
  }
  return payload as T;
};

export const fetchClientPortalBootstrap = (token: string, companyId?: string | null) =>
  postClientPortal<ClientPortalBootstrap & { ok: true }>({
    section: 'bootstrap',
    token,
    company_id: companyId ?? null,
  });

export const fetchClientPortalOverview = (params: {
  token: string;
  companyId: string;
  dateFrom: string;
  dateTo: string;
  campaignIds: string[];
}) =>
  postClientPortal<ClientPortalOverview & { ok: true }>({
    section: 'overview',
    token: params.token,
    company_id: params.companyId,
    date_from: params.dateFrom,
    date_to: params.dateTo,
    campaign_ids: params.campaignIds,
  });

export const fetchClientPortalWeeklyList = (token: string, companyId: string) =>
  postClientPortal<{ ok: true; items: WeeklyReportListItem[] }>({
    section: 'weekly_list',
    token,
    company_id: companyId,
  });

export const fetchClientPortalWeeklyDetail = (token: string, companyId: string, reportId: string) =>
  postClientPortal<{ ok: true; report: WeeklyReportDetail }>({
    section: 'weekly_detail',
    token,
    company_id: companyId,
    report_id: reportId,
  });
