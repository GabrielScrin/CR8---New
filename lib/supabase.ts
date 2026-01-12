import { createClient } from '@supabase/supabase-js';

// -----------------------------------------------------------------------------
// CONFIGURAÇÃO DE CONEXÃO (Vercel / Vite)
// -----------------------------------------------------------------------------
// Defina:
// - VITE_SUPABASE_URL
// - VITE_SUPABASE_ANON_KEY
// -----------------------------------------------------------------------------

const SUPABASE_URL: string = (import.meta as any)?.env?.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY: string = (import.meta as any)?.env?.VITE_SUPABASE_ANON_KEY ?? '';

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

export const isSupabaseConfigured = () => {
  return finalUrl !== 'https://placeholder.supabase.co' && finalKey !== 'placeholder';
};
