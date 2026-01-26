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
  cpc?: number;
  ctr?: number;
  roas?: number;
  cpa?: number;
  hookRate?: number;
  holdRate?: number;
  scores?: { label: string; value: number }[];
  idc?: number;
  classification?: 'otimo' | 'bom' | 'regular' | 'ruim';
  tags?: string[];
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
