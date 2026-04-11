import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../../lib/supabase';

export interface IgTokenStatus {
  hasStoredToken: boolean;
  expiresAt: Date | null;
  daysLeft: number | null;
  isExpiring: boolean;   // true quando restam ≤ 7 dias
  isExpired: boolean;    // true quando já expirou
  loading: boolean;
}

const WARN_DAYS = 7; // alerta quando restam ≤ 7 dias

/**
 * Lê o status do token de longa duração armazenado para a empresa.
 * Usado pela UI para exibir banners de alerta de expiração.
 */
export function useInstagramToken(companyId: string | null): IgTokenStatus {
  const [status, setStatus] = useState<IgTokenStatus>({
    hasStoredToken: false,
    expiresAt: null,
    daysLeft: null,
    isExpiring: false,
    isExpired: false,
    loading: true,
  });

  const check = useCallback(async () => {
    if (!companyId) {
      setStatus((s) => ({ ...s, loading: false }));
      return;
    }

    const { data } = await supabase
      .from('companies')
      .select('instagram_access_token, instagram_token_expires_at')
      .eq('id', companyId)
      .single();

    const token = (data as any)?.instagram_access_token as string | null;
    const expiresAtRaw = (data as any)?.instagram_token_expires_at as string | null;

    if (!token) {
      setStatus({ hasStoredToken: false, expiresAt: null, daysLeft: null, isExpiring: false, isExpired: false, loading: false });
      return;
    }

    const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;
    const msLeft = expiresAt ? expiresAt.getTime() - Date.now() : null;
    const daysLeft = msLeft !== null ? Math.floor(msLeft / (1000 * 60 * 60 * 24)) : null;
    const isExpired = msLeft !== null ? msLeft <= 0 : false;
    const isExpiring = daysLeft !== null && !isExpired && daysLeft <= WARN_DAYS;

    setStatus({ hasStoredToken: true, expiresAt, daysLeft, isExpiring, isExpired, loading: false });
  }, [companyId]);

  useEffect(() => {
    check();
  }, [check]);

  return status;
}
