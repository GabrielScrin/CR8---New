import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, RefreshCw, Save, Trash2, UserPlus, Send } from 'lucide-react';
import { getSupabaseAnonKey, getSupabaseUrl, isSupabaseConfigured, supabase } from '../lib/supabase';
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
  google_ads_customer_id?: string | null;
  google_ads_login_customer_id?: string | null;
  google_ads_conversion_action_lead?: string | null;
  google_ads_conversion_action_purchase?: string | null;
  google_ads_currency_code?: string | null;
  meta_pixel_id?: string | null;
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

type WeeklyReportRow = {
  id: string;
  company_id: string;
  period_start: string; // date
  period_end: string; // date (exclusive)
  summary: string | null;
  highlights: string[] | null;
  risks: string[] | null;
  next_week: string[] | null;
  metrics: any;
  created_at: string;
  updated_at: string;
};

type FinanceTransactionKind = 'media_credit' | 'media_spend' | 'agency_fee' | 'adjustment';

type FinanceTransactionRow = {
  id: string;
  company_id: string;
  kind: FinanceTransactionKind;
  amount: number;
  currency: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

type AuditEventRow = {
  id: string;
  company_id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  actor_user_id: string | null;
  metadata: any;
  created_at: string;
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
  const [googleAdsCustomerId, setGoogleAdsCustomerId] = useState('');
  const [googleAdsLoginCustomerId, setGoogleAdsLoginCustomerId] = useState('');
  const [googleAdsConvLead, setGoogleAdsConvLead] = useState('');
  const [googleAdsConvPurchase, setGoogleAdsConvPurchase] = useState('');
  const [googleAdsCurrencyCode, setGoogleAdsCurrencyCode] = useState('BRL');
  const [metaPixelId, setMetaPixelId] = useState('');
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

  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [weeklyError, setWeeklyError] = useState<string | null>(null);
  const [weeklyReports, setWeeklyReports] = useState<WeeklyReportRow[]>([]);
  const [weeklyGenerating, setWeeklyGenerating] = useState(false);

  const [dispatchingConversions, setDispatchingConversions] = useState(false);
  const [dispatchConversionsMsg, setDispatchConversionsMsg] = useState<string | null>(null);
  const [googleActionsLoading, setGoogleActionsLoading] = useState(false);
  const [googleActionsError, setGoogleActionsError] = useState<string | null>(null);
  const [googleActions, setGoogleActions] = useState<
    Array<{ id: string; resource_name: string; name: string | null; status: string | null; type: string | null; category: string | null }>
  >([]);
  const [googleActionsManual, setGoogleActionsManual] = useState(false);

  const [financeLedgerAvailable, setFinanceLedgerAvailable] = useState(false);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [financeError, setFinanceError] = useState<string | null>(null);
  const [financeTxns, setFinanceTxns] = useState<FinanceTransactionRow[]>([]);
  const [txnKind, setTxnKind] = useState<FinanceTransactionKind>('media_credit');
  const [txnAmount, setTxnAmount] = useState('');
  const [txnNote, setTxnNote] = useState('');
  const [txnSaving, setTxnSaving] = useState(false);

  const [auditAvailable, setAuditAvailable] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEventRow[]>([]);

  const webhookUrl = useMemo(() => `${getSupabaseUrl()}/functions/v1/omni-webhook`, []);

  const formatDatePt = (isoDate: string) => {
    const d = new Date(`${isoDate}T00:00:00Z`);
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  };

  const formatPeriodPt = (start: string, endExclusive: string) => {
    const end = new Date(`${endExclusive}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() - 1);
    const endStr = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(end);
    return `${formatDatePt(start)} \u2192 ${endStr}`;
  };

  const formatMoney = (amount: number, cur: string) => {
    const code = (cur || 'BRL').toUpperCase();
    try {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: code, maximumFractionDigits: 2 }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${code}`;
    }
  };

  const labelTxnKind = (k: FinanceTransactionKind) => {
    switch (k) {
      case 'media_credit':
        return 'Cr\u00e9dito de m\u00eddia';
      case 'media_spend':
        return 'Gasto de m\u00eddia';
      case 'agency_fee':
        return 'Fee da ag\u00eancia';
      case 'adjustment':
        return 'Ajuste';
      default:
        return k;
    }
  };

  const labelAuditAction = (a: string) => {
    switch (a) {
      case 'company_invite.created':
        return 'Convite criado';
      case 'company_invite.accepted':
        return 'Convite aceito';
      case 'company_invite.revoked':
        return 'Convite revogado';
      case 'company_member.added':
        return 'Membro adicionado';
      case 'company_member.role_changed':
        return 'Permissão alterada';
      case 'company_member.removed':
        return 'Membro removido';
      case 'finance_transaction.created':
        return 'Movimento financeiro';
      default:
        return a;
    }
  };

  useEffect(() => {
    if (readOnlyMode || !companyId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setOk(null);

    void (async () => {
      try {
        const fullSelect =
          'id,name,brand_name,brand_logo_url,brand_primary_color,meta_ad_account_id,whatsapp_phone_number_id,whatsapp_waba_id,google_ads_customer_id,google_ads_login_customer_id,google_ads_conversion_action_lead,google_ads_conversion_action_purchase,google_ads_currency_code,meta_pixel_id,media_balance,agency_fee_percent,agency_fee_fixed,currency';

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
        setGoogleAdsCustomerId(row?.google_ads_customer_id ?? '');
        setGoogleAdsLoginCustomerId(row?.google_ads_login_customer_id ?? '');
        setGoogleAdsConvLead(row?.google_ads_conversion_action_lead ?? '');
        setGoogleAdsConvPurchase(row?.google_ads_conversion_action_purchase ?? '');
        setGoogleAdsCurrencyCode(row?.google_ads_currency_code ?? 'BRL');
        setMetaPixelId(row?.meta_pixel_id ?? '');
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

  const refreshFinanceTransactions = async () => {
    if (readOnlyMode || !companyId) return;
    setFinanceLoading(true);
    setFinanceError(null);

    try {
      const { data, error } = await supabase
        .from('finance_transactions')
        .select('id,company_id,kind,amount,currency,note,created_by,created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        const msg = String(error.message || '').toLowerCase();
        if (msg.includes('does not exist')) {
          setFinanceLedgerAvailable(false);
          setFinanceTxns([]);
          return;
        }
        throw error;
      }

      setFinanceLedgerAvailable(true);
      setFinanceTxns(
        ((data ?? []) as any[]).map((r) => ({
          id: String(r.id),
          company_id: String(r.company_id),
          kind: r.kind as FinanceTransactionKind,
          amount: Number(r.amount),
          currency: String(r.currency ?? 'BRL'),
          note: r.note ?? null,
          created_by: r.created_by ?? null,
          created_at: String(r.created_at),
        }))
      );
    } catch (e: any) {
      setFinanceLedgerAvailable(true);
      setFinanceTxns([]);
      setFinanceError(e?.message ?? 'Erro ao carregar transações.');
    } finally {
      setFinanceLoading(false);
    }
  };

  useEffect(() => {
    void refreshFinanceTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, readOnlyMode]);

  const refreshAuditEvents = async () => {
    if (readOnlyMode || !companyId) return;
    setAuditLoading(true);
    setAuditError(null);
    try {
      const { data, error } = await supabase
        .from('audit_events')
        .select('id,company_id,action,entity_type,entity_id,actor_user_id,metadata,created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        const msg = String(error.message || '').toLowerCase();
        if (msg.includes('does not exist')) {
          setAuditAvailable(false);
          setAuditEvents([]);
          return;
        }
        throw error;
      }

      setAuditAvailable(true);
      setAuditEvents(
        ((data ?? []) as any[]).map((r) => ({
          id: String(r.id),
          company_id: String(r.company_id),
          action: String(r.action),
          entity_type: r.entity_type ?? null,
          entity_id: r.entity_id ?? null,
          actor_user_id: r.actor_user_id ?? null,
          metadata: r.metadata ?? null,
          created_at: String(r.created_at),
        }))
      );
    } catch (e: any) {
      setAuditAvailable(true);
      setAuditEvents([]);
      setAuditError(e?.message ?? 'Erro ao carregar auditoria.');
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    void refreshAuditEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, readOnlyMode]);

  const applyTransaction = async () => {
    if (readOnlyMode || !companyId) return;
    if (!canEditCompany) return;

    const rawAmount = txnAmount.replace(',', '.').trim();
    const parsed = rawAmount ? Number(rawAmount) : NaN;
    if (!Number.isFinite(parsed) || parsed === 0) {
      setFinanceError('Informe um valor válido.');
      return;
    }

    const abs = Math.abs(parsed);
    const signed = txnKind === 'media_spend' ? -abs : abs;

    setTxnSaving(true);
    setFinanceError(null);
    try {
      const { data, error } = await supabase.rpc('apply_finance_transaction', {
        p_company_id: companyId,
        p_kind: txnKind,
        p_amount: signed,
        p_note: txnNote.trim() || null,
      });

      if (error) throw error;
      if (!data) throw new Error('Falha ao registrar transação.');

      setTxnAmount('');
      setTxnNote('');
      await refreshFinanceTransactions();

      // Refresh cached company values (media_balance might be updated by the RPC)
      try {
        const { data: updated } = await supabase
          .from('companies')
          .select('media_balance,agency_fee_percent,agency_fee_fixed,currency')
          .eq('id', companyId)
          .maybeSingle();
        if (updated) {
          setMediaBalance(updated.media_balance != null ? String(updated.media_balance) : '');
          setFeePercent(updated.agency_fee_percent != null ? String(updated.agency_fee_percent) : '');
          setFeeFixed(updated.agency_fee_fixed != null ? String(updated.agency_fee_fixed) : '');
          setCurrency(updated.currency ?? 'BRL');
        }
      } catch {
        // ignore
      }
    } catch (e: any) {
      setFinanceError(e?.message ?? 'Erro ao registrar transação.');
    } finally {
      setTxnSaving(false);
    }
  };

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
        throw new Error('Migrations de membros/convites não aplicadas ainda. Rode `supabase db push` e recarregue.');
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

  const refreshWeeklyReports = async () => {
    if (readOnlyMode || !companyId) {
      setWeeklyReports([]);
      setWeeklyError(null);
      return;
    }

    setWeeklyLoading(true);
    setWeeklyError(null);
    try {
      const { data, error: repErr } = await supabase
        .from('weekly_reports')
        .select('id,company_id,period_start,period_end,summary,highlights,risks,next_week,metrics,created_at,updated_at')
        .eq('company_id', companyId)
        .order('period_start', { ascending: false })
        .limit(12);

      const msg = String(repErr?.message ?? '').toLowerCase();
      const missing = msg.includes('does not exist') || msg.includes('relation');
      if (missing) throw new Error('Migrations de relatório semanal não aplicadas ainda. Rode `supabase db push` e recarregue.');
      if (repErr) throw repErr;

      setWeeklyReports(((data ?? []) as any) as WeeklyReportRow[]);
    } catch (e: any) {
      setWeeklyReports([]);
      setWeeklyError(e?.message ?? 'Erro ao carregar relatórios.');
    } finally {
      setWeeklyLoading(false);
    }
  };

  useEffect(() => {
    void refreshWeeklyReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, readOnlyMode]);

  const generateWeeklyNow = async () => {
    if (readOnlyMode || !companyId) return;
    setWeeklyGenerating(true);
    setWeeklyError(null);
    setError(null);
    setOk(null);
    try {
      const { error: rpcErr } = await supabase.rpc('request_weekly_report', { p_company_id: companyId });
      if (rpcErr) throw rpcErr;
      await refreshWeeklyReports();
      setOk('Relatório semanal gerado.');
    } catch (e: any) {
      setWeeklyError(e?.message ?? 'Falha ao gerar relatório.');
    } finally {
      setWeeklyGenerating(false);
    }
  };

  const dispatchConversionsNow = async () => {
    if (readOnlyMode || !companyId) return;
    setDispatchingConversions(true);
    setDispatchConversionsMsg(null);
    setError(null);
    setOk(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Sem sessão. Faça login novamente.');

      const res = await fetch(`${getSupabaseUrl()}/functions/v1/conversions-dispatch`, {
        method: 'POST',
        headers: {
          apikey: getSupabaseAnonKey(),
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ company_id: companyId, limit: 100 }),
      });

      const text = await res.text().catch(() => '');
      let payload: any = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = { raw: text };
      }
      if (!res.ok) throw new Error(payload?.error ?? `HTTP ${res.status}`);

      const processed = Number(payload?.processed ?? 0);
      const sent = Number(payload?.sent ?? 0);
      const failed = Number(payload?.failed ?? 0);
      setDispatchConversionsMsg(`Conversões: processadas ${processed}, enviadas ${sent}, falhas ${failed}.`);
      setOk('Conversões processadas.');
    } catch (e: any) {
      setDispatchConversionsMsg(null);
      setError(e?.message ?? 'Falha ao despachar conversões.');
    } finally {
      setDispatchingConversions(false);
    }
  };

  const refreshGoogleConversionActions = async () => {
    if (readOnlyMode || !companyId) return;
    setGoogleActionsLoading(true);
    setGoogleActionsError(null);
    try {
      const getAccessToken = async (): Promise<string> => {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session?.access_token) return sessionData.session.access_token;

        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) throw refreshError;
        const token = refreshed.session?.access_token;
        if (!token) throw new Error('Sem sessão. Faça login novamente.');
        return token;
      };

      const customerId = googleAdsCustomerId.trim().replace(/\D/g, '');
      if (!customerId) throw new Error('Preencha o Google Ads Customer ID primeiro.');

      const callOnce = async (accessToken: string) => {
        return fetch(`${getSupabaseUrl()}/functions/v1/google-ads-actions`, {
          method: 'POST',
          headers: {
            apikey: getSupabaseAnonKey(),
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ company_id: companyId, customer_id: customerId }),
        });
      };

      let accessToken = await getAccessToken();
      let res = await callOnce(accessToken);
      if (res.status === 401) {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (!refreshError && refreshed.session?.access_token) {
          accessToken = refreshed.session.access_token;
          res = await callOnce(accessToken);
        }
      }

      const text = await res.text().catch(() => '');
      let payload: any = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = { raw: text };
      }
      if (!res.ok) throw new Error(payload?.error ?? `HTTP ${res.status}`);

      const actions = Array.isArray(payload?.actions) ? payload.actions : [];
      setGoogleActions(actions);
      if (actions.length === 0) setGoogleActionsError('Nenhuma Conversion Action encontrada nesse Customer ID.');
    } catch (e: any) {
      setGoogleActions([]);
      setGoogleActionsError(e?.message ?? 'Falha ao buscar Conversion Actions.');
    } finally {
      setGoogleActionsLoading(false);
    }
  };

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
        google_ads_customer_id: googleAdsCustomerId.trim() ? googleAdsCustomerId.trim().replace(/\D/g, '') : null,
        google_ads_login_customer_id: googleAdsLoginCustomerId.trim() ? googleAdsLoginCustomerId.trim().replace(/\D/g, '') : null,
        google_ads_conversion_action_lead: googleAdsConvLead.trim() || null,
        google_ads_conversion_action_purchase: googleAdsConvPurchase.trim() || null,
        google_ads_currency_code: googleAdsCurrencyCode.trim() ? googleAdsCurrencyCode.trim().toUpperCase() : null,
        meta_pixel_id: metaPixelId.trim() || null,
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
      setOk('Permissão atualizada.');
    } catch (e: any) {
      setError(e?.message ?? 'Falha ao atualizar permissão.');
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

        {financeLedgerAvailable ? (
          <div className="pt-4 border-t border-[hsl(var(--border))] space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">Movimentos</h3>
                <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                  Registre créditos e gastos (atualiza o saldo de mídia) e fees/ajustes (histórico).
                </p>
              </div>
              <button
                onClick={() => void refreshFinanceTransactions()}
                disabled={financeLoading || readOnlyMode || !companyId}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] disabled:opacity-60"
                title="Atualizar"
              >
                <RefreshCw className="h-4 w-4" />
                Atualizar
              </button>
            </div>

            {financeError ? <div className="text-sm text-red-400">{financeError}</div> : null}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))]">Tipo</label>
                <select
                  value={txnKind}
                  onChange={(e) => setTxnKind(e.target.value as FinanceTransactionKind)}
                  disabled={readOnlyMode || !canEditCompany}
                  className="mt-2 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
                >
                  <option value="media_credit">Crédito de mídia</option>
                  <option value="media_spend">Gasto de mídia</option>
                  <option value="adjustment">Ajuste</option>
                  <option value="agency_fee">Fee da agência</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))]">Valor</label>
                <input
                  value={txnAmount}
                  onChange={(e) => setTxnAmount(e.target.value)}
                  disabled={readOnlyMode || !canEditCompany}
                  placeholder="Ex: 100,00"
                  inputMode="decimal"
                  className="mt-2 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))]">Obs (opcional)</label>
                <div className="mt-2 flex gap-2">
                  <input
                    value={txnNote}
                    onChange={(e) => setTxnNote(e.target.value)}
                    disabled={readOnlyMode || !canEditCompany}
                    placeholder="Ex: Recarga inicial / Ajuste"
                    className="w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
                  />
                  <button
                    onClick={() => void applyTransaction()}
                    disabled={txnSaving || readOnlyMode || !canEditCompany}
                    className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold hover:opacity-90 disabled:opacity-60"
                    title="Registrar"
                  >
                    <Save className="h-4 w-4" />
                    {txnSaving ? 'Salvando...' : 'Registrar'}
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-[hsl(var(--border))] overflow-auto max-h-80">
              <table className="min-w-full text-sm">
                <thead className="bg-[hsl(var(--card))] sticky top-0">
                  <tr className="text-left text-[hsl(var(--muted-foreground))]">
                    <th className="px-3 py-2 font-medium">Quando</th>
                    <th className="px-3 py-2 font-medium">Tipo</th>
                    <th className="px-3 py-2 font-medium">Valor</th>
                    <th className="px-3 py-2 font-medium">Obs</th>
                  </tr>
                </thead>
                <tbody>
                  {financeTxns.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-[hsl(var(--muted-foreground))]">
                        Sem movimentos ainda.
                      </td>
                    </tr>
                  ) : (
                    financeTxns.map((t) => (
                      <tr key={t.id} className="border-t border-[hsl(var(--border))]">
                        <td className="px-3 py-2 whitespace-nowrap text-[hsl(var(--foreground))]">
                          {new Date(t.created_at).toLocaleString('pt-BR')}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-[hsl(var(--foreground))]">{labelTxnKind(t.kind)}</td>
                        <td
                          className={`px-3 py-2 whitespace-nowrap font-medium ${
                            t.amount < 0 ? 'text-red-400' : 'text-emerald-400'
                          }`}
                        >
                          {formatMoney(t.amount, t.currency || currency)}
                        </td>
                        <td className="px-3 py-2 text-[hsl(var(--muted-foreground))]">{t.note || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Histórico de transações ainda não está habilitado neste banco (migration: phase5_finance_ledger).
          </p>
        )}
      </div>

      <div className="cr8-card p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Conversões (Google Ads / Meta)</h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              Usa os click IDs capturados nos leads (ex: <span className="font-mono">gclid</span>) para enviar{' '}
              <span className="font-medium">Offline Conversions</span>. Os segredos OAuth ficam no Supabase (Edge Secrets), não no banco.
            </p>
          </div>

          <button
            onClick={() => void dispatchConversionsNow()}
            disabled={dispatchingConversions || readOnlyMode || !companyId}
            className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold hover:opacity-90 disabled:opacity-60"
            title="Despachar conversões pendentes (Google Ads)"
          >
            <Send className="h-4 w-4" />
            {dispatchingConversions ? 'Enviando...' : 'Despachar agora'}
          </button>
        </div>

        {dispatchConversionsMsg ? <div className="text-xs text-emerald-300">{dispatchConversionsMsg}</div> : null}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Google Ads Customer ID</label>
            <input
              value={googleAdsCustomerId}
              onChange={(e) => setGoogleAdsCustomerId(e.target.value)}
              disabled={!canEditCompany}
              placeholder="1234567890 (sem traços)"
              className="mt-2 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-sm font-mono text-[hsl(var(--foreground))]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Login Customer ID (MCC)</label>
            <input
              value={googleAdsLoginCustomerId}
              onChange={(e) => setGoogleAdsLoginCustomerId(e.target.value)}
              disabled={!canEditCompany}
              placeholder="Opcional (sem traços)"
              className="mt-2 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-sm font-mono text-[hsl(var(--foreground))]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Currency Code</label>
            <input
              value={googleAdsCurrencyCode}
              onChange={(e) => setGoogleAdsCurrencyCode(e.target.value)}
              disabled={!canEditCompany}
              placeholder="BRL"
              className="mt-2 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-sm font-mono text-[hsl(var(--foreground))]"
            />
          </div>

          <div className="md:col-span-3 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-[hsl(var(--muted-foreground))]">
                Dica: clique em <span className="font-medium">Buscar ações</span> para listar as Conversion Actions desse Customer ID e só selecionar.
              </div>
              {googleActionsError ? <div className="mt-1 text-xs text-rose-300">{googleActionsError}</div> : null}
            </div>
            <button
              onClick={() => void refreshGoogleConversionActions()}
              disabled={googleActionsLoading || readOnlyMode || !companyId}
              className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--foreground))] text-sm hover:bg-[hsl(var(--accent))] disabled:opacity-60"
              title="Buscar Conversion Actions no Google Ads"
            >
              <RefreshCw className={`h-4 w-4 ${googleActionsLoading ? 'animate-spin' : ''}`} />
              {googleActionsLoading ? 'Buscando...' : 'Buscar ações'}
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Conversion Action (Lead)</label>
            <select
              value={googleAdsConvLead}
              onChange={(e) => setGoogleAdsConvLead(e.target.value)}
              disabled={!canEditCompany}
              className="mt-2 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
            >
              <option value="">Selecione (ou preencha manualmente)</option>
              {googleActions.map((a) => (
                <option key={a.resource_name} value={a.id || a.resource_name}>
                  {(a.name || 'Sem nome') + ` — ${a.id}`}
                </option>
              ))}
            </select>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="text-[11px] text-[hsl(var(--muted-foreground))]">
                Se preferir, você pode colar o resource name (ex.: <span className="font-mono">customers/123.../conversionActions/111</span>).
              </div>
              <button
                type="button"
                onClick={() => setGoogleActionsManual((v) => !v)}
                className="text-[11px] text-[hsl(var(--primary))] hover:underline"
              >
                {googleActionsManual ? 'Ocultar manual' : 'Editar manual'}
              </button>
            </div>
            {googleActionsManual ? (
              <input
                value={googleAdsConvLead}
                onChange={(e) => setGoogleAdsConvLead(e.target.value)}
                disabled={!canEditCompany}
                placeholder="ID (ex: 123) ou resource name"
                className="mt-2 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-sm font-mono text-[hsl(var(--foreground))]"
              />
            ) : null}
          </div>

          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Conversion Action (Compra)</label>
            <select
              value={googleAdsConvPurchase}
              onChange={(e) => setGoogleAdsConvPurchase(e.target.value)}
              disabled={!canEditCompany}
              className="mt-2 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
            >
              <option value="">(Opcional) Selecione</option>
              {googleActions.map((a) => (
                <option key={a.resource_name + ':purchase'} value={a.id || a.resource_name}>
                  {(a.name || 'Sem nome') + ` — ${a.id}`}
                </option>
              ))}
            </select>
            {googleActionsManual ? (
              <input
                value={googleAdsConvPurchase}
                onChange={(e) => setGoogleAdsConvPurchase(e.target.value)}
                disabled={!canEditCompany}
                placeholder="ID (ex: 456) ou resource name"
                className="mt-2 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-sm font-mono text-[hsl(var(--foreground))]"
              />
            ) : null}
          </div>

          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Meta Pixel ID (opcional)</label>
            <input
              value={metaPixelId}
              onChange={(e) => setMetaPixelId(e.target.value)}
              disabled={!canEditCompany}
              placeholder="1234567890"
              className="mt-2 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-sm font-mono text-[hsl(var(--foreground))]"
            />
            <p className="mt-2 text-[11px] text-[hsl(var(--muted-foreground))]">Usaremos isso para eventos da Meta (CAPI) em uma próxima etapa.</p>
          </div>
        </div>

        <div className="text-xs text-[hsl(var(--muted-foreground))]">
          Dica: para enviar automaticamente, configure um Cron (Vercel Cron / QStash) chamando{' '}
          <span className="font-mono">{getSupabaseUrl()}/functions/v1/conversions-dispatch</span> com{' '}
          <span className="font-mono">{`{ company_id: "${companyId}" }`}</span>.
        </div>
      </div>

      <div className="cr8-card p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Auditoria</h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Registra eventos importantes (membros, convites e financeiro) para rastreabilidade.
            </p>
          </div>
          <button
            onClick={() => void refreshAuditEvents()}
            disabled={auditLoading || readOnlyMode || !companyId}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] disabled:opacity-60"
            title="Atualizar"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>

        {auditError && <div className="text-sm text-[hsl(var(--destructive))]">{auditError}</div>}

        {auditLoading ? (
          <div className="text-sm text-[hsl(var(--muted-foreground))]">Carregando eventos...</div>
        ) : !auditAvailable ? (
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Auditoria ainda não está habilitada neste banco (migration: phase6_1_audit_logs).
          </p>
        ) : auditEvents.length === 0 ? (
          <div className="text-sm text-[hsl(var(--muted-foreground))]">Nenhum evento ainda.</div>
        ) : (
          <div className="overflow-auto rounded-lg border border-[hsl(var(--border))] max-h-[360px]">
            <table className="w-full text-sm">
              <thead className="bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Quando</th>
                  <th className="px-3 py-2 text-left font-medium">Evento</th>
                  <th className="px-3 py-2 text-left font-medium">Por</th>
                  <th className="px-3 py-2 text-left font-medium">Alvo</th>
                  <th className="px-3 py-2 text-left font-medium">Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {auditEvents.map((ev) => {
                  const metaStr = JSON.stringify(ev.metadata ?? {});
                  const actorShort = ev.actor_user_id ? String(ev.actor_user_id).slice(0, 8) : null;
                  const entityLabel = [ev.entity_type, ev.entity_id].filter(Boolean).join(':');
                  return (
                    <tr key={ev.id} className="border-t border-[hsl(var(--border))]">
                      <td className="px-3 py-2 whitespace-nowrap text-[hsl(var(--foreground))]">
                        {new Date(ev.created_at).toLocaleString('pt-BR')}
                      </td>
                      <td className="px-3 py-2 text-[hsl(var(--foreground))]">{labelAuditAction(ev.action)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-[hsl(var(--muted-foreground))] font-mono">
                        {actorShort ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-[hsl(var(--muted-foreground))]">{entityLabel || '—'}</td>
                      <td className="px-3 py-2 text-[hsl(var(--muted-foreground))]">
                        <span className="font-mono text-xs">{metaStr.length > 160 ? `${metaStr.slice(0, 160)}…` : metaStr}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="cr8-card p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Relatório semanal</h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Gerado automaticamente toda segunda-feira (12:00 UTC ≈ 09:00 São Paulo). Baseado em Leads/CRM e atividade do Live Chat.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void refreshWeeklyReports()}
              disabled={weeklyLoading || readOnlyMode || !companyId}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] disabled:opacity-60"
              title="Atualizar"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <button
              onClick={() => void generateWeeklyNow()}
              disabled={weeklyGenerating || readOnlyMode || !companyId || !canEditCompany}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold hover:opacity-90 disabled:opacity-60"
              title="Gera para a última semana completa (Seg-Dom)."
            >
              <CalendarClock className="h-4 w-4" />
              {weeklyGenerating ? 'Gerando...' : 'Gerar agora'}
            </button>
          </div>
        </div>

        {weeklyError && <div className="text-sm text-[hsl(var(--destructive))]">{weeklyError}</div>}

        {weeklyLoading ? (
          <div className="text-sm text-[hsl(var(--muted-foreground))]">Carregando relatórios...</div>
        ) : weeklyReports.length === 0 ? (
          <div className="text-sm text-[hsl(var(--muted-foreground))]">
            Nenhum relatório ainda. Clique em <span className="font-semibold">Gerar agora</span> para criar o primeiro.
          </div>
        ) : (
          <div className="space-y-3">
            {weeklyReports.map((r) => {
              const created = Number(r?.metrics?.leads?.created ?? 0) || 0;
              const won = Number(r?.metrics?.leads?.won ?? 0) || 0;
              const inbound = Number(r?.metrics?.messages?.inbound ?? 0) || 0;
              const outbound = Number(r?.metrics?.messages?.outbound ?? 0) || 0;

              return (
                <details
                  key={r.id}
                  className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] p-4"
                >
                  <summary className="cursor-pointer select-none">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[hsl(var(--foreground))]">
                          {formatPeriodPt(r.period_start, r.period_end)}
                        </div>
                        <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))] truncate">{r.summary ?? ''}</div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                        <span className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1">
                          Leads: <span className="text-[hsl(var(--foreground))] font-semibold">{created}</span>
                        </span>
                        <span className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1">
                          Won: <span className="text-[hsl(var(--foreground))] font-semibold">{won}</span>
                        </span>
                        <span className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1">
                          Msg:{' '}
                          <span className="text-[hsl(var(--foreground))] font-semibold">{inbound}</span>/
                          <span className="text-[hsl(var(--foreground))] font-semibold">{outbound}</span>
                        </span>
                      </div>
                    </div>
                  </summary>

                  <div className="mt-3 space-y-3 text-sm">
                    {r.summary && <div className="text-[hsl(var(--foreground))]">{r.summary}</div>}

                    {Array.isArray(r.highlights) && r.highlights.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-[hsl(var(--muted-foreground))] mb-1">Destaques</div>
                        <ul className="list-disc pl-5 space-y-1 text-[hsl(var(--foreground))]">
                          {r.highlights.map((h, i) => (
                            <li key={i}>{h}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {Array.isArray(r.risks) && r.risks.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-[hsl(var(--muted-foreground))] mb-1">Riscos</div>
                        <ul className="list-disc pl-5 space-y-1 text-[hsl(var(--foreground))]">
                          {r.risks.map((h, i) => (
                            <li key={i}>{h}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {Array.isArray(r.next_week) && r.next_week.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-[hsl(var(--muted-foreground))] mb-1">Próximos passos</div>
                        <ul className="list-disc pl-5 space-y-1 text-[hsl(var(--foreground))]">
                          {r.next_week.map((h, i) => (
                            <li key={i}>{h}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
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
