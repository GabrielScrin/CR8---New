/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_FACEBOOK_SCOPES?: string;
  readonly VITE_META_AD_ACCOUNT_ID?: string;
  readonly VITE_META_GRAPH_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

