import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { User } from '../types';
import { Bell, Bot, ChevronDown } from 'lucide-react';
import { getSupabaseAnonKey, getSupabaseUrl, isSupabaseConfigured, supabase } from '../lib/supabase';
import { loadLocalAiSettings } from '../lib/aiLocal';

interface LayoutProps {
  children: React.ReactNode;
  user: User;
  currentView: string;
  setCurrentView: (view: string) => void;
  onLogout: () => void;
  onCompanyChange: (companyId: string) => void;
}

type CompanyOption = {
  id: string;
  name: string;
  brand_name?: string | null;
  brand_logo_url?: string | null;
  brand_primary_color?: string | null;
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const hexToHsl = (hex: string): { h: number; s: number; l: number } | null => {
  const raw = hex.trim();
  if (!raw) return null;

  const v = raw.startsWith('#') ? raw.slice(1) : raw;
  const isShort = v.length === 3;
  const isLong = v.length === 6;
  if (!isShort && !isLong) return null;

  const full = isShort ? v.split('').map((c) => c + c).join('') : v;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if (![r, g, b].every((n) => Number.isFinite(n))) return null;

  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));

  return {
    h: Math.round(h),
    s: Math.round(clamp01(s) * 100),
    l: Math.round(clamp01(l) * 100),
  };
};

const applyBrandPrimaryColor = (hex: string | null | undefined) => {
  const root = document.documentElement;
  const style = root.style;

  if (!hex) {
    style.removeProperty('--primary');
    style.removeProperty('--ring');
    style.removeProperty('--sidebar-primary');
    style.removeProperty('--gradient-primary');
    style.removeProperty('--shadow-glow');
    return;
  }

  const hsl = hexToHsl(hex);
  if (!hsl) return;

  const primary = `${hsl.h} ${hsl.s}% ${hsl.l}%`;
  style.setProperty('--primary', primary);
  style.setProperty('--ring', primary);
  style.setProperty('--sidebar-primary', primary);

  const h2 = (hsl.h + 20) % 360;
  const l2 = Math.max(18, Math.min(72, hsl.l + 8));
  style.setProperty('--gradient-primary', `linear-gradient(135deg, hsl(${primary}) 0%, hsl(${h2} ${hsl.s}% ${l2}%) 100%)`);
  style.setProperty('--shadow-glow', `0 0 20px -5px hsl(${primary} / 0.35)`);
};

export const Layout: React.FC<LayoutProps> = ({ children, user, currentView, setCurrentView, onLogout, onCompanyChange }) => {
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiMessages, setAiMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; bullets?: string[] }>>([
    {
      role: 'assistant',
      content: 'Olá! Sou o CR8 Assistant. Me diga o que você quer analisar/decidir e eu te ajudo com hipóteses e próximos passos.',
    },
  ]);
  const aiBottomRef = useRef<HTMLDivElement | null>(null);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companiesError, setCompaniesError] = useState<string | null>(null);

  const canUseAi = useMemo(() => isSupabaseConfigured() && Boolean(user.companyId), [user.companyId]);
  const isClientPortal = useMemo(() => user.role === 'empresa', [user.role]);
  const selectedCompany = useMemo(() => companies.find((c) => c.id === user.companyId) ?? null, [companies, user.companyId]);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setCompanies([]);
      setCompaniesError(null);
      return;
    }

    let alive = true;
    const fetchCompanies = async () => {
      try {
        setCompaniesError(null);
        const preferredSelect = 'id,name,brand_name,brand_logo_url,brand_primary_color';
        let data: any[] | null = null;
        let error: any = null;

        {
          const res = await supabase.from('companies').select(preferredSelect).order('created_at', { ascending: true });
          data = (res.data as any[] | null) ?? null;
          error = res.error;
        }

        if (error && String(error.message || '').toLowerCase().includes('does not exist')) {
          const res = await supabase.from('companies').select('id,name').order('created_at', { ascending: true });
          data = (res.data as any[] | null) ?? null;
          error = res.error;
        }

        if (error) throw error;
        if (!alive) return;
        const rows = (data ?? []).map((d: any) => ({
          id: d.id,
          name: d.name ?? 'Empresa',
          brand_name: d.brand_name ?? null,
          brand_logo_url: d.brand_logo_url ?? null,
          brand_primary_color: d.brand_primary_color ?? null,
        }));
        setCompanies(rows);
      } catch (e: any) {
        if (!alive) return;
        setCompanies([]);
        setCompaniesError(e?.message ?? 'Erro ao carregar empresas.');
      }
    };

    void fetchCompanies();

    return () => {
      alive = false;
    };
  }, [user.id]);

  useEffect(() => {
    // White label primary color per selected company
    if (!isSupabaseConfigured()) return;
    applyBrandPrimaryColor(selectedCompany?.brand_primary_color ?? null);
  }, [selectedCompany?.brand_primary_color]);

  useEffect(() => {
    if (!isAiPanelOpen) return;
    aiBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages.length, isAiPanelOpen]);

  useEffect(() => {
    if (isClientPortal) setIsAiPanelOpen(false);
  }, [isClientPortal]);

  const sendAi = async () => {
    const text = aiInput.trim();
    if (!text) return;

    setAiInput('');
    setAiError(null);
    setAiMessages((prev) => [...prev, { role: 'user', content: text }]);

    if (!canUseAi) {
      setAiMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'IA indisponível: configure o Supabase/empresa e salve sua API Key em Agente IA.',
        },
      ]);
      return;
    }

    const local = loadLocalAiSettings(user.id);
    if (!local?.apiKey) {
      setAiMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Falta sua API Key. Vá em Agente IA e salve a chave do provedor (fica só no seu navegador).',
        },
      ]);
      return;
    }

    setAiBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Sessão inválida. Faça logout/login e tente novamente.');

      const res = await fetch(`${getSupabaseUrl()}/functions/v1/ai-assistant`, {
        method: 'POST',
        headers: {
          apikey: getSupabaseAnonKey(),
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'helper',
          company_id: user.companyId,
          context_view: currentView,
          user_message: text,
          provider: local.provider,
          api_key: local.apiKey,
          model: local.model,
          access_token: accessToken,
        }),
      });

      const payloadText = await res.text().catch(() => '');
      const payload = payloadText ? JSON.parse(payloadText) : {};
      if (!res.ok) {
        throw Object.assign(new Error(payload?.error ?? 'Falha ao chamar IA.'), {
          context: { status: res.status, body: payload },
        });
      }

      const result = (payload as any)?.result ?? {};
      const reply =
        typeof result?.reply === 'string'
          ? result.reply
          : typeof result?.summary === 'string'
            ? result.summary
            : typeof result === 'string'
              ? result
              : JSON.stringify(result);

      const bullets = Array.isArray(result?.bullets)
        ? result.bullets
        : Array.isArray(result?.highlights)
          ? result.highlights
          : undefined;

      setAiMessages((prev) => [...prev, { role: 'assistant', content: reply, bullets }]);
    } catch (e: any) {
      const baseMsg = String(e?.message ?? 'Falha ao chamar IA.');
      const status = e?.context?.status;
      const body = e?.context?.body;
      const details =
        typeof status === 'number'
          ? ` (HTTP ${status}${body ? `: ${typeof body === 'string' ? body : JSON.stringify(body)}` : ''})`
          : '';
      setAiError(`${baseMsg}${details}`);
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] flex font-sans">
      <Sidebar 
        currentView={currentView} 
        setCurrentView={setCurrentView} 
        role={user.role} 
        companyName={selectedCompany?.brand_name ?? selectedCompany?.name ?? null}
        companyLogoUrl={selectedCompany?.brand_logo_url ?? null}
        onLogout={onLogout}
      />

      <main className="flex-1 ml-64 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 bg-[hsl(var(--card))] border-b border-[hsl(var(--border))] flex items-center justify-between px-8 sticky top-0 z-40">
            <div className="flex items-center gap-4 min-w-0">
              <h1 className="text-xl font-bold text-[hsl(var(--foreground))] capitalize truncate">
                {currentView === 'ai' ? 'Agente IA' : currentView.replace('-', ' ')}
              </h1>

              {isSupabaseConfigured() && user.companyId && (
                <div className="hidden lg:flex items-center gap-2 min-w-0">
                  {isClientPortal ? (
                    <span className="text-sm font-semibold text-[hsl(var(--foreground))] truncate max-w-[320px]">
                      {(selectedCompany?.brand_name ?? selectedCompany?.name) || 'Empresa'}
                    </span>
                  ) : (
                    <>
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">Empresa:</span>
                      {companies.length > 1 ? (
                        <select
                          value={user.companyId}
                          onChange={(e) => onCompanyChange(e.target.value)}
                          className="max-w-[320px] truncate rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                        >
                          {companies.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.brand_name ?? c.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-sm font-semibold text-[hsl(var(--foreground))] truncate max-w-[320px]">
                          {(selectedCompany?.brand_name ?? selectedCompany?.name) || 'Empresa'}
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}

              {companiesError && <span className="text-xs text-[hsl(var(--destructive))]">{companiesError}</span>}
            </div>

            <div className="flex items-center space-x-6">
                {!isClientPortal && (
                  <button
                    onClick={() => setIsAiPanelOpen(!isAiPanelOpen)}
                    className={`flex items-center space-x-2 px-3 py-1.5 rounded-full transition-colors ${isAiPanelOpen ? 'bg-[hsl(var(--primary))] text-white ring-2 ring-[hsl(var(--ring))]' : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]'}`}
                  >
                    <Bot className="w-4 h-4" />
                    <span className="text-sm font-medium">IA Helper</span>
                  </button>
                )}

                {!isClientPortal && (
                  <div className="relative">
                    <div className="relative cursor-pointer">
                      <Bell className="w-5 h-5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]" />
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[hsl(var(--card))]"></span>
                    </div>
                  </div>
                )}

                <div className="flex items-center space-x-3 pl-6 border-l border-[hsl(var(--border))]">
                    <img src={user.avatar || 'https://via.placeholder.com/40'} alt={user.name} className="w-8 h-8 rounded-full bg-[hsl(var(--muted))]" />
                    <div className="hidden md:block">
                        <p className="text-sm font-medium text-[hsl(var(--foreground))] leading-tight">{user.name}</p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))] leading-tight capitalize">{user.role}</p>
                    </div>
                    {!isClientPortal && <ChevronDown className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />}
                </div>
            </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 p-8 overflow-y-auto relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentView}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
            
            {/* AI Floating Panel */}
             {isAiPanelOpen && !isClientPortal && (
                 <div className="absolute top-4 right-8 w-80 bg-[hsl(var(--card))] rounded-xl shadow-2xl border border-[hsl(var(--border))] overflow-hidden z-50 flex flex-col max-h-[600px] animate-in slide-in-from-right-10 duration-200">
                     <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4 text-white flex justify-between items-center">
                         <div className="flex items-center space-x-2">
                              <Bot className="w-5 h-5" />
                              <span className="font-bold">CR8 Assistant</span>
                         </div>
                         <button
                           onClick={() => setIsAiPanelOpen(false)}
                           className="hover:bg-white/20 p-1 rounded"
                           aria-label="Fechar"
                         >
                           ✕
                         </button>
                     </div>
                     <div className="p-4 bg-[hsl(var(--secondary))] text-xs text-[hsl(var(--muted-foreground))] border-b border-[hsl(var(--border))]">
                         Contexto atual: <strong>{currentView}</strong>
                     </div>
                     <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[hsl(var(--background))] min-h-[240px]">
                       {!canUseAi && (
                         <div className="text-xs text-[hsl(var(--muted-foreground))]">
                           IA indisponível (sem Supabase/empresa). Para habilitar: configure o Supabase no app e defina a secret{' '}
                           <span className="font-mono">OPENAI_API_KEY</span> no Supabase.
                         </div>
                       )}

                       {aiMessages.map((m, idx) => {
                         const isUser = m.role === 'user';
                         return (
                           <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                             <div
                               className={`max-w-[90%] p-3 rounded-lg shadow-sm text-sm border ${
                                 isUser
                                   ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-[hsl(var(--primary))] rounded-tr-none'
                                   : 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] border-[hsl(var(--border))] rounded-tl-none'
                               }`}
                             >
                               <div className="whitespace-pre-wrap">{m.content}</div>
                               {m.bullets && m.bullets.length > 0 && (
                                 <ul className="mt-2 space-y-1 list-disc pl-5 text-xs opacity-90">
                                   {m.bullets.slice(0, 6).map((b) => (
                                     <li key={b}>{b}</li>
                                   ))}
                                 </ul>
                               )}
                             </div>
                           </div>
                         );
                       })}
                       {aiBusy && <div className="text-xs text-[hsl(var(--muted-foreground))]">Pensando...</div>}
                       {aiError && <div className="text-xs text-[hsl(var(--destructive))]">{aiError}</div>}
                       <div ref={aiBottomRef} />
                     </div>

                     <div className="p-3 border-t border-[hsl(var(--border))] bg-[hsl(var(--card))]">
                       <form
                         onSubmit={(e) => {
                           e.preventDefault();
                           void sendAi();
                         }}
                         className="flex gap-2"
                       >
                         <input
                           type="text"
                           value={aiInput}
                           onChange={(e) => setAiInput(e.target.value)}
                           placeholder="Pergunte à IA..."
                           className="flex-1 px-3 py-2 bg-[hsl(var(--input))] border border-[hsl(var(--border))] rounded-lg text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                         />
                         <button
                           type="submit"
                           disabled={aiBusy}
                           className="px-3 py-2 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm hover:opacity-90 disabled:opacity-50"
                         >
                           Enviar
                         </button>
                       </form>
                     </div>
                 </div>
             )}
        </div>
      </main>
    </div>
  );
};
