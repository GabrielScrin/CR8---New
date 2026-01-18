import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, MessageCircle, Paperclip, Plus, Search, Send, User as UserIcon } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { ChatMessage, ChatSession } from '../types';

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

const badgeForPlatform = (platform: ChatPlatform) => {
  switch (platform) {
    case 'whatsapp':
      return { label: 'WA', className: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20' };
    case 'instagram':
      return { label: 'IG', className: 'bg-pink-500/15 text-pink-300 border border-pink-500/20' };
    case 'web':
      return { label: 'WEB', className: 'bg-sky-500/15 text-sky-300 border border-sky-500/20' };
    case 'meta':
    default:
      return { label: 'META', className: 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/20' };
  }
};

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
      const payloadWithRaw: any = {
        company_id: companyId,
        platform,
        external_thread_id: threadId.trim(),
        last_message: null,
        last_message_at: null,
        raw: { contact_name: contactName.trim() || null, from: threadId.trim() },
      };

      let { data, error: insError } = await supabase.from('chats').insert([payloadWithRaw]).select('id').maybeSingle();

      if (insError) {
        const msg = String(insError.message ?? '');
        const isRawCacheError =
          msg.toLowerCase().includes('raw') &&
          (msg.toLowerCase().includes('schema cache') || msg.toLowerCase().includes('could not find'));

        // Back-compat: se o schema ainda não tem a coluna `raw`, tenta criar sem ela.
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="cr8-card w-full max-w-md p-6">
        <h2 className="text-xl font-bold text-[hsl(var(--foreground))]">Nova conversa</h2>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Para WhatsApp, use o telefone (ex: 5511999999999).
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Canal</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as ChatPlatform)}
              className="mt-1 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="instagram">Instagram</option>
              <option value="web">Web</option>
              <option value="meta">Meta</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Nome do contato (opcional)</label>
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="mt-1 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              placeholder="Ex: Ana Souza"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Destino *</label>
            <input
              value={threadId}
              onChange={(e) => setThreadId(e.target.value)}
              className="mt-1 w-full rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              placeholder="5511999999999"
            />
          </div>

          {error && <div className="text-sm text-[hsl(var(--destructive))]">{error}</div>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void createChat()}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Criando...' : 'Criar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const LiveChat: React.FC<{ companyId?: string; userId?: string }> = ({ companyId, userId }) => {
  const readOnlyMode = !isSupabaseConfigured();

  const [search, setSearch] = useState('');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');

  const [loading, setLoading] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [chats, setChats] = useState<ChatRow[]>([]);
  const [unreadByChatId, setUnreadByChatId] = useState<Record<string, number>>({});
  const [messages, setMessages] = useState<MessageRow[]>([]);

  const [createOpen, setCreateOpen] = useState(false);

  const activeChat = useMemo(() => chats.find((c) => c.id === activeChatId) ?? null, [chats, activeChatId]);
  const sessions: ChatSession[] = useMemo(() => chats.map((c) => toChatSession(c, unreadByChatId[c.id] ?? 0)), [chats, unreadByChatId]);

  const filteredSessions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => `${s.contactName} ${s.lastMessage}`.toLowerCase().includes(q));
  }, [sessions, search]);

  const loadChats = useCallback(async () => {
    if (readOnlyMode || !companyId) return;
    setError(null);
    setLoading(true);
    try {
      const [{ data: readsRows, error: readsError }] = await Promise.all([
        supabase.from('chat_reads').select('chat_id, last_read_at').order('last_read_at', { ascending: false }),
      ]);
      if (readsError) throw readsError;

      // Prefer carregar `raw` quando existir. Se o PostgREST ainda não atualizou o schema cache, faz fallback.
      let chatRows: any[] | null = null;
      let chatError: any = null;

      ({ data: chatRows, error: chatError } = await supabase
        .from('chats')
        .select(
          'id, company_id, platform, external_thread_id, last_message, last_message_at, ai_active, taken_by, taken_at, tags, raw'
        )
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

  useEffect(() => {
    void loadChats();
  }, [loadChats]);

  useEffect(() => {
    if (!activeChatId) return;
    void loadMessages(activeChatId);
  }, [activeChatId, loadMessages]);

  // Realtime: chats list
  useEffect(() => {
    if (readOnlyMode || !companyId) return;
    const channel = supabase
      .channel(`realtime:chats:${companyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chats', filter: `company_id=eq.${companyId}` },
        () => void loadChats()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [companyId, loadChats, readOnlyMode]);

  // Realtime: active chat messages
  useEffect(() => {
    if (readOnlyMode || !activeChatId) return;
    const channel = supabase
      .channel(`realtime:chat_messages:${activeChatId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `chat_id=eq.${activeChatId}` },
        (payload) => {
          const row = payload.new as any;
          if (!row?.id) return;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
          void markRead(activeChatId);
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeChatId, markRead, readOnlyMode]);

  const sendMessage = useCallback(async () => {
    if (!activeChatId) return;
    const content = messageInput.trim();
    if (!content) return;
    setMessageInput('');
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('omni-send', {
        body: { chat_id: activeChatId, content },
      });
      if (fnError) throw fnError;

      const provider = (data as any)?.provider;
      if (provider && provider.ok === false && provider.skipped !== true) {
        const status = provider.status ? `HTTP ${provider.status}` : 'erro';
        setError(`Mensagem salva, mas o provedor recusou o envio (${status}).`);
      }
    } catch (e: any) {
      console.error(e);
      const baseMsg = String(e?.message ?? 'Falha ao enviar mensagem.');
      const status = e?.context?.status;
      const body = e?.context?.body;

      const details =
        typeof status === 'number'
          ? ` (HTTP ${status}${body ? `: ${typeof body === 'string' ? body : JSON.stringify(body)}` : ''})`
          : '';

      setError(`${baseMsg}${details}`);
    }
  }, [activeChatId, messageInput]);

  const toggleAi = useCallback(async () => {
    if (!activeChat) return;
    try {
      const { error: updError } = await supabase
        .from('chats')
        .update({ ai_active: !activeChat.ai_active })
        .eq('id', activeChat.id);
      if (updError) throw updError;
    } catch (e: any) {
      setError(e?.message ?? 'Falha ao atualizar modo IA.');
    }
  }, [activeChat]);

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
    // auto scroll to bottom on message changes
    listBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, activeChatId]);

  if (readOnlyMode || !companyId) {
    return (
      <div className="cr8-card h-[calc(100vh-8rem)] flex items-center justify-center">
        <div className="max-w-md text-center px-6">
          <h2 className="text-xl font-bold text-[hsl(var(--foreground))]">Live Chat</h2>
          <p className="text-[hsl(var(--muted-foreground))] mt-2 text-sm">
            Configure o Supabase para habilitar a central omnichannel (Fase 3).
          </p>
        </div>
      </div>
    );
  }

  const activeBadge = activeChat ? badgeForPlatform(activeChat.platform) : null;

  return (
    <>
      <div className="cr8-card flex h-[calc(100vh-8rem)] overflow-hidden">
        {/* Sidebar */}
        <div className="w-80 border-r border-[hsl(var(--border))] flex flex-col bg-[hsl(var(--card))]">
          <div className="p-4 border-b border-[hsl(var(--border))] space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Conversas</div>
              <button
                onClick={() => setCreateOpen(true)}
                className="p-2 rounded-lg bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--secondary)/0.8)] text-[hsl(var(--foreground))] border border-[hsl(var(--border))]"
                title="Nova conversa"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-[hsl(var(--muted-foreground))]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar conversa..."
                className="w-full pl-10 pr-3 py-2 rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="p-4 text-sm text-[hsl(var(--muted-foreground))]">Carregando conversas...</div>
            )}
            {!loading &&
              filteredSessions.map((session) => {
                const chat = chats.find((c) => c.id === session.id);
                const badge = chat ? badgeForPlatform(chat.platform) : null;
                const isActive = activeChatId === session.id;
                return (
                  <button
                    key={session.id}
                    onClick={() => setActiveChatId(session.id)}
                    className={`w-full text-left p-4 border-b border-[hsl(var(--border))] transition-colors ${
                      isActive ? 'bg-[hsl(var(--secondary))]' : 'hover:bg-[hsl(var(--secondary)/0.6)]'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[hsl(var(--foreground))] text-sm truncate">{session.contactName}</span>
                          {session.unread > 0 && (
                            <span className="h-2 w-2 rounded-full bg-[hsl(var(--primary))]" title="Não lida" />
                          )}
                        </div>
                        <div className="text-xs text-[hsl(var(--muted-foreground))] truncate mt-1">{session.lastMessage}</div>
                      </div>
                      {badge && (
                        <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold ${badge.className}`}>
                          {badge.label}
                        </span>
                      )}
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <div className="flex gap-1 flex-wrap">
                        {(session.tags ?? []).slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] text-[10px] px-1.5 py-0.5 rounded border border-[hsl(var(--border))]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                      {session.aiActive && <Bot className="w-3 h-3 text-[hsl(var(--primary))]" />}
                    </div>
                    {chat?.last_message_at && (
                      <div className="mt-2 text-[10px] text-[hsl(var(--muted-foreground))]">{formatDateTimeShort(chat.last_message_at)}</div>
                    )}
                  </button>
                );
              })}
          </div>
        </div>

        {/* Chat */}
        <div className="flex-1 flex flex-col bg-[hsl(var(--background))]">
          {activeChat ? (
            <>
              <div className="h-16 bg-[hsl(var(--card))] border-b border-[hsl(var(--border))] flex items-center justify-between px-6">
                <div className="flex items-center min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] flex items-center justify-center mr-3">
                    <UserIcon className="w-5 h-5 text-[hsl(var(--foreground))]" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-[hsl(var(--foreground))] truncate">{contactNameFromChat(activeChat)}</h3>
                      {activeBadge && (
                        <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold ${activeBadge.className}`}>
                          {activeBadge.label}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[hsl(var(--muted-foreground))] truncate">
                      {activeChat.external_thread_id ? `Thread: ${activeChat.external_thread_id}` : ''}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {activeChat.taken_by && (
                    <span className="text-xs px-2 py-1 rounded-full bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border))]">
                      {activeChat.taken_by === userId ? 'Assumido por você' : 'Em atendimento'}
                    </span>
                  )}

                  {!activeChat.taken_by ? (
                    <button
                      onClick={() => void takeChat()}
                      className="px-3 py-2 rounded-lg bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--secondary)/0.8)] border border-[hsl(var(--border))] text-sm text-[hsl(var(--foreground))]"
                    >
                      Assumir
                    </button>
                  ) : activeChat.taken_by === userId ? (
                    <button
                      onClick={() => void releaseChat()}
                      className="px-3 py-2 rounded-lg bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--secondary)/0.8)] border border-[hsl(var(--border))] text-sm text-[hsl(var(--foreground))]"
                    >
                      Liberar
                    </button>
                  ) : null}

                  <button
                    onClick={() => void toggleAi()}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--secondary)/0.8)]"
                    title="Alternar modo IA"
                  >
                    <Bot className={`w-4 h-4 ${activeChat.ai_active ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'}`} />
                    <span className="text-xs font-medium text-[hsl(var(--foreground))]">
                      {activeChat.ai_active ? 'IA ativa' : 'IA off'}
                    </span>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {error && <div className="text-sm text-[hsl(var(--destructive))]">{error}</div>}
                {loadingMessages && <div className="text-sm text-[hsl(var(--muted-foreground))]">Carregando mensagens...</div>}

                {messages.map((msg) => {
                  const uiMsg = toChatMessage(msg, activeChat.platform);
                  const isInbound = uiMsg.sender === 'user';
                  return (
                    <div key={uiMsg.id} className={`flex ${isInbound ? 'justify-start' : 'justify-end'}`}>
                      <div
                        className={`max-w-[70%] p-4 rounded-xl shadow-sm text-sm border ${
                          isInbound
                            ? 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] border-[hsl(var(--border))] rounded-tl-none'
                            : 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-[hsl(var(--primary))] rounded-tr-none'
                        }`}
                      >
                        {uiMsg.content}
                        <div className={`text-[10px] mt-1 text-right ${isInbound ? 'text-[hsl(var(--muted-foreground))]' : 'text-[hsl(var(--primary-foreground)/0.8)]'}`}>
                          {formatTime(msg.created_at)}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={listBottomRef} />
              </div>

              <div className="p-4 bg-[hsl(var(--card))] border-t border-[hsl(var(--border))]">
                <div className="flex items-center space-x-3 bg-[hsl(var(--background))] p-2 rounded-xl border border-[hsl(var(--border))] focus-within:ring-2 focus-within:ring-[hsl(var(--ring))] transition-shadow">
                  <button className="p-2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] rounded-lg">
                    <Paperclip className="w-5 h-5" />
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
                    placeholder="Digite sua mensagem..."
                    className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] outline-none"
                  />
                  <button
                    onClick={() => void sendMessage()}
                    className="p-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-lg hover:opacity-90 shadow-sm transition-transform active:scale-95"
                    title="Enviar"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-[hsl(var(--muted-foreground))]">
              <MessageCircle className="w-16 h-16 mb-4 opacity-20" />
              <p>Selecione uma conversa para iniciar</p>
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
