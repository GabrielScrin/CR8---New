import React, { useEffect, useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { getSupabaseUrl, isSupabaseConfigured, supabase } from '../lib/supabase';
import { Role } from '../types';

type CompanyRow = {
  id: string;
  name: string;
  brand_name?: string | null;
  brand_logo_url?: string | null;
  meta_ad_account_id?: string | null;
  whatsapp_phone_number_id?: string | null;
  whatsapp_waba_id?: string | null;
  media_balance?: number | null;
  agency_fee_percent?: number | null;
  agency_fee_fixed?: number | null;
  currency?: string | null;
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
  const [metaAdAccountId, setMetaAdAccountId] = useState('');
  const [whatsPhoneNumberId, setWhatsPhoneNumberId] = useState('');
  const [whatsWabaId, setWhatsWabaId] = useState('');
  const [currency, setCurrency] = useState('BRL');
  const [mediaBalance, setMediaBalance] = useState('');
  const [feePercent, setFeePercent] = useState('');
  const [feeFixed, setFeeFixed] = useState('');

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
          'id,name,brand_name,brand_logo_url,meta_ad_account_id,whatsapp_phone_number_id,whatsapp_waba_id,media_balance,agency_fee_percent,agency_fee_fixed,currency';

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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
    </div>
  );
};
