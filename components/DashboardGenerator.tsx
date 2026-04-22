import React, { useCallback, useEffect, useState } from 'react';
import {
  Check, ChevronDown, Copy, ExternalLink, Instagram, Loader2,
  MonitorSmartphone, Plus, Search, Trash2, X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { resolveMetaToken } from '../lib/metaToken';

interface DashboardGeneratorProps {
  companyId?: string;
}

type PortalLink = {
  id: string;
  public_token: string;
  name: string;
  client_name: string | null;
  meta_ad_account_id: string;
  meta_ad_account_name: string | null;
  instagram_business_account_id: string | null;
  instagram_username: string | null;
  status: string;
  created_at: string;
};

type AdAccount = { id: string; name: string };
type IgAccount = { id: string; username: string; name: string; profile_picture_url?: string; page_id: string; page_name: string };

const GRAPH = 'https://graph.facebook.com/v19.0';

const fetchJson = async (url: string) => {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.error) throw new Error(json?.error?.message || `HTTP ${res.status}`);
  return json;
};

export const DashboardGenerator: React.FC<DashboardGeneratorProps> = ({ companyId }) => {
  const [links, setLinks] = useState<PortalLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalStep, setModalStep] = useState<'form' | 'done'>('form');

  // Form state
  const [formName, setFormName] = useState('');
  const [formClientName, setFormClientName] = useState('');
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
  const [selectedAdAccount, setSelectedAdAccount] = useState<AdAccount | null>(null);
  const [adAccountSearch, setAdAccountSearch] = useState('');
  const [adDropOpen, setAdDropOpen] = useState(false);
  const [igAccounts, setIgAccounts] = useState<IgAccount[]>([]);
  const [selectedIg, setSelectedIg] = useState<IgAccount | null>(null);
  const [igSearch, setIgSearch] = useState('');
  const [igDropOpen, setIgDropOpen] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');
  const [metaToken, setMetaToken] = useState('');

  const loadLinks = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    const { data, error: err } = await supabase
      .from('portal_links')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    if (!err) setLinks((data ?? []) as PortalLink[]);
    else setError(err.message);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { void loadLinks(); }, [loadLinks]);

  const openModal = async () => {
    setShowModal(true);
    setModalStep('form');
    setFormName('');
    setFormClientName('');
    setSelectedAdAccount(null);
    setSelectedIg(null);
    setAdAccounts([]);
    setIgAccounts([]);
    setGeneratedLink('');
    setError(null);
    setLoadingAccounts(true);

    try {
      const token = await resolveMetaToken(companyId);
      if (!token) throw new Error('Faça login com Facebook para conectar suas contas.');
      setMetaToken(token);

      // Fetch ad accounts
      let allAccounts: AdAccount[] = [];
      let nextUrl: string | null = `${GRAPH}/me/adaccounts?fields=id,name&limit=100&access_token=${token}`;
      for (let page = 0; page < 10 && nextUrl; page++) {
        const json = await fetchJson(nextUrl);
        allAccounts = allAccounts.concat(Array.isArray(json?.data) ? json.data : []);
        nextUrl = json?.paging?.next ?? null;
      }
      setAdAccounts(allAccounts);

      // Fetch Instagram accounts via pages
      const pagesJson = await fetchJson(
        `${GRAPH}/me/accounts?fields=id,name,instagram_business_account{id,username,name,profile_picture_url}&limit=50&access_token=${token}`,
      );
      const igList: IgAccount[] = [];
      for (const page of Array.isArray(pagesJson?.data) ? pagesJson.data : []) {
        const ig = page?.instagram_business_account;
        if (ig?.id) {
          igList.push({
            id: ig.id,
            username: ig.username ?? ig.id,
            name: ig.name ?? ig.username ?? ig.id,
            profile_picture_url: ig.profile_picture_url,
            page_id: page.id,
            page_name: page.name,
          });
        }
      }
      setIgAccounts(igList);
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao carregar contas.');
    } finally {
      setLoadingAccounts(false);
    }
  };

  const handleSave = async () => {
    if (!companyId || !selectedAdAccount) return;
    setSaving(true);
    setError(null);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const { data, error: err } = await supabase
        .from('portal_links')
        .insert({
          company_id: companyId,
          created_by: authData?.user?.id ?? null,
          name: formName.trim() || selectedAdAccount.name || 'Dashboard',
          client_name: formClientName.trim() || null,
          meta_ad_account_id: selectedAdAccount.id,
          meta_ad_account_name: selectedAdAccount.name,
          instagram_business_account_id: selectedIg?.id ?? null,
          instagram_username: selectedIg?.username ?? null,
          status: 'active',
        })
        .select('public_token')
        .single();

      if (err) throw err;
      const link = `${window.location.origin}/d/${data.public_token}`;
      setGeneratedLink(link);
      setModalStep('done');
      void loadLinks();
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async (token: string, id: string) => {
    const url = `${window.location.origin}/d/${token}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const deleteLink = async (id: string) => {
    if (!confirm('Remover este link? Clientes com o link perderão acesso.')) return;
    await supabase.from('portal_links').delete().eq('id', id);
    void loadLinks();
  };

  const filteredAdAccounts = adAccounts.filter((a) => {
    const q = adAccountSearch.toLowerCase();
    return !q || (a.name ?? '').toLowerCase().includes(q) || a.id.toLowerCase().includes(q);
  });

  const filteredIg = igAccounts.filter((a) => {
    const q = igSearch.toLowerCase();
    return !q || a.username.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || a.page_name.toLowerCase().includes(q);
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[hsl(var(--foreground))]">
            Portal do Cliente
          </h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Gere links personalizados com dashboard de campanhas para compartilhar com seus clientes.
          </p>
        </div>
        <button
          type="button"
          onClick={openModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600 transition-all shadow-lg shadow-indigo-500/25"
        >
          <Plus className="h-4 w-4" />
          Novo link
        </button>
      </div>

      {/* Links list */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-[hsl(var(--muted-foreground))]">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
        </div>
      ) : links.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-56 rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))]/50">
          <MonitorSmartphone className="h-10 w-10 text-[hsl(var(--muted-foreground))]/40 mb-3" />
          <p className="text-sm font-medium text-[hsl(var(--muted-foreground))]">Nenhum dashboard criado ainda</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]/60 mt-1">Clique em "Novo link" para gerar o primeiro.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {links.map((link) => {
            const url = `${window.location.origin}/d/${link.public_token}`;
            const isCopied = copiedId === link.id;
            return (
              <div
                key={link.id}
                className="flex items-center gap-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-5 py-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[hsl(var(--foreground))] truncate">
                      {link.client_name || link.name}
                    </span>
                    {link.status === 'active' && (
                      <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Ativo
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-[hsl(var(--muted-foreground))]">
                    <span>Conta: {link.meta_ad_account_name || link.meta_ad_account_id}</span>
                    {link.instagram_username && (
                      <span className="flex items-center gap-1">
                        <Instagram className="h-3 w-3" /> @{link.instagram_username}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 text-[11px] text-[hsl(var(--muted-foreground))]/60 truncate font-mono">{url}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void copyLink(link.public_token, link.id)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[hsl(var(--border))] text-xs font-semibold text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] transition-all"
                  >
                    {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    {isCopied ? 'Copiado!' : 'Copiar'}
                  </button>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-xl border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] transition-all"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={() => void deleteLink(link.id)}
                    className="p-2 rounded-xl border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-red-400 hover:bg-red-500/10 transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] shadow-2xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[hsl(var(--border))]">
              <div>
                <h2 className="text-base font-bold text-[hsl(var(--foreground))]">
                  {modalStep === 'done' ? 'Link gerado!' : 'Novo dashboard'}
                </h2>
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                  {modalStep === 'done' ? 'Compartilhe com seu cliente.' : 'Escolha as contas para este dashboard.'}
                </p>
              </div>
              <button type="button" onClick={() => setShowModal(false)} className="p-1.5 rounded-xl hover:bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] transition-all">
                <X className="h-4 w-4" />
              </button>
            </div>

            {modalStep === 'done' ? (
              <div className="p-6 space-y-4">
                <div className="rounded-2xl bg-emerald-500/8 border border-emerald-500/20 p-4">
                  <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">Link do cliente</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs text-[hsl(var(--foreground))] font-mono break-all">{generatedLink}</code>
                    <button
                      type="button"
                      onClick={() => { navigator.clipboard.writeText(generatedLink).catch(() => {}); }}
                      className="shrink-0 p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-all"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  O cliente acessa sem precisar de login. O link é permanente e pode ser revogado a qualquer momento.
                </p>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="w-full py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600 transition-all"
                >
                  Concluir
                </button>
              </div>
            ) : (
              <div className="p-6 space-y-4">
                {error && (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-xs text-red-300">{error}</div>
                )}

                {/* Name fields */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1.5">Nome do link</label>
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="Ex: Dashboard Anúncios"
                      className="w-full px-3 py-2.5 rounded-xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]/60 outline-none focus:border-indigo-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1.5">Nome do cliente</label>
                    <input
                      type="text"
                      value={formClientName}
                      onChange={(e) => setFormClientName(e.target.value)}
                      placeholder="Ex: Clínica XYZ"
                      className="w-full px-3 py-2.5 rounded-xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]/60 outline-none focus:border-indigo-500/50"
                    />
                  </div>
                </div>

                {/* Ad Account selector */}
                <div>
                  <label className="block text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1.5">
                    Conta de anúncio <span className="text-red-400">*</span>
                  </label>
                  {loadingAccounts ? (
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-[hsl(var(--border))] text-sm text-[hsl(var(--muted-foreground))]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando contas...
                    </div>
                  ) : (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => { setAdDropOpen((o) => !o); setAdAccountSearch(''); }}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] text-sm text-left hover:border-indigo-500/50 transition-all"
                      >
                        <span className={selectedAdAccount ? 'text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]/60'}>
                          {selectedAdAccount ? `${selectedAdAccount.name} (${selectedAdAccount.id})` : 'Selecione a conta de anúncio'}
                        </span>
                        <ChevronDown className={`h-4 w-4 text-[hsl(var(--muted-foreground))] shrink-0 transition-transform ${adDropOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {adDropOpen && (
                        <div className="absolute top-[calc(100%+4px)] left-0 right-0 z-20 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-2xl py-2">
                          <div className="px-3 pb-2">
                            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[hsl(var(--background))] border border-[hsl(var(--border))]">
                              <Search className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
                              <input
                                autoFocus
                                value={adAccountSearch}
                                onChange={(e) => setAdAccountSearch(e.target.value)}
                                placeholder="Buscar conta..."
                                className="flex-1 bg-transparent text-sm outline-none text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]/60"
                              />
                            </div>
                          </div>
                          <div className="max-h-52 overflow-y-auto">
                            {filteredAdAccounts.length === 0 ? (
                              <div className="px-4 py-3 text-sm text-[hsl(var(--muted-foreground))]">Nenhuma conta encontrada.</div>
                            ) : filteredAdAccounts.map((a) => (
                              <button
                                key={a.id}
                                type="button"
                                onClick={() => { setSelectedAdAccount(a); setAdDropOpen(false); }}
                                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-[hsl(var(--secondary))] transition-colors ${selectedAdAccount?.id === a.id ? 'text-indigo-400 font-semibold' : 'text-[hsl(var(--foreground))]'}`}
                              >
                                <div>{a.name}</div>
                                <div className="text-xs text-[hsl(var(--muted-foreground))]">{a.id}</div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Instagram selector */}
                <div>
                  <label className="block text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1.5">
                    Instagram <span className="text-[hsl(var(--muted-foreground))]/60 font-normal normal-case">(opcional)</span>
                  </label>
                  {loadingAccounts ? (
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-[hsl(var(--border))] text-sm text-[hsl(var(--muted-foreground))]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando...
                    </div>
                  ) : (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => { setIgDropOpen((o) => !o); setIgSearch(''); }}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] text-sm text-left hover:border-indigo-500/50 transition-all"
                      >
                        <span className={selectedIg ? 'text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]/60'}>
                          {selectedIg ? `@${selectedIg.username} (${selectedIg.page_name})` : 'Selecione o Instagram (opcional)'}
                        </span>
                        <ChevronDown className={`h-4 w-4 text-[hsl(var(--muted-foreground))] shrink-0 transition-transform ${igDropOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {igDropOpen && (
                        <div className="absolute top-[calc(100%+4px)] left-0 right-0 z-20 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-2xl py-2">
                          <div className="px-3 pb-2">
                            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[hsl(var(--background))] border border-[hsl(var(--border))]">
                              <Search className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
                              <input
                                autoFocus
                                value={igSearch}
                                onChange={(e) => setIgSearch(e.target.value)}
                                placeholder="Buscar Instagram..."
                                className="flex-1 bg-transparent text-sm outline-none text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]/60"
                              />
                            </div>
                          </div>
                          <div className="max-h-52 overflow-y-auto">
                            <button
                              type="button"
                              onClick={() => { setSelectedIg(null); setIgDropOpen(false); }}
                              className="w-full text-left px-4 py-2.5 text-sm text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] transition-colors"
                            >
                              Sem Instagram
                            </button>
                            {filteredIg.length === 0 ? (
                              <div className="px-4 py-3 text-sm text-[hsl(var(--muted-foreground))]">
                                {igAccounts.length === 0 ? 'Nenhuma conta Instagram encontrada via Pages.' : 'Nenhum resultado.'}
                              </div>
                            ) : filteredIg.map((a) => (
                              <button
                                key={a.id}
                                type="button"
                                onClick={() => { setSelectedIg(a); setIgDropOpen(false); }}
                                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-[hsl(var(--secondary))] transition-colors flex items-center gap-3 ${selectedIg?.id === a.id ? 'text-indigo-400 font-semibold' : 'text-[hsl(var(--foreground))]'}`}
                              >
                                {a.profile_picture_url ? (
                                  <img src={a.profile_picture_url} alt="" className="h-8 w-8 rounded-full object-cover shrink-0" />
                                ) : (
                                  <div className="h-8 w-8 rounded-full shrink-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#f09433,#dc2743,#bc1888)' }}>
                                    <Instagram className="h-4 w-4 text-white" />
                                  </div>
                                )}
                                <div>
                                  <div>@{a.username}</div>
                                  <div className="text-xs text-[hsl(var(--muted-foreground))]">{a.page_name}</div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 py-2.5 rounded-xl border border-[hsl(var(--border))] text-sm font-semibold text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !selectedAdAccount}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {saving ? 'Gerando...' : 'Gerar link'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
