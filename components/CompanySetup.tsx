import React, { useState } from 'react';
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
  const [metaAdAccountId, setMetaAdAccountId] = useState('');
  const [whatsAppPhoneNumberId, setWhatsAppPhoneNumberId] = useState('');
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

      if (Object.keys(updatePayload).length > 0) {
        const { error: updateError } = await supabase.from('companies').update(updatePayload).eq('id', companyId);
        if (updateError) throw updateError;
      }

      onDone(companyId);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao criar empresa.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="bg-white p-8 rounded-2xl shadow-md w-full max-w-lg space-y-6 border border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Primeiro Setup</h2>
            <p className="text-sm text-gray-500 mt-1">Crie uma empresa/cliente para começar a ver dados reais.</p>
          </div>
          <Building2 className="w-10 h-10 text-indigo-600" />
        </div>

        {errorMsg && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">{errorMsg}</div>}

        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Nome da empresa/cliente</label>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Ex: Cliente X"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Meta Ad Account ID (opcional)</label>
            <div className="mt-1 flex items-center border border-gray-300 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500">
              <KeyRound className="w-4 h-4 text-gray-400 mr-2" />
              <input
                value={metaAdAccountId}
                onChange={(e) => setMetaAdAccountId(e.target.value)}
                className="w-full outline-none"
                placeholder="act_1234567890"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Isso é usado no módulo de Tráfego (Meta Insights). Você também pode definir depois em `companies.meta_ad_account_id`.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">WhatsApp Phone Number ID (opcional)</label>
            <input
              value={whatsAppPhoneNumberId}
              onChange={(e) => setWhatsAppPhoneNumberId(e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Ex: 123456789012345"
            />
            <p className="text-xs text-gray-400 mt-1">
              Use para vincular webhooks do WhatsApp a esta empresa. Você encontra em WhatsApp Manager (Phone Numbers) ou no payload do webhook (`metadata.phone_number_id`).
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full px-4 py-2 rounded-lg text-white font-medium ${
              loading ? 'bg-gray-400' : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {loading ? 'Criando...' : 'Criar empresa'}
          </button>
        </form>
      </div>
    </div>
  );
};
