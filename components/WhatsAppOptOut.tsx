import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Role } from '../types';

type SuppressionRow = {
  id: string;
  company_id: string;
  phone: string;
  reason: string | null;
  created_at: string;
};

const normalizePhone = (v: string) => String(v || '').replace(/\D/g, '');

const formatDateTimePt = (iso: string | null | undefined) => {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
};

export function WhatsAppOptOut({ companyId, role }: { companyId: string; role: Role }) {
  const canManage = useMemo(() => role === 'admin' || role === 'gestor', [role]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [rows, setRows] = useState<SuppressionRow[]>([]);

  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('');

  const fetchRows = async () => {
    setLoading(true);
    setError(null);
    setOk(null);
    try {
      const { data, error: dbError } = await supabase
        .from('whatsapp_phone_suppressions')
        .select('id,company_id,phone,reason,created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(2000);
      if (dbError) throw dbError;
      setRows((data ?? []) as any as SuppressionRow[]);
    } catch (e: any) {
      setRows([]);
      setError(e?.message ?? 'Erro ao carregar opt-out.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const add = async () => {
    if (!canManage) {
      setError('Sem permissão para gerenciar opt-out.');
      return;
    }
    const p = normalizePhone(phone);
    if (!p) {
      setError('Informe um telefone válido.');
      return;
    }
    setLoading(true);
    setError(null);
    setOk(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user?.id ?? null;
      const { error: dbError } = await supabase.from('whatsapp_phone_suppressions').upsert([
        { company_id: companyId, phone: p, reason: reason.trim() || null, created_by: userId },
      ] as any);
      if (dbError) throw dbError;
      setPhone('');
      setReason('');
      setOk('Telefone bloqueado.');
      await fetchRows();
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao adicionar bloqueio.');
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id: string) => {
    if (!canManage) return;
    setLoading(true);
    setError(null);
    setOk(null);
    try {
      const { error: dbError } = await supabase.from('whatsapp_phone_suppressions').delete().eq('id', id);
      if (dbError) throw dbError;
      setOk('Bloqueio removido.');
      await fetchRows();
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao remover bloqueio.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="cr8-card p-4 lg:col-span-1">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Opt-out</div>
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Telefones aqui não recebem disparos.</p>
          </div>
          <button
            onClick={() => void fetchRows()}
            disabled={loading}
            className="px-3 py-2 rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] disabled:opacity-50 inline-flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>

        {(error || ok) && (
          <div className="mt-3">
            {error && <div className="text-sm text-[hsl(var(--destructive))]">{error}</div>}
            {ok && <div className="text-sm text-emerald-300">{ok}</div>}
          </div>
        )}

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-xs text-[hsl(var(--muted-foreground))]">Telefone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="5511999999999"
              className="mt-1 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
            />
          </div>
          <div>
            <label className="block text-xs text-[hsl(var(--muted-foreground))]">Motivo (opcional)</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="ex: pediu para parar"
              className="mt-1 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
            />
          </div>
          <button
            disabled={!canManage || loading}
            onClick={() => void add()}
            className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50"
          >
            Salvar
          </button>
        </div>
      </div>

      <div className="cr8-card p-4 lg:col-span-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Lista</div>
          <div className="text-xs text-[hsl(var(--muted-foreground))]">{loading ? 'Carregando...' : rows.length}</div>
        </div>

        <div className="mt-3 overflow-auto max-h-[62vh] border border-[hsl(var(--border))] rounded-xl">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[hsl(var(--card))]">
              <tr className="text-left text-xs text-[hsl(var(--muted-foreground))] border-b border-[hsl(var(--border))]">
                <th className="p-3">Telefone</th>
                <th className="p-3">Motivo</th>
                <th className="p-3">Criado</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[hsl(var(--border))]">
                  <td className="p-3 font-mono text-[hsl(var(--foreground))]">{r.phone}</td>
                  <td className="p-3 text-[hsl(var(--muted-foreground))]">{r.reason || '-'}</td>
                  <td className="p-3 text-[hsl(var(--muted-foreground))]">{formatDateTimePt(r.created_at)}</td>
                  <td className="p-3 text-right">
                    <button
                      disabled={!canManage || loading}
                      onClick={() => void remove(r.id)}
                      className="px-2 py-2 rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] disabled:opacity-50 inline-flex items-center gap-2"
                      title="Remover"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-[hsl(var(--muted-foreground))]">
                    Nenhum telefone bloqueado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

