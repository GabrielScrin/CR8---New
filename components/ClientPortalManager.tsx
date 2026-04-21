import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Link2, Loader2, Save, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { normalizeRole } from '../types';

type ClientPortalManagerProps = {
  companyId?: string;
};

type CompanyOption = {
  id: string;
  name: string;
  brand_name?: string | null;
  brand_logo_url?: string | null;
  brand_primary_color?: string | null;
};

type ClientPortalRow = {
  id: string;
  public_token: string;
  name: string;
  status: 'active' | 'inactive';
  default_company_id: string;
  theme_payload: Record<string, unknown> | null;
};

const safeThemeColor = (value: string | null | undefined) => {
  const color = String(value ?? '').trim();
  if (!/^#?[0-9a-fA-F]{3,8}$/.test(color)) return null;
  return color.startsWith('#') ? color : `#${color}`;
};

export const ClientPortalManager: React.FC<ClientPortalManagerProps> = ({ companyId }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [portal, setPortal] = useState<ClientPortalRow | null>(null);
  const [portalName, setPortalName] = useState('');
  const [portalStatus, setPortalStatus] = useState<'active' | 'inactive'>('active');
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);

  const selectedCompanies = useMemo(
    () => selectedCompanyIds.map((id) => companies.find((company) => company.id === id)).filter(Boolean) as CompanyOption[],
    [companies, selectedCompanyIds],
  );

  const portalUrl = portal?.public_token ? `${window.location.origin}/portal/${portal.public_token}` : null;

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      setCanManage(false);
      return;
    }

    let alive = true;
    setLoading(true);
    setError(null);
    setMessage(null);

    const load = async () => {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const userId = authData.user?.id;
      if (!userId) throw new Error('Sessão inválida.');

      const [{ data: membership, error: membershipError }, { data: companyRows, error: companiesError }] = await Promise.all([
        supabase.from('company_members').select('member_role').eq('company_id', companyId).eq('user_id', userId).maybeSingle(),
        supabase.from('companies').select('id,name,brand_name,brand_logo_url,brand_primary_color').order('created_at', { ascending: true }),
      ]);

      if (membershipError) throw membershipError;
      if (companiesError) throw companiesError;

      const role = normalizeRole((membership as any)?.member_role);
      const allow = role === 'admin' || role === 'gestor';
      if (!alive) return;
      setCanManage(allow);
      setCompanies((companyRows ?? []) as CompanyOption[]);

      if (!allow) return;

      const { data: portalRow, error: portalError } = await supabase
        .from('client_portals')
        .select('id,public_token,name,status,default_company_id,theme_payload')
        .eq('default_company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (portalError) throw portalError;

      if (!alive) return;

      if (portalRow) {
        setPortal(portalRow as ClientPortalRow);
        setPortalName(String((portalRow as any).name ?? 'Portal do Cliente'));
        setPortalStatus(((portalRow as any).status ?? 'active') as 'active' | 'inactive');

        const { data: links, error: linksError } = await supabase
          .from('client_portal_companies')
          .select('company_id,display_order')
          .eq('portal_id', (portalRow as any).id)
          .order('display_order', { ascending: true });
        if (linksError) throw linksError;

        const ordered = ((links ?? []) as any[]).map((row) => String(row.company_id)).filter(Boolean);
        setSelectedCompanyIds(ordered.length > 0 ? ordered : [companyId]);
      } else {
        setPortal(null);
        setPortalName('Portal do Cliente');
        setPortalStatus('active');
        setSelectedCompanyIds([companyId]);
      }
    };

    load()
      .catch((loadError: any) => {
        if (!alive) return;
        setError(loadError?.message ?? 'Falha ao carregar as configurações do portal.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [companyId]);

  const toggleCompany = (id: string) => {
    setSelectedCompanyIds((current) => {
      if (id === companyId && current.includes(id)) return current;
      return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    });
  };

  const moveCompany = (id: string, direction: -1 | 1) => {
    setSelectedCompanyIds((current) => {
      const index = current.indexOf(id);
      if (index < 0) return current;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const copy = [...current];
      const [item] = copy.splice(index, 1);
      copy.splice(nextIndex, 0, item);
      return copy;
    });
  };

  const copyPortalLink = async () => {
    if (!portalUrl) return;
    await navigator.clipboard.writeText(portalUrl).catch(() => {});
    setMessage('Link permanente copiado.');
  };

  const savePortal = async () => {
    if (!companyId) return;
    const normalizedName = portalName.trim() || 'Portal do Cliente';
    const nextCompanyIds = Array.from(new Set([companyId, ...selectedCompanyIds])).filter(Boolean);
    const defaultCompany = companies.find((row) => row.id === companyId);
    const themePayload = {
      brand_primary_color: safeThemeColor(defaultCompany?.brand_primary_color),
      brand_logo_url: defaultCompany?.brand_logo_url ?? null,
      brand_name: defaultCompany?.brand_name ?? defaultCompany?.name ?? null,
    };

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      let portalId = portal?.id ?? null;
      let publicToken = portal?.public_token ?? null;

      if (portalId) {
        const { data, error: updateError } = await supabase
          .from('client_portals')
          .update({
            name: normalizedName,
            status: portalStatus,
            theme_payload: themePayload,
          })
          .eq('id', portalId)
          .select('id,public_token,name,status,default_company_id,theme_payload')
          .single();
        if (updateError) throw updateError;
        portalId = String((data as any).id);
        publicToken = String((data as any).public_token);
        setPortal(data as ClientPortalRow);
      } else {
        const { data, error: insertError } = await supabase
          .from('client_portals')
          .insert({
            name: normalizedName,
            default_company_id: companyId,
            status: portalStatus,
            theme_payload: themePayload,
          })
          .select('id,public_token,name,status,default_company_id,theme_payload')
          .single();
        if (insertError) throw insertError;
        portalId = String((data as any).id);
        publicToken = String((data as any).public_token);
        setPortal(data as ClientPortalRow);
      }

      if (!portalId) throw new Error('Falha ao persistir o portal.');

      const { error: deleteError } = await supabase.from('client_portal_companies').delete().eq('portal_id', portalId);
      if (deleteError) throw deleteError;

      const rows = nextCompanyIds.map((id, index) => ({
        portal_id: portalId,
        company_id: id,
        display_order: index,
      }));
      const { error: linksError } = await supabase.from('client_portal_companies').insert(rows);
      if (linksError) throw linksError;

      setSelectedCompanyIds(nextCompanyIds);
      setMessage(publicToken ? 'Portal salvo com sucesso.' : 'Portal atualizado.');
    } catch (saveError: any) {
      setError(saveError?.message ?? 'Falha ao salvar o portal.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
        <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando portal do cliente...
        </div>
      </div>
    );
  }

  if (!canManage) return null;

  return (
    <div className="rounded-[28px] border border-[hsl(var(--border))] p-5" style={{ background: 'linear-gradient(180deg, hsl(220 18% 9%), hsl(220 20% 7%))' }}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
            <ShieldCheck className="h-3.5 w-3.5" />
            Portal do Cliente
          </div>
          <h3 className="mt-2 text-xl font-bold text-[hsl(var(--foreground))]">Link permanente com acesso controlado</h3>
          <p className="mt-2 max-w-2xl text-sm text-[hsl(var(--muted-foreground))]">
            Defina quais contas o cliente pode ver no portal unificado, mantenha um link fixo e controle se o acesso está ativo ou inativo.
          </p>
        </div>

        {portalUrl && (
          <div className="min-w-[300px] rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background))]/70 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Link público</div>
            <div className="mt-2 break-all text-sm text-[hsl(var(--foreground))]">{portalUrl}</div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={copyPortalLink}
                className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-2 text-sm text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))]/70"
              >
                <Copy className="h-4 w-4" />
                Copiar
              </button>
              <a
                href={portalUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-indigo-500/25 bg-indigo-500/10 px-3 py-2 text-sm font-semibold text-indigo-300 transition-colors hover:bg-indigo-500/20"
              >
                <Link2 className="h-4 w-4" />
                Abrir portal
              </a>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="space-y-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background))]/70 p-4">
          <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Nome do portal</label>
            <input
              value={portalName}
              onChange={(event) => setPortalName(event.target.value)}
              className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-3 py-2.5 text-sm text-[hsl(var(--foreground))] outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              placeholder="Ex: Portal GIOPPO & Conti"
            />
          </div>

          <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Status</label>
            <select
              value={portalStatus}
              onChange={(event) => setPortalStatus(event.target.value as 'active' | 'inactive')}
              className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-3 py-2.5 text-sm text-[hsl(var(--foreground))] outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
            >
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
          </div>

          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 text-sm text-[hsl(var(--muted-foreground))]">
            <div className="font-semibold text-[hsl(var(--foreground))]">Empresa padrão</div>
            <div className="mt-1">
              {companies.find((row) => row.id === companyId)?.brand_name ?? companies.find((row) => row.id === companyId)?.name ?? 'Empresa atual'}
            </div>
            <div className="mt-2 text-xs">Essa conta sempre entra primeiro no portal e permanece liberada.</div>
          </div>

          {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>}
          {message && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{message}</div>}

          <button
            type="button"
            onClick={() => void savePortal()}
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {portal ? 'Salvar portal' : 'Criar portal'}
          </button>
        </div>

        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background))]/70 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Contas liberadas</div>
              <div className="mt-1 text-sm text-[hsl(var(--foreground))]">Escolha exatamente o que o cliente poderá acessar no link permanente.</div>
            </div>
            <div className="text-xs text-[hsl(var(--muted-foreground))]">{selectedCompanyIds.length} conta(s)</div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {companies.map((company) => {
              const selected = selectedCompanyIds.includes(company.id);
              const locked = company.id === companyId;
              return (
                <div
                  key={company.id}
                  className={`rounded-2xl border p-4 transition-colors ${selected ? 'border-indigo-500/30 bg-indigo-500/8' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))]'}`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={locked}
                      onChange={() => toggleCompany(company.id)}
                      className="mt-1 h-4 w-4 rounded border-[hsl(var(--border))] bg-[hsl(var(--input))]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-[hsl(var(--foreground))]">{company.brand_name ?? company.name}</div>
                      <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{locked ? 'Conta padrão obrigatória' : selected ? 'Liberada no portal' : 'Bloqueada no portal'}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {selectedCompanies.length > 0 && (
            <div className="mt-5 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Ordem do seletor</div>
              <div className="mt-3 space-y-2">
                {selectedCompanies.map((company, index) => (
                  <div key={company.id} className="flex items-center gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2.5">
                    <div className="w-6 text-center text-xs font-bold text-[hsl(var(--muted-foreground))]">{index + 1}</div>
                    <div className="min-w-0 flex-1 truncate text-sm text-[hsl(var(--foreground))]">{company.brand_name ?? company.name}</div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => moveCompany(company.id, -1)}
                        className="rounded-lg border border-[hsl(var(--border))] p-2 text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveCompany(company.id, 1)}
                        className="rounded-lg border border-[hsl(var(--border))] p-2 text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
