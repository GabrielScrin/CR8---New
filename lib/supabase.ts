import { createClient } from '@supabase/supabase-js';

// -----------------------------------------------------------------------------
// CONFIGURAÇÃO DE CONEXÃO
// -----------------------------------------------------------------------------
// 1. Vá no Supabase -> Project Settings -> API
// 2. Copie a "Project URL" e cole abaixo.
// 3. Copie a "anon public key" e cole abaixo.
// -----------------------------------------------------------------------------

const SUPABASE_URL: string = 'https://boomatdjlaybryypqvzg.supabase.co';
const SUPABASE_ANON_KEY: string = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvb21hdGRqbGF5YnJ5eXBxdnpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxNzIzNzcsImV4cCI6MjA4Mzc0ODM3N30.3PTHfC1rT6xD0jT5YrkaPE-jSolGAcN1Xjp3C5idKic';

// Validação simples para evitar erro de URL inválida se você esquecer de trocar
const isValidUrl = (url: string) => {
  try {
    return Boolean(new URL(url));
  } catch (e) {
    return false;
  }
};

const finalUrl = isValidUrl(SUPABASE_URL) ? SUPABASE_URL : 'https://placeholder.supabase.co';
const finalKey = SUPABASE_ANON_KEY !== 'COLE_SUA_ANON_KEY_AQUI' ? SUPABASE_ANON_KEY : 'placeholder';

export const supabase = createClient(finalUrl, finalKey);

// Helper para verificar se o supabase está configurado corretamente
export const isSupabaseConfigured = () => {
    return finalUrl !== 'https://placeholder.supabase.co' && finalKey !== 'placeholder';
};