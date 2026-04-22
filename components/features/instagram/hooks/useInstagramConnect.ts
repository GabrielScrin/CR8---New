import { useState, useCallback } from 'react';
import { INSTAGRAM_REQUIRED_SCOPES as REQUIRED_SCOPES } from '../../../../lib/facebookScopes';
import { supabase } from '../../../../lib/supabase';
import { clearIgTokenCache, exchangeIgToken, setActiveIgCompany } from '../../../../lib/instagramToken';

const META_GRAPH_VERSION = import.meta.env.VITE_META_GRAPH_VERSION ?? 'v19.0';
const GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export const INSTAGRAM_REQUIRED_SCOPES = REQUIRED_SCOPES;

export interface IgPage {
  id: string;           // Facebook Page ID
  name: string;
  igUserId: string;     // Instagram Business Account ID
  igUsername: string;
  igProfilePicture?: string;
  pageAccessToken?: string;
}

interface UseInstagramConnectReturn {
  pages: IgPage[];
  loading: boolean;
  error: string | null;
  missingScopes: boolean;
  fetchPages: () => Promise<void>;
  saveAccount: (page: IgPage, companyId: string) => Promise<void>;
  saving: boolean;
}

async function getProviderToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.provider_token ?? null;
}

export function useInstagramConnect(): UseInstagramConnectReturn {
  const [pages, setPages] = useState<IgPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingScopes, setMissingScopes] = useState(false);

  const fetchPages = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMissingScopes(false);
    setPages([]);

    try {
      const token = await getProviderToken();

      if (!token) {
        setError('Voce precisa estar logado com Facebook para conectar o Instagram. Faca logout e entre novamente com Facebook.');
        return;
      }

      // Busca as Facebook Pages do usuario com a conta Instagram vinculada.
      const res = await fetch(
        `${GRAPH_BASE}/me/accounts` +
        `?fields=id,name,access_token,instagram_business_account{id,username,profile_picture_url}` +
        `&access_token=${token}`,
      );

      const json = await res.json();

      if (json.error) {
        if (json.error.code === 10 || json.error.code === 200 || json.error.type === 'OAuthException') {
          setMissingScopes(true);
          setError('Permissoes insuficientes. Reconecte sua conta Facebook com os escopos do Instagram.');
          return;
        }

        throw new Error(json.error.message || 'Erro ao buscar paginas do Facebook.');
      }

      const rawPages: any[] = json.data ?? [];

      const igPages: IgPage[] = rawPages
        .filter((page: any) => page.instagram_business_account?.id)
        .map((page: any) => ({
          id: page.id,
          name: page.name,
          igUserId: page.instagram_business_account.id,
          igUsername: page.instagram_business_account.username ?? '',
          igProfilePicture: page.instagram_business_account.profile_picture_url,
          pageAccessToken: page.access_token ?? undefined,
        }));

      if (igPages.length === 0) {
        setError(
          'Nenhuma conta Instagram Business ou Creator encontrada nas suas paginas do Facebook. ' +
          'Certifique-se de que seu perfil do Instagram esta vinculado a uma Pagina do Facebook.',
        );
        return;
      }

      setPages(igPages);
    } catch (err: any) {
      setError(err?.message || 'Erro inesperado ao buscar contas Instagram.');
    } finally {
      setLoading(false);
    }
  }, []);

  const saveAccount = useCallback(async (page: IgPage, companyId: string) => {
    setSaving(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from('companies')
        .update({
          meta_page_id: page.id,
          instagram_business_account_id: page.igUserId,
          instagram_username: page.igUsername,
          // The page access token returned by /me/accounts is not reliable for
          // Instagram Graph media reads. Persist the long-lived user token instead.
          instagram_access_token: null,
          instagram_token_expires_at: null,
        })
        .eq('id', companyId);

      if (updateError) {
        const msg = String(updateError?.message ?? updateError);
        if (msg.toLowerCase().includes('does not exist') || msg.toLowerCase().includes('column')) {
          throw new Error(
            'A coluna instagram_business_account_id nao existe na tabela companies. ' +
            'Execute a migracao SQL antes de continuar.',
          );
        }

        throw updateError;
      }

      setActiveIgCompany(companyId);
      clearIgTokenCache();

      const providerToken = await getProviderToken();
      if (providerToken) {
        await exchangeIgToken(companyId, providerToken);
      }
    } catch (err: any) {
      setError(err?.message || 'Erro ao salvar conta Instagram.');
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  return { pages, loading, error, missingScopes, fetchPages, saveAccount, saving };
}
