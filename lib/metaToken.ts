import { getSupabaseUrl, supabase } from './supabase';

const CACHE_TTL_MS = 5 * 60 * 1000;
const MIN_VALIDITY_MS = 24 * 60 * 60 * 1000;

type CachedToken = {
  companyId: string | null;
  token: string;
  fetchedAt: number;
};

let cache: CachedToken | null = null;

export async function exchangeMetaToken(companyId: string, shortLivedToken: string): Promise<void> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const jwt = sessionData.session?.access_token;
    if (!jwt) return;

    const res = await fetch(`${getSupabaseUrl()}/functions/v1/meta-token-exchange`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        company_id: companyId,
        short_lived_token: shortLivedToken,
      }),
    });

    if (res.ok) {
      cache = null;
    }
  } catch {
    // Falha silenciosa: continuamos com o fallback do token atual.
  }
}

export async function resolveMetaToken(companyId: string | null): Promise<string | null> {
  if (
    cache &&
    cache.companyId === companyId &&
    Date.now() - cache.fetchedAt < CACHE_TTL_MS
  ) {
    return cache.token;
  }

  let storedToken: string | null = null;
  let storedExpiresAtMs = 0;

  if (companyId) {
    const { data, error } = await supabase
      .from('companies')
      .select('meta_access_token, meta_token_expires_at')
      .eq('id', companyId)
      .maybeSingle();

    const missingColumns =
      error &&
      (String(error.message ?? '').includes('meta_access_token') ||
        String(error.message ?? '').includes('meta_token_expires_at'));

    if (!error || !missingColumns) {
      storedToken = (data as any)?.meta_access_token ?? null;
      const expiresAtRaw = (data as any)?.meta_token_expires_at as string | null;
      storedExpiresAtMs = expiresAtRaw ? new Date(expiresAtRaw).getTime() : 0;
    }

    if (storedToken && storedExpiresAtMs > Date.now() + MIN_VALIDITY_MS) {
      cache = { companyId, token: storedToken, fetchedAt: Date.now() };
      return storedToken;
    }
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const sessionToken = sessionData.session?.provider_token ?? null;

  if (sessionToken && companyId) {
    exchangeMetaToken(companyId, sessionToken).catch(() => {});
  }

  const usableStoredToken =
    storedToken && storedExpiresAtMs > Date.now() ? storedToken : null;
  const resolved = usableStoredToken ?? sessionToken;

  if (resolved) {
    cache = { companyId, token: resolved, fetchedAt: Date.now() };
  }

  return resolved;
}
