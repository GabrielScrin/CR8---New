import React, { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Lead } from '../types';

interface NewLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (newLead: Lead) => void;
  companyId?: string;
}

type DddInfo = { state: string; cities: string[] };

const onlyDigits = (value: string) => value.replace(/\D/g, '');

const toE164BR = (digits: string): string | null => {
  const d = onlyDigits(digits);
  if (!d) return null;
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return `+${d}`;
  if (d.length === 10 || d.length === 11) return `+55${d}`;
  return null;
};

const dddFromDigits = (digits: string): string | null => {
  const d = onlyDigits(digits);
  if (d.startsWith('55') && d.length >= 4) return d.slice(2, 4);
  if (d.length >= 2) return d.slice(0, 2);
  return null;
};

async function fetchDddInfo(ddd: string): Promise<DddInfo | null> {
  try {
    const res = await fetch(`https://brasilapi.com.br/api/ddd/v1/${ddd}`);
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    return {
      state: data?.state ?? '',
      cities: Array.isArray(data?.cities) ? data.cities.slice(0, 10) : [],
    };
  } catch {
    return null;
  }
}

export const NewLeadModal: React.FC<NewLeadModalProps> = ({ isOpen, onClose, onSave, companyId }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [value, setValue] = useState('');
  const [source, setSource] = useState('Manual');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const phoneDigits = useMemo(() => onlyDigits(phone), [phone]);
  const phoneE164 = useMemo(() => toE164BR(phone), [phone]);
  const phoneValid = useMemo(() => phoneDigits.length === 0 || phoneE164 != null, [phoneDigits.length, phoneE164]);

  const handleClose = () => {
    setName('');
    setEmail('');
    setPhone('');
    setValue('');
    setSource('Manual');
    setError(null);
    setLoading(false);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) {
      setError('Empresa não definida.');
      return;
    }
    if (!name.trim()) {
      setError('O nome do lead é obrigatório.');
      return;
    }
    if (!phoneValid) {
      setError('Telefone inválido. Use DDD + número (ex: 11999999999).');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const ddd = phoneDigits ? dddFromDigits(phoneDigits) : null;
      const dddInfo = ddd ? await fetchDddInfo(ddd) : null;

      const raw = {
        phone_meta: {
          digits: phoneDigits || null,
          e164: phoneE164,
          valid: phoneDigits ? phoneE164 != null : null,
          whatsapp_possible: phoneDigits ? phoneE164 != null : null,
        },
        ddd_info: dddInfo,
      };

      const argsWithRaw: Record<string, unknown> = {
        p_company_id: companyId,
        p_name: name.trim(),
        p_email: email.trim() || null,
        p_phone: phoneE164 ?? (phoneDigits || null),
        p_value: value ? parseFloat(value) : null,
        p_source: source,
        p_raw: raw,
      };

      let { data, error: rpcError } = await supabase.rpc('create_lead_manual', argsWithRaw);

      if (rpcError) {
        // Back-compat: DB ainda pode estar com a assinatura antiga (sem p_raw)
        const msg = String(rpcError.message ?? '');
        if (msg.includes('create_lead_manual') && msg.toLowerCase().includes('p_raw')) {
          const { p_raw: _ignored, ...argsWithoutRaw } = argsWithRaw;
          ({ data, error: rpcError } = await supabase.rpc('create_lead_manual', argsWithoutRaw));
        }
      }

      if (rpcError) throw rpcError;

      const newLead = Array.isArray(data) ? data[0] : null;
      if (!newLead?.id) throw new Error('Falha ao criar lead.');

      onSave({
        id: newLead.id,
        name: newLead.name ?? name.trim(),
        phone: newLead.phone ?? (phoneE164 ?? phoneDigits),
        email: newLead.email ?? email.trim(),
        status: newLead.status ?? 'new',
        source: newLead.source ?? source,
        lastInteraction: 'Agora',
        value: newLead.value ?? (value ? parseFloat(value) : undefined),
        assigned_to: newLead.assigned_to ?? undefined,
        raw: newLead.raw ?? undefined,
      });

      handleClose();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Ocorreu um erro ao criar o lead.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="cr8-card w-full max-w-md p-6">
        <h2 className="text-xl font-bold text-[hsl(var(--foreground))]">Adicionar novo lead</h2>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">O lead será distribuído automaticamente (roleta).</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Nome *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              placeholder="Ex: Maria Souza"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">E-mail</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              className="mt-1 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              placeholder="email@dominio.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Telefone / WhatsApp</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              type="tel"
              className="mt-1 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              placeholder="(11) 99999-9999"
            />
            {phoneDigits.length > 0 && (
              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                Normalizado: {phoneE164 ?? 'inválido'} {phoneE164 ? '(E.164)' : ''}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Valor (R$)</label>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                type="number"
                step="0.01"
                className="mt-1 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                placeholder="1500.00"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Fonte</label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="mt-1 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              >
                <option>Manual</option>
                <option>Instagram</option>
                <option>WhatsApp</option>
                <option>Facebook</option>
                <option>Site</option>
              </select>
            </div>
          </div>

          {error && <p className="text-sm text-[hsl(var(--destructive))]">{error}</p>}

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="px-4 py-2 rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Salvando...' : 'Salvar lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
