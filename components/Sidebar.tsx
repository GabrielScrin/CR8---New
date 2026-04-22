import React, { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  BarChart2,
  ExternalLink,
  Instagram,
  MessageCircle,
  Bot,
  Settings,
  FileText,
  LogOut,
  ChevronDown,
  Building2,
  DollarSign,
  Target,
  ClipboardCheck,
  Puzzle,
  UserCog,
  MonitorSmartphone,
} from 'lucide-react';
import { Role, getAllowedViews, getAllowedSettingsSections, normalizeRole, roleConfig } from '../types';

interface SidebarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  role: Role;
  companyName?: string | null;
  companyLogoUrl?: string | null;
  onLogout: () => void;
}

// All navigation items with section grouping
type NavItem = { id: string; label: string; icon: React.ElementType; group: string };

const ALL_NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard',        icon: LayoutDashboard, group: 'principal' },
  { id: 'traffic',   label: 'Trafego',           icon: BarChart2,       group: 'principal' },
  { id: 'crm',       label: 'CRM & Vendas',      icon: Users,           group: 'comercial' },
  { id: 'contacts',  label: 'Contatos',          icon: FileText,        group: 'comercial' },
  { id: 'livechat',  label: 'Live Chat',         icon: MessageSquare,   group: 'comunicacao' },
  { id: 'whatsapp',  label: 'WhatsApp',          icon: MessageCircle,   group: 'comunicacao' },
  { id: 'instagram', label: 'Instagram',         icon: Instagram,       group: 'comunicacao' },
  { id: 'forms',     label: 'Quiz & Forms',      icon: FileText,        group: 'ferramentas' },
  { id: 'ai',        label: 'Agente IA',         icon: Bot,             group: 'ferramentas' },
  { id: 'portal',    label: 'Portal do Cliente', icon: MonitorSmartphone, group: 'ferramentas' },
];

const GROUP_LABELS: Record<string, string> = {
  principal:   'Visao Geral',
  comercial:   'Comercial',
  comunicacao: 'Comunicacao',
  ferramentas: 'Ferramentas',
};

const BENCHMARK_URL = '/benchmark-contas-2026/';

const ALL_SETTINGS_SUBS = [
  { id: 'company',     label: 'Empresa',       icon: Building2 },
  { id: 'whatsapp',    label: 'WhatsApp',      icon: MessageCircle },
  { id: 'financeiro',  label: 'Financeiro',    icon: DollarSign },
  { id: 'conversoes',  label: 'Conversoes',    icon: Target },
  { id: 'auditoria',   label: 'Auditoria',     icon: ClipboardCheck },
  { id: 'equipe',      label: 'Equipe',        icon: UserCog },
  { id: 'integracoes', label: 'Integracoes',   icon: Puzzle },
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  setCurrentView,
  role,
  companyName,
  companyLogoUrl,
  onLogout,
}) => {
  const [settingsOpen, setSettingsOpen] = useState(false);

  const normalizedRole = normalizeRole(role);
  const allowedViews = getAllowedViews(normalizedRole);
  const allowedSettings = getAllowedSettingsSections(normalizedRole);
  const { label: roleLabel, badgeClass } = roleConfig[normalizedRole];

  // Filter and group nav items
  const visibleItems = ALL_NAV_ITEMS.filter((item) => allowedViews.has(item.id));
  const visibleSettings = ALL_SETTINGS_SUBS.filter((s) => allowedSettings.has(s.id));
  const showSettings = allowedViews.has('settings');

  // Build groups in order
  const groups = ['principal', 'comercial', 'comunicacao', 'ferramentas'];
  const itemsByGroup: Record<string, NavItem[]> = {};
  for (const item of visibleItems) {
    if (!itemsByGroup[item.group]) itemsByGroup[item.group] = [];
    itemsByGroup[item.group].push(item);
  }

  const settingsActive = currentView === 'settings' || currentView.startsWith('settings:');

  return (
    <div className="h-screen w-64 flex flex-col fixed left-0 top-0 z-50 border-r border-[hsl(var(--sidebar-border))]"
         style={{ background: 'linear-gradient(180deg, hsl(220 20% 8%) 0%, hsl(220 18% 7%) 100%)' }}>

      {/* Logo */}
      <div className="px-5 py-5 flex items-center gap-3 border-b border-[hsl(var(--sidebar-border))]">
        <div className="h-8 w-8 rounded-xl bg-[hsl(var(--primary))]/10 border border-[hsl(var(--primary))]/30 flex items-center justify-center overflow-hidden shrink-0">
          <img src={companyLogoUrl || '/cr8-logo.svg'} alt="CR8" className="h-7 w-7 object-contain" />
        </div>
        <div className="min-w-0">
          <div className="text-[15px] font-extrabold tracking-tight leading-none">CR8</div>
          {companyName && (
            <div className="text-[11px] text-[hsl(var(--sidebar-foreground))]/60 truncate mt-0.5">{companyName}</div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 cr8-scroll">
        {groups.map((group) => {
          const items = itemsByGroup[group];
          if (!items || items.length === 0) return null;
          return (
            <div key={group} className="mb-3">
              <p className="px-5 mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--sidebar-foreground))]/35 select-none">
                {GROUP_LABELS[group]}
              </p>
              {items.map((item) => {
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setCurrentView(item.id)}
                    className={`w-full flex items-center gap-3 px-4 mx-1 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                      isActive
                        ? 'bg-[hsl(var(--sidebar-primary))] text-white shadow-sm shadow-[hsl(var(--primary))]/20'
                        : 'text-[hsl(var(--sidebar-foreground))]/70 hover:text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))]'
                    }`}
                    style={{ width: 'calc(100% - 8px)' }}
                  >
                    <item.icon className={`h-4 w-4 shrink-0 ${isActive ? 'opacity-100' : 'opacity-60'}`} />
                    {item.label}
                    {isActive && (
                      <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent))]" />
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}

        <div className="mb-3">
          <p className="px-5 mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--sidebar-foreground))]/35 select-none">
            Relatorios
          </p>
          <a
            href={BENCHMARK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center gap-3 px-4 mx-1 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 text-[hsl(var(--sidebar-foreground))]/70 hover:text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))]"
            style={{ width: 'calc(100% - 8px)' }}
          >
            <BarChart2 className="h-4 w-4 shrink-0 opacity-60" />
            <span className="flex-1">Benchmark</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </a>
        </div>

        {/* Settings */}
        {showSettings && (
          <div className="mb-3">
            <p className="px-5 mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--sidebar-foreground))]/35 select-none">
              Sistema
            </p>
            <button
              onClick={() => {
                setSettingsOpen((s) => !s);
                setCurrentView('settings');
              }}
              className={`w-full flex items-center gap-3 px-4 mx-1 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                settingsActive
                  ? 'bg-[hsl(var(--sidebar-primary))] text-white shadow-sm shadow-[hsl(var(--primary))]/20'
                  : 'text-[hsl(var(--sidebar-foreground))]/70 hover:text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))]'
              }`}
              style={{ width: 'calc(100% - 8px)' }}
            >
              <Settings className={`h-4 w-4 shrink-0 ${settingsActive ? 'opacity-100' : 'opacity-60'}`} />
              <span className="flex-1 text-left">Configuracoes</span>
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 opacity-60 transition-transform duration-200 ${settingsOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {settingsOpen && visibleSettings.length > 0 && (
              <div className="mt-1 ml-3 pl-4 border-l border-[hsl(var(--sidebar-border))] space-y-0.5">
                {visibleSettings.map((s) => {
                  const isActive = currentView === `settings:${s.id}`;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setCurrentView(`settings:${s.id}`)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-accent-foreground))]'
                          : 'text-[hsl(var(--sidebar-foreground))]/60 hover:text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))]'
                      }`}
                    >
                      <s.icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                      {s.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Footer: role badge + logout */}
      <div className="px-4 pb-4 pt-3 border-t border-[hsl(var(--sidebar-border))]">
        <div className="flex items-center justify-between mb-3">
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-widest ${badgeClass}`}>
            {roleLabel}
          </span>
          <div className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-[hsl(var(--sidebar-foreground))]/40">online</span>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-red-400/80 hover:text-red-400 hover:bg-red-500/10 transition-all"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sair da conta
        </button>
      </div>
    </div>
  );
};
