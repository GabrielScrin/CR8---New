export type Role = 'admin' | 'gestor' | 'empresa' | 'vendedor';

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
  lastInteraction: string;
  value?: number;
  assigned_to?: string;
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
