import { createClient } from '@supabase/supabase-js';

// Helper to safely access env vars in browser environments without crashing
const getEnv = (key: string) => {
  try {
    // @ts-ignore
    if (typeof process !== 'undefined' && process.env) {
      // @ts-ignore
      return process.env[key];
    }
  } catch (e) {
    // Ignore error if process is undefined
  }
  return undefined;
};

// -----------------------------------------------------------------------------
// CONFIGURATION
// -----------------------------------------------------------------------------
// Please replace these values with your actual Supabase Project credentials.
// You can find them in your Supabase Dashboard -> Project Settings -> API
// -----------------------------------------------------------------------------

// We use a dummy valid URL to prevent "Invalid URL" errors during client initialization
// if the environment variables are not set.
const DEFAULT_URL = 'https://placeholder.supabase.co';
const DEFAULT_KEY = 'placeholder';

const envUrl = getEnv('SUPABASE_URL');
const envKey = getEnv('SUPABASE_ANON_KEY');

// If the env var is the placeholder text from previous steps or undefined, use the valid dummy URL
const SUPABASE_URL = (envUrl && envUrl !== 'YOUR_SUPABASE_URL_HERE') ? envUrl : DEFAULT_URL;
const SUPABASE_ANON_KEY = (envKey && envKey !== 'YOUR_SUPABASE_ANON_KEY_HERE') ? envKey : DEFAULT_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helper to check if supabase is configured
export const isSupabaseConfigured = () => {
    return SUPABASE_URL !== DEFAULT_URL && SUPABASE_ANON_KEY !== DEFAULT_KEY;
};