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
  profileVisits: number;
  followers: number;
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
    profileVisits: number;
    followers: number;
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
  }>;
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
  extractActionSum(
    actions,
    (t) =>
      t === 'onsite_conversion.messaging_conversation_started_7d' ||
      t === 'onsite_conversion.messaging_conversation_started_1d' ||
      t === 'onsite_conversion.messaging_first_reply' ||
      t.includes('messaging_conversation_started'),
  );

const extractProfileVisits = (actions: any[] | undefined) =>
  extractActionSum(
    actions,
    (t) =>
      t === 'instagram_profile_visit' ||
      t === 'profile_visit' ||
      t.includes('instagram_profile') ||
      t.includes('profile_visit'),
  );

const extractFollowers = (actions: any[] | undefined) =>
  extractActionSum(actions, (t) => t === 'like' || t === 'page_fan' || t === 'instagram_profile_follow' || t === 'follow');

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
    profileVisits: 0,
    followers: 0,
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
      'campaign_id,campaign_name,date_start,spend,impressions,reach,clicks,inline_link_clicks,ctr,cpc,cpm,frequency,actions',
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
      const leadForms = extractLeadForms(actions);
      const messagesStarted = extractMessagingStarted(actions);
      const siteLeads = extractSiteLeads(actions);
      const profileVisits = extractProfileVisits(actions);
      const followers = extractFollowers(actions);
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
          profileVisits: 0,
          followers: 0,
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
        previous.profileVisits += profileVisits;
        previous.followers += followers;
        previous.ctr = previous.impressions > 0 ? (previous.clicks / previous.impressions) * 100 : ctr;
        previous.cpc = previous.clicks > 0 ? previous.spend / previous.clicks : cpc;
        previous.cpm = previous.impressions > 0 ? (previous.spend / previous.impressions) * 1000 : cpm;
        previous.frequency = previous.reach > 0 ? previous.impressions / previous.reach : frequency;
        campaignMap.set(campaignId, previous);
      }

      if (date) {
        const previousPoint = dailyMap.get(date) ?? { date, spend: 0, results: 0 };
        previousPoint.spend += spend;
        previousPoint.results += results;
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
        acc.profileVisits += row.profileVisits;
        acc.followers += row.followers;
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
        profileVisits: 0,
        followers: 0,
      },
    );

    summary.ctr = summary.impressions > 0 ? (summary.clicks / summary.impressions) * 100 : 0;
    summary.cpc = summary.clicks > 0 ? summary.spend / summary.clicks : 0;
    summary.cpm = summary.impressions > 0 ? (summary.spend / summary.impressions) * 1000 : 0;
    summary.frequency = summary.reach > 0 ? summary.impressions / summary.reach : 0;

    const timeseries = daySeries(dateFrom, dateTo).map((date) => dailyMap.get(date) ?? { date, spend: 0, results: 0 });

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

    const [profileJson, reachJson, totalsJson, mediaJson] = await Promise.all([
      fetchInstagramJson(
        `${graphBase}/${instagramBusinessAccountId}?fields=username,name,followers_count,media_count,profile_picture_url&access_token=${instagramAccessToken}`,
      ),
      fetchInstagramJson(
        `${graphBase}/${instagramBusinessAccountId}/insights?metric=reach&period=day&since=${since}&until=${until}&access_token=${instagramAccessToken}`,
      ),
      fetchInstagramJson(
        `${graphBase}/${instagramBusinessAccountId}/insights?metric=views,profile_views,follows_and_unfollows,accounts_engaged&metric_type=total_value&period=day&since=${since}&until=${until}&access_token=${instagramAccessToken}`,
      ),
      fetchInstagramJson(
        `${graphBase}/${instagramBusinessAccountId}/media?fields=id,caption,comments_count,like_count,media_type,media_product_type,media_url,thumbnail_url,timestamp,permalink&limit=6&access_token=${instagramAccessToken}`,
      ),
    ]);

    const reachMetric = Array.isArray(reachJson?.data) ? reachJson.data.find((item: any) => item?.name === 'reach') : null;
    const seriesMap = new Map<string, number>();
    for (const point of reachMetric?.values ?? []) {
      const iso = asString(point?.end_time).slice(0, 10);
      if (!iso) continue;
      seriesMap.set(iso, (seriesMap.get(iso) ?? 0) + asNumber(point?.value));
    }

    const totalValueMetric = (name: string) =>
      asNumber(
        Array.isArray(totalsJson?.data)
          ? totalsJson.data.find((item: any) => item?.name === name)?.total_value?.value ??
              totalsJson.data.find((item: any) => item?.name === name)?.values?.[0]?.value
          : 0,
      );

    const media = await Promise.all(
      ((Array.isArray(mediaJson?.data) ? mediaJson.data : []) as any[]).map(async (item: any) => {
        const mediaId = asString(item?.id);
        const metrics = ['reach'];
        const productType = asString(item?.media_product_type).toUpperCase();
        const mediaType = asString(item?.media_type).toUpperCase();
        if (productType !== 'STORY') metrics.push('saved');
        if (productType === 'FEED' || productType === 'REEL' || productType === 'REELS') metrics.push('shares');
        if (mediaType === 'VIDEO') metrics.push('video_views');

        let insights: any = { data: [] };
        if (mediaId) {
          try {
            insights = await fetchInstagramJson(
              `${graphBase}/${mediaId}/insights?metric=${metrics.join(',')}&access_token=${instagramAccessToken}`,
            );
          } catch {
            insights = { data: [] };
          }
        }

        const insightValue = (metricName: string) => {
          const match = Array.isArray(insights?.data) ? insights.data.find((entry: any) => entry?.name === metricName) : null;
          return match?.total_value?.value ?? match?.values?.[0]?.value ?? null;
        };

        const commentsCount = typeof item?.comments_count === 'number' ? item.comments_count : null;
        const likeCount = typeof item?.like_count === 'number' ? item.like_count : null;
        const saved = insightValue('saved');
        const shares = insightValue('shares');
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
          reach: insightValue('reach'),
          saved,
          shares,
          videoViews: insightValue('video_views'),
          commentsCount,
          likeCount,
          totalInteractions,
        };
      }),
    );

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
        totalReach: Array.from(seriesMap.values()).reduce((sum, value) => sum + value, 0),
        totalViews: totalValueMetric('views'),
        totalProfileViews: totalValueMetric('profile_views'),
        totalFollowerGain: totalValueMetric('follows_and_unfollows'),
        totalAccountsEngaged: totalValueMetric('accounts_engaged'),
      },
      series: daySeries(dateFrom, dateTo).map((date) => ({
        date: `${date.slice(8, 10)}/${date.slice(5, 7)}`,
        dateIso: date,
        reach: seriesMap.get(date) ?? 0,
      })),
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
      'id,name,brand_name,brand_logo_url,brand_primary_color,meta_ad_account_id,meta_access_token,google_ads_customer_id,google_ads_login_customer_id,google_ads_currency_code,instagram_business_account_id,instagram_username,instagram_access_token',
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
  const instagramAccessToken = asString((companyRow as any)?.instagram_access_token);

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

  const { data, error } = await supabaseAdmin
    .from('weekly_reports')
    .select('id,company_id,period_start,period_end,metrics,summary,highlights,risks,next_week,created_at,updated_at')
    .eq('company_id', companyId)
    .eq('id', reportId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('weekly report not found');
  return data as WeeklyReportRow;
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
    `Captação consolidada: ${Math.round(totalLeads)} sinais de resultado entre mídia e CRM.`,
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
      'id,name,brand_name,meta_ad_account_id,meta_access_token,google_ads_customer_id,google_ads_login_customer_id,google_ads_currency_code,instagram_business_account_id,instagram_access_token',
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

  const instagram = asString((companyRow as any)?.instagram_business_account_id) && asString((companyRow as any)?.instagram_access_token)
    ? await buildInstagramOverview(
        asString((companyRow as any)?.instagram_access_token),
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
    .select('meta_access_token,instagram_access_token')
    .eq('id', companyId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('empresa não encontrada');
  const token = asString((data as any)?.meta_access_token);
  if (!token) throw new Error('Token Meta não configurado para esta empresa. Reconecte o Facebook em Configurações.');
  return token;
};

const getCompanyInstagramToken = async (supabaseAdmin: SupabaseClient, companyId: string): Promise<string> => {
  const { data, error } = await supabaseAdmin
    .from('companies')
    .select('instagram_access_token')
    .eq('id', companyId)
    .maybeSingle();

  if (error) throw error;
  const token = asString((data as any)?.instagram_access_token);
  if (!token) throw new Error('Token Instagram não configurado');
  return token;
};

export const loadDashboardBootstrap = async (supabaseAdmin: SupabaseClient, token: string) => {
  const link = await getPortalLinkRow(supabaseAdmin, token);
  let metaAccountName = link.meta_ad_account_name || link.meta_ad_account_id;
  let instagramProfile: InstagramOverview['profile'] | null = null;
  const { data: companyTokens, error: companyTokensError } = await supabaseAdmin
    .from('companies')
    .select('meta_access_token,instagram_access_token')
    .eq('id', link.company_id)
    .maybeSingle();

  if (companyTokensError) throw companyTokensError;

  const metaToken = asString((companyTokens as any)?.meta_access_token);
  const instagramToken = asString((companyTokens as any)?.instagram_access_token) || metaToken;

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
    .select('meta_access_token,instagram_access_token')
    .eq('id', link.company_id)
    .maybeSingle();

  if (companyTokensError) throw companyTokensError;

  const metaToken = asString((companyTokens as any)?.meta_access_token);
  const igToken = asString((companyTokens as any)?.instagram_access_token) || metaToken;

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
      ? aggregateMetaOverview(metaToken, link.meta_ad_account_id, prevDateFrom, prevDateTo, [])
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

export const loadDashboardWeekly = async (supabaseAdmin: SupabaseClient, token: string) => {
  const link = await getPortalLinkRow(supabaseAdmin, token);
  const { data: companyTokens, error: companyTokensError } = await supabaseAdmin
    .from('companies')
    .select('meta_access_token,instagram_access_token')
    .eq('id', link.company_id)
    .maybeSingle();

  if (companyTokensError) throw companyTokensError;

  const metaToken = asString((companyTokens as any)?.meta_access_token);

  const today = new Date();
  const periodEnd = new Date(today);
  periodEnd.setUTCDate(periodEnd.getUTCDate() - 1);
  const periodStart = new Date(periodEnd);
  periodStart.setUTCDate(periodStart.getUTCDate() - 6);
  const periodStartStr = periodStart.toISOString().slice(0, 10);
  const periodEndStr = periodEnd.toISOString().slice(0, 10);

  const igToken = asString((companyTokens as any)?.instagram_access_token) || metaToken;

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
  };
};

ensureSupabase();
