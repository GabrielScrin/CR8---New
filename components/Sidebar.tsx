import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  MessageSquare, 
  BarChart2, 
  Instagram, 
  MessageCircle, 
  Bot, 
  Settings, 
  FileText,
  LogOut
} from 'lucide-react';
import { Role, isClientRole, labelRolePt, normalizeRole } from '../types';

interface SidebarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  role: Role;
  companyName?: string | null;
  companyLogoUrl?: string | null;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, setCurrentView, role, companyName, companyLogoUrl, onLogout }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard Geral', icon: LayoutDashboard },
    { id: 'crm', label: 'CRM & Vendas', icon: Users },
    { id: 'contacts', label: 'Contatos & Leads', icon: FileText },
    { id: 'livechat', label: 'Live Chat', icon: MessageSquare },
    { id: 'forms', label: 'Quiz & Forms', icon: FileText }, // Reusing icon for simplicity
    { id: 'instagram', label: 'Instagram', icon: Instagram },
    { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
    { id: 'ai', label: 'Agente IA', icon: Bot },
    { id: 'traffic', label: 'Análise de Tráfego', icon: BarChart2 },
    { id: 'settings', label: 'Configurações', icon: Settings },
  ];

  const filteredMenuItems =
    isClientRole(role) ? menuItems.filter((item) => item.id === 'dashboard' || item.id === 'traffic') : menuItems;

  const SETTINGS_SUB = [
    { id: 'company', label: 'Empresa e White Label' },
    { id: 'whatsapp', label: 'WhatsApp' },
    { id: 'financeiro', label: 'Financeiro' },
    { id: 'conversoes', label: 'Conversões' },
    { id: 'auditoria', label: 'Auditoria' },
    { id: 'equipe', label: 'Equipe' },
    { id: 'integracoes', label: 'Integrações' },
  ];

  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="h-screen w-64 bg-[hsl(var(--sidebar-background))] text-[hsl(var(--foreground))] flex flex-col fixed left-0 top-0 shadow-xl z-50 border-r border-[hsl(var(--sidebar-border))]">
      <div className="p-6 flex items-center space-x-3 border-b border-[hsl(var(--sidebar-border))]">
        <div className="w-8 h-8 rounded-lg bg-transparent flex items-center justify-center overflow-hidden ring-1 ring-[hsl(var(--sidebar-border))]">
          <img src={companyLogoUrl || '/cr8-logo.svg'} alt="CR8" className="w-8 h-8 object-contain" />
        </div>
        <div className="min-w-0">
          <div className="text-xl font-bold tracking-tight leading-tight">CR8</div>
          {companyName && <div className="text-xs text-[hsl(var(--sidebar-foreground))] opacity-80 truncate">{companyName}</div>}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 space-y-1">
        {filteredMenuItems.map((item) => {
          if (item.id !== 'settings') {
            return (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id)}
                className={`w-full flex items-center px-6 py-3 text-sm font-medium transition-colors ${
                  currentView === item.id
                    ? 'bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))] border-r-4 border-[hsl(var(--accent))]'
                    : 'text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-accent-foreground))]'
                }`}
              >
                <item.icon className="w-5 h-5 mr-3" />
                {item.label}
              </button>
            );
          }

          // settings parent button with dropdown
          const settingsActive = currentView === 'settings' || currentView.startsWith('settings:');
          return (
            <div key={item.id} className="w-full">
              <button
                onClick={() => {
                  // toggle dropdown visibility; also set view to base settings
                  setSettingsOpen((s) => !s);
                  setCurrentView('settings');
                }}
                className={`w-full flex items-center px-6 py-3 text-sm font-medium transition-colors ${
                  settingsActive
                    ? 'bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))] border-r-4 border-[hsl(var(--accent))]'
                    : 'text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-accent-foreground))]'
                }`}
              >
                <item.icon className="w-5 h-5 mr-3" />
                {item.label}
              </button>
              {settingsOpen && (
                <div className="pl-12 pr-4">
                  {SETTINGS_SUB.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setCurrentView(`settings:${s.id}`)}
                      className={`w-full text-left mt-1 mb-1 px-2 py-2 rounded text-sm ${
                        currentView === `settings:${s.id}` ? 'bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-accent-foreground))]' : 'text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))]'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="p-4 border-t border-[hsl(var(--sidebar-border))]">
        <div className="flex items-center mb-4 px-2">
          <div className="w-2 h-2 rounded-full bg-[hsl(var(--accent))] mr-2"></div>
          <span className="text-xs text-[hsl(var(--sidebar-foreground))] uppercase tracking-wider">
            {labelRolePt(normalizeRole(role))}
          </span>
        </div>
        <button 
          onClick={onLogout}
          className="w-full flex items-center px-2 py-2 text-sm text-red-400 hover:bg-[hsl(var(--sidebar-accent))] rounded-md transition-colors"
        >
          <LogOut className="w-4 h-4 mr-3" />
          Sair
        </button>
      </div>
    </div>
  );
};
