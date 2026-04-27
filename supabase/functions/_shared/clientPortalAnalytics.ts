import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

export const corsHeaders: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const META_GRAPH_VERSION = Deno.env.get('META_GRAPH_VERSION') ?? 'v19.0';
const GOOGLE_ADS_CLIENT_ID = Deno.env.get('GOOGLE_ADS_CLIENT_ID') ?? '';
const GOOGLE_ADS_CLIENT_SECRET = Deno.env.get('GOOGLE_ADS_CLIENT_SECRET') ?? '';
const GOOGLE_ADS_REFRESH_TOKEN = Deno.env.get('GOOGLE_ADS_REFRESH_TOKEN') ?? '';
const GOOGLE_ADS_DEVELOPER_TOKEN = Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN') ?? '';
const GOOGLE_ADS_LOGIN_CUSTOMER_ID = (Deno.env.get('GOOGLE_ADS_LOGIN_CUSTOMER_ID') ?? '').replace(/\D/g, '');
const GOOGLE_ADS_API_VERSION = Deno.env.get('GOOGLE_ADS_API_VERSION') ?? '20';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4.1-mini';
const META_APP_ID = Deno.env.get('META_APP_ID') ?? '';
const META_APP_SECRET = Deno.env.get('META_APP_SECRET') ?? '';

type Json = Record<string, unknown>;

type PortalCompany = {
  id: string;
  name: string;
  brandName: string | null;
  brandLogoUrl: string | null;
  brandPrimaryColor: string | null;
  displayOrder: number;
};

type PortalContext = {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  publicToken: string;
  defaultCompanyId: string;
  themePayload: Json;
  companies: PortalCompany[];
};

type BusinessOverview = {
  crmLeads: number;
  won: number;
  revenue: number;
  pendingFollowup: number;
};

type MetaCampaignRow = {
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
  messagesStarted: number;
  leadForms: number;
  siteLeads: number;
  landingPageViews: number;
  profileVisits: number;
  followers: number;
  videoViews: number;
  thruplays: number;
  hookRate: number;
  holdRate: number;
};

type MetaAdRow = {
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
  messagesStarted: number;
  leadForms: number;
  siteLeads: number;
  landingPageViews: number;
  profileVisits: number;
  followers: number;
  videoViews: number;
  thruplays: number;
  hookRate: number;
  holdRate: number;
  nativeResultType: string;
  nativeResultLabel: string;
  nativeResultValue: number;
};

type GoogleCampaignRow = {
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
};

type DailyPoint = {
  date: string;
  spend: number;
  results: number;
  leads: number;
  messages: number;
  profileVisits: number;
  thruplays: number;
};

type MetaOverview = {
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
    landingPageViews: number;
    profileVisits: number;
    followers: number;
    videoViews: number;
    thruplays: number;
    hookRate: number;
    holdRate: number;
  };
  timeseries: DailyPoint[];
  campaigns: MetaCampaignRow[];
};

type GoogleOverview = {
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
  timeseries: DailyPoint[];
  campaigns: GoogleCampaignRow[];
};

type InstagramOverview = {
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
  series: Array<{
    date: string;
    dateIso: string;
    reach: number;
    views: number;
    followerDelta: number;
    accountsEngaged: number;
  }>;
  audience: {
    cities: Array<{ city: string; count: number }>;
    ageGroups: Array<{ range: string; male: number; female: number; total: number }>;
    gender: { male: number; female: number; unknown: number; total: number } | null;
  };
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
    impressions: number | null;
    saved: number | null;
    shares: number | null;
    videoViews: number | null;
    commentsCount: number | null;
    likeCount: number | null;
    totalInteractions: number | null;
  }>;
};

type WeeklyReportRow = {
  id: string;
  company_id: string;
  period_start: string;
  period_end: string;
  metrics: Json;
  summary: string | null;
  highlights: string[] | null;
  risks: string[] | null;
  next_week: string[] | null;
  created_at: string;
  updated_at: string;
};

type TrafficReportRow = {
  public_id: string;
  title: string | null;
  created_at: string;
  report_data?: any;
};

const IDC_THRESHOLDS = {
  otimo: 0.8,
  bom: 0.6,
  regular: 0.4,
};

let cachedGoogleAccessToken: { token: string; expiresAtMs: number } | null = null;

export const createSupabaseAdmin = () =>
  createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

export const jsonResponse = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });

const asNumber = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const asString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const nextDateIso = (dateIso: string) => {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

const shiftUtcDate = (date: Date, deltaDays: number) => {
  const shifted = new Date(date);
  shifted.setUTCDate(shifted.getUTCDate() + deltaDays);
  return shifted;
};

const parseDateInput = (raw: string | null | undefined, fallback: string) => {
  const value = asString(raw);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
};

const dateDiffDays = (startIso: string, endIso: string) => {
  const start = new Date(`${startIso}T00:00:00.000Z`).getTime();
  const end = new Date(`${endIso}T00:00:00.000Z`).getTime();
  return Math.round((end - start) / 86400000);
};

const daySeries = (startIso: string, endIso: string) => {
  const points: string[] = [];
  let cursor = startIso;
  const totalDays = clamp(dateDiffDays(startIso, nextDateIso(endIso)) + 1, 0, 370);
  for (let i = 0; i < totalDays; i += 1) {
    points.push(cursor);
    cursor = nextDateIso(cursor);
    if (cursor > endIso) break;
  }
  return points;
};

const normalizeActionType = (actionType: unknown) => String(actionType ?? '').trim().toLowerCase();

const extractActionSum = (actions: any[] | undefined, matcher: (actionType: string) => boolean) => {
  if (!Array.isArray(actions)) return 0;
  return actions.reduce((sum, item) => {
    const type = normalizeActionType(item?.action_type);
    if (!matcher(type)) return sum;
    return sum + asNumber(item?.value);
  }, 0);
};

const extractPreferredActionValue = (
  actions: any[] | undefined,
  exactPriority: string[],
  fallbackMatcher?: (actionType: string) => boolean,
) => {
  if (!Array.isArray(actions) || actions.length === 0) return 0;
  for (const actionType of exactPriority) {
    const match = actions.find((entry) => normalizeActionType(entry?.action_type) === actionType);
    if (match != null) return asNumber(match?.value);
  }
  if (!fallbackMatcher) return 0;
  const match = actions.find((entry) => fallbackMatcher(normalizeActionType(entry?.action_type)));
  return match != null ? asNumber(match?.value) : 0;
};

const extractActionTotal = (actions: any[] | undefined) => {
  if (!Array.isArray(actions) || actions.length === 0) return 0;
  return actions.reduce((sum, item) => sum + asNumber(item?.value), 0);
};

const deriveCountFromCostPerAction = (
  spend: number,
  costPerAction: any[] | undefined,
  selector: (actions: any[] | undefined) => number,
) => {
  if (!Number.isFinite(spend) || spend <= 0) return 0;
  const cost = selector(costPerAction);
  if (!Number.isFinite(cost) || cost <= 0) return 0;
  return Math.max(0, Math.round(spend / cost));
};

const extractLeadForms = (actions: any[] | undefined) =>
  extractActionSum(
    actions,
    (t) =>
      t === 'lead' ||
      t === 'onsite_conversion.lead_grouped' ||
      t.includes('lead_grouped') ||
      t.includes('lead_form'),
  );

const extractSiteLeads = (actions: any[] | undefined) =>
  extractActionSum(
    actions,
    (t) =>
      t === 'contact' ||
      t === 'omni_contact' ||
      t === 'omni_lead' ||
      t === 'omni_complete_registration' ||
      t.includes('fb_pixel_lead') ||
      (t.startsWith('offsite_conversion.') && (t.includes('lead') || t.includes('contact') || t.includes('complete_registration'))),
  );

const extractMessagingStarted = (actions: any[] | undefined) =>
  extractPreferredActionValue(
    actions,
    [
      'onsite_conversion.messaging_conversation_started_7d',
      'onsite_conversion.messaging_conversation_started_1d',
    ],
    (t) => t.includes('messaging_conversation_started'),
  );

const isProfileVisitActionType = (actionType: string) => {
  if (!actionType) return false;
  if (actionType.includes('follow') || actionType === 'like' || actionType === 'page_fan') return false;
  return (
    actionType === 'instagram_profile_visit' ||
    actionType === 'profile_visit' ||
    (actionType.includes('profile') && actionType.includes('visit'))
  );
};

const extractProfileVisits = (actions: any[] | undefined) =>
  extractActionSum(actions, isProfileVisitActionType);

const extractFollowers = (actions: any[] | undefined) =>
  extractActionSum(actions, (t) => t === 'like' || t === 'page_fan' || t === 'instagram_profile_follow' || t === 'follow');

const extractLandingPageViews = (actions: any[] | undefined) =>
  extractPreferredActionValue(
    actions,
    ['landing_page_view', 'omni_landing_page_view'],
    (t) => t.includes('landing_page_view'),
  );

const extractVideoViews = (actions: any[] | undefined) =>
  extractActionSum(actions, (t) => {
    return t === 'video_view' || t === 'video_view_3s' || t === 'video_view_3_sec' || t === 'video_view_3s_watched';
  });

const extractThruplays = (actions: any[] | undefined) =>
  extractActionSum(actions, (t) => {
    return t === 'video_view_15s' || t === 'video_view_15_sec' || t === 'video_view_15s_watched' || t.startsWith('video_view_15');
  });

const buildEmptyMetaOverview = (reason: string): MetaOverview => ({
  available: false,
  reason,
  summary: {
    spend: 0,
    impressions: 0,
    reach: 0,
    clicks: 0,
    linkClicks: 0,
    ctr: 0,
    cpc: 0,
    cpm: 0,
    frequency: 0,
    results: 0,
    messagesStarted: 0,
    leadForms: 0,
    siteLeads: 0,
    landingPageViews: 0,
    profileVisits: 0,
    followers: 0,
    videoViews: 0,
    thruplays: 0,
    hookRate: 0,
    holdRate: 0,
  },
  timeseries: [],
  campaigns: [],
});

const buildEmptyGoogleOverview = (reason: string): GoogleOverview => ({
  available: false,
  reason,
  summary: {
    spend: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    conversionValue: 0,
    ctr: 0,
    cpc: 0,
    cpm: 0,
  },
  timeseries: [],
  campaigns: [],
});

const buildEmptyInstagramOverview = (reason: string): InstagramOverview => ({
  available: false,
  reason,
  profile: null,
  summary: {
    totalReach: 0,
    totalViews: 0,
    totalProfileViews: 0,
    totalFollowerGain: 0,
    totalAccountsEngaged: 0,
  },
  series: [],
  audience: {
    cities: [],
    ageGroups: [],
    gender: null,
  },
  media: [],
});

const ensureSupabase = () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  }
};

const fetchJson = async (url: string, init?: RequestInit) => {
  const res = await fetch(url, init);
  const text = await res.text().catch(() => '');
  const json = text ? JSON.parse(text) : {};
  if (!res.ok || json?.error) {
    const message = json?.error?.message || `HTTP ${res.status}`;
    throw new Error(message);
  }
  return json;
};

const getPortalContext = async (supabaseAdmin: SupabaseClient, token: string): Promise<PortalContext> => {
  const cleanToken = asString(token);
  if (!cleanToken || cleanToken.length < 16) throw new Error('invalid portal token');

  const { data: portal, error } = await supabaseAdmin
    .from('client_portals')
    .select('id,name,status,public_token,default_company_id,theme_payload')
    .eq('public_token', cleanToken)
    .maybeSingle();

  if (error) throw error;
  if (!portal) throw new Error('portal not found');
  if (portal.status !== 'active') throw new Error('portal inactive');

  const { data: links, error: linksError } = await supabaseAdmin
    .from('client_portal_companies')
    .select('company_id,display_order')
    .eq('portal_id', portal.id)
    .order('display_order', { ascending: true });

  if (linksError) throw linksError;
  const companyIds = (links ?? []).map((row: any) => String(row.company_id ?? '')).filter(Boolean);
  if (companyIds.length === 0) throw new Error('portal has no companies');

  const { data: companies, error: companiesError } = await supabaseAdmin
    .from('companies')
    .select('id,name,brand_name,brand_logo_url,brand_primary_color')
    .in('id', companyIds);

  if (companiesError) throw companiesError;

  const orderMap = new Map<string, number>((links ?? []).map((row: any) => [String(row.company_id), Number(row.display_order ?? 0)]));
  const companyList: PortalCompany[] = (companies ?? [])
    .map((row: any) => ({
      id: String(row.id),
      name: String(row.name ?? 'Empresa'),
      brandName: row.brand_name ? String(row.brand_name) : null,
      brandLogoUrl: row.brand_logo_url ? String(row.brand_logo_url) : null,
      brandPrimaryColor: row.brand_primary_color ? String(row.brand_primary_color) : null,
      displayOrder: orderMap.get(String(row.id)) ?? 0,
    }))
    .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));

  return {
    id: String(portal.id),
    name: String(portal.name ?? 'Portal do cliente'),
    status: portal.status as 'active' | 'inactive',
    publicToken: String(portal.public_token),
    defaultCompanyId: String(portal.default_company_id),
    themePayload: (portal.theme_payload ?? {}) as Json,
    companies: companyList,
  };
};

const assertCompanyAllowed = (context: PortalContext, companyId: string) => {
  const match = context.companies.find((item) => item.id === companyId);
  if (!match) throw new Error('company not allowed');
  return match;
};

const portalCampaignId = (platform: 'meta' | 'google', id: string) => `${platform}:${id}`;

const splitCampaignIds = (campaignIds: string[]) => {
  const metaCampaignIds: string[] = [];
  const googleCampaignIds: string[] = [];

  for (const raw of campaignIds) {
    const value = asString(raw);
    if (!value.includes(':')) continue;
    const [platform, id] = value.split(':', 2);
    if (!id) continue;
    if (platform === 'meta') metaCampaignIds.push(id);
    if (platform === 'google') googleCampaignIds.push(id.replace(/\D/g, ''));
  }

  return {
    metaCampaignIds: Array.from(new Set(metaCampaignIds)),
    googleCampaignIds: Array.from(new Set(googleCampaignIds)),
  };
};

const buildDateWindow = (dateFromRaw?: string, dateToRaw?: string) => {
  const today = new Date();
  const defaultEnd = today.toISOString().slice(0, 10);
  const startDate = new Date();
  startDate.setUTCDate(startDate.getUTCDate() - 6);
  const defaultStart = startDate.toISOString().slice(0, 10);

  const dateFrom = parseDateInput(dateFromRaw, defaultStart);
  const dateTo = parseDateInput(dateToRaw, defaultEnd);
  if (dateFrom > dateTo) throw new Error('invalid date range');

  const inclusiveDays = dateDiffDays(dateFrom, dateTo) + 1;
  if (inclusiveDays > 120) throw new Error('date range too large');

  return {
    dateFrom,
    dateTo,
    startIso: `${dateFrom}T00:00:00.000Z`,
    endExclusiveIso: `${nextDateIso(dateTo)}T00:00:00.000Z`,
    inclusiveDays,
  };
};

const getMetaAccountName = async (metaAccessToken: string, adAccountId: string) => {
  try {
    const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${adAccountId}`);
    url.searchParams.set('fields', 'name');
    url.searchParams.set('access_token', metaAccessToken);
    const json = await fetchJson(url.toString());
    return asString(json?.name) || adAccountId;
  } catch {
    return adAccountId;
  }
};

const fetchMetaInsights = async (
  metaAccessToken: string,
  adAccountId: string,
  dateFrom: string,
  dateTo: string,
  campaignIds: string[],
) => {
  const rows: any[] = [];
  let nextUrl: string | null = null;

  const makeFirstUrl = () => {
    const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${adAccountId}/insights`);
    url.searchParams.set(
      'fields',
      'campaign_id,campaign_name,date_start,spend,impressions,reach,clicks,inline_link_clicks,ctr,cpc,cpm,frequency,actions,results,cost_per_result,cost_per_action_type,instagram_profile_visits,video_thruplay_watched_actions',
    );
    url.searchParams.set('level', 'campaign');
    url.searchParams.set('time_increment', '1');
    url.searchParams.set('time_range', JSON.stringify({ since: dateFrom, until: dateTo }));
    url.searchParams.set('limit', '100');
    url.searchParams.set('access_token', metaAccessToken);
    if (campaignIds.length > 0) {
      url.searchParams.set('filtering', JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: campaignIds }]));
    }
    return url.toString();
  };

  for (let page = 0; page < 8; page += 1) {
    const json = await fetchJson(nextUrl ?? makeFirstUrl());
    const pageRows = Array.isArray(json?.data) ? json.data : [];
    rows.push(...pageRows);
    nextUrl = typeof json?.paging?.next === 'string' ? json.paging.next : null;
    if (!nextUrl) break;
  }

  return rows;
};

const fetchMetaAdInsights = async (
  metaAccessToken: string,
  adAccountId: string,
  dateFrom: string,
  dateTo: string,
  campaignId: string,
) => {
  const rows: any[] = [];
  let nextUrl: string | null = null;

  const makeFirstUrl = () => {
    const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${adAccountId}/insights`);
    url.searchParams.set(
      'fields',
      'campaign_id,campaign_name,ad_id,ad_name,spend,impressions,reach,clicks,inline_link_clicks,ctr,cpc,cpm,frequency,actions,results,cost_per_result,cost_per_action_type,instagram_profile_visits,video_thruplay_watched_actions',
    );
    url.searchParams.set('level', 'ad');
    url.searchParams.set('time_range', JSON.stringify({ since: dateFrom, until: dateTo }));
    url.searchParams.set('limit', '200');
    url.searchParams.set('access_token', metaAccessToken);
    url.searchParams.set('filtering', JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: [campaignId] }]));
    return url.toString();
  };

  for (let page = 0; page < 10; page += 1) {
    const json = await fetchJson(nextUrl ?? makeFirstUrl());
    const pageRows = Array.isArray(json?.data) ? json.data : [];
    rows.push(...pageRows);
    nextUrl = typeof json?.paging?.next === 'string' ? json.paging.next : null;
    if (!nextUrl) break;
  }

  return rows;
};

const getResultEntryValue = (entry: any) => {
  const values = Array.isArray(entry?.values) ? entry.values : [];
  if (values.length > 0) return asNumber(values[0]?.value);
  return asNumber(entry?.value);
};

const scoreResultIndicator = (indicator: string) => {
  const normalized = asString(indicator).toLowerCase();
  if (!normalized) return 0;
  if (normalized.includes('profile_visit')) return 100;
  if (normalized.includes('messaging') || normalized.includes('onsite_conversion.messaging_conversation_started')) return 95;
  if (normalized.includes('lead') && normalized.includes('omni')) return 92;
  if ((normalized.includes('lead') && normalized.includes('website')) || (normalized.includes('offsite_conversion') && normalized.includes('lead'))) return 90;
  if (normalized.includes('landing_page_view')) return 80;
  if (normalized.includes('follow')) return 70;
  if (normalized.includes('thruplay')) return 40;
  if (normalized.includes('video_view')) return 30;
  return 10;
};

const extractPreferredResultEntry = (results: any[] | undefined) => {
  if (!Array.isArray(results) || results.length === 0) return null;
  return [...results]
    .map((entry) => ({
      entry,
      indicator: asString(entry?.indicator).toLowerCase(),
      value: getResultEntryValue(entry),
      score: scoreResultIndicator(asString(entry?.indicator)),
    }))
    .sort((a, b) => b.score - a.score || b.value - a.value)[0]?.entry ?? null;
};

const extractResultIndicator = (results: any[] | undefined) => {
  const preferred = extractPreferredResultEntry(results);
  return asString(preferred?.indicator).toLowerCase();
};

const extractResultValue = (results: any[] | undefined) => {
  const preferred = extractPreferredResultEntry(results);
  return preferred ? getResultEntryValue(preferred) : 0;
};

const fetchMetaAdThumbnails = async (
  metaAccessToken: string,
  adAccountId: string,
  campaignId: string,
): Promise<Map<string, string>> => {
  const thumbnailMap = new Map<string, string>();
  try {
    let nextUrl: string | null = null;
    const makeFirstUrl = () => {
      const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${adAccountId}/ads`);
      url.searchParams.set('fields', 'id,creative{thumbnail_url,image_url}');
      url.searchParams.set(
        'filtering',
        JSON.stringify([{ field: 'campaign.id', operator: 'EQUAL', value: campaignId }]),
      );
      url.searchParams.set('limit', '200');
      url.searchParams.set('access_token', metaAccessToken);
      return url.toString();
    };
    for (let page = 0; page < 5; page += 1) {
      const json = await fetchJson(nextUrl ?? makeFirstUrl());
      for (const ad of Array.isArray(json?.data) ? json.data : []) {
        const adId = asString(ad?.id);
        const thumbnailUrl = asString(ad?.creative?.thumbnail_url) || asString(ad?.creative?.image_url);
        if (adId && thumbnailUrl) thumbnailMap.set(adId, thumbnailUrl);
      }
      nextUrl = typeof json?.paging?.next === 'string' ? json.paging.next : null;
      if (!nextUrl) break;
    }
  } catch {
    // thumbnails são não-críticos
  }
  return thumbnailMap;
};

const aggregateMetaOverview = async (
  metaAccessToken: string,
  adAccountId: string,
  dateFrom: string,
  dateTo: string,
  campaignIds: string[],
): Promise<MetaOverview> => {
  try {
    const rows = await fetchMetaInsights(metaAccessToken, adAccountId, dateFrom, dateTo, campaignIds);
    const accountName = await getMetaAccountName(metaAccessToken, adAccountId);
    const campaignMap = new Map<string, MetaCampaignRow>();
    const dailyMap = new Map<string, DailyPoint>();

    for (const row of rows) {
      const campaignId = asString(row?.campaign_id);
      const campaignName = asString(row?.campaign_name) || campaignId || 'Campanha';
      const date = asString(row?.date_start);
      const spend = asNumber(row?.spend);
      const impressions = asNumber(row?.impressions);
      const reach = asNumber(row?.reach);
      const clicks = asNumber(row?.clicks);
      const linkClicks = asNumber(row?.inline_link_clicks);
      const ctr = asNumber(row?.ctr);
      const cpc = asNumber(row?.cpc);
      const cpm = asNumber(row?.cpm);
      const frequency = asNumber(row?.frequency);
      const actions = Array.isArray(row?.actions) ? row.actions : [];
      const resultsPayload = Array.isArray(row?.results) ? row.results : [];
      const resultIndicator = extractResultIndicator(resultsPayload);
      const isProfileVisitCampaign = resultIndicator === 'profile_visit_view';
      const costPerActionType = Array.isArray(row?.cost_per_action_type) ? row.cost_per_action_type : [];
      const videoThruplayActions = Array.isArray(row?.video_thruplay_watched_actions) ? row.video_thruplay_watched_actions : [];
      const leadForms = isProfileVisitCampaign ? 0 : extractLeadForms(actions) || deriveCountFromCostPerAction(spend, costPerActionType, extractLeadForms);
      const messagesStarted = isProfileVisitCampaign ? 0 : extractMessagingStarted(actions) || deriveCountFromCostPerAction(spend, costPerActionType, extractMessagingStarted);
      const siteLeads = isProfileVisitCampaign ? 0 : extractSiteLeads(actions) || deriveCountFromCostPerAction(spend, costPerActionType, extractSiteLeads);
      const landingPageViews = extractLandingPageViews(actions) || deriveCountFromCostPerAction(spend, costPerActionType, extractLandingPageViews);
      const profileVisits =
        asNumber(row?.instagram_profile_visits) ||
        (isProfileVisitCampaign ? extractResultValue(resultsPayload) : 0) ||
        extractProfileVisits(actions) ||
        deriveCountFromCostPerAction(spend, costPerActionType, extractProfileVisits);
      const followers = 0;
      const videoViews = extractVideoViews(actions);
      const thruplays =
        extractThruplays(actions) ||
        extractActionTotal(videoThruplayActions) ||
        deriveCountFromCostPerAction(spend, costPerActionType, extractThruplays);
      const hookRate = impressions > 0 ? videoViews / impressions : 0;
      const holdRate = videoViews > 0 ? thruplays / videoViews : 0;
      const results = leadForms + messagesStarted + siteLeads;

      if (campaignId) {
        const previous = campaignMap.get(campaignId) ?? {
          id: campaignId,
          name: campaignName,
          spend: 0,
          impressions: 0,
          reach: 0,
          clicks: 0,
          linkClicks: 0,
          ctr: 0,
          cpc: 0,
          cpm: 0,
          frequency: 0,
          results: 0,
          messagesStarted: 0,
          leadForms: 0,
          siteLeads: 0,
          landingPageViews: 0,
          profileVisits: 0,
          followers: 0,
          videoViews: 0,
          thruplays: 0,
          hookRate: 0,
          holdRate: 0,
        };

        previous.spend += spend;
        previous.impressions += impressions;
        previous.reach += reach;
        previous.clicks += clicks;
        previous.linkClicks += linkClicks;
        previous.results += results;
        previous.messagesStarted += messagesStarted;
        previous.leadForms += leadForms;
        previous.siteLeads += siteLeads;
        previous.landingPageViews += landingPageViews;
        previous.profileVisits += profileVisits;
        previous.followers += followers;
        previous.videoViews += videoViews;
        previous.thruplays += thruplays;
        previous.ctr = previous.impressions > 0 ? (previous.clicks / previous.impressions) * 100 : ctr;
        previous.cpc = previous.clicks > 0 ? previous.spend / previous.clicks : cpc;
        previous.cpm = previous.impressions > 0 ? (previous.spend / previous.impressions) * 1000 : cpm;
        previous.frequency = previous.reach > 0 ? previous.impressions / previous.reach : frequency;
        previous.hookRate = previous.impressions > 0 ? previous.videoViews / previous.impressions : 0;
        previous.holdRate = previous.videoViews > 0 ? previous.thruplays / previous.videoViews : 0;
        campaignMap.set(campaignId, previous);
      }

      if (date) {
        const previousPoint = dailyMap.get(date) ?? { date, spend: 0, results: 0, leads: 0, messages: 0, profileVisits: 0, thruplays: 0 };
        previousPoint.spend += spend;
        previousPoint.results += results;
        previousPoint.leads += leadForms + siteLeads;
        previousPoint.messages += messagesStarted;
        previousPoint.profileVisits += profileVisits;
        previousPoint.thruplays += thruplays;
        dailyMap.set(date, previousPoint);
      }
    }

    const campaigns = Array.from(campaignMap.values()).sort((a, b) => b.spend - a.spend);
    const summary = campaigns.reduce(
      (acc, row) => {
        acc.spend += row.spend;
        acc.impressions += row.impressions;
        acc.reach += row.reach;
        acc.clicks += row.clicks;
        acc.linkClicks += row.linkClicks;
        acc.results += row.results;
        acc.messagesStarted += row.messagesStarted;
        acc.leadForms += row.leadForms;
        acc.siteLeads += row.siteLeads;
        acc.landingPageViews += row.landingPageViews;
        acc.profileVisits += row.profileVisits;
        acc.followers += row.followers;
        acc.videoViews += row.videoViews;
        acc.thruplays += row.thruplays;
        return acc;
      },
      {
        spend: 0,
        impressions: 0,
        reach: 0,
        clicks: 0,
        linkClicks: 0,
        ctr: 0,
        cpc: 0,
        cpm: 0,
        frequency: 0,
        results: 0,
        messagesStarted: 0,
        leadForms: 0,
        siteLeads: 0,
        landingPageViews: 0,
        profileVisits: 0,
        followers: 0,
        videoViews: 0,
        thruplays: 0,
        hookRate: 0,
        holdRate: 0,
      },
    );

    summary.ctr = summary.impressions > 0 ? (summary.clicks / summary.impressions) * 100 : 0;
    summary.cpc = summary.clicks > 0 ? summary.spend / summary.clicks : 0;
    summary.cpm = summary.impressions > 0 ? (summary.spend / summary.impressions) * 1000 : 0;
    summary.frequency = summary.reach > 0 ? summary.impressions / summary.reach : 0;
    summary.hookRate = summary.impressions > 0 ? summary.videoViews / summary.impressions : 0;
    summary.holdRate = summary.videoViews > 0 ? summary.thruplays / summary.videoViews : 0;

    const timeseries = daySeries(dateFrom, dateTo).map((date) => dailyMap.get(date) ?? { date, spend: 0, results: 0, leads: 0, messages: 0, profileVisits: 0, thruplays: 0 });

    return {
      available: true,
      adAccountId,
      accountName,
      summary,
      timeseries,
      campaigns,
    };
  } catch (error: any) {
    return buildEmptyMetaOverview(error?.message ?? 'failed to load meta overview');
  }
};

async function getGoogleAccessToken(): Promise<string> {
  if (!GOOGLE_ADS_CLIENT_ID || !GOOGLE_ADS_CLIENT_SECRET || !GOOGLE_ADS_REFRESH_TOKEN) {
    throw new Error('google ads credentials not configured');
  }
  const now = Date.now();
  if (cachedGoogleAccessToken && cachedGoogleAccessToken.expiresAtMs - 30000 > now) {
    return cachedGoogleAccessToken.token;
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_ADS_CLIENT_ID,
      client_secret: GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: GOOGLE_ADS_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }).toString(),
  });

  const text = await response.text().catch(() => '');
  if (!response.ok) throw new Error(`google oauth error: HTTP ${response.status} ${text}`);

  const json = JSON.parse(text);
  const token = asString(json?.access_token);
  const expiresIn = asNumber(json?.expires_in);
  if (!token) throw new Error('google oauth returned empty token');

  cachedGoogleAccessToken = { token, expiresAtMs: now + expiresIn * 1000 };
  return token;
}

const googleAdsField = (row: any, camel: string, snake: string) => row?.[camel] ?? row?.[snake] ?? null;

const fetchGoogleAdsSearch = async (
  accessToken: string,
  customerId: string,
  loginCustomerId: string | null,
  query: string,
) => {
  const url = `https://googleads.googleapis.com/v${encodeURIComponent(GOOGLE_ADS_API_VERSION)}/customers/${encodeURIComponent(customerId)}/googleAds:search`;
  const callApi = async (withLoginCustomerId: boolean) => {
    const headers: Record<string, string> = {
      authorization: `Bearer ${accessToken}`,
      'developer-token': GOOGLE_ADS_DEVELOPER_TOKEN,
      'content-type': 'application/json',
    };
    if (withLoginCustomerId && loginCustomerId) headers['login-customer-id'] = loginCustomerId;

    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ query }) });
    const text = await response.text().catch(() => '');
    return { response, text };
  };

  let result = await callApi(true);
  if (!result.response.ok && loginCustomerId && (result.response.status === 400 || result.response.status === 403)) {
    result = await callApi(false);
  }

  if (!result.response.ok) throw new Error(`google ads api error: HTTP ${result.response.status} ${result.text}`);
  const json = result.text ? JSON.parse(result.text) : {};
  return Array.isArray(json?.results) ? json.results : [];
};

const aggregateGoogleOverview = async (
  customerId: string,
  loginCustomerId: string | null,
  currencyCode: string | null,
  dateFrom: string,
  dateTo: string,
  campaignIds: string[],
): Promise<GoogleOverview> => {
  try {
    if (!GOOGLE_ADS_DEVELOPER_TOKEN) {
      return buildEmptyGoogleOverview('google ads developer token not configured');
    }

    const accessToken = await getGoogleAccessToken();
    const filterIds = campaignIds.map((id) => id.replace(/\D/g, '')).filter(Boolean);
    const filterClause = filterIds.length > 0 ? ` AND campaign.id IN (${filterIds.join(',')})` : '';
    const query = [
      'SELECT',
      'segments.date,',
      'campaign.id,',
      'campaign.name,',
      'campaign.status,',
      'metrics.cost_micros,',
      'metrics.impressions,',
      'metrics.clicks,',
      'metrics.conversions,',
      'metrics.conversions_value',
      'FROM campaign',
      `WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'`,
      "AND campaign.status != 'REMOVED'",
      filterClause,
      'ORDER BY segments.date',
    ]
      .filter(Boolean)
      .join(' ');

    const rows = await fetchGoogleAdsSearch(accessToken, customerId, loginCustomerId, query);
    const campaignMap = new Map<string, GoogleCampaignRow>();
    const dailyMap = new Map<string, DailyPoint>();

    for (const item of rows) {
      const campaign = item?.campaign ?? {};
      const metrics = item?.metrics ?? {};
      const segments = item?.segments ?? {};
      const campaignId = asString(googleAdsField(campaign, 'id', 'id'));
      const campaignName = asString(googleAdsField(campaign, 'name', 'name')) || campaignId || 'Campaign';
      const status = asString(googleAdsField(campaign, 'status', 'status')) || 'UNKNOWN';
      const date = asString(googleAdsField(segments, 'date', 'date'));
      const spend = asNumber(googleAdsField(metrics, 'costMicros', 'cost_micros')) / 1_000_000;
      const impressions = asNumber(googleAdsField(metrics, 'impressions', 'impressions'));
      const clicks = asNumber(googleAdsField(metrics, 'clicks', 'clicks'));
      const conversions = asNumber(googleAdsField(metrics, 'conversions', 'conversions'));
      const conversionValue = asNumber(googleAdsField(metrics, 'conversionsValue', 'conversions_value'));

      if (campaignId) {
        const previous = campaignMap.get(campaignId) ?? {
          id: campaignId,
          name: campaignName,
          status,
          spend: 0,
          impressions: 0,
          clicks: 0,
          conversions: 0,
          conversionValue: 0,
          ctr: 0,
          cpc: 0,
          cpm: 0,
        };
        previous.spend += spend;
        previous.impressions += impressions;
        previous.clicks += clicks;
        previous.conversions += conversions;
        previous.conversionValue += conversionValue;
        previous.ctr = previous.impressions > 0 ? (previous.clicks / previous.impressions) * 100 : 0;
        previous.cpc = previous.clicks > 0 ? previous.spend / previous.clicks : 0;
        previous.cpm = previous.impressions > 0 ? (previous.spend / previous.impressions) * 1000 : 0;
        campaignMap.set(campaignId, previous);
      }

      if (date) {
        const point = dailyMap.get(date) ?? { date, spend: 0, results: 0 };
        point.spend += spend;
        point.results += conversions;
        dailyMap.set(date, point);
      }
    }

    const campaigns = Array.from(campaignMap.values()).sort((a, b) => b.spend - a.spend);
    const summary = campaigns.reduce(
      (acc, row) => {
        acc.spend += row.spend;
        acc.impressions += row.impressions;
        acc.clicks += row.clicks;
        acc.conversions += row.conversions;
        acc.conversionValue += row.conversionValue;
        return acc;
      },
      {
        spend: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        conversionValue: 0,
        ctr: 0,
        cpc: 0,
        cpm: 0,
      },
    );
    summary.ctr = summary.impressions > 0 ? (summary.clicks / summary.impressions) * 100 : 0;
    summary.cpc = summary.clicks > 0 ? summary.spend / summary.clicks : 0;
    summary.cpm = summary.impressions > 0 ? (summary.spend / summary.impressions) * 1000 : 0;

    return {
      available: true,
      customerId,
      currencyCode,
      summary,
      timeseries: daySeries(dateFrom, dateTo).map((date) => dailyMap.get(date) ?? { date, spend: 0, results: 0 }),
      campaigns,
    };
  } catch (error: any) {
    return buildEmptyGoogleOverview(error?.message ?? 'failed to load google ads overview');
  }
};

const fetchInstagramJson = async (url: string) => {
  const res = await fetch(url);
  const text = await res.text().catch(() => '');
  const json = text ? JSON.parse(text) : {};
  if (!res.ok || json?.error) {
    throw new Error(json?.error?.message || `instagram graph error ${res.status}`);
  }
  return json;
};

const extractInstagramInsightValue = (raw: unknown): number => {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  if (raw && typeof raw === 'object') {
    const value = raw as Record<string, unknown>;
    return asNumber(value.follows) - asNumber(value.unfollows);
  }
  return 0;
};

const extractInstagramMetricTotal = (dataArr: any[], metricName: string): number => {
  const metric = (dataArr ?? []).find((item: any) => item?.name === metricName);
  if (!metric) return 0;

  if (metric.total_value?.value != null) return asNumber(metric.total_value.value);
  if (Array.isArray(metric.values)) {
    return metric.values.reduce((sum: number, point: any) => sum + extractInstagramInsightValue(point?.value), 0);
  }

  return 0;
};

const extractInstagramMetricSeries = (dataArr: any[], metricName: string): Record<string, number> => {
  const metric = (dataArr ?? []).find((item: any) => item?.name === metricName);
  if (!metric || !Array.isArray(metric.values)) return {};

  return metric.values.reduce((acc: Record<string, number>, point: any) => {
    const iso = asString(point?.end_time).slice(0, 10);
    if (!iso) return acc;
    acc[iso] = extractInstagramInsightValue(point?.value);
    return acc;
  }, {});
};

const fetchInstagramDailyTotalValueSeries = async (
  graphBase: string,
  instagramBusinessAccountId: string,
  instagramAccessToken: string,
  metricName: string,
  dateFrom: string,
  dateTo: string,
): Promise<Record<string, number>> => {
  const dates = daySeries(dateFrom, dateTo);
  const result: Record<string, number> = {};

  await Promise.all(
    dates.map(async (iso) => {
      const start = Math.floor(new Date(`${iso}T00:00:00.000Z`).getTime() / 1000);
      const end = start + 86400;

      try {
        const json = await fetchInstagramJson(
          `${graphBase}/${instagramBusinessAccountId}/insights` +
          `?metric=${metricName}&metric_type=total_value&period=day` +
          `&since=${start}&until=${end}&access_token=${instagramAccessToken}`,
        );
        result[iso] = extractInstagramMetricTotal(json.data ?? [], metricName);
      } catch {
        result[iso] = 0;
      }
    }),
  );

  return result;
};

const fetchInstagramMediaInsights = async (
  graphBase: string,
  mediaId: string,
  instagramAccessToken: string,
  mediaProductType: string,
  isVideo: boolean,
): Promise<Pick<InstagramOverview['media'][number], 'reach' | 'impressions' | 'saved' | 'shares' | 'videoViews'>> => {
  const empty = { reach: null, impressions: null, saved: null, shares: null, videoViews: null };

  try {
    const normalizedProductType = asString(mediaProductType).toUpperCase();
    const result = { ...empty };
    const metrics = ['reach'];

    if (normalizedProductType === 'FEED') metrics.push('views');
    if (normalizedProductType !== 'STORY') metrics.push('saved');
    if (normalizedProductType === 'FEED' || normalizedProductType === 'REEL' || normalizedProductType === 'REELS') metrics.push('shares');
    if (isVideo) metrics.push(normalizedProductType === 'REELS' ? 'views' : 'video_views');

    for (const metric of metrics) {
      try {
        const json = await fetchInstagramJson(
          `${graphBase}/${mediaId}/insights?metric=${metric}&access_token=${instagramAccessToken}`,
        );

        for (const item of Array.isArray(json?.data) ? json.data : []) {
          const value = item?.total_value?.value ?? item?.values?.[0]?.value ?? item?.value ?? null;
          const parsedValue = typeof value === 'number' ? value : null;

          if (item?.name === 'reach') result.reach = parsedValue;
          if (item?.name === 'views') result.impressions = parsedValue;
          if (item?.name === 'saved') result.saved = parsedValue;
          if (item?.name === 'shares') result.shares = parsedValue;
          if (item?.name === 'video_views' || item?.name === 'views') result.videoViews = parsedValue;
        }
      } catch {
        // Alguns tipos de mídia não suportam todas as métricas.
      }
    }

    return result;
  } catch {
    return empty;
  }
};

const parseInstagramDemographics = (dataArr: any[]) => {
  let cities: Array<{ city: string; count: number }> = [];
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
            city: asString(result?.dimension_values?.[0]),
            count: asNumber(result?.value),
          }))
          .filter((city) => city.city)
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
      }

      if (keys.includes('age') && keys.includes('gender')) {
        const ageIdx = keys.indexOf('age');
        const genderIdx = keys.indexOf('gender');

        for (const result of results) {
          const age = asString(result?.dimension_values?.[ageIdx]);
          const gender = asString(result?.dimension_values?.[genderIdx]).toUpperCase();
          const count = asNumber(result?.value);
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

  const ageGroups = Object.entries(ageMap)
    .map(([range, value]) => ({ range, male: value.male, female: value.female, total: value.male + value.female }))
    .sort((a, b) => (Number.parseInt(a.range, 10) || 0) - (Number.parseInt(b.range, 10) || 0));

  const genderTotal = totalMale + totalFemale + totalUnknown;

  return {
    cities,
    ageGroups,
    gender: genderTotal > 0 ? { male: totalMale, female: totalFemale, unknown: totalUnknown, total: genderTotal } : null,
  };
};

const buildInstagramOverview = async (
  instagramAccessToken: string,
  instagramBusinessAccountId: string,
  dateFrom: string,
  dateTo: string,
): Promise<InstagramOverview> => {
  try {
    const since = Math.floor(new Date(`${dateFrom}T00:00:00.000Z`).getTime() / 1000);
    const until = Math.floor(new Date(`${nextDateIso(dateTo)}T00:00:00.000Z`).getTime() / 1000);
    const graphBase = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

    // Phase 1: Profile — required; fail fast if this call fails
    const profileJson = await fetchInstagramJson(
      `${graphBase}/${instagramBusinessAccountId}?fields=username,name,followers_count,media_count,profile_picture_url&access_token=${instagramAccessToken}`,
    );

    // Phase 2: Account-level insights — requires instagram_manage_insights; optional
    const reachSeriesMap = new Map<string, number>();
    let totalViews = 0;
    let totalProfileViews = 0;
    let totalFollowerGain = 0;
    let totalAccountsEngaged = 0;
    let viewsSeries: Record<string, number> = {};
    let profileViewsSeries: Record<string, number> = {};
    let engagedSeries: Record<string, number> = {};
    let followerSeries: Record<string, number> = {};
    let audience: InstagramOverview['audience'] = { cities: [], ageGroups: [], gender: null };

    try {
      const [reachJson, totalsJson, followerCountJson, fetchedViewsSeries, fetchedProfileViewsSeries, fetchedEngagedSeries, demoCityJson, demoAgeJson] = await Promise.all([
        fetchInstagramJson(
          `${graphBase}/${instagramBusinessAccountId}/insights?metric=reach&period=day&since=${since}&until=${until}&access_token=${instagramAccessToken}`,
        ),
        fetchInstagramJson(
          `${graphBase}/${instagramBusinessAccountId}/insights?metric=views,profile_views,follows_and_unfollows,accounts_engaged&metric_type=total_value&period=day&since=${since}&until=${until}&access_token=${instagramAccessToken}`,
        ),
        fetchInstagramJson(
          `${graphBase}/${instagramBusinessAccountId}/insights?metric=follower_count&period=day&since=${since}&until=${until}&access_token=${instagramAccessToken}`,
        ).catch(() => ({ data: [] })),
        fetchInstagramDailyTotalValueSeries(graphBase, instagramBusinessAccountId, instagramAccessToken, 'views', dateFrom, dateTo),
        fetchInstagramDailyTotalValueSeries(graphBase, instagramBusinessAccountId, instagramAccessToken, 'profile_views', dateFrom, dateTo),
        fetchInstagramDailyTotalValueSeries(graphBase, instagramBusinessAccountId, instagramAccessToken, 'accounts_engaged', dateFrom, dateTo),
        fetchInstagramJson(
          `${graphBase}/${instagramBusinessAccountId}/insights?metric=follower_demographics&metric_type=total_value&period=lifetime&breakdown=city&access_token=${instagramAccessToken}`,
        ).catch(() => ({ data: [] })),
        fetchInstagramJson(
          `${graphBase}/${instagramBusinessAccountId}/insights?metric=follower_demographics&metric_type=total_value&period=lifetime&breakdown=age,gender&access_token=${instagramAccessToken}`,
        ).catch(() => ({ data: [] })),
      ]);

      const reachMetric = Array.isArray(reachJson?.data) ? reachJson.data.find((item: any) => item?.name === 'reach') : null;
      for (const point of reachMetric?.values ?? []) {
        const iso = asString(point?.end_time).slice(0, 10);
        if (!iso) continue;
        reachSeriesMap.set(iso, (reachSeriesMap.get(iso) ?? 0) + asNumber(point?.value));
      }

      const totalValueMetric = (name: string) =>
        asNumber(
          Array.isArray(totalsJson?.data)
            ? totalsJson.data.find((item: any) => item?.name === name)?.total_value?.value ??
                totalsJson.data.find((item: any) => item?.name === name)?.values?.[0]?.value
            : 0,
        );

      viewsSeries = fetchedViewsSeries;
      profileViewsSeries = fetchedProfileViewsSeries;
      engagedSeries = fetchedEngagedSeries;
      followerSeries = extractInstagramMetricSeries(followerCountJson.data ?? [], 'follower_count');
      totalViews = Object.values(viewsSeries).reduce((sum, value) => sum + value, 0);
      totalProfileViews = Object.values(profileViewsSeries).reduce((sum, value) => sum + value, 0);
      totalFollowerGain = Object.values(followerSeries).reduce((sum, value) => sum + value, 0);
      totalAccountsEngaged = Object.values(engagedSeries).reduce((sum, value) => sum + value, 0);
      audience = parseInstagramDemographics([
        ...((demoCityJson.data ?? []) as any[]),
        ...((demoAgeJson.data ?? []) as any[]),
      ]);
    } catch {
      // Insights permission not granted — profile + media still available
    }

    // Phase 3: Media listing — optional
    let media: InstagramOverview['media'] = [];
    try {
      let mediaJson: any;
      try {
        mediaJson = await fetchInstagramJson(
          `${graphBase}/${instagramBusinessAccountId}/media?fields=id,caption,comments_count,like_count,media_type,media_product_type,media_url,thumbnail_url,timestamp,permalink&limit=25&access_token=${instagramAccessToken}`,
        );
      } catch {
        // Fallback para contas que falham com campos mais ricos no endpoint de media.
        mediaJson = await fetchInstagramJson(
          `${graphBase}/${instagramBusinessAccountId}/media?fields=id,caption,media_type,media_url,thumbnail_url,timestamp,permalink&limit=25&access_token=${instagramAccessToken}`,
        );
      }

      media = await Promise.all(
        ((Array.isArray(mediaJson?.data) ? mediaJson.data : []) as any[]).map(async (item: any) => {
          const mediaId = asString(item?.id);
          const productType = asString(item?.media_product_type).toUpperCase();
          const mediaType = asString(item?.media_type).toUpperCase();
          const insights = mediaId
            ? await fetchInstagramMediaInsights(
                graphBase,
                mediaId,
                instagramAccessToken,
                productType || 'FEED',
                mediaType === 'VIDEO',
              )
            : { reach: null, impressions: null, saved: null, shares: null, videoViews: null };

          const commentsCount = typeof item?.comments_count === 'number' ? item.comments_count : null;
          const likeCount = typeof item?.like_count === 'number' ? item.like_count : null;
          const saved = insights.saved;
          const shares = insights.shares;
          const totalInteractions = [commentsCount, likeCount, saved, shares]
            .filter((value): value is number => typeof value === 'number')
            .reduce((sum, value) => sum + value, 0);

          return {
            id: mediaId,
            caption: asString(item?.caption),
            mediaType,
            mediaProductType: productType || 'FEED',
            mediaUrl: asString(item?.media_url),
            thumbnailUrl: asString(item?.thumbnail_url) || asString(item?.media_url),
            timestamp: asString(item?.timestamp),
            permalink: asString(item?.permalink),
            reach: insights.reach,
            impressions: insights.impressions,
            saved,
            shares,
            videoViews: insights.videoViews,
            commentsCount,
            likeCount,
            totalInteractions,
          };
        }),
      );
    } catch {
      // Media unavailable — continue with profile + insights
    }

    return {
      available: true,
      profile: {
        username: asString(profileJson?.username),
        name: asString(profileJson?.name),
        followersCount: asNumber(profileJson?.followers_count),
        mediaCount: asNumber(profileJson?.media_count),
        profilePictureUrl: asString(profileJson?.profile_picture_url),
      },
      summary: {
        totalReach: Array.from(reachSeriesMap.values()).reduce((sum, value) => sum + value, 0),
        totalViews,
        totalProfileViews,
        totalFollowerGain,
        totalAccountsEngaged,
      },
      series: daySeries(dateFrom, dateTo).map((date) => ({
        date: `${date.slice(8, 10)}/${date.slice(5, 7)}`,
        dateIso: date,
        reach: reachSeriesMap.get(date) ?? 0,
        views: viewsSeries[date] ?? 0,
        followerDelta: followerSeries[date] ?? 0,
        accountsEngaged: engagedSeries[date] ?? 0,
      })),
      audience,
      media,
    };
  } catch (error: any) {
    return buildEmptyInstagramOverview(error?.message ?? 'failed to load instagram overview');
  }
};

const loadBusinessOverview = async (
  supabaseAdmin: SupabaseClient,
  companyId: string,
  startIso: string,
  endExclusiveIso: string,
): Promise<BusinessOverview> => {
  const pendingBeforeIso = new Date(new Date(endExclusiveIso).getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();

  const [leadsCreated, wonLeads, revenueRes, pendingRes] = await Promise.all([
    supabaseAdmin.from('leads').select('id', { count: 'exact', head: true }).eq('company_id', companyId).gte('created_at', startIso).lt('created_at', endExclusiveIso),
    supabaseAdmin.from('leads').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'won').gte('updated_at', startIso).lt('updated_at', endExclusiveIso),
    supabaseAdmin.from('leads').select('value').eq('company_id', companyId).eq('status', 'won').gte('updated_at', startIso).lt('updated_at', endExclusiveIso),
    supabaseAdmin
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .not('status', 'in', '(won,lost)')
      .lt('created_at', pendingBeforeIso)
      .or(`last_interaction_at.is.null,last_interaction_at.lt.${pendingBeforeIso}`),
  ]);

  const revenue = ((revenueRes.data ?? []) as Array<{ value?: number | null }>).reduce((sum, row) => sum + asNumber(row?.value), 0);
  return {
    crmLeads: leadsCreated.count ?? 0,
    won: wonLeads.count ?? 0,
    revenue,
    pendingFollowup: pendingRes.count ?? 0,
  };
};

export const loadPortalBootstrap = async (
  supabaseAdmin: SupabaseClient,
  token: string,
  preferredCompanyId?: string | null,
) => {
  const context = await getPortalContext(supabaseAdmin, token);
  const selectedCompanyId =
    (preferredCompanyId && context.companies.some((item) => item.id === preferredCompanyId) ? preferredCompanyId : null) ??
    (context.companies.find((item) => item.id === context.defaultCompanyId)?.id ?? context.companies[0]?.id ?? null);
  if (!selectedCompanyId) throw new Error('portal has no default company');

  const weeklyList = await loadPortalWeeklyList(supabaseAdmin, token, selectedCompanyId);
  return {
    portal: {
      id: context.id,
      name: context.name,
      publicToken: context.publicToken,
      defaultCompanyId: context.defaultCompanyId,
      themePayload: context.themePayload,
    },
    companies: context.companies,
    selectedCompanyId,
    weekly: weeklyList.items,
  };
};

export const loadPortalOverview = async (
  supabaseAdmin: SupabaseClient,
  input: {
    token: string;
    companyId: string;
    dateFrom?: string;
    dateTo?: string;
    campaignIds?: string[];
  },
) => {
  const context = await getPortalContext(supabaseAdmin, input.token);
  const company = assertCompanyAllowed(context, input.companyId);
  const window = buildDateWindow(input.dateFrom, input.dateTo);
  const { metaCampaignIds, googleCampaignIds } = splitCampaignIds(input.campaignIds ?? []);

  const { data: companyRow, error: companyError } = await supabaseAdmin
    .from('companies')
    .select(
      'id,name,brand_name,brand_logo_url,brand_primary_color,meta_ad_account_id,meta_access_token,meta_token_expires_at,google_ads_customer_id,google_ads_login_customer_id,google_ads_currency_code,instagram_business_account_id,instagram_username,instagram_access_token,instagram_token_expires_at',
    )
    .eq('id', company.id)
    .maybeSingle();

  if (companyError) throw companyError;
  if (!companyRow) throw new Error('company not found');

  const metaAdAccountId = asString((companyRow as any)?.meta_ad_account_id);
  const metaAccessToken = asString((companyRow as any)?.meta_access_token);
  const googleAdsCustomerId = asString((companyRow as any)?.google_ads_customer_id).replace(/\D/g, '');
  const googleAdsLoginCustomerId =
    asString((companyRow as any)?.google_ads_login_customer_id).replace(/\D/g, '') || GOOGLE_ADS_LOGIN_CUSTOMER_ID || null;
  const googleAdsCurrencyCode = asString((companyRow as any)?.google_ads_currency_code) || null;
  const instagramBusinessAccountId = asString((companyRow as any)?.instagram_business_account_id);
  const instagramAccessToken = resolveInstagramApiToken(companyRow)?.token ?? null;

  const [meta, googleAds, instagram, business] = await Promise.all([
    metaAdAccountId && metaAccessToken
      ? aggregateMetaOverview(metaAccessToken, metaAdAccountId, window.dateFrom, window.dateTo, metaCampaignIds)
      : Promise.resolve(buildEmptyMetaOverview('meta ads not configured')),
    googleAdsCustomerId
      ? aggregateGoogleOverview(
          googleAdsCustomerId,
          googleAdsLoginCustomerId,
          googleAdsCurrencyCode,
          window.dateFrom,
          window.dateTo,
          googleCampaignIds,
        )
      : Promise.resolve(buildEmptyGoogleOverview('google ads not configured')),
    instagramBusinessAccountId && instagramAccessToken
      ? buildInstagramOverview(instagramAccessToken, instagramBusinessAccountId, window.dateFrom, window.dateTo)
      : Promise.resolve(buildEmptyInstagramOverview('instagram not configured')),
    loadBusinessOverview(supabaseAdmin, company.id, window.startIso, window.endExclusiveIso),
  ]);

  return {
    portal: {
      id: context.id,
      name: context.name,
      themePayload: context.themePayload,
      company,
    },
    filters: {
      companyId: company.id,
      dateFrom: window.dateFrom,
      dateTo: window.dateTo,
      campaignIds: input.campaignIds ?? [],
    },
    overview: {
      meta,
      googleAds,
      instagram,
      business,
    },
  };
};

export const loadPortalWeeklyList = async (
  supabaseAdmin: SupabaseClient,
  token: string,
  companyId: string,
) => {
  const context = await getPortalContext(supabaseAdmin, token);
  assertCompanyAllowed(context, companyId);

  const { data, error } = await supabaseAdmin
    .from('weekly_reports')
    .select('id,period_start,period_end,summary,created_at')
    .eq('company_id', companyId)
    .order('period_start', { ascending: false })
    .limit(24);

  if (error) throw error;

  return {
    items: ((data ?? []) as any[]).map((row) => ({
      id: String(row.id),
      periodStart: String(row.period_start),
      periodEnd: String(row.period_end),
      summary: row.summary ? String(row.summary) : null,
      createdAt: String(row.created_at),
    })),
  };
};

export const loadPortalWeeklyDetail = async (
  supabaseAdmin: SupabaseClient,
  token: string,
  companyId: string,
  reportId: string,
) => {
  const context = await getPortalContext(supabaseAdmin, token);
  assertCompanyAllowed(context, companyId);
  const link = await getPortalLinkRow(supabaseAdmin, token);
  const { data: companyRow, error: companyError } = await supabaseAdmin
    .from('companies')
    .select('meta_ad_account_id,meta_access_token,meta_token_expires_at')
    .eq('id', companyId)
    .maybeSingle();

  if (companyError) throw companyError;

  const { data, error } = await supabaseAdmin
    .from('weekly_reports')
    .select('id,company_id,period_start,period_end,metrics,summary,highlights,risks,next_week,created_at,updated_at')
    .eq('company_id', companyId)
    .eq('id', reportId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('weekly report not found');
  const trafficLikeReport = await buildPortalWeeklyTrafficLikeReport(
    supabaseAdmin,
    link,
    companyRow ?? {},
    String((data as any).period_start),
    String((data as any).period_end),
    {
      summary: (data as any).summary ?? null,
      highlights: ((data as any).highlights ?? []) as string[] | null,
      risks: ((data as any).risks ?? []) as string[] | null,
      next_week: ((data as any).next_week ?? []) as string[] | null,
    },
  ).catch(() => null);

  return {
    ...(data as WeeklyReportRow),
    traffic_report: null,
    traffic_like_report: trafficLikeReport,
  } as WeeklyReportRow & {
    traffic_report: {
      public_id: string;
      title: string | null;
      created_at: string;
    } | null;
    traffic_like_report: Record<string, unknown> | null;
  };
};

const buildFallbackWeeklyNarrative = (input: {
  companyName: string;
  periodStart: string;
  periodEnd: string;
  metrics: Json;
}) => {
  const meta = (input.metrics.meta ?? {}) as any;
  const googleAds = (input.metrics.google_ads ?? {}) as any;
  const instagram = (input.metrics.instagram ?? {}) as any;
  const business = (input.metrics.business ?? {}) as any;
  const totalSpend = asNumber(meta?.summary?.spend) + asNumber(googleAds?.summary?.spend);
  const totalLeads = asNumber(meta?.summary?.results) + asNumber(googleAds?.summary?.conversions) + asNumber(business?.crmLeads);
  const revenue = asNumber(business?.revenue);

  const highlights = [
    `Investimento total do período: ${totalSpend.toFixed(2)}.`,
    `Captação consolidada: ${Math.round(totalLeads)} Leads entre mídia e CRM.`,
    `Instagram gerou ${Math.round(asNumber(instagram?.summary?.totalProfileViews))} visitas ao perfil no período.`,
  ];

  const risks: string[] = [];
  if (totalLeads === 0) risks.push('Não houve geração relevante de leads no período.');
  if (revenue === 0) risks.push('Nenhuma receita marcada como won no CRM durante a semana.');
  if (asNumber(business?.pendingFollowup) > 0) risks.push(`Existem ${Math.round(asNumber(business?.pendingFollowup))} leads com follow-up pendente.`);

  const nextWeek = [
    'Revisar campanhas com maior gasto e menor resultado.',
    'Ajustar criativos e segmentações com base nos canais mais eficientes.',
    'Garantir resposta rápida no CRM para reduzir follow-up pendente.',
  ];

  return {
    summary: `${input.companyName}: resumo de ${input.periodStart} até ${input.periodEnd} com ${Math.round(totalLeads)} resultados consolidados e receita de ${revenue.toFixed(2)}.`,
    highlights,
    risks,
    next_week: nextWeek,
  };
};

const generateWeeklyNarrative = async (input: {
  companyName: string;
  periodStart: string;
  periodEnd: string;
  metrics: Json;
}) => {
  if (!OPENAI_API_KEY) {
    return buildFallbackWeeklyNarrative(input);
  }

  const fallback = buildFallbackWeeklyNarrative(input);
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${OPENAI_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Você gera resumos semanais de marketing em JSON. Responda APENAS com JSON válido contendo: summary (string), highlights (string[]), risks (string[]), next_week (string[]). Seja objetivo e em português do Brasil.',
          },
          {
            role: 'user',
            content: JSON.stringify(input),
          },
        ],
      }),
    });

    const text = await response.text().catch(() => '');
    if (!response.ok) return fallback;
    const json = text ? JSON.parse(text) : {};
    const content = json?.choices?.[0]?.message?.content;
    if (!content) return fallback;
    const parsed = JSON.parse(content);
    return {
      summary: typeof parsed?.summary === 'string' ? parsed.summary : fallback.summary,
      highlights: Array.isArray(parsed?.highlights) ? parsed.highlights.map((item: unknown) => String(item)) : fallback.highlights,
      risks: Array.isArray(parsed?.risks) ? parsed.risks.map((item: unknown) => String(item)) : fallback.risks,
      next_week: Array.isArray(parsed?.next_week) ? parsed.next_week.map((item: unknown) => String(item)) : fallback.next_week,
    };
  } catch {
    return fallback;
  }
};

export const buildWeeklyReportPayload = async (
  supabaseAdmin: SupabaseClient,
  companyId: string,
  periodStart: string,
  periodEnd: string,
) => {
  const { data: companyRow, error } = await supabaseAdmin
    .from('companies')
    .select(
      'id,name,brand_name,meta_ad_account_id,meta_access_token,meta_token_expires_at,google_ads_customer_id,google_ads_login_customer_id,google_ads_currency_code,instagram_business_account_id,instagram_access_token,instagram_token_expires_at',
    )
    .eq('id', companyId)
    .maybeSingle();

  if (error) throw error;
  if (!companyRow) throw new Error('company not found');

  const meta = asString((companyRow as any)?.meta_ad_account_id) && asString((companyRow as any)?.meta_access_token)
    ? await aggregateMetaOverview(
        asString((companyRow as any)?.meta_access_token),
        asString((companyRow as any)?.meta_ad_account_id),
        periodStart,
        periodEnd,
        [],
      )
    : buildEmptyMetaOverview('meta ads not configured');

  const googleAds = asString((companyRow as any)?.google_ads_customer_id)
    ? await aggregateGoogleOverview(
        asString((companyRow as any)?.google_ads_customer_id).replace(/\D/g, ''),
        asString((companyRow as any)?.google_ads_login_customer_id).replace(/\D/g, '') || GOOGLE_ADS_LOGIN_CUSTOMER_ID || null,
        asString((companyRow as any)?.google_ads_currency_code) || null,
        periodStart,
        periodEnd,
        [],
      )
    : buildEmptyGoogleOverview('google ads not configured');

  const _igResolved = resolveInstagramApiToken(companyRow);
  const instagram = asString((companyRow as any)?.instagram_business_account_id) && _igResolved
    ? await buildInstagramOverview(
        _igResolved.token,
        asString((companyRow as any)?.instagram_business_account_id),
        periodStart,
        periodEnd,
      )
    : buildEmptyInstagramOverview('instagram not configured');

  const business = await loadBusinessOverview(
    supabaseAdmin,
    companyId,
    `${periodStart}T00:00:00.000Z`,
    `${nextDateIso(periodEnd)}T00:00:00.000Z`,
  );

  const metrics: Json = {
    period: {
      start: periodStart,
      end: periodEnd,
      days: dateDiffDays(periodStart, periodEnd) + 1,
    },
    meta,
    google_ads: googleAds,
    instagram,
    business,
  };

  const narrative = await generateWeeklyNarrative({
    companyName: asString((companyRow as any)?.brand_name) || asString((companyRow as any)?.name) || 'Cliente',
    periodStart,
    periodEnd,
    metrics,
  });

  return {
    metrics,
    summary: narrative.summary,
    highlights: narrative.highlights,
    risks: narrative.risks,
    next_week: narrative.next_week,
  };
};

export const upsertWeeklyReport = async (
  supabaseAdmin: SupabaseClient,
  companyId: string,
  periodStart: string,
  periodEnd: string,
) => {
  const payload = await buildWeeklyReportPayload(supabaseAdmin, companyId, periodStart, periodEnd);
  const { data, error } = await supabaseAdmin
    .from('weekly_reports')
    .upsert(
      {
        company_id: companyId,
        period_start: periodStart,
        period_end: periodEnd,
        metrics: payload.metrics,
        summary: payload.summary,
        highlights: payload.highlights,
        risks: payload.risks,
        next_week: payload.next_week,
      },
      { onConflict: 'company_id,period_start,period_end' },
    )
    .select('id,company_id,period_start,period_end,metrics,summary,highlights,risks,next_week,created_at,updated_at')
    .single();

  if (error) throw error;
  return data as WeeklyReportRow;
};

export const lastCompletedWeekRange = (reference = new Date()) => {
  const utc = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()));
  const day = utc.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const currentWeekMonday = new Date(utc);
  currentWeekMonday.setUTCDate(currentWeekMonday.getUTCDate() + diffToMonday);

  const start = new Date(currentWeekMonday);
  start.setUTCDate(start.getUTCDate() - 7);
  const end = new Date(currentWeekMonday);
  end.setUTCDate(end.getUTCDate() - 1);

  return {
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
  };
};

export const listCompaniesForWeeklySync = async (supabaseAdmin: SupabaseClient) => {
  const { data, error } = await supabaseAdmin.from('companies').select('id').order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as any[]).map((row) => String(row.id)).filter(Boolean);
};

// ─── Portal Links (direct ad-account dashboards) ──────────────────────────────

type PortalLinkRow = {
  id: string;
  company_id: string;
  public_token: string;
  name: string;
  client_name: string | null;
  meta_ad_account_id: string;
  meta_ad_account_name: string | null;
  instagram_business_account_id: string | null;
  instagram_username: string | null;
  status: string;
};

const getPortalLinkRow = async (supabaseAdmin: SupabaseClient, token: string): Promise<PortalLinkRow> => {
  const clean = asString(token);
  if (!clean || clean.length < 16) throw new Error('token inválido');

  const { data, error } = await supabaseAdmin
    .from('portal_links')
    .select('id,company_id,public_token,name,client_name,meta_ad_account_id,meta_ad_account_name,instagram_business_account_id,instagram_username,status')
    .eq('public_token', clean)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('dashboard não encontrado');
  if ((data as any).status !== 'active') throw new Error('dashboard inativo');
  return data as PortalLinkRow;
};

const getCompanyMetaToken = async (supabaseAdmin: SupabaseClient, companyId: string): Promise<string> => {
  const { data, error } = await supabaseAdmin
    .from('companies')
    .select('meta_access_token,meta_token_expires_at,instagram_access_token,instagram_token_expires_at')
    .eq('id', companyId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('empresa não encontrada');
  const token = asString((data as any)?.meta_access_token);
  if (!token) throw new Error('Token Meta não configurado para esta empresa. Reconecte o Facebook em Configurações.');
  return token;
};

const resolveInstagramApiToken = (row: any): { token: string; expiresAtMs: number } | null => {
  const now = Date.now();
  const instagramToken = asString(row?.instagram_access_token);
  const instagramExpiresAtRaw = asString(row?.instagram_token_expires_at);
  const instagramExpiresAtMs = instagramExpiresAtRaw ? new Date(instagramExpiresAtRaw).getTime() : 0;

  // Prioriza o token dedicado com validade conhecida.
  if (instagramToken && instagramExpiresAtMs > now) return { token: instagramToken, expiresAtMs: instagramExpiresAtMs };

  // Fallback legado: algumas empresas ainda têm token salvo sem expires_at.
  // Não é ideal para /media, mas evita derrubar toda a visão geral do portal.
  if (instagramToken) return { token: instagramToken, expiresAtMs: 0 };

  return null;
};

const refreshInstagramTokenIfNeeded = async (
  supabaseAdmin: SupabaseClient,
  companyId: string,
  token: string,
  expiresAtMs: number,
): Promise<void> => {
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  if (!expiresAtMs) return;
  if (expiresAtMs - Date.now() > sevenDays) return;
  if (!META_APP_ID || !META_APP_SECRET) return;

  try {
    const url =
      `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token` +
      `?grant_type=fb_exchange_token` +
      `&client_id=${encodeURIComponent(META_APP_ID)}` +
      `&client_secret=${encodeURIComponent(META_APP_SECRET)}` +
      `&fb_exchange_token=${encodeURIComponent(token)}`;

    const res = await fetch(url);
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.access_token) return;

    const expiresInSec = Number(json.expires_in ?? 5_184_000);
    const newExpiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();
    await supabaseAdmin
      .from('companies')
      .update({ instagram_access_token: json.access_token, instagram_token_expires_at: newExpiresAt })
      .eq('id', companyId);
  } catch {
    // Silencioso — o token atual ainda é válido
  }
};

const getCompanyInstagramToken = async (supabaseAdmin: SupabaseClient, companyId: string): Promise<string> => {
  const { data, error } = await supabaseAdmin
    .from('companies')
    .select('instagram_access_token,instagram_token_expires_at,meta_access_token,meta_token_expires_at')
    .eq('id', companyId)
    .maybeSingle();

  if (error) throw error;
  const resolved = resolveInstagramApiToken(data);
  if (!resolved) throw new Error('Token Instagram não configurado');
  return resolved.token;
};

export const loadDashboardBootstrap = async (supabaseAdmin: SupabaseClient, token: string) => {
  const link = await getPortalLinkRow(supabaseAdmin, token);
  let metaAccountName = link.meta_ad_account_name || link.meta_ad_account_id;
  let instagramProfile: InstagramOverview['profile'] | null = null;
  const { data: companyTokens, error: companyTokensError } = await supabaseAdmin
    .from('companies')
    .select('meta_access_token,meta_token_expires_at,instagram_access_token,instagram_token_expires_at')
    .eq('id', link.company_id)
    .maybeSingle();

  if (companyTokensError) throw companyTokensError;

  const metaToken = asString((companyTokens as any)?.meta_access_token);
  const instagramResolved = resolveInstagramApiToken(companyTokens);
  const instagramToken = instagramResolved?.token ?? null;

  // Renova o token em background se estiver próximo do vencimento
  if (instagramResolved) {
    refreshInstagramTokenIfNeeded(supabaseAdmin, link.company_id, instagramResolved.token, instagramResolved.expiresAtMs).catch(() => {});
  }

  if (metaToken) {
    try {
      metaAccountName = await getMetaAccountName(metaToken, link.meta_ad_account_id);
    } catch {
      // keep persisted name if the live lookup fails
    }
  }

  if (link.instagram_business_account_id && instagramToken) {
    const baseUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/${link.instagram_business_account_id}`;
    const profileJson = await fetchJson(
      `${baseUrl}?fields=username,name,followers_count,media_count,profile_picture_url&access_token=${instagramToken}`,
    ).catch(() => null);
    if (profileJson) {
      instagramProfile = {
        username: asString(profileJson?.username),
        name: asString(profileJson?.name),
        followersCount: asNumber(profileJson?.followers_count),
        mediaCount: asNumber(profileJson?.media_count),
        profilePictureUrl: asString(profileJson?.profile_picture_url),
      };
    }
  }

  return {
    id: link.id,
    name: link.name,
    clientName: link.client_name,
    metaAdAccountId: link.meta_ad_account_id,
    metaAdAccountName: metaAccountName,
    instagramBusinessAccountId: link.instagram_business_account_id,
    instagramUsername: link.instagram_username || instagramProfile?.username || null,
    instagramProfile,
  };
};

export const loadDashboardData = async (
  supabaseAdmin: SupabaseClient,
  token: string,
  dateFromRaw?: string,
  dateToRaw?: string,
  campaignIds?: string[],
) => {
  const link = await getPortalLinkRow(supabaseAdmin, token);
  const window = buildDateWindow(dateFromRaw, dateToRaw);
  const { metaCampaignIds } = splitCampaignIds(campaignIds ?? []);
  const { data: companyTokens, error: companyTokensError } = await supabaseAdmin
    .from('companies')
    .select('meta_access_token,meta_token_expires_at,instagram_access_token,instagram_token_expires_at')
    .eq('id', link.company_id)
    .maybeSingle();

  if (companyTokensError) throw companyTokensError;

  const metaToken = asString((companyTokens as any)?.meta_access_token);
  const igResolved = resolveInstagramApiToken(companyTokens);
  const igToken = igResolved?.token ?? null;

  // Renova o token em background se estiver próximo do vencimento
  if (igResolved) {
    refreshInstagramTokenIfNeeded(supabaseAdmin, link.company_id, igResolved.token, igResolved.expiresAtMs).catch(() => {});
  }

  const [meta, instagram] = await Promise.all([
    metaToken
      ? aggregateMetaOverview(metaToken, link.meta_ad_account_id, window.dateFrom, window.dateTo, metaCampaignIds)
      : Promise.resolve(buildEmptyMetaOverview('Meta Ads nao configurado para esta empresa.')),
    link.instagram_business_account_id && igToken
      ? buildInstagramOverview(igToken, link.instagram_business_account_id, window.dateFrom, window.dateTo)
      : Promise.resolve(buildEmptyInstagramOverview('Instagram não configurado para este portal')),
  ]);

  // also compute previous period for delta
  const prevDays = dateDiffDays(window.dateFrom, window.dateTo) + 1;
  const prevEnd = new Date(`${window.dateFrom}T00:00:00.000Z`);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevStart.getUTCDate() - (prevDays - 1));
  const prevDateFrom = prevStart.toISOString().slice(0, 10);
  const prevDateTo = prevEnd.toISOString().slice(0, 10);

  const [prevMeta, prevInstagram] = await Promise.all([
    metaToken
      ? aggregateMetaOverview(metaToken, link.meta_ad_account_id, prevDateFrom, prevDateTo, metaCampaignIds)
      : Promise.resolve(buildEmptyMetaOverview('Meta Ads nao configurado para esta empresa.')),
    link.instagram_business_account_id && igToken
      ? buildInstagramOverview(igToken, link.instagram_business_account_id, prevDateFrom, prevDateTo)
      : Promise.resolve(buildEmptyInstagramOverview('')),
  ]);

  return {
    dateFrom: window.dateFrom,
    dateTo: window.dateTo,
    prevDateFrom,
    prevDateTo,
    meta,
    prevMeta,
    instagram,
    prevInstagram,
  };
};

export const loadDashboardCampaignAds = async (
  supabaseAdmin: SupabaseClient,
  token: string,
  dateFromRaw?: string,
  dateToRaw?: string,
  campaignIdRaw?: string,
) => {
  const link = await getPortalLinkRow(supabaseAdmin, token);
  const window = buildDateWindow(dateFromRaw, dateToRaw);
  const campaignId = asString(campaignIdRaw);
  if (!campaignId) throw new Error('campaign_id ausente');

  const { data: companyTokens, error: companyTokensError } = await supabaseAdmin
    .from('companies')
    .select('meta_access_token')
    .eq('id', link.company_id)
    .maybeSingle();

  if (companyTokensError) throw companyTokensError;

  const metaToken = asString((companyTokens as any)?.meta_access_token);
  if (!metaToken) throw new Error('Meta Ads nao configurado para esta empresa.');

  const rows = await fetchMetaAdInsights(metaToken, link.meta_ad_account_id, window.dateFrom, window.dateTo, campaignId);
  const adMap = new Map<string, MetaAdRow>();
  let campaignName = '';

  for (const row of rows) {
    const adId = asString(row?.ad_id);
    if (!adId) continue;

    const adName = asString(row?.ad_name) || adId;
    const currentCampaignId = asString(row?.campaign_id) || campaignId;
    const currentCampaignName = asString(row?.campaign_name) || currentCampaignId || 'Campanha';
    const spend = asNumber(row?.spend);
    const impressions = asNumber(row?.impressions);
    const reach = asNumber(row?.reach);
    const clicks = asNumber(row?.clicks);
    const linkClicks = asNumber(row?.inline_link_clicks);
    const ctr = asNumber(row?.ctr);
    const cpc = asNumber(row?.cpc);
    const cpm = asNumber(row?.cpm);
    const frequency = asNumber(row?.frequency);
    const actions = Array.isArray(row?.actions) ? row.actions : [];
    const resultsPayload = Array.isArray(row?.results) ? row.results : [];
    const resultIndicator = extractResultIndicator(resultsPayload);
    const isProfileVisitCampaign = resultIndicator === 'profile_visit_view';
    const costPerActionType = Array.isArray(row?.cost_per_action_type) ? row.cost_per_action_type : [];
    const videoThruplayActions = Array.isArray(row?.video_thruplay_watched_actions) ? row.video_thruplay_watched_actions : [];
    const leadForms = isProfileVisitCampaign ? 0 : extractLeadForms(actions) || deriveCountFromCostPerAction(spend, costPerActionType, extractLeadForms);
    const messagesStarted = isProfileVisitCampaign ? 0 : extractMessagingStarted(actions) || deriveCountFromCostPerAction(spend, costPerActionType, extractMessagingStarted);
    const siteLeads = isProfileVisitCampaign ? 0 : extractSiteLeads(actions) || deriveCountFromCostPerAction(spend, costPerActionType, extractSiteLeads);
    const landingPageViews = extractLandingPageViews(actions) || deriveCountFromCostPerAction(spend, costPerActionType, extractLandingPageViews);
    const profileVisits =
      asNumber(row?.instagram_profile_visits) ||
      (isProfileVisitCampaign ? extractResultValue(resultsPayload) : 0) ||
      extractProfileVisits(actions) ||
      deriveCountFromCostPerAction(spend, costPerActionType, extractProfileVisits);
    const followers = 0;
    const videoViews = extractVideoViews(actions);
    const thruplays =
      extractThruplays(actions) ||
      extractActionTotal(videoThruplayActions) ||
      deriveCountFromCostPerAction(spend, costPerActionType, extractThruplays);
    const results = leadForms + messagesStarted + siteLeads;

    const previous = adMap.get(adId) ?? {
      id: adId,
      name: adName,
      thumbnailUrl: '',
      campaignId: currentCampaignId,
      campaignName: currentCampaignName,
      spend: 0,
      impressions: 0,
      reach: 0,
      clicks: 0,
      linkClicks: 0,
      ctr: 0,
      cpc: 0,
      cpm: 0,
      frequency: 0,
      results: 0,
      messagesStarted: 0,
      leadForms: 0,
      siteLeads: 0,
      landingPageViews: 0,
      profileVisits: 0,
      followers: 0,
      videoViews: 0,
      thruplays: 0,
      hookRate: 0,
      holdRate: 0,
    };

    previous.spend += spend;
    previous.impressions += impressions;
    previous.reach += reach;
    previous.clicks += clicks;
    previous.linkClicks += linkClicks;
    previous.results += results;
    previous.messagesStarted += messagesStarted;
    previous.leadForms += leadForms;
    previous.siteLeads += siteLeads;
    previous.landingPageViews += landingPageViews;
    previous.profileVisits += profileVisits;
    previous.followers += followers;
    previous.videoViews += videoViews;
    previous.thruplays += thruplays;
    previous.ctr = previous.impressions > 0 ? (previous.clicks / previous.impressions) * 100 : ctr;
    previous.cpc = previous.clicks > 0 ? previous.spend / previous.clicks : cpc;
    previous.cpm = previous.impressions > 0 ? (previous.spend / previous.impressions) * 1000 : cpm;
    previous.frequency = previous.reach > 0 ? previous.impressions / previous.reach : frequency;
    previous.hookRate = previous.impressions > 0 ? previous.videoViews / previous.impressions : 0;
    previous.holdRate = previous.videoViews > 0 ? previous.thruplays / previous.videoViews : 0;
    adMap.set(adId, previous);
    campaignName = currentCampaignName;
  }

  const thumbnailMap = await fetchMetaAdThumbnails(metaToken, link.meta_ad_account_id, campaignId).catch(
    () => new Map<string, string>(),
  );

  return {
    campaignId,
    campaignName: campaignName || campaignId,
    rows: Array.from(adMap.values())
      .map((ad) => ({ ...ad, thumbnailUrl: thumbnailMap.get(ad.id) ?? '' }))
      .sort((a, b) => b.spend - a.spend),
  };
};

const normalizeLoose = (value: string | null | undefined) =>
  asString(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const normalizeHigherBetter = (value: number, min: number, max: number) => {
  const denom = max - min;
  if (!Number.isFinite(denom) || denom <= 0) return 0;
  return clamp01((value - min) / denom);
};

const normalizeLowerBetter = (value: number, min: number, max: number) =>
  clamp01(1 - normalizeHigherBetter(value, min, max));

const describeResult = (row: {
  messagesStarted: number;
  leadForms: number;
  siteLeads: number;
  profileVisits: number;
  followers: number;
  videoViews: number;
  thruplays: number;
}) => {
  const options = [
    { key: 'messagesStarted', label: 'Mensagens iniciadas', value: row.messagesStarted },
    { key: 'leadForms', label: 'Lead forms', value: row.leadForms },
    { key: 'siteLeads', label: 'Leads no site', value: row.siteLeads },
    { key: 'profileVisits', label: 'Visitas ao perfil', value: row.profileVisits },
    { key: 'followers', label: 'Seguidores', value: row.followers },
    { key: 'thruplays', label: 'ThruPlays', value: row.thruplays },
    { key: 'videoViews', label: 'Views 3s', value: row.videoViews },
  ];
  const winner = options.sort((a, b) => b.value - a.value)[0];
  return {
    resultLabel: winner?.label ?? 'Resultados',
    resultValue: winner?.value ?? 0,
  };
};

const mapNativeResultLabel = (indicator: string) => {
  const normalized = asString(indicator).toLowerCase();
  if (!normalized) return '';
  if (normalized.includes('profile_visit')) return 'Visitas ao perfil';
  if (normalized.includes('messaging') || normalized.includes('onsite_conversion.messaging_conversation_started')) return 'Mensagens iniciadas';
  if (normalized.includes('lead') && normalized.includes('omni')) return 'Lead Forms';
  if (normalized.includes('lead') && normalized.includes('website')) return 'Leads no site';
  if (normalized.includes('offsite_conversion') && normalized.includes('lead')) return 'Leads no site';
  if (normalized.includes('landing_page_view')) return 'Vis. pag. destino';
  if (normalized.includes('follow')) return 'Seguidores';
  if (normalized.includes('thruplay')) return 'ThruPlays';
  if (normalized.includes('video_view')) return 'Views 3s';
  return '';
};

const inferNativeResultFromIndicator = (input: {
  indicator: string;
  payloadValue: number;
  messagesStarted: number;
  leadForms: number;
  siteLeads: number;
  landingPageViews: number;
  profileVisits: number;
  followers: number;
  videoViews: number;
  thruplays: number;
}) => {
  const indicator = asString(input.indicator).toLowerCase();
  const label = mapNativeResultLabel(indicator);

  if (indicator.includes('profile_visit')) {
    return { nativeResultType: indicator, nativeResultLabel: label || 'Visitas ao perfil', nativeResultValue: input.profileVisits || input.payloadValue };
  }
  if (indicator.includes('messaging') || indicator.includes('onsite_conversion.messaging_conversation_started')) {
    return { nativeResultType: indicator, nativeResultLabel: label || 'Mensagens iniciadas', nativeResultValue: input.messagesStarted || input.payloadValue };
  }
  if (indicator.includes('lead') && indicator.includes('omni')) {
    return { nativeResultType: indicator, nativeResultLabel: label || 'Lead Forms', nativeResultValue: input.leadForms || input.payloadValue };
  }
  if ((indicator.includes('lead') && indicator.includes('website')) || (indicator.includes('offsite_conversion') && indicator.includes('lead'))) {
    return { nativeResultType: indicator, nativeResultLabel: label || 'Leads no site', nativeResultValue: input.siteLeads || input.payloadValue };
  }
  if (indicator.includes('landing_page_view')) {
    return { nativeResultType: indicator, nativeResultLabel: label || 'Vis. pag. destino', nativeResultValue: input.landingPageViews || input.payloadValue };
  }
  if (indicator.includes('follow')) {
    return { nativeResultType: indicator, nativeResultLabel: label || 'Seguidores', nativeResultValue: input.followers || input.payloadValue };
  }
  if (indicator.includes('thruplay')) {
    return { nativeResultType: indicator, nativeResultLabel: label || 'ThruPlays', nativeResultValue: input.thruplays || input.payloadValue };
  }
  if (indicator.includes('video_view')) {
    return { nativeResultType: indicator, nativeResultLabel: label || 'Views 3s', nativeResultValue: input.videoViews || input.payloadValue };
  }

  return { nativeResultType: '', nativeResultLabel: '', nativeResultValue: 0 };
};

const classifyAdsByIdc = <T extends { impressions: number; hookRate: number; holdRate: number; ctr: number; cpc: number }>(
  rows: T[],
) => {
  const hookValues = rows.map((row) => row.hookRate ?? 0);
  const holdValues = rows.map((row) => row.holdRate ?? 0);
  const ctrValues = rows.map((row) => row.ctr ?? 0);
  const cpcValues = rows.map((row) => row.cpc).filter((value) => Number.isFinite(value));

  const [minHook, maxHook] = [Math.min(...hookValues, 0), Math.max(...hookValues, 0)];
  const [minHold, maxHold] = [Math.min(...holdValues, 0), Math.max(...holdValues, 0)];
  const [minCtr, maxCtr] = [Math.min(...ctrValues, 0), Math.max(...ctrValues, 0)];
  const [minCpc, maxCpc] = cpcValues.length ? [Math.min(...cpcValues), Math.max(...cpcValues)] : [0, 1];

  return rows.map((row) => {
    const scoreHook = normalizeHigherBetter(row.hookRate ?? 0, minHook, maxHook);
    const scoreHold = normalizeHigherBetter(row.holdRate ?? 0, minHold, maxHold);
    const scoreCtr = normalizeHigherBetter(row.ctr ?? 0, minCtr, maxCtr);
    const scoreCpc = Number.isFinite(row.cpc) ? normalizeLowerBetter(row.cpc, minCpc, maxCpc) : 0;

    let idc01 = 0;
    if ((row.hookRate ?? 0) > 0 && (row.holdRate ?? 0) > 0) {
      idc01 = scoreHook * 0.3 + scoreHold * 0.3 + scoreCtr * 0.25 + scoreCpc * 0.15;
    } else if ((row.hookRate ?? 0) > 0 || (row.holdRate ?? 0) > 0) {
      const scoreVideo = (row.hookRate ?? 0) > 0 ? scoreHook : scoreHold;
      idc01 = scoreVideo * 0.5 + scoreCtr * 0.35 + scoreCpc * 0.15;
    } else {
      idc01 = scoreCtr * 0.625 + scoreCpc * 0.375;
    }

    const classification =
      row.impressions === 0
        ? undefined
        : idc01 >= IDC_THRESHOLDS.otimo
          ? 'otimo'
          : idc01 >= IDC_THRESHOLDS.bom
            ? 'bom'
            : idc01 >= IDC_THRESHOLDS.regular
              ? 'regular'
              : 'ruim';

    return {
      ...row,
      idc: Math.round(idc01 * 100),
      classification,
    };
  });
};

const buildPortalWeeklyTrafficLikeReport = async (
  supabaseAdmin: SupabaseClient,
  link: PortalLinkRow,
  companyRow: any,
  periodStart: string,
  periodEnd: string,
  weeklyNarrative: { summary: string | null; highlights: string[] | null; risks: string[] | null; next_week: string[] | null },
) => {
  const metaToken = asString(companyRow?.meta_access_token);
  if (!metaToken || !link.meta_ad_account_id) return null;

  const days = dateDiffDays(periodStart, periodEnd) + 1;
  const prevEnd = shiftUtcDate(new Date(`${periodStart}T00:00:00.000Z`), -1).toISOString().slice(0, 10);
  const prevStart = shiftUtcDate(new Date(`${periodStart}T00:00:00.000Z`), -days).toISOString().slice(0, 10);

  const [currentMeta, previousMeta, currentBusiness, previousBusiness, metaAccountName] = await Promise.all([
    aggregateMetaOverview(metaToken, link.meta_ad_account_id, periodStart, periodEnd, []),
    aggregateMetaOverview(metaToken, link.meta_ad_account_id, prevStart, prevEnd, []),
    loadBusinessOverview(supabaseAdmin, link.company_id, `${periodStart}T00:00:00.000Z`, `${nextDateIso(periodEnd)}T00:00:00.000Z`),
    loadBusinessOverview(supabaseAdmin, link.company_id, `${prevStart}T00:00:00.000Z`, `${nextDateIso(prevEnd)}T00:00:00.000Z`),
    getMetaAccountName(metaToken, link.meta_ad_account_id).catch(() => link.meta_ad_account_name || link.meta_ad_account_id),
  ]);

  const activeCampaigns = currentMeta.campaigns.filter((campaign) => campaign.spend > 0);
  const campaignAds = await Promise.all(
    activeCampaigns.map(async (campaign) => {
      const rows = await fetchMetaAdInsights(metaToken, link.meta_ad_account_id, periodStart, periodEnd, campaign.id);
      const thumbnailMap = await fetchMetaAdThumbnails(metaToken, link.meta_ad_account_id, campaign.id).catch(() => new Map<string, string>());
      const adMap = new Map<string, MetaAdRow>();

      for (const row of rows) {
        const adId = asString(row?.ad_id);
        if (!adId) continue;
        const spend = asNumber(row?.spend);
        const impressions = asNumber(row?.impressions);
        const reach = asNumber(row?.reach);
        const clicks = asNumber(row?.clicks);
        const linkClicks = asNumber(row?.inline_link_clicks);
        const ctr = asNumber(row?.ctr);
        const cpc = asNumber(row?.cpc);
        const cpm = asNumber(row?.cpm);
        const frequency = asNumber(row?.frequency);
        const actions = Array.isArray(row?.actions) ? row.actions : [];
        const resultsPayload = Array.isArray(row?.results) ? row.results : [];
        const resultIndicator = extractResultIndicator(resultsPayload);
        const resultValue = extractResultValue(resultsPayload);
        const isProfileVisitCampaign = resultIndicator === 'profile_visit_view';
        const costPerActionType = Array.isArray(row?.cost_per_action_type) ? row.cost_per_action_type : [];
        const videoThruplayActions = Array.isArray(row?.video_thruplay_watched_actions) ? row.video_thruplay_watched_actions : [];
        const leadForms = isProfileVisitCampaign ? 0 : extractLeadForms(actions) || deriveCountFromCostPerAction(spend, costPerActionType, extractLeadForms);
        const messagesStarted = isProfileVisitCampaign ? 0 : extractMessagingStarted(actions) || deriveCountFromCostPerAction(spend, costPerActionType, extractMessagingStarted);
        const siteLeads = isProfileVisitCampaign ? 0 : extractSiteLeads(actions) || deriveCountFromCostPerAction(spend, costPerActionType, extractSiteLeads);
        const landingPageViews = extractLandingPageViews(actions) || deriveCountFromCostPerAction(spend, costPerActionType, extractLandingPageViews);
        const profileVisits =
          asNumber(row?.instagram_profile_visits) ||
          (isProfileVisitCampaign ? extractResultValue(resultsPayload) : 0) ||
          extractProfileVisits(actions) ||
          deriveCountFromCostPerAction(spend, costPerActionType, extractProfileVisits);
        const followers = 0;
        const videoViews = extractVideoViews(actions);
        const thruplays =
          extractThruplays(actions) ||
          extractActionTotal(videoThruplayActions) ||
          deriveCountFromCostPerAction(spend, costPerActionType, extractThruplays);
        const results = leadForms + messagesStarted + siteLeads;
        const nativeResult = inferNativeResultFromIndicator({
          indicator: resultIndicator,
          payloadValue: resultValue,
          messagesStarted,
          leadForms,
          siteLeads,
          landingPageViews,
          profileVisits,
          followers,
          videoViews,
          thruplays,
        });

        const previous = adMap.get(adId) ?? {
          id: adId,
          name: asString(row?.ad_name) || adId,
          thumbnailUrl: '',
          campaignId: campaign.id,
          campaignName: campaign.name,
          spend: 0,
          impressions: 0,
          reach: 0,
          clicks: 0,
          linkClicks: 0,
          ctr: 0,
          cpc: 0,
          cpm: 0,
          frequency: 0,
          results: 0,
          messagesStarted: 0,
          leadForms: 0,
          siteLeads: 0,
          landingPageViews: 0,
          profileVisits: 0,
          followers: 0,
          videoViews: 0,
          thruplays: 0,
          hookRate: 0,
          holdRate: 0,
          nativeResultType: '',
          nativeResultLabel: '',
          nativeResultValue: 0,
        };

        previous.spend += spend;
        previous.impressions += impressions;
        previous.reach += reach;
        previous.clicks += clicks;
        previous.linkClicks += linkClicks;
        previous.results += results;
        previous.messagesStarted += messagesStarted;
        previous.leadForms += leadForms;
        previous.siteLeads += siteLeads;
        previous.landingPageViews += landingPageViews;
        previous.profileVisits += profileVisits;
        previous.followers += followers;
        previous.videoViews += videoViews;
        previous.thruplays += thruplays;
        previous.ctr = previous.impressions > 0 ? (previous.clicks / previous.impressions) * 100 : ctr;
        previous.cpc = previous.clicks > 0 ? previous.spend / previous.clicks : cpc;
        previous.cpm = previous.impressions > 0 ? (previous.spend / previous.impressions) * 1000 : cpm;
        previous.frequency = previous.reach > 0 ? previous.impressions / previous.reach : frequency;
        previous.hookRate = previous.impressions > 0 ? previous.videoViews / previous.impressions : 0;
        previous.holdRate = previous.videoViews > 0 ? previous.thruplays / previous.videoViews : 0;
        if (nativeResult.nativeResultLabel) {
          previous.nativeResultType = nativeResult.nativeResultType;
          previous.nativeResultLabel = nativeResult.nativeResultLabel;
          previous.nativeResultValue += nativeResult.nativeResultValue;
        }
        previous.thumbnailUrl = thumbnailMap.get(adId) ?? previous.thumbnailUrl;
        adMap.set(adId, previous);
      }

      return Array.from(adMap.values()).filter((item) => item.spend > 0);
    }),
  );

  const allAds = classifyAdsByIdc(campaignAds.flat());

  const currentPlatform = {
    videoViews: currentMeta.summary.videoViews,
    thruplays: currentMeta.summary.thruplays,
    profileVisits: currentMeta.summary.profileVisits,
    followers: currentMeta.summary.followers,
    messagesStarted: currentMeta.summary.messagesStarted,
    leadForms: currentMeta.summary.leadForms,
    siteLeads: currentMeta.summary.siteLeads,
    businessLeads: currentMeta.summary.results + currentBusiness.crmLeads,
  };

  const previousPlatform = {
    videoViews: previousMeta.summary.videoViews,
    thruplays: previousMeta.summary.thruplays,
    profileVisits: previousMeta.summary.profileVisits,
    followers: previousMeta.summary.followers,
    messagesStarted: previousMeta.summary.messagesStarted,
    leadForms: previousMeta.summary.leadForms,
    siteLeads: previousMeta.summary.siteLeads,
    businessLeads: previousMeta.summary.results + previousBusiness.crmLeads,
  };

  const currentBusinessLayer = {
    crmLeads: currentBusiness.crmLeads,
    won: currentBusiness.won,
    revenue: currentBusiness.revenue,
    pendingFollowup: currentBusiness.pendingFollowup,
    businessLeads: currentMeta.summary.results + currentBusiness.crmLeads,
  };

  const previousBusinessLayer = {
    crmLeads: previousBusiness.crmLeads,
    won: previousBusiness.won,
    revenue: previousBusiness.revenue,
    pendingFollowup: previousBusiness.pendingFollowup,
    businessLeads: previousMeta.summary.results + previousBusiness.crmLeads,
  };

  const currentSummary = {
    invest: currentMeta.summary.spend,
    impressions: currentMeta.summary.impressions,
    reach: currentMeta.summary.reach,
    clicks: currentMeta.summary.clicks,
    linkClicks: currentMeta.summary.linkClicks,
    ctr: currentMeta.summary.ctr,
    cpc: currentMeta.summary.cpc,
    cpm: currentMeta.summary.cpm,
    frequency: currentMeta.summary.frequency,
    results: currentBusinessLayer.businessLeads,
    resultLabel: 'Leads de negocio',
    costPerResult: currentBusinessLayer.businessLeads > 0 ? currentMeta.summary.spend / currentBusinessLayer.businessLeads : undefined,
    profileVisits: currentMeta.summary.profileVisits || undefined,
    followers: currentMeta.summary.followers || undefined,
  };

  const previousSummary = {
    invest: previousMeta.summary.spend,
    impressions: previousMeta.summary.impressions,
    reach: previousMeta.summary.reach,
    clicks: previousMeta.summary.clicks,
    linkClicks: previousMeta.summary.linkClicks,
    ctr: previousMeta.summary.ctr,
    cpc: previousMeta.summary.cpc,
    cpm: previousMeta.summary.cpm,
    frequency: previousMeta.summary.frequency,
    results: previousBusinessLayer.businessLeads,
    resultLabel: 'Leads de negocio',
    costPerResult: previousBusinessLayer.businessLeads > 0 ? previousMeta.summary.spend / previousBusinessLayer.businessLeads : undefined,
    profileVisits: previousMeta.summary.profileVisits || undefined,
    followers: previousMeta.summary.followers || undefined,
  };

  const campaignRows = allAds.map((ad) => {
    const described =
      ad.nativeResultLabel && ad.nativeResultValue > 0
        ? { resultLabel: ad.nativeResultLabel, resultValue: ad.nativeResultValue }
        : describeResult(ad);
    return {
      name: ad.name,
      status: 'active',
      spend: ad.spend,
      reach: ad.reach,
      impressions: ad.impressions,
      results: described.resultValue,
      resultLabel: described.resultLabel,
      costPerResult: described.resultValue > 0 ? ad.spend / described.resultValue : 0,
      ctr: ad.ctr,
      cpc: ad.cpc,
      cpm: ad.cpm,
      frequency: ad.frequency,
      hookRate: ad.hookRate,
      holdRate: ad.holdRate,
      idc: (ad as any).idc,
      classification: (ad as any).classification,
      thumbnailUrl: ad.thumbnailUrl,
    };
  });

  const rankedAdsByCampaign = Array.from(
    allAds.reduce((map, ad) => {
      const key = ad.campaignName || 'Sem campanha';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ad);
      return map;
    }, new Map<string, (MetaAdRow & { idc?: number; classification?: string })[]>()),
  )
    .map(([campaignName, ads]) => ({
      campaignName,
      ads: [...ads].sort(
        (a, b) =>
          (b.nativeResultValue ?? 0) - (a.nativeResultValue ?? 0) ||
          ((b as any).idc ?? 0) - ((a as any).idc ?? 0) ||
          b.spend - a.spend,
      ),
    }))
    .sort(
      (a, b) =>
        ((b.ads[0]?.nativeResultValue ?? 0) - (a.ads[0]?.nativeResultValue ?? 0)) ||
        (((b.ads[0] as any)?.idc ?? 0) - ((a.ads[0] as any)?.idc ?? 0)) ||
        ((b.ads[0]?.spend ?? 0) - (a.ads[0]?.spend ?? 0)),
    );

  const topAds = rankedAdsByCampaign
    .flatMap(({ ads }) => ads)
    .map((ad) => {
      const described =
        ad.nativeResultLabel && ad.nativeResultValue > 0
          ? { resultLabel: ad.nativeResultLabel, resultValue: ad.nativeResultValue }
          : describeResult(ad);
      return {
        id: ad.id,
        name: ad.name,
        campaign: ad.campaignName,
        spend: ad.spend,
        impressions: ad.impressions,
        reach: ad.reach,
        ctr: ad.ctr,
        cpc: ad.cpc,
        cpm: ad.cpm,
        frequency: ad.frequency,
        results: described.resultValue,
        resultLabel: described.resultLabel,
        hookRate: ad.hookRate,
        holdRate: ad.holdRate,
        idc: (ad as any).idc ?? 0,
        idcClass:
          (ad as any).classification === 'otimo'
            ? 'great'
            : (ad as any).classification === 'bom'
              ? 'good'
              : (ad as any).classification === 'regular'
                ? 'ok'
                : 'bad',
        thumbnailUrl: ad.thumbnailUrl,
      };
    });

  const activeObjectives = [
    { key: 'thruplays', label: 'ThruPlays', current: currentPlatform.thruplays, previous: previousPlatform.thruplays, layer: 'platform' },
    { key: 'videoViews', label: 'Views 3s', current: currentPlatform.videoViews, previous: previousPlatform.videoViews, layer: 'platform' },
    { key: 'profileVisits', label: 'Visitas ao perfil', current: currentPlatform.profileVisits, previous: previousPlatform.profileVisits, layer: 'platform' },
    { key: 'followers', label: 'Seguidores', current: currentPlatform.followers, previous: previousPlatform.followers, layer: 'platform' },
    { key: 'messagesStarted', label: 'Mensagens iniciadas', current: currentPlatform.messagesStarted, previous: previousPlatform.messagesStarted, layer: 'platform' },
    { key: 'leadForms', label: 'Lead Forms', current: currentPlatform.leadForms, previous: previousPlatform.leadForms, layer: 'platform' },
    { key: 'siteLeads', label: 'Leads no site', current: currentPlatform.siteLeads, previous: previousPlatform.siteLeads, layer: 'platform' },
    { key: 'crmLeads', label: 'Leads no CRM', current: currentBusinessLayer.crmLeads, previous: previousBusinessLayer.crmLeads, layer: 'business' },
    { key: 'won', label: 'Ganhos', current: currentBusinessLayer.won, previous: previousBusinessLayer.won, layer: 'business' },
  ].filter((item) => item.current > 0 || item.previous > 0);

  return {
    schemaVersion: 2,
    clientName: asString(link.client_name || link.name) || 'Cliente',
    agencyName: 'CR8',
    adAccountId: link.meta_ad_account_id,
    adAccountName: metaAccountName,
    level: 'ad',
    scope: 'account',
    scopeLabel: metaAccountName,
    periodCurrent: { label: `${periodStart} a ${periodEnd}`, start: periodStart, end: periodEnd },
    periodPrevious: { label: `${prevStart} a ${prevEnd}`, start: prevStart, end: prevEnd },
    current: currentSummary,
    previous: previousSummary,
    currentLayers: {
      media: currentSummary,
      platform: currentPlatform,
      business: currentBusinessLayer,
    },
    previousLayers: {
      media: previousSummary,
      platform: previousPlatform,
      business: previousBusinessLayer,
    },
    activeObjectives,
    timeseries: currentMeta.timeseries.map((point) => ({
      name: point.date.slice(8, 10) + '/' + point.date.slice(5, 7),
      metaSpend: point.spend,
      metaLeads: point.results,
    })),
    campaigns: campaignRows,
    topAds,
    insights: [weeklyNarrative.summary, ...((weeklyNarrative.highlights ?? []).filter(Boolean))].filter(Boolean),
    actionItems: [...(weeklyNarrative.risks ?? []), ...(weeklyNarrative.next_week ?? [])],
  };
};

const scoreTrafficReportMatch = (
  report: TrafficReportRow,
  link: {
    meta_ad_account_id: string;
    meta_ad_account_name: string | null;
    client_name: string | null;
    name: string;
  },
) => {
  const reportData = report.report_data ?? {};
  const reportClientName = normalizeLoose(reportData?.clientName);
  const reportAccountId = normalizeLoose(reportData?.adAccountId);
  const reportAccountName = normalizeLoose(reportData?.adAccountName);
  const reportScopeLabel = normalizeLoose(reportData?.scopeLabel);
  const linkAccountId = normalizeLoose(link.meta_ad_account_id);
  const linkAccountName = normalizeLoose(link.meta_ad_account_name || link.meta_ad_account_id);
  const linkClientName = normalizeLoose(link.client_name || link.name);

  let score = 0;

  if (reportAccountId && reportAccountId === linkAccountId) score += 100;
  if (reportAccountName && reportAccountName === linkAccountName) score += 80;
  if (reportClientName && reportClientName === linkClientName) score += 60;
  if (reportScopeLabel && (reportScopeLabel.includes(linkAccountId) || reportScopeLabel.includes(linkAccountName))) score += 40;
  if (!reportAccountId && !reportAccountName && !reportClientName && reportScopeLabel) score += 5;

  return score;
};

const loadLatestTrafficReport = async (
  supabaseAdmin: SupabaseClient,
  link: {
    company_id: string;
    meta_ad_account_id: string;
    meta_ad_account_name: string | null;
    client_name: string | null;
    name: string;
  },
): Promise<TrafficReportRow | null> => {
  const { data, error } = await supabaseAdmin
    .from('traffic_reports')
    .select('public_id,title,created_at,report_data')
    .eq('company_id', link.company_id)
    .order('created_at', { ascending: false })
    .limit(25);

  if (error) return null;
  const rows = ((data ?? []) as any[]).map((item) => ({
    public_id: asString(item?.public_id),
    title: asString(item?.title) || null,
    created_at: asString(item?.created_at),
    report_data: item?.report_data ?? {},
  }));
  if (!rows.length) return null;

  const scored = rows
    .map((row) => ({ row, score: scoreTrafficReportMatch(row, link) }))
    .sort((a, b) => b.score - a.score || b.row.created_at.localeCompare(a.row.created_at));

  return scored[0]?.score > 0 ? scored[0].row : null;
};

export const loadDashboardWeekly = async (
  supabaseAdmin: SupabaseClient,
  token: string,
  requestedDateFrom?: string,
  requestedDateTo?: string,
) => {
  const link = await getPortalLinkRow(supabaseAdmin, token);
  const { data: companyTokens, error: companyTokensError } = await supabaseAdmin
    .from('companies')
    .select('meta_access_token,meta_token_expires_at,instagram_access_token,instagram_token_expires_at')
    .eq('id', link.company_id)
    .maybeSingle();

  if (companyTokensError) throw companyTokensError;

  const metaToken = asString((companyTokens as any)?.meta_access_token);

  const today = new Date();
  const defaultPeriodEnd = new Date(today);
  defaultPeriodEnd.setUTCDate(defaultPeriodEnd.getUTCDate() - 1);
  const defaultPeriodStart = new Date(defaultPeriodEnd);
  defaultPeriodStart.setUTCDate(defaultPeriodStart.getUTCDate() - 6);
  const defaultPeriodStartStr = defaultPeriodStart.toISOString().slice(0, 10);
  const defaultPeriodEndStr = defaultPeriodEnd.toISOString().slice(0, 10);
  const parsedDateFrom = parseDateInput(requestedDateFrom, defaultPeriodStartStr);
  const parsedDateTo = parseDateInput(requestedDateTo, defaultPeriodEndStr);
  const periodStartStr = parsedDateFrom <= parsedDateTo ? parsedDateFrom : parsedDateTo;
  const periodEndStr = parsedDateFrom <= parsedDateTo ? parsedDateTo : parsedDateFrom;

  const igResolvedWeekly = resolveInstagramApiToken(companyTokens);
  const igToken = igResolvedWeekly?.token ?? null;

  // Renova o token em background se estiver próximo do vencimento
  if (igResolvedWeekly) {
    refreshInstagramTokenIfNeeded(supabaseAdmin, link.company_id, igResolvedWeekly.token, igResolvedWeekly.expiresAtMs).catch(() => {});
  }

  const [meta, instagram] = await Promise.all([
    metaToken
      ? aggregateMetaOverview(metaToken, link.meta_ad_account_id, periodStartStr, periodEndStr, [])
      : Promise.resolve(buildEmptyMetaOverview('Meta Ads nao configurado para esta empresa.')),
    link.instagram_business_account_id && igToken
      ? buildInstagramOverview(igToken, link.instagram_business_account_id, periodStartStr, periodEndStr)
      : Promise.resolve(buildEmptyInstagramOverview('')),
  ]);

  const companyName = link.client_name || link.name || 'Cliente';
  const metrics: Json = {
    period: { start: periodStartStr, end: periodEndStr, days: 7 },
    meta,
    instagram,
  };

  const narrative = await generateWeeklyNarrative({ companyName, periodStart: periodStartStr, periodEnd: periodEndStr, metrics });
  const trafficLikeReport = await buildPortalWeeklyTrafficLikeReport(
    supabaseAdmin,
    link,
    companyTokens ?? {},
    periodStartStr,
    periodEndStr,
    narrative,
  ).catch((error) => {
    console.error('loadDashboardWeekly trafficLikeReport error', {
      token,
      companyId: link.company_id,
      adAccountId: link.meta_ad_account_id,
      periodStart: periodStartStr,
      periodEnd: periodEndStr,
      error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
    });
    return null;
  });

  return {
    periodStart: periodStartStr,
    periodEnd: periodEndStr,
    summary: narrative.summary,
    highlights: narrative.highlights,
    risks: narrative.risks,
    next_week: narrative.next_week,
    meta: {
      spend: meta.summary.spend,
      impressions: meta.summary.impressions,
      reach: meta.summary.reach,
      results: meta.summary.results,
      ctr: meta.summary.ctr,
      cpc: meta.summary.cpc,
      campaigns: meta.campaigns.length,
    },
    instagram: {
      totalReach: instagram.summary.totalReach,
      totalViews: instagram.summary.totalViews,
      totalProfileViews: instagram.summary.totalProfileViews,
      totalFollowerGain: instagram.summary.totalFollowerGain,
    },
    trafficLikeReport,
    trafficReport: null,
  };
};

ensureSupabase();
