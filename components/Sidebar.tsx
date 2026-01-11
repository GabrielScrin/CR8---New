import React from 'react';
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
import { Role } from '../types';

interface SidebarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  role: Role;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, setCurrentView, role, onLogout }) => {
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

  return (
    <div className="h-screen w-64 bg-slate-900 text-white flex flex-col fixed left-0 top-0 shadow-xl z-50">
      <div className="p-6 flex items-center space-x-3 border-b border-slate-800">
        <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center font-bold text-xl">8</div>
        <span className="text-xl font-bold tracking-tight">CR-8</span>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 space-y-1">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setCurrentView(item.id)}
            className={`w-full flex items-center px-6 py-3 text-sm font-medium transition-colors ${
              currentView === item.id
                ? 'bg-indigo-600 text-white border-r-4 border-indigo-300'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <item.icon className="w-5 h-5 mr-3" />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center mb-4 px-2">
          <div className="w-2 h-2 rounded-full bg-green-500 mr-2"></div>
          <span className="text-xs text-slate-400 uppercase tracking-wider">{role}</span>
        </div>
        <button 
          onClick={onLogout}
          className="w-full flex items-center px-2 py-2 text-sm text-red-400 hover:bg-slate-800 rounded-md transition-colors"
        >
          <LogOut className="w-4 h-4 mr-3" />
          Sair
        </button>
      </div>
    </div>
  );
};