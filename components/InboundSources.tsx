import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export const InboundSources: React.FC<{ companyId?: string; refreshTrigger?: any }> = ({ companyId, refreshTrigger }) => {
  const [loading, setLoading] = useState(false);
  const [sources, setSources] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [entryBoardId, setEntryBoardId] = useState<string | null>(null);
  const [entryStageId, setEntryStageId] = useState<string | null>(null);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from('integration_inbound_sources').select('id,name,entry_board_id,entry_stage_id,secret_prefix,active,created_at').eq('company_id', companyId).order('created_at', { ascending: false });
      if (error) throw error;
      setSources((data ?? []) as any[]);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [companyId, refreshTrigger]);

  const createSource = async () => {
    if (!companyId) return setError('companyId necessário');
    if (!name.trim()) return setError('Nome necessário');
    setError(null);
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('create_inbound_source', { p_company_id: companyId, p_name: name.trim(), p_entry_board_id: entryBoardId, p_entry_stage_id: entryStageId });
      if (error) throw error;
      const token = String(data ?? '');
      setCreatedSecret(token);
      setName('');
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const revokeSource = async (id: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.from('integration_inbound_sources').update({ active: false }).eq('id', id);
      if (error) throw error;
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const testSource = async (id: string, secret: string | null) => {
    setError(null);
    try {
      const url = `${(window as any).__env?.SUPABASE_URL ?? ''}/functions/v1/webhook-in/${id}`;
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-webhook-secret': secret ?? '' }, body: JSON.stringify({ text: 'test', external_event_id: `test-${Date.now()}` }) });
      const json = await res.json();
      alert('Resposta: ' + JSON.stringify({ status: res.status, body: json }));
    } catch (e: any) {
      alert('Erro: ' + (e?.message ?? String(e)));
    }
  };

  return (
    <div>
      <div className="rounded-md border border-[hsl(var(--border))] p-4 bg-[hsl(var(--secondary))] space-y-3">
        <div className="text-sm font-semibold">Criar fonte inbound</div>
        {error ? <div className="text-xs text-rose-400">{error}</div> : null}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} className="px-3 py-2 rounded-md" />
          <input placeholder="board id (opcional)" value={entryBoardId ?? ''} onChange={(e) => setEntryBoardId(e.target.value || null)} className="px-3 py-2 rounded-md" />
          <input placeholder="stage id (opcional)" value={entryStageId ?? ''} onChange={(e) => setEntryStageId(e.target.value || null)} className="px-3 py-2 rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void createSource()} className="px-3 py-2 rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">Criar</button>
          <div className="text-xs text-[hsl(var(--muted-foreground))]">Ao criar, o secret é mostrado apenas uma vez.</div>
        </div>

        {createdSecret ? (
          <div className="rounded-md border p-3 bg-[hsl(var(--background))]">
            <div className="text-xs text-[hsl(var(--muted-foreground))]">Secret (mostrado 1x)</div>
            <div className="font-mono mt-2 break-all">{createdSecret}</div>
            <div className="mt-2">
              <button onClick={() => navigator.clipboard?.writeText(createdSecret ?? '')} className="px-3 py-1 rounded-md border">Copiar</button>
              <button onClick={() => setCreatedSecret(null)} className="px-3 py-1 rounded-md border ml-2">Fechar</button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4">
        <div className="text-sm font-semibold mb-2">Fontes existentes</div>
        <div className="rounded-md border overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]"><tr><th className="px-3 py-2">Nome</th><th className="px-3 py-2">Prefixo</th><th className="px-3 py-2">Ativa</th><th className="px-3 py-2">Criada</th><th className="px-3 py-2 text-right">Ações</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={5} className="px-3 py-3 text-[hsl(var(--muted-foreground))]">Carregando...</td></tr> : sources.length === 0 ? <tr><td colSpan={5} className="px-3 py-3 text-[hsl(var(--muted-foreground))]">Nenhuma fonte.</td></tr> : sources.map((s) => (
                <tr key={s.id} className="border-t border-[hsl(var(--border))]"><td className="px-3 py-2">{s.name}</td><td className="px-3 py-2 font-mono">{s.secret_prefix}</td><td className="px-3 py-2">{s.active ? 'Sim' : 'Não'}</td><td className="px-3 py-2">{new Date(s.created_at).toLocaleString('pt-BR')}</td><td className="px-3 py-2 text-right"><button onClick={() => void revokeSource(s.id)} className="px-2 py-1 rounded-md border">Revogar</button><button onClick={() => void testSource(s.id, prompt('Cole o secret (ou deixe em branco para testar somente se você tiver o secret)'))} className="px-2 py-1 rounded-md border ml-2">Testar</button></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
