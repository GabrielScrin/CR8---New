import React, { useEffect, useMemo, useState } from 'react';
import { Save, Trash2, UserPlus } from 'lucide-react';
import { getSupabaseUrl, isSupabaseConfigured, supabase } from '../lib/supabase';
import { Role } from '../types';

type CompanyRow = {
  id: string;
  name: string;
  brand_name?: string | null;
  brand_logo_url?: string | null;
  brand_primary_color?: string | null;
  meta_ad_account_id?: string | null;
  whatsapp_phone_number_id?: string | null;
  whatsapp_waba_id?: string | null;
  media_balance?: number | null;
  agency_fee_percent?: number | null;
  agency_fee_fixed?: number | null;
  currency?: string | null;
};

type CompanyMemberRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  member_role: Role;
  created_at: string;
};

type CompanyInviteRow = {
  id: string;
  email: string;
  member_role: Role;
  created_at: string;
  accepted_at: string | null;
};

export const SettingsView: React.FC<{ companyId?: string; role: Role }> = ({ companyId, role }) => {
  const readOnlyMode = !isSupabaseConfigured();
  const canEditCompany = useMemo(() => role === 'admin' || role === 'gestor', [role]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [company, setCompany] = useState<CompanyRow | null>(null);

  const [companyName, setCompanyName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [brandLogoUrl, setBrandLogoUrl] = useState('');
  const [brandPrimaryColor, setBrandPrimaryColor] = useState('');
  const [metaAdAccountId, setMetaAdAccountId] = useState('');
  const [whatsPhoneNumberId, setWhatsPhoneNumberId] = useState('');
  const [whatsWabaId, setWhatsWabaId] = useState('');
  const [currency, setCurrency] = useState('BRL');
  const [mediaBalance, setMediaBalance] = useState('');
  const [feePercent, setFeePercent] = useState('');
  const [feeFixed, setFeeFixed] = useState('');

  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [members, setMembers] = useState<CompanyMemberRow[]>([]);
  const [invites, setInvites] = useState<CompanyInviteRow[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('empresa');

  const webhookUrl = useMemo(() => `${getSupabaseUrl()}/functions/v1/omni-webhook`, []);

  useEffect(() => {
    if (readOnlyMode || !companyId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setOk(null);

    void (async () => {
      try {
        const fullSelect =
          'id,name,brand_name,brand_logo_url,brand_primary_color,meta_ad_account_id,whatsapp_phone_number_id,whatsapp_waba_id,media_balance,agency_fee_percent,agency_fee_fixed,currency';

        let { data, error: dbError } = await supabase.from('companies').select(fullSelect).eq('id', companyId).maybeSingle();
        if (dbError && String(dbError.message || '').toLowerCase().includes('does not exist')) {
          ({ data, error: dbError } = await supabase.from('companies').select('id,name').eq('id', companyId).maybeSingle());
        }
        if (dbError) throw dbError;
        if (cancelled) return;

        const row = (data ?? null) as any as CompanyRow | null;
        setCompany(row);

        setCompanyName(row?.name ?? '');
        setBrandName(row?.brand_name ?? '');
        setBrandLogoUrl(row?.brand_logo_url ?? '');
        setBrandPrimaryColor(row?.brand_primary_color ?? '');
        setMetaAdAccountId(row?.meta_ad_account_id ?? '');
        setWhatsPhoneNumberId(row?.whatsapp_phone_number_id ?? '');
        setWhatsWabaId(row?.whatsapp_waba_id ?? '');
        setCurrency(row?.currency ?? 'BRL');
        setMediaBalance(row?.media_balance != null ? String(row.media_balance) : '');
        setFeePercent(row?.agency_fee_percent != null ? String(row.agency_fee_percent) : '');
        setFeeFixed(row?.agency_fee_fixed != null ? String(row.agency_fee_fixed) : '');
      } catch (e: any) {
        if (cancelled) return;
        setCompany(null);
        setError(e?.message ?? 'Erro ao carregar configurações.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId, readOnlyMode]);

  const refreshMembersAndInvites = async () => {
    if (readOnlyMode || !companyId || !canEditCompany) {
      setMembers([]);
      setInvites([]);
      setMembersError(null);
      return;
    }

    setMembersLoading(true);
    setMembersError(null);

    try {
      const [{ data: membersData, error: membersErr }, { data: invitesData, error: invitesErr }] = await Promise.all([
        supabase.rpc('list_company_members', { p_company_id: companyId }),
        supabase.from('company_invites').select('id,email,member_role,created_at,accepted_at').eq('company_id', companyId).order('created_at', { ascending: false }),
      ]);

      const inviteMsg = String(invitesErr?.message ?? '').toLowerCase();
      const membersMsg = String(membersErr?.message ?? '').toLowerCase();
      const missing =
        inviteMsg.includes('does not exist') ||
        inviteMsg.includes('relation') ||
        membersMsg.includes('does not exist') ||
        membersMsg.includes('relation');

      if (missing) {
        throw new Error('Migrations de membros/convites nÃ£o aplicadas ainda. Rode `supabase db push` e recarregue.');
      }
      if (membersErr) throw membersErr;
      if (invitesErr) throw invitesErr;

      setMembers(((membersData ?? []) as any) as CompanyMemberRow[]);
      setInvites(((invitesData ?? []) as any) as CompanyInviteRow[]);
    } catch (e: any) {
      setMembers([]);
      setInvites([]);
      setMembersError(e?.message ?? 'Erro ao carregar membros.');
    } finally {
      setMembersLoading(false);
    }
  };

  useEffect(() => {
    void refreshMembersAndInvites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, readOnlyMode, canEditCompany]);

  const save = async () => {
    if (!companyId) return;
    if (!canEditCompany) return;
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const payload: Record<string, any> = {
        name: companyName.trim() || company?.name || 'Empresa',
        brand_name: brandName.trim() || null,
        brand_logo_url: brandLogoUrl.trim() || null,
        brand_primary_color: brandPrimaryColor.trim() || null,
        meta_ad_account_id: metaAdAccountId.trim() || null,
        whatsapp_phone_number_id: whatsPhoneNumberId.trim() || null,
        whatsapp_waba_id: whatsWabaId.trim() || null,
        currency: currency.trim() || 'BRL',
        media_balance: mediaBalance.trim() ? Number(mediaBalance) : null,
        agency_fee_percent: feePercent.trim() ? Number(feePercent) : null,
        agency_fee_fixed: feeFixed.trim() ? Number(feeFixed) : null,
      };

      const { error: updError } = await supabase.from('companies').update(payload as any).eq('id', companyId);
      if (updError) throw updError;
      setOk('Configurações salvas.');
    } catch (e: any) {
      setError(e?.message ?? 'Falha ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const createInvite = async () => {
    if (!companyId) return;
    if (!canEditCompany) return;

    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const email = inviteEmail.trim();
      if (!email) throw new Error('Informe um e-mail.');

      const { error: rpcErr } = await supabase.rpc('create_company_invite', {
        p_company_id: companyId,
        p_email: email,
        p_member_role: inviteRole,
      });
      if (rpcErr) throw rpcErr;

      setInviteEmail('');
      setInviteRole('empresa');
      await refreshMembersAndInvites();
      setOk('Convite criado.');
    } catch (e: any) {
      setError(e?.message ?? 'Falha ao criar convite.');
    } finally {
      setSaving(false);
    }
  };

  const revokeInvite = async (inviteId: string) => {
    if (!companyId) return;
    if (!canEditCompany) return;

    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const { error: rpcErr } = await supabase.rpc('revoke_company_invite', { p_invite_id: inviteId });
      if (rpcErr) throw rpcErr;
      await refreshMembersAndInvites();
      setOk('Convite removido.');
    } catch (e: any) {
      setError(e?.message ?? 'Falha ao remover convite.');
    } finally {
      setSaving(false);
    }
  };

  const updateMemberRole = async (userId: string, nextRole: Role) => {
    if (!companyId) return;
    if (!canEditCompany) return;

    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const { error: rpcErr } = await supabase.rpc('set_company_member_role', {
        p_company_id: companyId,
        p_user_id: userId,
        p_member_role: nextRole,
      });
      if (rpcErr) throw rpcErr;
      await refreshMembersAndInvites();
      setOk('PermissÃ£o atualizada.');
    } catch (e: any) {
      setError(e?.message ?? 'Falha ao atualizar permissÃ£o.');
    } finally {
      setSaving(false);
    }
  };

  const removeMember = async (userId: string) => {
    if (!companyId) return;
    if (!canEditCompany) return;

    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const { error: rpcErr } = await supabase.rpc('remove_company_member', { p_company_id: companyId, p_user_id: userId });
      if (rpcErr) throw rpcErr;
      await refreshMembersAndInvites();
      setOk('Membro removido.');
    } catch (e: any) {
      setError(e?.message ?? 'Falha ao remover membro.');
    } finally {
      setSaving(false);
    }
  };

  if (readOnlyMode) {
    return (
      <div className="cr8-card h-[calc(100vh-8rem)] flex items-center justify-center">
        <div className="max-w-md text-center px-6">
          <h2 className="text-xl font-bold text-[hsl(var(--foreground))]">Configurações</h2>
          <p className="text-[hsl(var(--muted-foreground))] mt-2 text-sm">Configure o Supabase para habilitar este módulo.</p>
        </div>
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="cr8-card h-[calc(100vh-8rem)] flex items-center justify-center">
        <div className="max-w-md text-center px-6">
          <h2 className="text-xl font-bold text-[hsl(var(--foreground))]">Configurações</h2>
          <p className="text-[hsl(var(--muted-foreground))] mt-2 text-sm">Selecione/crie uma empresa para continuar.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[hsl(var(--foreground))]">Configurações</h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 text-sm">Ajuste branding, integrações e financeiro por empresa.</p>
        </div>
        <button
          onClick={() => void save()}
          disabled={saving || loading || !canEditCompany}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>

      {!canEditCompany && (
        <div className="cr8-card p-4 text-sm text-[hsl(var(--muted-foreground))]">
          Seu perfil ({role}) é somente leitura para configurações da empresa.
        </div>
      )}

      {error && <div className="text-sm text-[hsl(var(--destructive))]">{error}</div>}
      {ok && <div className="text-sm text-emerald-300">{ok}</div>}

      <div className="cr8-card p-6 space-y-4">
        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Empresa</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Nome</label>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              disabled={!canEditCompany}
              className="mt-2 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Meta Ad Account ID</label>
            <input
              value={metaAdAccountId}
              onChange={(e) => setMetaAdAccountId(e.target.value)}
              disabled={!canEditCompany}
              placeholder="act_123..."
              className="mt-2 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
            />
          </div>
        </div>
      </div>

      <div className="cr8-card p-6 space-y-4">
        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">White Label</h2>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">Esses campos personalizam o nome e o logo no menu lateral.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Nome de marca</label>
            <input
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              disabled={!canEditCompany}
              placeholder="Ex: Agência X"
              className="mt-2 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">URL do logo</label>
            <input
              value={brandLogoUrl}
              onChange={(e) => setBrandLogoUrl(e.target.value)}
              disabled={!canEditCompany}
              placeholder="https://..."
              className="mt-2 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Cor primária (opcional)</label>
            <div className="mt-2 flex items-center gap-3">
              <input
                type="color"
                value={brandPrimaryColor?.startsWith('#') ? brandPrimaryColor : '#0D6EFD'}
                onChange={(e) => setBrandPrimaryColor(e.target.value)}
                disabled={!canEditCompany}
                className="h-10 w-12 rounded bg-transparent border border-[hsl(var(--border))]"
              />
              <input
                value={brandPrimaryColor}
                onChange={(e) => setBrandPrimaryColor(e.target.value)}
                disabled={!canEditCompany}
                placeholder="#0D6EFD"
                className="w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-sm font-mono text-[hsl(var(--foreground))]"
              />
            </div>
            <p className="mt-2 text-[11px] text-[hsl(var(--muted-foreground))]">Use HEX (ex: #0D6EFD). Aplica no tema ao trocar de empresa.</p>
          </div>
        </div>
      </div>

      <div className="cr8-card p-6 space-y-4">
        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">WhatsApp (Cloud API)</h2>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          Para receber mensagens no Live Chat, configure o webhook na Meta com esta URL de callback:{' '}
          <span className="font-mono">{webhookUrl}</span>
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">phone_number_id</label>
            <input
              value={whatsPhoneNumberId}
              onChange={(e) => setWhatsPhoneNumberId(e.target.value)}
              disabled={!canEditCompany}
              placeholder="Ex: 1234567890"
              className="mt-2 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-sm font-mono text-[hsl(var(--foreground))]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">WABA ID (opcional)</label>
            <input
              value={whatsWabaId}
              onChange={(e) => setWhatsWabaId(e.target.value)}
              disabled={!canEditCompany}
              placeholder="Ex: 198..."
              className="mt-2 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-sm font-mono text-[hsl(var(--foreground))]"
            />
          </div>
        </div>
      </div>

      <div className="cr8-card p-6 space-y-4">
        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Financeiro</h2>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">Controle de saldo de mídia e fee da agência (por empresa).</p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Moeda</label>
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              disabled={!canEditCompany}
              placeholder="BRL"
              className="mt-2 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Saldo de mídia</label>
            <input
              value={mediaBalance}
              onChange={(e) => setMediaBalance(e.target.value)}
              disabled={!canEditCompany}
              placeholder="0"
              inputMode="decimal"
              className="mt-2 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Fee (%)</label>
            <input
              value={feePercent}
              onChange={(e) => setFeePercent(e.target.value)}
              disabled={!canEditCompany}
              placeholder="10"
              inputMode="decimal"
              className="mt-2 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Fee fixo</label>
            <input
              value={feeFixed}
              onChange={(e) => setFeeFixed(e.target.value)}
              disabled={!canEditCompany}
              placeholder="0"
              inputMode="decimal"
              className="mt-2 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
            />
          </div>
        </div>
      </div>

      {canEditCompany && (
        <div className="cr8-card p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Membros</h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Convide equipe e clientes para acessar esta empresa.</p>
          </div>

          {membersError && <div className="text-sm text-[hsl(var(--destructive))]">{membersError}</div>}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--foreground))]">E-mail</label>
              <input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={saving}
                placeholder="cliente@empresa.com"
                className="mt-2 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Perfil</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as Role)}
                disabled={saving}
                className="mt-2 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
              >
                <option value="empresa">Cliente (empresa)</option>
                <option value="vendedor">Vendedor</option>
                <option value="gestor">Gestor</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <button
              onClick={() => void createInvite()}
              disabled={saving || !inviteEmail.trim()}
              className="h-10 inline-flex items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 text-sm font-semibold text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-60"
            >
              <UserPlus className="h-4 w-4" /> Convidar
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Membros atuais</div>
              <div className="rounded-lg border border-[hsl(var(--border))] overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-[hsl(var(--secondary))]">
                    <tr className="text-left text-[hsl(var(--muted-foreground))]">
                      <th className="px-3 py-2">Usuário</th>
                      <th className="px-3 py-2">Perfil</th>
                      <th className="px-3 py-2 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {membersLoading ? (
                      <tr>
                        <td className="px-3 py-3 text-[hsl(var(--muted-foreground))]" colSpan={3}>
                          Carregando...
                        </td>
                      </tr>
                    ) : members.length === 0 ? (
                      <tr>
                        <td className="px-3 py-3 text-[hsl(var(--muted-foreground))]" colSpan={3}>
                          Nenhum membro encontrado.
                        </td>
                      </tr>
                    ) : (
                      members.map((m) => (
                        <tr key={m.user_id} className="border-t border-[hsl(var(--border))]">
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <img
                                src={m.avatar_url ?? 'https://via.placeholder.com/32'}
                                alt={m.full_name ?? m.email ?? 'user'}
                                className="h-7 w-7 rounded-full bg-[hsl(var(--muted))]"
                              />
                              <div className="min-w-0">
                                <div className="text-[hsl(var(--foreground))] truncate">{m.full_name ?? '(sem nome)'}</div>
                                <div className="text-xs text-[hsl(var(--muted-foreground))] truncate">{m.email ?? ''}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={m.member_role}
                              onChange={(e) => void updateMemberRole(m.user_id, e.target.value as Role)}
                              disabled={saving}
                              className="rounded-md bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-2 py-1 text-sm text-[hsl(var(--foreground))]"
                            >
                              <option value="empresa">empresa</option>
                              <option value="vendedor">vendedor</option>
                              <option value="gestor">gestor</option>
                              <option value="admin">admin</option>
                            </select>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              onClick={() => void removeMember(m.user_id)}
                              disabled={saving}
                              className="inline-flex items-center gap-2 rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] disabled:opacity-60"
                            >
                              <Trash2 className="h-4 w-4" />
                              Remover
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-[hsl(var(--muted-foreground))]">O perfil é por empresa (multi-tenancy).</p>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Convites</div>
              <div className="rounded-lg border border-[hsl(var(--border))] overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-[hsl(var(--secondary))]">
                    <tr className="text-left text-[hsl(var(--muted-foreground))]">
                      <th className="px-3 py-2">E-mail</th>
                      <th className="px-3 py-2">Perfil</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {membersLoading ? (
                      <tr>
                        <td className="px-3 py-3 text-[hsl(var(--muted-foreground))]" colSpan={4}>
                          Carregando...
                        </td>
                      </tr>
                    ) : invites.length === 0 ? (
                      <tr>
                        <td className="px-3 py-3 text-[hsl(var(--muted-foreground))]" colSpan={4}>
                          Nenhum convite.
                        </td>
                      </tr>
                    ) : (
                      invites.map((i) => (
                        <tr key={i.id} className="border-t border-[hsl(var(--border))]">
                          <td className="px-3 py-2 text-[hsl(var(--foreground))]">{i.email}</td>
                          <td className="px-3 py-2 text-[hsl(var(--foreground))]">{i.member_role}</td>
                          <td className="px-3 py-2">
                            {i.accepted_at ? (
                              <span className="text-emerald-300 text-xs">aceito</span>
                            ) : (
                              <span className="text-[hsl(var(--muted-foreground))] text-xs">pendente</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {!i.accepted_at ? (
                              <button
                                onClick={() => void revokeInvite(i.id)}
                                disabled={saving}
                                className="inline-flex items-center gap-2 rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] disabled:opacity-60"
                              >
                                <Trash2 className="h-4 w-4" />
                                Revogar
                              </button>
                            ) : (
                              <span className="text-xs text-[hsl(var(--muted-foreground))]">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                Se o usuário já existir, o convite é aceito automaticamente. Caso contrário, será aceito no primeiro login.
              </p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
