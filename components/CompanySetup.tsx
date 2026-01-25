import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Building2, KeyRound } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface CompanySetupProps {
  onDone: (companyId: string) => void;
}

const normalizeAdAccountId = (id: string) => {
  const trimmed = id.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('act_') ? trimmed : `act_${trimmed.replace(/^act_/, '')}`;
};

export const CompanySetup: React.FC<CompanySetupProps> = ({ onDone }) => {
  const [companyName, setCompanyName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [brandLogoUrl, setBrandLogoUrl] = useState('');
  const [metaAdAccountId, setMetaAdAccountId] = useState('');
  const [whatsAppPhoneNumberId, setWhatsAppPhoneNumberId] = useState('');
  const [googleAdsCustomerId, setGoogleAdsCustomerId] = useState('');
  const [googleAdsLoginCustomerId, setGoogleAdsLoginCustomerId] = useState('');
  const [googleAdsConversionActionLead, setGoogleAdsConversionActionLead] = useState('');
  const [googleAdsConversionActionPurchase, setGoogleAdsConversionActionPurchase] = useState('');
  const [googleAdsCurrencyCode, setGoogleAdsCurrencyCode] = useState('BRL');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      const { data: companyId, error } = await supabase.rpc('create_company', { p_name: companyName });
      if (error) throw error;
      if (!companyId) throw new Error('Não foi possível criar a empresa.');

      const normalized = normalizeAdAccountId(metaAdAccountId);
      const updatePayload: any = {};
      if (normalized) updatePayload.meta_ad_account_id = normalized;
      if (whatsAppPhoneNumberId.trim()) updatePayload.whatsapp_phone_number_id = whatsAppPhoneNumberId.trim();
      if (brandName.trim()) updatePayload.brand_name = brandName.trim();
      if (brandLogoUrl.trim()) updatePayload.brand_logo_url = brandLogoUrl.trim();
      if (googleAdsCustomerId.trim()) updatePayload.google_ads_customer_id = googleAdsCustomerId.trim().replace(/\D/g, '');
      if (googleAdsLoginCustomerId.trim()) updatePayload.google_ads_login_customer_id = googleAdsLoginCustomerId.trim().replace(/\D/g, '');
      if (googleAdsConversionActionLead.trim()) updatePayload.google_ads_conversion_action_lead = googleAdsConversionActionLead.trim();
      if (googleAdsConversionActionPurchase.trim())
        updatePayload.google_ads_conversion_action_purchase = googleAdsConversionActionPurchase.trim();
      if (googleAdsCurrencyCode.trim()) updatePayload.google_ads_currency_code = googleAdsCurrencyCode.trim().toUpperCase();

      if (Object.keys(updatePayload).length > 0) {
        const { error: updateError } = await supabase.from('companies').update(updatePayload).eq('id', companyId);
        if (updateError) {
          const msg = String((updateError as any)?.message ?? updateError);
          if (!msg.toLowerCase().includes('does not exist')) throw updateError;
        }
      }

      onDone(companyId);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao criar empresa.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--background))] px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-xl rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-2xl"
      >
        <div className="p-8">
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-transparent flex items-center justify-center overflow-hidden ring-1 ring-[hsl(var(--border))]">
                <img src="/cr8-logo.svg" alt="CR8" className="h-12 w-12 object-contain" />
              </div>
              <div>
                <h2 className="text-2xl font-extrabold">Primeiro Setup</h2>
                <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                  Crie uma empresa/cliente para começar a ver dados reais.
                </p>
              </div>
            </div>

            <div className="h-12 w-12 rounded-xl bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] flex items-center justify-center">
              <Building2 className="h-6 w-6 text-[hsl(var(--primary))]" />
            </div>
          </div>

          {errorMsg && (
            <div className="mt-6 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-3">{errorMsg}</div>
          )}

          <form onSubmit={handleCreate} className="mt-6 space-y-5">
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Nome da empresa/cliente</label>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
                className="mt-1 w-full border border-[hsl(var(--border))] rounded-lg px-3 py-2 bg-[hsl(var(--input))] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                placeholder="Ex: Cliente X"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Meta Ad Account ID (opcional)</label>
              <div className="mt-1 flex items-center border border-[hsl(var(--border))] rounded-lg px-3 py-2 bg-[hsl(var(--input))] focus-within:ring-2 focus-within:ring-[hsl(var(--ring))]">
                <KeyRound className="w-4 h-4 text-[hsl(var(--muted-foreground))] mr-2" />
                <input
                  value={metaAdAccountId}
                  onChange={(e) => setMetaAdAccountId(e.target.value)}
                  className="w-full outline-none bg-transparent text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]"
                  placeholder="act_1234567890"
                />
              </div>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                Isso é usado no módulo de Tráfego (Meta Insights). Você também pode definir depois em `companies.meta_ad_account_id`.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-[hsl(var(--foreground))]">WhatsApp Phone Number ID (opcional)</label>
              <input
                value={whatsAppPhoneNumberId}
                onChange={(e) => setWhatsAppPhoneNumberId(e.target.value)}
                className="mt-1 w-full border border-[hsl(var(--border))] rounded-lg px-3 py-2 bg-[hsl(var(--input))] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                placeholder="Ex: 123456789012345"
              />
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                Use para vincular webhooks do WhatsApp a esta empresa. Você encontra em WhatsApp Manager (Phone Numbers) ou no payload do webhook (`metadata.phone_number_id`).
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-[hsl(var(--foreground))]">White Label (opcional)</label>
              <div className="mt-2 space-y-2">
                <input
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  className="w-full border border-[hsl(var(--border))] rounded-lg px-3 py-2 bg-[hsl(var(--input))] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                  placeholder="Nome de marca (ex: Bioclin Vacinas)"
                />
                <input
                  value={brandLogoUrl}
                  onChange={(e) => setBrandLogoUrl(e.target.value)}
                  className="w-full border border-[hsl(var(--border))] rounded-lg px-3 py-2 bg-[hsl(var(--input))] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                  placeholder="URL do logo (https://...)"
                />
              </div>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">Personaliza a navegação para o cliente (fase 5).</p>
            </div>

            <div className="pt-2 border-t border-[hsl(var(--border))]">
              <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Conversões (Google Ads) (opcional)</div>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                Necessário para <span className="font-medium">Google Ads Offline Conversions</span>. Os segredos (tokens OAuth) ficam no Supabase (Edge Secrets), não no banco.
              </p>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Google Ads Customer ID</label>
                  <input
                    value={googleAdsCustomerId}
                    onChange={(e) => setGoogleAdsCustomerId(e.target.value)}
                    className="mt-1 w-full border border-[hsl(var(--border))] rounded-lg px-3 py-2 bg-[hsl(var(--input))] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                    placeholder="1234567890 (sem traços)"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Login Customer ID (MCC)</label>
                  <input
                    value={googleAdsLoginCustomerId}
                    onChange={(e) => setGoogleAdsLoginCustomerId(e.target.value)}
                    className="mt-1 w-full border border-[hsl(var(--border))] rounded-lg px-3 py-2 bg-[hsl(var(--input))] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                    placeholder="Opcional (sem traços)"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Conversion Action (Lead)</label>
                  <input
                    value={googleAdsConversionActionLead}
                    onChange={(e) => setGoogleAdsConversionActionLead(e.target.value)}
                    className="mt-1 w-full border border-[hsl(var(--border))] rounded-lg px-3 py-2 bg-[hsl(var(--input))] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                    placeholder="ID (ex: 123) ou resource name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Conversion Action (Compra)</label>
                  <input
                    value={googleAdsConversionActionPurchase}
                    onChange={(e) => setGoogleAdsConversionActionPurchase(e.target.value)}
                    className="mt-1 w-full border border-[hsl(var(--border))] rounded-lg px-3 py-2 bg-[hsl(var(--input))] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                    placeholder="ID (ex: 456) ou resource name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Currency Code</label>
                  <input
                    value={googleAdsCurrencyCode}
                    onChange={(e) => setGoogleAdsCurrencyCode(e.target.value)}
                    className="mt-1 w-full border border-[hsl(var(--border))] rounded-lg px-3 py-2 bg-[hsl(var(--input))] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                    placeholder="BRL"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full flex items-center justify-center px-5 py-3 text-base font-medium text-white rounded-lg transition-colors ${
                loading ? 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] cursor-not-allowed' : 'bg-[hsl(var(--primary))] hover:opacity-90'
              }`}
            >
              {loading ? 'Criando…' : 'Criar empresa'}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
};
