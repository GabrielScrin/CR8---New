// Role model (RBAC)
// - Current product roles: admin | gestor | vendedor | cliente
// - Legacy alias kept for backward compatibility: empresa -> cliente
export type Role = 'admin' | 'gestor' | 'vendedor' | 'cliente' | 'empresa';

export const normalizeRole = (role: unknown): Role => {
  const r = String(role ?? '').toLowerCase().trim();
  if (r === 'empresa') return 'cliente';
  if (r === 'cliente') return 'cliente';
  if (r === 'admin') return 'admin';
  if (r === 'gestor') return 'gestor';
  if (r === 'vendedor') return 'vendedor';
  return 'gestor';
};

export const isClientRole = (role: Role | null | undefined) => role === 'cliente' || role === 'empresa';

export const isVendorRole = (role: Role | null | undefined) => role === 'vendedor';

// Views each role is allowed to navigate to
export const getAllowedViews = (role: Role): Set<string> => {
  const r = normalizeRole(role);
  if (r === 'admin' || r === 'gestor') {
    return new Set(['dashboard', 'traffic', 'crm', 'livechat', 'contacts', 'forms', 'instagram', 'whatsapp', 'ai', 'settings']);
  }
  if (r === 'vendedor') {
    return new Set(['dashboard', 'crm', 'livechat', 'contacts', 'forms', 'whatsapp', 'ai', 'settings']);
  }
  // cliente / empresa
  return new Set(['dashboard', 'traffic']);
};

// Settings sections each role is allowed to see
export const getAllowedSettingsSections = (role: Role): Set<string> => {
  const r = normalizeRole(role);
  if (r === 'admin' || r === 'gestor') {
    return new Set(['company', 'whatsapp', 'financeiro', 'conversoes', 'auditoria', 'equipe', 'integracoes']);
  }
  if (r === 'vendedor') {
    return new Set(['equipe']);
  }
  return new Set();
};

export const roleConfig = {
  admin:    { label: 'Admin',    badgeClass: 'bg-red-500/15 text-red-400 border-red-500/25' },
  gestor:   { label: 'Gestor',   badgeClass: 'bg-orange-500/15 text-orange-400 border-orange-500/25' },
  vendedor: { label: 'Vendedor', badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
  cliente:  { label: 'Cliente',  badgeClass: 'bg-blue-500/15 text-blue-400 border-blue-500/25' },
  empresa:  { label: 'Cliente',  badgeClass: 'bg-blue-500/15 text-blue-400 border-blue-500/25' },
} satisfies Record<Role, { label: string; badgeClass: string }>;

export const labelRolePt = (role: Role) => {
  const r = normalizeRole(role);
  switch (r) {
    case 'admin':
      return 'Admin';
    case 'gestor':
      return 'Gestor';
    case 'vendedor':
      return 'Vendedor';
    case 'cliente':
      return 'Cliente';
    default:
      return 'Gestor';
  }
};

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatar?: string;
  companyId?: string;
}

export interface AdMetric {
  id: string;
  adName: string;
  adId: string;
  thumbnail: string;
  imageUrl?: string;
  subtitle?: string;
  campaignId?: string;
  campaignName?: string;
  adsetId?: string;
  adsetName?: string;
  results?: number;
  resultLabel?: string;
  costPerResult?: number;
  status: 'active' | 'paused';
  spend: number;
  impressions: number;
  reach?: number;
  clicks?: number;
  inlineLinkClicks?: number;
  cpm?: number;
  frequency?: number;
  leads?: number;
  messagesStarted?: number;
  leadForms?: number;
  siteLeads?: number;
  videoViews?: number;
  thruplays?: number;
  cpc?: number;
  ctr?: number;
  roas?: number;
  cpa?: number;
  hookRate?: number;
  holdRate?: number;
  profileVisits?: number;
  followers?: number;
  nativeType?: NativeResultType;
  nativeResultContext?: NativeResultContext;
  scores?: { label: string; value: number }[];
  idc?: number;
  classification?: 'otimo' | 'bom' | 'regular' | 'ruim';
  tags?: string[];
}

export type NativeResultType =
  | 'messages_started'
  | 'profile_visits'
  | 'lead_forms'
  | 'site_leads'
  | 'video_views'
  | 'followers'
  | 'purchases'
  | 'unknown';

export interface NativeResultContext {
  nativeType: NativeResultType;
  sourceLevel: 'campaign' | 'adset' | 'ad' | 'inferred';
  destinationType?: string;
  optimizationGoal?: string;
  objective?: string;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string;
  status: 'new' | 'contacted' | 'proposal' | 'won' | 'lost';
  source: string;
  utm_source?: string;
  utm_campaign?: string;
  utm_medium?: string;
  utm_content?: string;
  utm_term?: string;
  landing_page_url?: string;
  referrer_url?: string;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  fbclid?: string;
  fbc?: string;
  fbp?: string;
  first_touch_at?: string;
  first_touch_channel?: string;
  last_touch_at?: string;
  last_touch_channel?: string;
  lead_score_total?: number;
  lead_score_last?: number;
  lead_score_updated_at?: string;
  lastInteraction: string;
  value?: number;
  assigned_to?: string;
  external_id?: string;
  company_id?: string;
  created_at?: string;
  updated_at?: string;
  raw?: any;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent' | 'system';
  content: string;
  timestamp: Date;
  platform: 'whatsapp' | 'instagram' | 'web' | 'meta';
}

export interface ChatSession {
  id: string;
  contactName: string;
  platform: 'whatsapp' | 'instagram' | 'web' | 'meta';
  lastMessage: string;
  unread: number;
  aiActive: boolean;
  tags: string[];
}

// =============================================================================
// AI AGENTS TYPES
// =============================================================================

export type EmbeddingProvider = 'google' | 'openai' | 'voyage' | 'cohere';
export type RerankProvider = 'cohere' | 'together';

export interface AIAgent {
  id: string;
  name: string;
  system_prompt: string;
  model: string;
  temperature: number;
  max_tokens: number;
  is_active: boolean;
  is_default: boolean;
  debounce_ms: number;
  // RAG: Embedding config
  embedding_provider: EmbeddingProvider | null;
  embedding_model: string | null;
  embedding_dimensions: number | null;
  // RAG: Reranking config (opcional)
  rerank_enabled: boolean | null;
  rerank_provider: RerankProvider | null;
  rerank_model: string | null;
  rerank_top_k: number | null;
  // RAG: Search config
  rag_similarity_threshold: number | null;
  rag_max_results: number | null;
  // Handoff config
  handoff_enabled: boolean;
  handoff_instructions: string | null;
  // Booking tool config
  booking_tool_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export type KnowledgeFileIndexingStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'local_only';

export interface AIKnowledgeFile {
  id: string;
  agent_id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  content: string | null;
  external_file_id: string | null;
  external_file_uri: string | null;
  indexing_status: KnowledgeFileIndexingStatus;
  chunks_count: number;
  created_at: string;
  updated_at: string;
}
