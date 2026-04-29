import React, { useCallback, useEffect, useState } from 'react';
import {
  Check, ChevronDown, Copy, ExternalLink, FileText, Instagram, Loader2,
  MonitorSmartphone, Pencil, Plus, Search, Trash2, X,
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
  company?: {
    name?: string | null;
    brand_name?: string | null;
  } | null;
  project_context_text?: string | null;
  meta_ad_account_id: string;
  meta_ad_account_name: string | null;
  instagram_business_account_id: string | null;
  instagram_username: string | null;
  status: string;
  created_at: string;
};

type PortalContextFileRow = {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  indexing_status: string;
  created_at: string;
};

type AdAccount = { id: string; name: string };
type IgAccount = { id: string; username: string; name: string; profile_picture_url?: string; page_id: string; page_name: string };

const GRAPH = 'https://graph.facebook.com/v19.0';
const CONTEXT_BUCKET = 'portal-link-context';
const CONTEXT_GUIDANCE =
  'Descreva o projeto para a IA analisar melhor os dados: objetivo principal, publico-alvo, oferta/produto, ticket, diferenciais, regiao de atuacao, restricoes, metas, principais objecoes e historico do que ja funcionou ou nao funcionou.';

const sanitizeFileName = (value: string) => value.replace(/[^\w.\-]+/g, '_');

const inferContextMimeType = (file: File) => {
  if (file.type) return file.type;
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return 'text/plain';
};

const isSupportedContextFile = (file: File) => {
  const lower = file.name.toLowerCase();
  return lower.endsWith('.pdf') || lower.endsWith('.docx') || lower.endsWith('.txt');
};

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
  const [showContextModal, setShowContextModal] = useState(false);
  const [editingContextLink, setEditingContextLink] = useState<PortalLink | null>(null);
  const [contextModalLoading, setContextModalLoading] = useState(false);
  const [contextModalSaving, setContextModalSaving] = useState(false);
  const [contextModalText, setContextModalText] = useState('');
  const [existingContextFiles, setExistingContextFiles] = useState<PortalContextFileRow[]>([]);
  const [newContextFiles, setNewContextFiles] = useState<File[]>([]);

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
  const [projectContextText, setProjectContextText] = useState('');
  const [contextFiles, setContextFiles] = useState<File[]>([]);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState('');
  const [savingNameId, setSavingNameId] = useState<string | null>(null);

  const getLinkDisplayName = (link: PortalLink) =>
    link.client_name?.trim() ||
    link.company?.brand_name?.trim() ||
    link.company?.name?.trim() ||
    link.name;

  const startEditingName = (link: PortalLink) => {
    setEditingNameId(link.id);
    setEditingNameValue(getLinkDisplayName(link));
    setError(null);
  };

  const cancelEditingName = () => {
    setEditingNameId(null);
    setEditingNameValue('');
    setSavingNameId(null);
  };

  const saveLinkName = async (link: PortalLink) => {
    const nextName = editingNameValue.trim();
    setSavingNameId(link.id);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from('portal_links')
        .update({ client_name: nextName || null })
        .eq('id', link.id);
      if (updateError) throw updateError;

      setLinks((current) => current.map((item) => (
        item.id === link.id ? { ...item, client_name: nextName || null } : item
      )));
      cancelEditingName();
    } catch (err: any) {
      setSavingNameId(null);
      setError(err?.message ?? 'Erro ao atualizar nome do cliente.');
    }
  };

  const loadLinks = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    const { data, error: err } = await supabase
      .from('portal_links')
      .select('*, company:companies(name,brand_name)')
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
    setProjectContextText('');
    setContextFiles([]);
    setAdAccounts([]);
    setIgAccounts([]);
    setGeneratedLink('');
    setError(null);
    setLoadingAccounts(true);

    try {
      const token = await resolveMetaToken(companyId ?? null);
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

  const closeContextModal = () => {
    setShowContextModal(false);
    setEditingContextLink(null);
    setContextModalText('');
    setExistingContextFiles([]);
    setNewContextFiles([]);
    setError(null);
    setContextModalLoading(false);
    setContextModalSaving(false);
  };

  const openContextModal = async (link: PortalLink) => {
    setShowContextModal(true);
    setEditingContextLink(link);
    setContextModalText(String(link.project_context_text ?? ''));
    setExistingContextFiles([]);
    setNewContextFiles([]);
    setContextModalLoading(true);
    setError(null);

    try {
      const { data, error: filesError } = await supabase
        .from('portal_link_context_files')
        .select('id,name,mime_type,size_bytes,storage_path,indexing_status,created_at')
        .eq('portal_link_id', link.id)
        .order('created_at', { ascending: false });
      if (filesError) throw filesError;
      setExistingContextFiles((data ?? []) as PortalContextFileRow[]);
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao carregar contexto do projeto.');
    } finally {
      setContextModalLoading(false);
    }
  };

  const handleSave = async () => {
    if (!companyId || !selectedAdAccount) return;
    setSaving(true);
    setError(null);
    try {
      const { data: authData } = await supabase.auth.getUser();

      // Ensure the Meta token is persisted so the portal edge function can fetch data.
      // resolveMetaToken fires exchangeMetaToken in background, but it may not have
      // completed yet. Saving here guarantees the token is available immediately.
      if (metaToken) {
        const { data: tokenRow } = await supabase
          .from('companies')
          .select('meta_access_token, meta_token_expires_at')
          .eq('id', companyId)
          .maybeSingle();
        const storedExpiry = tokenRow?.meta_token_expires_at
          ? new Date(tokenRow.meta_token_expires_at).getTime()
          : 0;
        const hasValidToken =
          tokenRow?.meta_access_token && storedExpiry > Date.now() + 60_000;
        if (!hasValidToken) {
          // Fallback: save current token (session token valid ~1 h).
          // meta-token-exchange will upgrade to long-lived on next resolveMetaToken call.
          await supabase
            .from('companies')
            .update({
              meta_access_token: metaToken,
              meta_token_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
            })
            .eq('id', companyId);
        }
      }

      const { data, error: err } = await supabase
        .from('portal_links')
        .insert({
          company_id: companyId,
          created_by: authData?.user?.id ?? null,
          name: formName.trim() || selectedAdAccount.name || 'Dashboard',
          client_name: formClientName.trim() || null,
          project_context_text: projectContextText.trim() || null,
          meta_ad_account_id: selectedAdAccount.id,
          meta_ad_account_name: selectedAdAccount.name,
          instagram_business_account_id: selectedIg?.id ?? null,
          instagram_username: selectedIg?.username ?? null,
          status: 'active',
        })
        .select('id,public_token')
        .single();

      if (err) throw err;
      const portalLinkId = String((data as any).id);

      if (projectContextText.trim()) {
        await supabase.functions.invoke('portal-link-context-processor', {
          body: {
            mode: 'reindex_manual_context',
            portal_link_id: portalLinkId,
          },
        }).catch(() => {});
      }

      for (const file of contextFiles) {
        const mimeType = inferContextMimeType(file);
        const path = `${companyId}/${portalLinkId}/${Date.now()}_${sanitizeFileName(file.name)}`;
        const { error: uploadError } = await supabase.storage.from(CONTEXT_BUCKET).upload(path, file, {
          upsert: false,
          contentType: mimeType,
        });
        if (uploadError) throw uploadError;

        const { data: fileRow, error: fileInsertError } = await supabase
          .from('portal_link_context_files')
          .insert({
            portal_link_id: portalLinkId,
            uploaded_by: authData?.user?.id ?? null,
            name: file.name,
            mime_type: mimeType,
            size_bytes: file.size,
            storage_path: path,
            indexing_status: 'pending',
          })
          .select('id')
          .single();
        if (fileInsertError) throw fileInsertError;

        await supabase.functions.invoke('portal-link-context-processor', {
          body: {
            mode: 'index_file',
            context_file_id: (fileRow as any).id,
          },
        }).catch(() => {});
      }

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
    const { data: files } = await supabase
      .from('portal_link_context_files')
      .select('storage_path')
      .eq('portal_link_id', id);
    const paths = ((files ?? []) as Array<{ storage_path?: string | null }>).map((row) => String(row.storage_path ?? '')).filter(Boolean);
    if (paths.length > 0) {
      await supabase.storage.from(CONTEXT_BUCKET).remove(paths).catch(() => {});
    }
    await supabase.from('portal_links').delete().eq('id', id);
    void loadLinks();
  };

  const addFilesToQueue = (
    incoming: FileList | File[] | null,
    setter: React.Dispatch<React.SetStateAction<File[]>>,
    setErrorMessage?: (value: string | null) => void,
  ) => {
    if (!incoming) return;
    const files = Array.from(incoming);
    const validFiles = files.filter(isSupportedContextFile);
    if (validFiles.length !== files.length) {
      setErrorMessage?.('Use apenas arquivos PDF, DOCX ou TXT.');
    }
    setter((current) => {
      const map = new Map(current.map((file) => [`${file.name}:${file.size}`, file]));
      for (const file of validFiles) map.set(`${file.name}:${file.size}`, file);
      return Array.from(map.values());
    });
  };

  const filteredAdAccounts = adAccounts.filter((a) => {
    const q = adAccountSearch.toLowerCase();
    return !q || (a.name ?? '').toLowerCase().includes(q) || a.id.toLowerCase().includes(q);
  });

  const filteredIg = igAccounts.filter((a) => {
    const q = igSearch.toLowerCase();
    return !q || a.username.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || a.page_name.toLowerCase().includes(q);
  });

  const addContextFiles = (incoming: FileList | File[] | null) => {
    addFilesToQueue(incoming, setContextFiles, setError);
  };

  const removeContextFile = (targetName: string, targetSize: number) => {
    setContextFiles((current) => current.filter((file) => !(file.name === targetName && file.size === targetSize)));
  };

  const addNewContextFiles = (incoming: FileList | File[] | null) => {
    addFilesToQueue(incoming, setNewContextFiles, setError);
  };

  const removeNewContextFile = (targetName: string, targetSize: number) => {
    setNewContextFiles((current) => current.filter((file) => !(file.name === targetName && file.size === targetSize)));
  };

  const removeExistingContextFile = (fileId: string) => {
    setExistingContextFiles((current) => current.filter((file) => file.id !== fileId));
  };

  const saveContextModal = async () => {
    if (!companyId || !editingContextLink) return;
    setContextModalSaving(true);
    setError(null);

    try {
      const { data: authData } = await supabase.auth.getUser();

      const { data: latestFiles, error: currentFilesError } = await supabase
        .from('portal_link_context_files')
        .select('id,storage_path')
        .eq('portal_link_id', editingContextLink.id);
      if (currentFilesError) throw currentFilesError;

      const keptFileIds = new Set(existingContextFiles.map((file) => file.id));
      const removedFiles = ((latestFiles ?? []) as Array<{ id: string; storage_path: string }>).filter((file) => !keptFileIds.has(file.id));
      const removedPaths = removedFiles.map((file) => String(file.storage_path ?? '')).filter(Boolean);

      const { error: updateError } = await supabase
        .from('portal_links')
        .update({ project_context_text: contextModalText.trim() || null })
        .eq('id', editingContextLink.id);
      if (updateError) throw updateError;

      await supabase.functions.invoke('portal-link-context-processor', {
        body: {
          mode: 'reindex_manual_context',
          portal_link_id: editingContextLink.id,
        },
      }).catch(() => {});

      if (removedPaths.length > 0) {
        await supabase.storage.from(CONTEXT_BUCKET).remove(removedPaths).catch(() => {});
      }

      if (removedFiles.length > 0) {
        const { error: deleteFilesError } = await supabase
          .from('portal_link_context_files')
          .delete()
          .in('id', removedFiles.map((file) => file.id));
        if (deleteFilesError) throw deleteFilesError;
      }

      for (const file of newContextFiles) {
        const mimeType = inferContextMimeType(file);
        const path = `${companyId}/${editingContextLink.id}/${Date.now()}_${sanitizeFileName(file.name)}`;
        const { error: uploadError } = await supabase.storage.from(CONTEXT_BUCKET).upload(path, file, {
          upsert: false,
          contentType: mimeType,
        });
        if (uploadError) throw uploadError;

        const { data: fileRow, error: fileInsertError } = await supabase
          .from('portal_link_context_files')
          .insert({
            portal_link_id: editingContextLink.id,
            uploaded_by: authData?.user?.id ?? null,
            name: file.name,
            mime_type: mimeType,
            size_bytes: file.size,
            storage_path: path,
            indexing_status: 'pending',
          })
          .select('id')
          .single();
        if (fileInsertError) throw fileInsertError;

        await supabase.functions.invoke('portal-link-context-processor', {
          body: {
            mode: 'index_file',
            context_file_id: (fileRow as any).id,
          },
        }).catch(() => {});
      }

      setLinks((current) => current.map((link) => (link.id === editingContextLink.id
        ? { ...link, project_context_text: contextModalText.trim() || null }
        : link)));
      closeContextModal();
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao salvar contexto do projeto.');
    } finally {
      setContextModalSaving(false);
    }
  };

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
                    {editingNameId === link.id ? (
                      <div className="flex min-w-0 items-center gap-2">
                        <input
                          value={editingNameValue}
                          onChange={(event) => setEditingNameValue(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              void saveLinkName(link);
                            }
                            if (event.key === 'Escape') {
                              event.preventDefault();
                              cancelEditingName();
                            }
                          }}
                          className="h-8 w-64 max-w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm font-semibold text-[hsl(var(--foreground))] outline-none focus:border-indigo-500"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => void saveLinkName(link)}
                          disabled={savingNameId === link.id}
                          className="inline-flex items-center rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-300 transition-all hover:bg-emerald-500/15 disabled:opacity-60"
                        >
                          {savingNameId === link.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Salvar'}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditingName}
                          disabled={savingNameId === link.id}
                          className="inline-flex items-center rounded-lg border border-[hsl(var(--border))] px-2.5 py-1.5 text-xs font-semibold text-[hsl(var(--muted-foreground))] transition-all hover:bg-[hsl(var(--secondary))] disabled:opacity-60"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="text-sm font-semibold text-[hsl(var(--foreground))] truncate">
                          {getLinkDisplayName(link)}
                        </span>
                        <button
                          type="button"
                          onClick={() => startEditingName(link)}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] transition-all hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]"
                          title="Editar nome"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                    {link.status === 'active' && (
                      <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Ativo
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-[hsl(var(--muted-foreground))]">
                    {link.company?.brand_name || link.company?.name ? (
                      <span>Cliente: {link.company?.brand_name || link.company?.name}</span>
                    ) : null}
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
                    onClick={() => void openContextModal(link)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[hsl(var(--border))] text-xs font-semibold text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] transition-all"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Contexto IA
                  </button>
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

      {showContextModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 bg-black/60 backdrop-blur-sm sm:items-center">
          <div className="flex w-full max-w-lg max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] shadow-2xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[hsl(var(--border))]">
              <div>
                <h2 className="text-base font-bold text-[hsl(var(--foreground))]">Contexto do projeto para a IA</h2>
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                  {editingContextLink ? getLinkDisplayName(editingContextLink) : 'Link do cliente'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeContextModal}
                className="p-1.5 rounded-xl hover:bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {error && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-xs text-red-300">{error}</div>
              )}

              {contextModalLoading ? (
                <div className="flex items-center justify-center h-36 text-[hsl(var(--muted-foreground))]">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando contexto...
                </div>
              ) : (
                <div className="space-y-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]/50 p-4">
                  <div>
                    <label className="block text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1.5">
                      Contexto do projeto para a IA
                    </label>
                    <p className="text-[11px] leading-5 text-[hsl(var(--muted-foreground))] mb-2">
                      {CONTEXT_GUIDANCE}
                    </p>
                    <textarea
                      value={contextModalText}
                      onChange={(e) => setContextModalText(e.target.value)}
                      placeholder="Cole aqui o contexto do projeto para personalizar a analise semanal."
                      rows={7}
                      className="w-full resize-y px-3 py-2.5 rounded-xl bg-[hsl(var(--background))] border border-[hsl(var(--border))] text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]/60 outline-none focus:border-indigo-500/50"
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Arquivos de apoio</div>
                        <div className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">Formatos aceitos: PDF, DOCX e TXT.</div>
                      </div>
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[hsl(var(--border))] px-3 py-2 text-xs font-semibold text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] transition-all">
                        <Plus className="h-3.5 w-3.5" />
                        Adicionar arquivos
                        <input
                          type="file"
                          accept=".pdf,.docx,.txt"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            addNewContextFiles(e.target.files);
                            e.currentTarget.value = '';
                          }}
                        />
                      </label>
                    </div>

                    {existingContextFiles.length > 0 ? (
                      <div className="space-y-2">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">Arquivos atuais</div>
                        {existingContextFiles.map((file) => (
                          <div
                            key={file.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))]/70 px-3 py-2"
                          >
                            <div className="min-w-0 flex items-center gap-2">
                              <FileText className="h-4 w-4 shrink-0 text-indigo-300" />
                              <div className="min-w-0">
                                <div className="truncate text-sm text-[hsl(var(--foreground))]">{file.name}</div>
                                <div className="text-[11px] text-[hsl(var(--muted-foreground))]">
                                  {(file.size_bytes / 1024 / 1024).toFixed(2)} MB · {file.indexing_status}
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeExistingContextFile(file.id)}
                              className="rounded-lg p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-red-500/10 hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {newContextFiles.length > 0 ? (
                      <div className="space-y-2">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">Novos arquivos</div>
                        {newContextFiles.map((file) => (
                          <div
                            key={`${file.name}:${file.size}`}
                            className="flex items-center justify-between gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))]/70 px-3 py-2"
                          >
                            <div className="min-w-0 flex items-center gap-2">
                              <FileText className="h-4 w-4 shrink-0 text-indigo-300" />
                              <div className="min-w-0">
                                <div className="truncate text-sm text-[hsl(var(--foreground))]">{file.name}</div>
                                <div className="text-[11px] text-[hsl(var(--muted-foreground))]">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeNewContextFile(file.name, file.size)}
                              className="rounded-lg p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-red-500/10 hover:text-red-400 transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 border-t border-[hsl(var(--border))] bg-[hsl(var(--background))] px-6 py-4">
              <button
                type="button"
                onClick={closeContextModal}
                className="flex-1 py-2.5 rounded-xl border border-[hsl(var(--border))] text-sm font-semibold text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveContextModal}
                disabled={contextModalSaving || contextModalLoading || !editingContextLink}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {contextModalSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {contextModalSaving ? 'Salvando...' : 'Salvar contexto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 bg-black/60 backdrop-blur-sm sm:items-center">
          <div className="flex w-full max-w-lg max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] shadow-2xl">
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
              <div className="overflow-y-auto p-6 space-y-4">
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
                {(projectContextText.trim() || contextFiles.length > 0) ? (
                  <p className="text-xs text-indigo-300/80">
                    O contexto do projeto foi enviado para indexacao e vai alimentar a analise do relatorio semanal.
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="w-full py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600 transition-all"
                >
                  Concluir
                </button>
              </div>
            ) : (
              <>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {error && (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-xs text-red-300">{error}</div>
                )}

                {/* Name fields */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

                <div className="space-y-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]/50 p-4">
                  <div>
                    <label className="block text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1.5">
                      Contexto do projeto para a IA
                    </label>
                    <p className="text-[11px] leading-5 text-[hsl(var(--muted-foreground))] mb-2">
                      {CONTEXT_GUIDANCE}
                    </p>
                    <textarea
                      value={projectContextText}
                      onChange={(e) => setProjectContextText(e.target.value)}
                      placeholder="Cole aqui o contexto do projeto para personalizar a analise semanal."
                      rows={6}
                      className="w-full resize-y px-3 py-2.5 rounded-xl bg-[hsl(var(--background))] border border-[hsl(var(--border))] text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]/60 outline-none focus:border-indigo-500/50"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Arquivos de apoio</div>
                        <div className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">Formatos aceitos: PDF, DOCX e TXT.</div>
                      </div>
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[hsl(var(--border))] px-3 py-2 text-xs font-semibold text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] transition-all">
                        <Plus className="h-3.5 w-3.5" />
                        Adicionar arquivos
                        <input
                          type="file"
                          accept=".pdf,.docx,.txt"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            addContextFiles(e.target.files);
                            e.currentTarget.value = '';
                          }}
                        />
                      </label>
                    </div>

                    {contextFiles.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {contextFiles.map((file) => (
                          <div
                            key={`${file.name}:${file.size}`}
                            className="flex items-center justify-between gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))]/70 px-3 py-2"
                          >
                            <div className="min-w-0 flex items-center gap-2">
                              <FileText className="h-4 w-4 shrink-0 text-indigo-300" />
                              <div className="min-w-0">
                                <div className="truncate text-sm text-[hsl(var(--foreground))]">{file.name}</div>
                                <div className="text-[11px] text-[hsl(var(--muted-foreground))]">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeContextFile(file.name, file.size)}
                              className="rounded-lg p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-red-500/10 hover:text-red-400 transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
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
              </div>

                <div className="flex gap-3 border-t border-[hsl(var(--border))] bg-[hsl(var(--background))] px-6 py-4">
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
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
