import { getSupabaseAnonKey, getSupabaseUrl, supabase } from '../../lib/supabase';

export type WhatsAppTemplateAction = 'list' | 'sync' | 'create_in_meta';

export type WhatsAppTemplatesListBody = { action: 'list'; company_id: string; q?: string };
export type WhatsAppTemplatesSyncBody = { action: 'sync'; company_id: string };
export type WhatsAppTemplatesCreateInMetaBody = {
  action: 'create_in_meta';
  company_id: string;
  template: { name: string; language?: string; category?: string; components: unknown };
};

export type WhatsAppTemplatesRequestBody =
  | WhatsAppTemplatesListBody
  | WhatsAppTemplatesSyncBody
  | WhatsAppTemplatesCreateInMetaBody;

export async function callWhatsAppTemplates<T = any>(body: WhatsAppTemplatesRequestBody): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Sem sessão. Faça login novamente.');

  const res = await fetch(`${getSupabaseUrl()}/functions/v1/whatsapp-templates`, {
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

