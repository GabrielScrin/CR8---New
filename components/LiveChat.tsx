import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, MessageCircle, Paperclip, Plus, Search, Send, User as UserIcon, Wifi, WifiOff, ChevronDown, X } from 'lucide-react';
import { getSupabaseAnonKey, getSupabaseUrl, isSupabaseConfigured, supabase } from '../lib/supabase';
import { ChatMessage, ChatSession } from '../types';
import { loadLocalAiSettings } from '../lib/aiLocal';
import { useAIAgents } from '../hooks/useAIAgents';

type ChatPlatform = 'whatsapp' | 'instagram' | 'web' | 'meta';

type ChatRow = {
  id: string;
  company_id: string;
  platform: ChatPlatform;
  external_thread_id: string | null;
  last_message: string | null;
  last_message_at: string | null;
  ai_active: boolean;
  taken_by: string | null;
  taken_at: string | null;
  tags: string[];
  raw: any;
};

type MessageRow = {
  id: string;
  chat_id: string;
  sender: 'user' | 'agent' | 'system';
  content: string;
  raw: any;
  created_at: string;
};

// ── Platform config ──────────────────────────────────────────────────────────
const PLATFORM_CFG: Record<ChatPlatform, { label: string; badge: string; dot: string }> = {
  whatsapp: {
    label: 'WA',
    badge: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20',
    dot: 'bg-emerald-400',
  },
  instagram: {
    label: 'IG',
    badge: 'bg-pink-500/15 text-pink-300 border border-pink-500/20',
    dot: 'bg-pink-400',
  },
  web: {
    label: 'WEB',
    badge: 'bg-sky-500/15 text-sky-300 border border-sky-500/20',
    dot: 'bg-sky-400',
  },
  meta: {
    label: 'META',
    badge: 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/20',
    dot: 'bg-indigo-400',
  },
};

const badgeForPlatform = (platform: ChatPlatform) => {
  const cfg = PLATFORM_CFG[platform] ?? PLATFORM_CFG.meta;
  return { label: cfg.label, className: cfg.badge };
};

// ── Avatar helpers ────────────────────────────────────────────────────────────
const AVATAR_PALETTE = [
  'bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-orange-500',
  'bg-pink-500', 'bg-cyan-500', 'bg-amber-500', 'bg-rose-500',
];

const avatarColor = (id: string) => {
  const code = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_PALETTE[code % AVATAR_PALETTE.length];
};

const initials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

// ── Data helpers ──────────────────────────────────────────────────────────────
const contactNameFromChat = (chat: ChatRow) => {
  const fromRaw = chat?.raw?.contact_name ?? chat?.raw?.from ?? null;
  return String(fromRaw || chat.external_thread_id || 'Conversa');
};

const formatTime = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const formatDateTimeShort = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

function toChatSession(chat: ChatRow, unread: number): ChatSession {
  return {
    id: chat.id,
    contactName: contactNameFromChat(chat),
    platform: chat.platform,
    lastMessage: chat.last_message ?? '',
    unread,
    aiActive: chat.ai_active,
    tags: Array.isArray(chat.tags) ? chat.tags : [],
  };
}

function toChatMessage(row: MessageRow, platform: ChatPlatform): ChatMessage {
  return {
    id: row.id,
    sender: row.sender,
    content: row.content,
    timestamp: new Date(row.created_at),
    platform,
  };
}

// ── Create Chat Modal ─────────────────────────────────────────────────────────
const CreateChatModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onCreated: (chatId: string) => void;
  companyId: string;
}> = ({ isOpen, onClose, onCreated, companyId }) => {
  const [platform, setPlatform] = useState<ChatPlatform>('whatsapp');
  const [contactName, setContactName] = useState('');
  const [threadId, setThreadId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setPlatform('whatsapp');
    setContactName('');
    setThreadId('');
    setError(null);
    setLoading(false);
  }, [isOpen]);

  const createChat = async () => {
    setError(null);
    if (!threadId.trim()) {
      setError('Informe o destino (ex: telefone ou id).');
      return;
    }

    setLoading(true);
    try {
      const normalizedThreadId =
        platform === 'whatsapp'
          ? threadId.trim().replace(/\D/g, '')
          : threadId.trim();

      if (!normalizedThreadId) {
        setError('Informe um destino valido.');
        setLoading(false);
        return;
      }

      const payloadWithRaw: any = {
        company_id: companyId,
        platform,
        external_thread_id: normalizedThreadId,
        last_message: null,
        last_message_at: null,
        raw: { contact_name: contactName.trim() || null, from: normalizedThreadId },
      };

      let { data, error: insError } = await supabase.from('chats').insert([payloadWithRaw]).select('id').maybeSingle();

      if (insError) {
        const msg = String(insError.message ?? '');
        const isRawCacheError =
          msg.toLowerCase().includes('raw') &&
          (msg.toLowerCase().includes('schema cache') || msg.toLowerCase().includes('could not find'));

        if (isRawCacheError) {
          const { raw: _raw, ...payloadWithoutRaw } = payloadWithRaw;
          ({ data, error: insError } = await supabase.from('chats').insert([payloadWithoutRaw]).select('id').maybeSingle());
        }
      }

      if (insError) throw insError;
      if (!data?.id) throw new Error('Falha ao criar conversa.');

      onCreated(String(data.id));
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao criar conversa.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className="w-full max-w-md rounded-2xl border border-[hsl(var(--border))] bg-[hsl(220_20%_8%)] shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-[hsl(var(--border))]">
              <div>
                <h2 className="text-base font-bold text-[hsl(var(--foreground))]">Nova conversa</h2>
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                  WhatsApp: use o telefone com DDI (ex: 5511999999999)
                </p>
              </div>
              <button
                onClick={onClose}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              {/* Canal */}
              <div>
                <label className="block text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1.5">
                  Canal
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['whatsapp', 'instagram', 'web', 'meta'] as ChatPlatform[]).map((p) => {
                    const cfg = PLATFORM_CFG[p];
                    const active = platform === p;
                    return (
                      <button
                        key={p}
                        onClick={() => setPlatform(p)}
                        className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                          active
                            ? cfg.badge + ' border-current'
                            : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--border))]/80'
                        }`}
                      >
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Nome */}
              <div>
                <label className="block text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1.5">
                  Nome do contato <span className="normal-case font-normal">(opcional)</span>
                </label>
                <input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="w-full rounded-xl bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] transition-shadow"
                  placeholder="Ex: Ana Souza"
                />
              </div>

              {/* Destino */}
              <div>
                <label className="block text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1.5">
                  Destino <span className="text-red-400">*</span>
                </label>
                <input
                  value={threadId}
                  onChange={(e) => setThreadId(e.target.value)}
                  className="w-full rounded-xl bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] transition-shadow"
                  placeholder="5511999999999"
                />
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2"
                >
                  {error}
                </motion.div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-[hsl(var(--border))] bg-[hsl(var(--card))]/30">
              <button
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 rounded-xl border border-[hsl(var(--border))] text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] disabled:opacity-50 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={() => void createChat()}
                disabled={loading}
                className="px-5 py-2 rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-all shadow-sm"
              >
                {loading ? 'Criando...' : 'Criar conversa'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
export const LiveChat: React.FC<{ companyId?: string; userId?: string }> = ({ companyId, userId }) => {
  const readOnlyMode = !isSupabaseConfigured();

  const [search, setSearch] = useState('');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');

  const { defaultAgent } = useAIAgents();

  const [loading, setLoading] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [aiAutoReplying, setAiAutoReplying] = useState(false);

  const [chats, setChats] = useState<ChatRow[]>([]);
  const [unreadByChatId, setUnreadByChatId] = useState<Record<string, number>>({});
  const [messages, setMessages] = useState<MessageRow[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [companyInfo, setCompanyInfo] = useState<{
    name: string | null;
    whatsapp_phone_number_id: string | null;
    whatsapp_waba_id: string | null;
  } | null>(null);
  const [infoExpanded, setInfoExpanded] = useState(false);

  const reloadActiveChatTimerRef = useRef<number | null>(null);
  const processedInboundMessageIdsRef = useRef<Set<string>>(new Set());
  const aiAutoReplyQueueRef = useRef<Promise<void>>(Promise.resolve());
  const activeChatRef = useRef<ChatRow | null>(null);
  const messageInputRef = useRef<string>('');

  const activeChat = useMemo(() => chats.find((c) => c.id === activeChatId) ?? null, [chats, activeChatId]);
  const sessions: ChatSession[] = useMemo(() => chats.map((c) => toChatSession(c, unreadByChatId[c.id] ?? 0)), [chats, unreadByChatId]);

  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);
  useEffect(() => { messageInputRef.current = messageInput; }, [messageInput]);

  const filteredSessions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => `${s.contactName} ${s.lastMessage}`.toLowerCase().includes(q));
  }, [sessions, search]);

  useEffect(() => {
    if (readOnlyMode || !companyId) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('name, whatsapp_phone_number_id, whatsapp_waba_id')
        .eq('id', companyId)
        .maybeSingle();
      if (cancelled) return;
      if (error) { setCompanyInfo(null); return; }
      setCompanyInfo({
        name: (data as any)?.name ?? null,
        whatsapp_phone_number_id: (data as any)?.whatsapp_phone_number_id ?? null,
        whatsapp_waba_id: (data as any)?.whatsapp_waba_id ?? null,
      });
    })();
    return () => { cancelled = true; };
  }, [companyId, readOnlyMode]);

  const loadChats = useCallback(async () => {
    if (readOnlyMode || !companyId) return;
    setError(null);
    setLoading(true);
    try {
      const [{ data: readsRows, error: readsError }] = await Promise.all([
        supabase.from('chat_reads').select('chat_id, last_read_at').order('last_read_at', { ascending: false }),
      ]);
      if (readsError) throw readsError;

      let chatRows: any[] | null = null;
      let chatError: any = null;

      ({ data: chatRows, error: chatError } = await supabase
        .from('chats')
        .select('id, company_id, platform, external_thread_id, last_message, last_message_at, ai_active, taken_by, taken_at, tags, raw')
        .eq('company_id', companyId)
        .order('last_message_at', { ascending: false })
        .limit(200));

      if (chatError) {
        const msg = String(chatError.message ?? '');
        const isRawCacheError =
          msg.toLowerCase().includes('raw') &&
          (msg.toLowerCase().includes('schema cache') || msg.toLowerCase().includes('could not find'));

        if (!isRawCacheError) throw chatError;

        ({ data: chatRows, error: chatError } = await supabase
          .from('chats')
          .select('id, company_id, platform, external_thread_id, last_message, last_message_at, ai_active, taken_by, taken_at, tags')
          .eq('company_id', companyId)
          .order('last_message_at', { ascending: false })
          .limit(200));

        if (chatError) throw chatError;
        chatRows = (chatRows ?? []).map((c) => ({ ...c, raw: {} }));
      }

      const chatsMapped = (chatRows ?? []) as unknown as ChatRow[];
      setChats(chatsMapped);

      const readsById: Record<string, string> = {};
      for (const r of readsRows ?? []) readsById[String((r as any).chat_id)] = String((r as any).last_read_at);

      const unreadMap: Record<string, number> = {};
      for (const chat of chatsMapped) {
        const lastRead = readsById[chat.id];
        if (!chat.last_message_at) unreadMap[chat.id] = 0;
        else if (!lastRead) unreadMap[chat.id] = 1;
        else unreadMap[chat.id] = new Date(chat.last_message_at).getTime() > new Date(lastRead).getTime() ? 1 : 0;
      }
      setUnreadByChatId(unreadMap);

      if (!activeChatId && chatsMapped.length > 0) setActiveChatId(chatsMapped[0].id);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? 'Erro ao carregar conversas.');
    } finally {
      setLoading(false);
    }
  }, [activeChatId, companyId, readOnlyMode]);

  const markRead = useCallback(
    async (chatId: string) => {
      if (readOnlyMode || !userId) return;
      const nowIso = new Date().toISOString();
      setUnreadByChatId((prev) => ({ ...prev, [chatId]: 0 }));
      await supabase.from('chat_reads').upsert([{ chat_id: chatId, user_id: userId, last_read_at: nowIso }] as any);
    },
    [readOnlyMode, userId]
  );

  const loadMessages = useCallback(
    async (chatId: string) => {
      if (readOnlyMode) return;
      setError(null);
      setLoadingMessages(true);
      try {
        const { data, error: msgError } = await supabase
          .from('chat_messages')
          .select('id, chat_id, sender, content, raw, created_at')
          .eq('chat_id', chatId)
          .order('created_at', { ascending: true })
          .limit(500);
        if (msgError) throw msgError;
        setMessages((data ?? []) as unknown as MessageRow[]);
        await markRead(chatId);
      } catch (e: any) {
        console.error(e);
        setError(e?.message ?? 'Erro ao carregar mensagens.');
      } finally {
        setLoadingMessages(false);
      }
    },
    [markRead, readOnlyMode]
  );

  useEffect(() => { void loadChats(); }, [loadChats]);
  useEffect(() => { if (!activeChatId) return; void loadMessages(activeChatId); }, [activeChatId, loadMessages]);

  // Realtime: chats list
  useEffect(() => {
    if (readOnlyMode || !companyId) return;
    const channel = supabase
      .channel(`realtime:chats:${companyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chats', filter: `company_id=eq.${companyId}` }, (payload) => {
        void loadChats();
        const changedChatId = String((payload as any)?.new?.id ?? (payload as any)?.old?.id ?? '');
        if (!changedChatId || !activeChatId) return;
        if (changedChatId !== activeChatId) return;
        if (reloadActiveChatTimerRef.current) window.clearTimeout(reloadActiveChatTimerRef.current);
        reloadActiveChatTimerRef.current = window.setTimeout(() => { void loadMessages(activeChatId); }, 350);
      })
      .subscribe();
    return () => {
      if (reloadActiveChatTimerRef.current) window.clearTimeout(reloadActiveChatTimerRef.current);
      reloadActiveChatTimerRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [activeChatId, companyId, loadChats, loadMessages, readOnlyMode]);

  useEffect(() => {
    if (readOnlyMode) return;
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      void loadChats();
      if (activeChatId) void loadMessages(activeChatId);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [activeChatId, loadChats, loadMessages, readOnlyMode]);

  const safeJson = (text: string): any => {
    const raw = String(text ?? '').trim();
    if (!raw) return {};
    try { return JSON.parse(raw); } catch { return { raw }; }
  };

  const sendOutboundMessage = useCallback(async (chatId: string, content: string) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error('Sessao invalida. Faca logout/login e tente novamente.');

    const res = await fetch(`${getSupabaseUrl()}/functions/v1/omni-send`, {
      method: 'POST',
      headers: {
        apikey: getSupabaseAnonKey(),
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ chat_id: chatId, content, access_token: accessToken }),
    });

    const payloadText = await res.text().catch(() => '');
    const payload = safeJson(payloadText);
    if (!res.ok) {
      throw Object.assign(new Error((payload as any)?.error ?? 'Falha ao enviar mensagem.'), {
        context: { status: res.status, body: payload },
      });
    }
    return payload;
  }, []);

  const sendMessage = useCallback(async () => {
    if (!activeChatId) return;
    const content = messageInput.trim();
    if (!content) return;
    setMessageInput('');
    setError(null);
    try {
      const payload = await sendOutboundMessage(activeChatId, content);
      const provider = (payload as any)?.provider;
      if (provider && provider.ok === false && provider.skipped !== true) {
        const status = provider.status ? `HTTP ${provider.status}` : 'erro';
        setError(`Mensagem salva, mas o provedor recusou o envio (${status}).`);
      }
    } catch (e: any) {
      console.error(e);
      const baseMsg = String(e?.message ?? 'Falha ao enviar mensagem.');
      const status = e?.context?.status;
      const body = e?.context?.body;
      const details = typeof status === 'number'
        ? ` (HTTP ${status}${body ? `: ${typeof body === 'string' ? body : JSON.stringify(body)}` : ''})`
        : '';
      setError(`${baseMsg}${details}`);
    }
  }, [activeChatId, messageInput, sendOutboundMessage]);

  const upsertLeadFromChat = useCallback(
    async (chat: ChatRow, qualification: any | null) => {
      if (readOnlyMode || !companyId || !userId) return;
      if (chat.platform !== 'whatsapp') return;
      if (!chat.external_thread_id) return;

      const externalId = `wa:${chat.external_thread_id}`;
      const phone = chat.external_thread_id;
      const name = chat?.raw?.contact_name ? String(chat.raw.contact_name) : null;
      const nowIso = new Date().toISOString();

      const mergedRaw: any = {
        ...(chat.raw ?? {}),
        sdr: {
          ...((chat.raw ?? {})?.sdr ?? {}),
          qualification: qualification ?? null,
          last_qualified_at: nowIso,
        },
      };

      const { data: leadRow, error: leadErr } = await supabase
        .from('leads')
        .upsert(
          [{
            company_id: companyId,
            external_id: externalId,
            phone,
            name,
            source: 'WhatsApp',
            status: 'new',
            assigned_to: chat.taken_by ?? userId,
            last_interaction_at: nowIso,
            raw: mergedRaw,
          }] as any,
          { onConflict: 'company_id,external_id' }
        )
        .select('id')
        .maybeSingle();

      if (leadErr) throw leadErr;
      if (leadRow?.id) {
        await supabase.from('chats').update({ lead_id: String((leadRow as any).id) }).eq('id', chat.id);
      }
    },
    [companyId, readOnlyMode, userId]
  );

  const persistChatSdrData = useCallback(
    async (chat: ChatRow, sdrResult: any) => {
      if (readOnlyMode) return;
      const nowIso = new Date().toISOString();
      const qualification = sdrResult?.qualification ?? null;
      const handoffReady = Boolean(sdrResult?.handoff_ready);
      const handoffReason = sdrResult?.handoff_reason ?? null;

      try {
        const nextRaw = {
          ...(chat.raw ?? {}),
          sdr: {
            ...((chat.raw ?? {})?.sdr ?? {}),
            qualification,
            handoff_ready: handoffReady,
            handoff_reason: handoffReason,
            last_qualified_at: nowIso,
          },
        };

        const { error: updErr } = await supabase.from('chats').update({ raw: nextRaw } as any).eq('id', chat.id);
        if (updErr) {
          const msg = String(updErr.message ?? '');
          const isRawCacheError =
            msg.toLowerCase().includes('raw') &&
            (msg.toLowerCase().includes('schema cache') || msg.toLowerCase().includes('could not find'));
          if (!isRawCacheError) throw updErr;
        }
      } finally {
        try { await upsertLeadFromChat(chat, qualification); } catch (e) { console.warn('[livechat] lead upsert failed', e); }
      }
    },
    [readOnlyMode, upsertLeadFromChat]
  );

  const maybeAutoSdrReply = useCallback(
    async (incoming: MessageRow) => {
      if (!activeChatId) return;
      const chat = activeChatRef.current;
      if (!chat) return;
      if (incoming.chat_id !== activeChatId) return;
      if (incoming.sender !== 'user') return;
      if (!incoming.content?.trim()) return;
      if (!userId) return;
      if (messageInputRef.current.trim()) return;
      if (!chat.ai_active) return;
      if (chat.taken_by && chat.taken_by !== userId) return;
      if (!chat.taken_by) {
        try {
          const nowIso = new Date().toISOString();
          const { data: taken, error: takeErr } = await supabase
            .from('chats')
            .update({ taken_by: userId, taken_at: nowIso } as any)
            .eq('id', chat.id)
            .is('taken_by', null)
            .select('id,taken_by,taken_at,ai_active')
            .maybeSingle();
          if (!takeErr && taken?.id) {
            setChats((prev) => prev.map((c) => (c.id === chat.id ? ({ ...c, ...(taken as any) } as any) : c)));
            const nextChat = { ...(chat as any), ...(taken as any) } as ChatRow;
            activeChatRef.current = nextChat;
          } else {
            return;
          }
        } catch { return; }
      } else if (chat.taken_by !== userId) {
        return;
      }

      if (processedInboundMessageIdsRef.current.size > 2000) processedInboundMessageIdsRef.current.clear();
      if (processedInboundMessageIdsRef.current.has(incoming.id)) return;
      processedInboundMessageIdsRef.current.add(incoming.id);

      const local = loadLocalAiSettings(userId);
      if (!local?.apiKey) {
        setError('IA ativa, mas falta sua API Key. Va em Agente IA e salve a chave do provedor.');
        return;
      }

      aiAutoReplyQueueRef.current = aiAutoReplyQueueRef.current
        .then(async () => {
          setAiAutoReplying(true);
          try {
            const { data: sessionData } = await supabase.auth.getSession();
            const accessToken = sessionData.session?.access_token;
            if (!accessToken) throw new Error('Sessao invalida. Faca logout/login e tente novamente.');

            const aiRes = await fetch(`${getSupabaseUrl()}/functions/v1/ai-assistant`, {
              method: 'POST',
              headers: {
                apikey: getSupabaseAnonKey(),
                authorization: `Bearer ${accessToken}`,
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                mode: 'sdr_reply',
                chat_id: activeChatId,
                provider: local.provider,
                api_key: local.apiKey,
                model: local.model,
                access_token: accessToken,
                agent_id: defaultAgent?.id,
              }),
            });

            const aiText = await aiRes.text().catch(() => '');
            const aiPayload = safeJson(aiText);
            if (!aiRes.ok) throw new Error((aiPayload as any)?.error ?? 'Falha ao chamar IA.');

            const result = (aiPayload as any)?.result ?? {};
            const reply = (result as any)?.reply;
            if (!reply || typeof reply !== 'string') throw new Error('A IA nao retornou uma sugestao de resposta.');

            await persistChatSdrData(chat, result);

            const outPayload = await sendOutboundMessage(activeChatId, reply);
            const provider = (outPayload as any)?.provider;
            if (provider && provider.ok === false && provider.skipped !== true) {
              const status = provider.status ? `HTTP ${provider.status}` : 'erro';
              setError(`Resposta da IA salva, mas o provedor recusou o envio (${status}).`);
            }
            if ((result as any)?.handoff_ready) {
              await supabase.from('chats').update({ ai_active: false } as any).eq('id', activeChatId);
            }
          } catch (e: any) {
            console.error(e);
            setError(e?.message ?? 'Falha no auto atendimento IA.');
          } finally {
            setAiAutoReplying(false);
          }
        })
        .catch((e) => console.error('[livechat] aiAutoReplyQueue error', e));
    },
    [activeChatId, persistChatSdrData, sendOutboundMessage, userId]
  );

  // Realtime: active chat messages
  useEffect(() => {
    if (readOnlyMode || !activeChatId) return;
    const channel = supabase
      .channel(`realtime:chat_messages:${activeChatId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `chat_id=eq.${activeChatId}` }, (payload) => {
        const row = payload.new as any;
        if (!row?.id) return;
        setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
        void markRead(activeChatId);
        void maybeAutoSdrReply(row as MessageRow);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [activeChatId, markRead, maybeAutoSdrReply, readOnlyMode]);

  const suggestSdrReply = useCallback(async () => {
    if (!activeChatId) return;
    setError(null);
    setAiSuggesting(true);
    try {
      const local = loadLocalAiSettings(userId ?? undefined);
      if (!local?.apiKey) throw new Error('Falta sua API Key. Va em Agente IA e salve a chave do provedor.');

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Sessao invalida. Faca logout/login e tente novamente.');

      const res = await fetch(`${getSupabaseUrl()}/functions/v1/ai-assistant`, {
        method: 'POST',
        headers: {
          apikey: getSupabaseAnonKey(),
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'sdr_reply',
          chat_id: activeChatId,
          provider: local.provider,
          api_key: local.apiKey,
          model: local.model,
          access_token: accessToken,
          agent_id: defaultAgent?.id,
        }),
      });

      const payloadText = await res.text().catch(() => '');
      const payload = payloadText ? JSON.parse(payloadText) : {};
      if (!res.ok) {
        throw Object.assign(new Error(payload?.error ?? 'Falha ao chamar IA.'), { context: { status: res.status, body: payload } });
      }

      const result = (payload as any)?.result ?? {};
      const reply = (result as any)?.reply;
      if (!reply || typeof reply !== 'string') throw new Error('A IA nao retornou uma sugestao de resposta.');

      setMessageInput(reply);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? 'Falha ao gerar sugestao IA.');
    } finally {
      setAiSuggesting(false);
    }
  }, [activeChatId]);

  const toggleAi = useCallback(async () => {
    if (!activeChat) return;
    try {
      if (!activeChat.ai_active) {
        if (!userId) throw new Error('Sessao invalida. Faca login novamente.');
        if (activeChat.taken_by !== userId) throw new Error('Para ativar IA, primeiro assuma a conversa.');
        const local = loadLocalAiSettings(userId);
        if (!local?.apiKey) throw new Error('Falta sua API Key. Va em Agente IA e salve a chave do provedor.');
      }
      const { error: updError } = await supabase.from('chats').update({ ai_active: !activeChat.ai_active }).eq('id', activeChat.id);
      if (updError) throw updError;
    } catch (e: any) {
      setError(e?.message ?? 'Falha ao atualizar modo IA.');
    }
  }, [activeChat, userId]);

  const takeChat = useCallback(async () => {
    if (!activeChat || !userId) return;
    try {
      const { error: updError } = await supabase
        .from('chats')
        .update({ taken_by: userId, taken_at: new Date().toISOString(), ai_active: false })
        .eq('id', activeChat.id);
      if (updError) throw updError;
    } catch (e: any) {
      setError(e?.message ?? 'Falha ao assumir conversa.');
    }
  }, [activeChat, userId]);

  const releaseChat = useCallback(async () => {
    if (!activeChat) return;
    try {
      const { error: updError } = await supabase.from('chats').update({ taken_by: null, taken_at: null }).eq('id', activeChat.id);
      if (updError) throw updError;
    } catch (e: any) {
      setError(e?.message ?? 'Falha ao liberar conversa.');
    }
  }, [activeChat]);

  const listBottomRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    listBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, activeChatId]);

  // ── Read-only fallback ───────────────────────────────────────────────────────
  if (readOnlyMode || !companyId) {
    return (
      <div className="flex items-center justify-center h-full text-[hsl(var(--muted-foreground))]">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] flex items-center justify-center mx-auto mb-4">
            <MessageCircle className="w-7 h-7 opacity-30" />
          </div>
          <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">Live Chat</h3>
          <p className="text-sm mt-1">Configure o Supabase para habilitar a central omnichannel.</p>
        </div>
      </div>
    );
  }

  const activePlatformCfg = activeChat ? PLATFORM_CFG[activeChat.platform] : null;
  const totalUnread = Object.values(unreadByChatId).reduce((a, b) => a + b, 0);

  // ── JSX ──────────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="flex h-[calc(100vh-6rem)] rounded-2xl border border-[hsl(var(--border))] overflow-hidden"
           style={{ background: 'hsl(220 20% 8%)' }}>

        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <div className="w-72 flex flex-col border-r border-[hsl(var(--border))]" style={{ background: 'hsl(220 18% 7%)' }}>

          {/* Header */}
          <div className="px-4 pt-4 pb-3 border-b border-[hsl(var(--border))]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[hsl(var(--foreground))]">Mensagens</h2>
                {totalUnread > 0 && (
                  <span className="h-5 min-w-5 px-1.5 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-[10px] font-bold flex items-center justify-center">
                    {totalUnread}
                  </span>
                )}
              </div>
              <button
                onClick={() => setCreateOpen(true)}
                className="h-7 w-7 rounded-lg bg-[hsl(var(--primary))]/10 border border-[hsl(var(--primary))]/20 text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/20 flex items-center justify-center transition-colors"
                title="Nova conversa"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-[hsl(var(--background))] border border-[hsl(var(--border))] text-xs text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
              />
            </div>
          </div>

          {/* Company info toggle */}
          {companyInfo && (
            <div className="px-4 py-2 border-b border-[hsl(var(--border))]">
              <button
                onClick={() => setInfoExpanded((v) => !v)}
                className="w-full flex items-center justify-between text-[10px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  {companyInfo.whatsapp_phone_number_id ? (
                    <Wifi className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <WifiOff className="w-3 h-3 text-red-400/70" />
                  )}
                  {companyInfo.name ?? 'Empresa'}
                </span>
                <ChevronDown className={`w-3 h-3 transition-transform ${infoExpanded ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {infoExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-2 space-y-1">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-[hsl(var(--muted-foreground))]">Phone ID</span>
                        <span className="text-[hsl(var(--foreground))] font-mono truncate max-w-[9rem]">
                          {companyInfo.whatsapp_phone_number_id ?? '—'}
                        </span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-[hsl(var(--muted-foreground))]">WABA</span>
                        <span className="text-[hsl(var(--foreground))] font-mono truncate max-w-[9rem]">
                          {companyInfo.whatsapp_waba_id ?? '—'}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Session list */}
          <div className="flex-1 overflow-y-auto cr8-scroll">
            {loading && (
              <div className="p-4 space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex gap-3 items-start animate-pulse">
                    <div className="w-9 h-9 rounded-full bg-[hsl(var(--border))] shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 bg-[hsl(var(--border))] rounded w-3/4" />
                      <div className="h-2.5 bg-[hsl(var(--border))] rounded w-full" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loading && filteredSessions.length === 0 && (
              <div className="flex flex-col items-center justify-center h-40 text-[hsl(var(--muted-foreground))] text-xs">
                <MessageCircle className="w-8 h-8 mb-2 opacity-20" />
                {search ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa ainda'}
              </div>
            )}

            {!loading && filteredSessions.map((session) => {
              const chat = chats.find((c) => c.id === session.id);
              const pcfg = chat ? PLATFORM_CFG[chat.platform] : null;
              const isActive = activeChatId === session.id;
              const contactName = session.contactName;
              const bgColor = avatarColor(session.id);

              return (
                <button
                  key={session.id}
                  onClick={() => setActiveChatId(session.id)}
                  className={`w-full text-left px-4 py-3 border-b border-[hsl(var(--border))]/50 transition-colors flex gap-3 items-start ${
                    isActive
                      ? 'bg-[hsl(var(--primary))]/8'
                      : 'hover:bg-[hsl(var(--secondary))]/40'
                  }`}
                >
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <div className={`w-9 h-9 rounded-full ${bgColor} flex items-center justify-center text-white text-xs font-bold`}>
                      {initials(contactName)}
                    </div>
                    {pcfg && (
                      <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ${pcfg.dot} border-2 border-[hsl(220_18%_7%)]`} />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className={`text-xs font-semibold truncate ${isActive ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--foreground))]'}`}>
                        {contactName}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        {session.unread > 0 && (
                          <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--primary))]" />
                        )}
                        {chat?.last_message_at && (
                          <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                            {formatDateTimeShort(chat.last_message_at)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-[11px] text-[hsl(var(--muted-foreground))] truncate leading-snug">
                      {session.lastMessage || <span className="italic opacity-60">Sem mensagens</span>}
                    </div>
                    {(session.aiActive || (session.tags ?? []).length > 0) && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        {session.aiActive && (
                          <span className="flex items-center gap-1 text-[10px] text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 rounded-full px-1.5 py-0.5">
                            <Bot className="w-2.5 h-2.5" />
                            IA
                          </span>
                        )}
                        {(session.tags ?? []).slice(0, 2).map((tag) => (
                          <span key={tag} className="text-[10px] bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] rounded-full px-1.5 py-0.5 border border-[hsl(var(--border))]">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Chat Area ─────────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {activeChat ? (
            <>
              {/* Chat header */}
              <div className="h-16 flex items-center justify-between px-5 border-b border-[hsl(var(--border))]"
                   style={{ background: 'hsl(220 18% 7%)' }}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`relative w-9 h-9 rounded-full ${avatarColor(activeChat.id)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                    {initials(contactNameFromChat(activeChat))}
                    {activePlatformCfg && (
                      <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ${activePlatformCfg.dot} border-2 border-[hsl(220_18%_7%)]`} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-[hsl(var(--foreground))] truncate">
                        {contactNameFromChat(activeChat)}
                      </h3>
                      {activePlatformCfg && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold border ${activePlatformCfg.badge}`}>
                          {activePlatformCfg.label}
                        </span>
                      )}
                      {activeChat.ai_active && (
                        <span className="flex items-center gap-1 text-[10px] text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 border border-[hsl(var(--primary))]/20 rounded-full px-1.5 py-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--primary))] animate-pulse" />
                          IA ativa
                        </span>
                      )}
                    </div>
                    {activeChat.external_thread_id && (
                      <div className="text-[10px] text-[hsl(var(--muted-foreground))] truncate font-mono">
                        {activeChat.external_thread_id}
                      </div>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  {activeChat.taken_by && (
                    <span className="hidden sm:block text-[10px] px-2 py-1 rounded-lg bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border))]">
                      {activeChat.taken_by === userId ? 'Voce atende' : 'Em atendimento'}
                    </span>
                  )}

                  {!activeChat.taken_by ? (
                    <button
                      onClick={() => void takeChat()}
                      className="px-3 py-1.5 rounded-lg bg-[hsl(var(--primary))]/10 border border-[hsl(var(--primary))]/25 text-[hsl(var(--primary))] text-xs font-semibold hover:bg-[hsl(var(--primary))]/20 transition-colors"
                    >
                      Assumir
                    </button>
                  ) : activeChat.taken_by === userId ? (
                    <button
                      onClick={() => void releaseChat()}
                      className="px-3 py-1.5 rounded-lg bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                    >
                      Liberar
                    </button>
                  ) : null}

                  <button
                    onClick={() => void toggleAi()}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                      activeChat.ai_active
                        ? 'bg-[hsl(var(--primary))]/10 border-[hsl(var(--primary))]/25 text-[hsl(var(--primary))]'
                        : 'bg-[hsl(var(--secondary))] border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                    }`}
                    title="Alternar modo IA"
                  >
                    <Bot className="w-3.5 h-3.5" />
                    {activeChat.ai_active ? 'IA on' : 'IA off'}
                  </button>

                  <button
                    onClick={() => void suggestSdrReply()}
                    disabled={aiSuggesting}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] disabled:opacity-40 transition-all"
                    title="Gerar sugestao de resposta"
                  >
                    <Bot className="w-3.5 h-3.5" />
                    {aiSuggesting ? 'Gerando...' : 'Sugerir'}
                  </button>
                </div>
              </div>

              {/* Messages area */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 cr8-scroll"
                   style={{ background: 'hsl(220 20% 8%)' }}>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2"
                  >
                    {error}
                  </motion.div>
                )}

                {loadingMessages && (
                  <div className="space-y-3">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'} animate-pulse`}>
                        <div className={`h-10 rounded-2xl bg-[hsl(var(--border))] ${i % 2 === 0 ? 'w-48' : 'w-36'}`} />
                      </div>
                    ))}
                  </div>
                )}

                {/* AI auto-reply indicator */}
                {aiAutoReplying && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl px-4 py-2.5">
                      <div className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--primary))] animate-bounce"
                            style={{ animationDelay: `${i * 0.15}s` }}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">IA respondendo</span>
                    </div>
                  </div>
                )}

                {/* SDR qualification card */}
                {activeChat?.raw?.sdr?.qualification && typeof activeChat.raw.sdr.qualification === 'object' && (
                  <div className="rounded-xl border border-[hsl(var(--primary))]/20 bg-[hsl(var(--primary))]/5 p-3">
                    <div className="text-[10px] font-bold text-[hsl(var(--primary))] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Bot className="w-3 h-3" />
                      Qualificacao SDR
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      {Object.entries(activeChat.raw.sdr.qualification as any).map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-[hsl(var(--muted-foreground))] capitalize">{k.replace(/_/g, ' ')}</span>
                          <span className="text-[10px] text-[hsl(var(--foreground))] truncate font-medium">{v ? String(v) : '—'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Messages */}
                <AnimatePresence initial={false}>
                  {messages.map((msg, idx) => {
                    const uiMsg = toChatMessage(msg, activeChat.platform);
                    const isInbound = uiMsg.sender === 'user';
                    const isSystem = uiMsg.sender === 'system';
                    const prevMsg = idx > 0 ? messages[idx - 1] : null;
                    const showAvatar = isInbound && (!prevMsg || prevMsg.sender !== 'user');

                    if (isSystem) {
                      return (
                        <motion.div
                          key={uiMsg.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="flex justify-center"
                        >
                          <span className="text-[10px] text-[hsl(var(--muted-foreground))] bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] px-3 py-1 rounded-full">
                            {uiMsg.content}
                          </span>
                        </motion.div>
                      );
                    }

                    return (
                      <motion.div
                        key={uiMsg.id}
                        initial={{ opacity: 0, y: 8, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        className={`flex items-end gap-2 ${isInbound ? 'justify-start' : 'justify-end'}`}
                      >
                        {/* Inbound avatar */}
                        {isInbound && (
                          <div className="shrink-0 mb-0.5">
                            {showAvatar ? (
                              <div className={`w-6 h-6 rounded-full ${avatarColor(activeChat.id)} flex items-center justify-center text-white text-[9px] font-bold`}>
                                {initials(contactNameFromChat(activeChat))}
                              </div>
                            ) : (
                              <div className="w-6" />
                            )}
                          </div>
                        )}

                        {/* Bubble */}
                        <div className={`max-w-[68%] ${isInbound ? 'rounded-2xl rounded-bl-md' : 'rounded-2xl rounded-br-md'} px-4 py-2.5 ${
                          isInbound
                            ? 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] border border-[hsl(var(--border))]'
                            : 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                        }`}>
                          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{uiMsg.content}</p>
                          <div className={`text-[10px] mt-1 text-right ${
                            isInbound ? 'text-[hsl(var(--muted-foreground))]' : 'text-white/60'
                          }`}>
                            {formatTime(msg.created_at)}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>

                <div ref={listBottomRef} />
              </div>

              {/* Input bar */}
              <div className="px-4 py-3 border-t border-[hsl(var(--border))]" style={{ background: 'hsl(220 18% 7%)' }}>
                <div className="flex items-center gap-2 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-2xl px-2 py-1.5 focus-within:ring-2 focus-within:ring-[hsl(var(--ring))]/60 transition-shadow">
                  <button className="p-2 rounded-xl text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] transition-colors shrink-0">
                    <Paperclip className="w-4 h-4" />
                  </button>
                  <input
                    type="text"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void sendMessage();
                      }
                    }}
                    placeholder="Mensagem... (Enter para enviar)"
                    className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] outline-none"
                  />
                  <button
                    onClick={() => void sendMessage()}
                    disabled={!messageInput.trim()}
                    className="p-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-xl hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95 shrink-0"
                    title="Enviar"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-[hsl(var(--muted-foreground))]">
              <div className="w-16 h-16 rounded-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] flex items-center justify-center mb-4">
                <MessageCircle className="w-7 h-7 opacity-25" />
              </div>
              <p className="text-sm font-medium text-[hsl(var(--foreground))]">Selecione uma conversa</p>
              <p className="text-xs mt-1">Escolha uma conversa na lista ao lado para iniciar</p>
            </div>
          )}
        </div>
      </div>

      <CreateChatModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(chatId) => {
          setActiveChatId(chatId);
          void loadChats();
          void loadMessages(chatId);
        }}
        companyId={companyId}
      />
    </>
  );
};
