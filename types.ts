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
  status: 'active' | 'paused';
  leads: number;
  spend: number;
  cpa: number;
  cpi: number; // Cost per install or interaction
  impressions: number;
  hookRate: string; // %
  holdRate: string; // %
  tags: string[]; // Awareness levels
  scoreLead: number;
  scoreCPL: number;
  scoreCTR: number;
  classification: 'Winner' | 'Loser' | 'Test';
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string;
  status: 'new' | 'contacted' | 'proposal' | 'won' | 'lost';
  source: 'Instagram' | 'WhatsApp' | 'Manual';
  utm_source?: string;
  utm_campaign?: string;
  lastInteraction: string;
  value?: number;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent' | 'system';
  content: string;
  timestamp: Date;
  platform: 'whatsapp' | 'instagram';
}

export interface ChatSession {
  id: string;
  contactName: string;
  platform: 'whatsapp' | 'instagram';
  lastMessage: string;
  unread: number;
  aiActive: boolean;
  tags: string[];
}