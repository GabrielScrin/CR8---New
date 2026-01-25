import { getSupabaseAnonKey, getSupabaseUrl, supabase } from '../../lib/supabase';

export type WhatsAppCampaignMessageKind = 'text' | 'template';

export type WhatsAppBroadcastCreateBody = {
  action: 'create';
  company_id: string;
  name: string;
  message_kind?: WhatsAppCampaignMessageKind;
  text_body?: string;
  template_name?: string;
  template_language?: string;
  template_components?: unknown;
  recipients?: Array<{ phone: string; name?: string | null; lead_id?: string | null }>;
};

export type WhatsAppBroadcastRunBody = {
  action: 'run';
  campaign_id: string;
  batch_size?: number;
  delay_ms?: number;
};

export type WhatsAppBroadcastCancelBody = {
  action: 'cancel';
  campaign_id: string;
};

export type WhatsAppBroadcastRequestBody = WhatsAppBroadcastCreateBody | WhatsAppBroadcastRunBody | WhatsAppBroadcastCancelBody;

export async function callWhatsAppBroadcast<T = any>(body: WhatsAppBroadcastRequestBody): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Sem sessão. Faça login novamente.');

  const res = await fetch(`${getSupabaseUrl()}/functions/v1/whatsapp-broadcast`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: getSupabaseAnonKey(),
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text().catch(() => '');
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ignore
  }

  if (!res.ok) {
    const msg = json?.error || json?.message || text || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return (json ?? {}) as T;
}

