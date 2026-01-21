import { createClient } from '@supabase/supabase-js';

// -----------------------------------------------------------------------------
// CONFIGURAÇÃO DE CONEXÃO (Vercel / Vite)
// -----------------------------------------------------------------------------
// Defina:
// - VITE_SUPABASE_URL
// - VITE_SUPABASE_ANON_KEY
// -----------------------------------------------------------------------------

const sanitizeEnv = (value: unknown) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.replace(/^['"]|['"]$/g, '');
};

const SUPABASE_URL: string = sanitizeEnv(import.meta.env.VITE_SUPABASE_URL);
const SUPABASE_ANON_KEY: string = sanitizeEnv(import.meta.env.VITE_SUPABASE_ANON_KEY);

const isValidUrl = (url: string) => {
  try {
    return Boolean(new URL(url));
  } catch {
    return false;
  }
};

const finalUrl = isValidUrl(SUPABASE_URL) ? SUPABASE_URL : 'https://placeholder.supabase.co';
const finalKey = SUPABASE_ANON_KEY ? SUPABASE_ANON_KEY : 'placeholder';

export const supabase = createClient(finalUrl, finalKey);

export const getSupabaseUrl = () => finalUrl;
export const getSupabaseAnonKey = () => finalKey;

export const isSupabaseConfigured = () => {
  return finalUrl !== 'https://placeholder.supabase.co' && finalKey !== 'placeholder';
};

export const getSupabaseConfigHints = () => {
  const urlOk = finalUrl !== 'https://placeholder.supabase.co';
  const keyOk = finalKey !== 'placeholder';
  return {
    urlOk,
    keyOk,
    missing: [...(urlOk ? [] : ['VITE_SUPABASE_URL']), ...(keyOk ? [] : ['VITE_SUPABASE_ANON_KEY'])],
  };
};
