/**
 * instagramToken.ts
 *
 * Utilitário centralizado de token para a Instagram Graph API.
 *
 * Prioridade de resolução:
 *   1. Token de longa duração armazenado em companies.instagram_access_token (≥ 24h de validade restante)
 *   2. provider_token da sessão Supabase (curta duração, ~1h)
 *      → dispara exchange em background para converter em token de 60 dias
 *
 * fetchGraphJson:
 *   - Wrapper fetch com retry único em caso de HTTP 429 (rate limit)
 *   - Lança erro formatado para qualquer resposta de erro da API
 */

import { supabase } from './supabase';

// ── Estado de módulo ─────────────────────────────────────────────────────────

let _activeCompanyId: string | null = null;
let _cache: { token: string; companyId: string | null; fetchedAt: number } | null = null;

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

/**
 * Deve ser chamado pelo componente raiz Instagram sempre que companyId mudar.
 * Invalida o cache ao trocar de empresa.
 */
export function setActiveIgCompany(companyId: string | null): void {
  if (companyId !== _activeCompanyId) {
    _activeCompanyId = companyId;
    _cache = null;
  }
}

export function clearIgTokenCache(): void {
  _cache = null;
}

// ── Exchange de token (chama a Edge Function) ────────────────────────────────

export async function exchangeIgToken(
  companyId: string,
  shortLivedToken: string,
): Promise<void> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const jwt = sessionData.session?.access_token;
    if (!jwt) return;

    const supabaseUrl = (supabase as any).supabaseUrl as string;
    await fetch(`${supabaseUrl}/functions/v1/instagram-token-exchange`, {
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

    // Invalida o cache para que a próxima chamada leia o token novo do DB
    _cache = null;
  } catch {
    // Falha silenciosa — o fallback para provider_token continua funcionando
  }
}

// ── Resolução do token ───────────────────────────────────────────────────────

/**
 * Retorna o melhor token disponível para a empresa ativa.
 * Usa cache em memória de 5 minutos para evitar queries repetidas.
 */
export async function resolveIgToken(): Promise<string | null> {
  const companyId = _activeCompanyId;
  let storedIgToken: string | null = null;
  let storedIgExpiresAtMs = 0;

  // Cache válido?
  if (
    _cache &&
    _cache.companyId === companyId &&
    Date.now() - _cache.fetchedAt < CACHE_TTL_MS
  ) {
    return _cache.token;
  }

  // 1. Token de Instagram armazenado no banco (longa duração, específico para IG)
  if (companyId) {
    const { data, error } = await supabase
      .from('companies')
      .select('instagram_access_token, instagram_token_expires_at')
      .eq('id', companyId)
      .maybeSingle();

    const missingColumns =
      error &&
      (String(error.message ?? '').includes('instagram_access_token') ||
        String(error.message ?? '').includes('instagram_token_expires_at'));

    if (error && !missingColumns) {
      throw error;
    }

    storedIgToken = (data as any)?.instagram_access_token as string | null;
    const igExpiresAtRaw = (data as any)?.instagram_token_expires_at as string | null;
    storedIgExpiresAtMs = igExpiresAtRaw ? new Date(igExpiresAtRaw).getTime() : 0;

    const minValidity = 24 * 60 * 60 * 1000; // exige pelo menos 24h restantes
    if (storedIgToken && storedIgExpiresAtMs > Date.now() + minValidity) {
      _cache = { token: storedIgToken, companyId, fetchedAt: Date.now() };
      // Auto-renova em background se expira em menos de 7 dias
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (storedIgExpiresAtMs - Date.now() < sevenDays) {
        exchangeIgToken(companyId, storedIgToken).catch(() => {});
      }
      return storedIgToken;
    }
  }

  // 2. Fallback: provider_token da sessão (token do usuário atualmente logado)
  // Não usamos meta_access_token como fallback porque ele pertence ao usuário
  // que conectou o Meta Ads — que pode ser diferente do dono da conta Instagram.
  const { data: sessionData } = await supabase.auth.getSession();
  const sessionToken = sessionData.session?.provider_token ?? null;

  if (sessionToken && companyId) {
    _cache = { token: sessionToken, companyId, fetchedAt: Date.now() };
    // Dispara exchange em background para salvar o token de longa duração
    exchangeIgToken(companyId, sessionToken).catch(() => {});
    return sessionToken;
  }

  // Fallback legado: permite usar tokens antigos sem expires_at para não
  // derrubar a visão geral enquanto a conta não é reconectada.
  if (storedIgToken) {
    _cache = { token: storedIgToken, companyId, fetchedAt: Date.now() };
    return storedIgToken;
  }

  return null;
}

// ── fetchGraphJson com retry 429 ─────────────────────────────────────────────

const RATE_LIMIT_RETRY_MS = 1500;

export async function fetchGraphJson(url: string): Promise<any> {
  const attempt = async (): Promise<Response> => fetch(url);

  let res = await attempt();

  // Rate limit: espera e tenta uma vez mais
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_RETRY_MS));
    res = await attempt();
  }

  const json = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));

  if (json?.error) {
    const msg: string = json.error.message || json.error.type || 'Erro na Instagram Graph API';
    throw new Error(msg);
  }

  return json;
}
