import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, XCircle, ArrowRight, LogIn, UserPlus } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { saveSelectedCompanyId } from '../lib/companySelection';
import { labelRolePt, normalizeRole, Role } from '../types';

type InviteValidation = {
  valid: boolean;
  company_id: string;
  company_name: string | null;
  email: string | null;
  role: string;
  expires_at: string | null;
};

export const Join: React.FC<{ token: string | null }> = ({ token }) => {
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InviteValidation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requiresEmailConfirm, setRequiresEmailConfirm] = useState(false);

  const tokenTrim = useMemo(() => (token ?? '').trim(), [token]);

  const inviteRole = useMemo<Role>(() => normalizeRole(invite?.role), [invite?.role]);
  const emailLocked = Boolean(invite?.email);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setOk(null);
    setInvite(null);

    void (async () => {
      try {
        if (!isSupabaseConfigured()) throw new Error('Supabase não está configurado neste ambiente.');
        if (!tokenTrim || tokenTrim.length < 16) throw new Error('Convite inválido (token ausente).');

        const { data, error: rpcErr } = await supabase.rpc('validate_company_invite', { p_token: tokenTrim });
        if (rpcErr) throw rpcErr;

        const row = (data as any)?.[0] as InviteValidation | undefined;
        if (!row || row.valid !== true) throw new Error('Convite inválido, expirado ou já usado.');

        if (cancelled) return;

        setInvite(row);
        if (row.email) setEmail(row.email);

        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session) {
          setMode('signin');
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Falha ao validar convite.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tokenTrim]);

  const acceptInvite = async () => {
    if (!invite) return;
    const { data: companyId, error: acceptErr } = await supabase.rpc('accept_company_invite', { p_token: tokenTrim });
    if (acceptErr) throw acceptErr;
    const acceptedCompanyId = String(companyId || invite.company_id);

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (userId) saveSelectedCompanyId(userId, acceptedCompanyId);

    window.location.assign('/');
  };

  const onSubmit = async () => {
    if (!invite) return;
    setSubmitting(true);
    setError(null);
    setOk(null);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const cleanPassword = password;
      if (!cleanEmail || cleanEmail.indexOf('@') === -1) throw new Error('Informe um e-mail válido.');
      if (!cleanPassword || cleanPassword.length < 6) throw new Error('A senha precisa ter no mínimo 6 caracteres.');

      if (mode === 'signup') {
        const { data: signUp, error: signUpErr } = await supabase.auth.signUp({
          email: cleanEmail,
          password: cleanPassword,
          options: {
            data: { full_name: fullName.trim() || undefined },
          },
        });
        if (signUpErr) throw signUpErr;

        if (!signUp.session) {
          setRequiresEmailConfirm(true);
          setOk('Conta criada. Confirme seu e-mail e depois volte neste link para entrar na empresa.');
          return;
        }

        await acceptInvite();
        return;
      }

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      });
      if (signInErr) throw signInErr;

      await acceptInvite();
    } catch (e: any) {
      setError(e?.message ?? 'Falha ao aceitar convite.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--background))] text-[hsl(var(--foreground))] px-4 py-10">
      <div className="w-full max-w-lg cr8-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-extrabold cr8-text-gradient">CR8</div>
            <div className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Entrar em uma empresa via convite</div>
          </div>
        </div>

        {loading ? (
          <div className="mt-6 text-sm text-[hsl(var(--muted-foreground))]">Validando convite...</div>
        ) : error ? (
          <div className="mt-6 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] p-4">
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 text-rose-300 mt-0.5" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Não foi possível entrar</div>
                <div className="mt-1 text-sm text-rose-300">{error}</div>
              </div>
            </div>
            <div className="mt-4">
              <a
                href="/"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--foreground))] text-sm hover:bg-[hsl(var(--accent))]"
              >
                Voltar para Login
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        ) : !invite ? null : (
          <>
            <div className="mt-6 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-300 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Convite válido</div>
                  <div className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                    Empresa: <span className="text-[hsl(var(--foreground))] font-medium">{invite.company_name ?? invite.company_id}</span>
                  </div>
                  <div className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                    Perfil: <span className="text-[hsl(var(--foreground))] font-medium">{labelRolePt(inviteRole)}</span>
                  </div>
                  {invite.expires_at ? (
                    <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                      Expira em: {new Date(invite.expires_at).toLocaleString('pt-BR')}
                    </div>
                  ) : (
                    <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Não expira.</div>
                  )}
                </div>
              </div>
            </div>

            {ok ? <div className="mt-4 text-sm text-emerald-300">{ok}</div> : null}
            {error ? <div className="mt-4 text-sm text-rose-300">{error}</div> : null}

            <div className="mt-6 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMode('signup')}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                  mode === 'signup'
                    ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                    : 'border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]'
                }`}
              >
                <UserPlus className="h-4 w-4" />
                Criar conta
              </button>
              <button
                type="button"
                onClick={() => setMode('signin')}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                  mode === 'signin'
                    ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                    : 'border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]'
                }`}
              >
                <LogIn className="h-4 w-4" />
                Já tenho conta
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3">
              {mode === 'signup' ? (
                <div>
                  <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Nome completo (opcional)</label>
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    disabled={submitting || requiresEmailConfirm}
                    className="mt-2 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
                  />
                </div>
              ) : null}

              <div>
                <label className="block text-sm font-medium text-[hsl(var(--foreground))]">E-mail</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submitting || requiresEmailConfirm || emailLocked}
                  className="mt-2 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--foreground))] disabled:opacity-70"
                />
                {emailLocked ? (
                  <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Este convite está restrito a esse e-mail.</div>
                ) : null}
              </div>

              <div>
                <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Senha</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting || requiresEmailConfirm}
                  className="mt-2 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end">
              <button
                type="button"
                onClick={() => void onSubmit()}
                disabled={submitting || requiresEmailConfirm}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold hover:opacity-90 disabled:opacity-60"
              >
                {submitting ? 'Processando...' : mode === 'signup' ? 'Criar conta e entrar' : 'Entrar e aceitar convite'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
