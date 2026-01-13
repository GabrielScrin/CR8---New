import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { User, Role } from '../types';
import { Bell, Bot, ChevronDown } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  user: User;
  currentView: string;
  setCurrentView: (view: string) => void;
  onLogout: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, user, currentView, setCurrentView, onLogout }) => {
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] flex font-sans">
      <Sidebar 
        currentView={currentView} 
        setCurrentView={setCurrentView} 
        role={user.role} 
        onLogout={onLogout}
      />

      <main className="flex-1 ml-64 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 bg-[hsl(var(--card))] border-b border-[hsl(var(--border))] flex items-center justify-between px-8 sticky top-0 z-40">
            <h1 className="text-xl font-bold text-[hsl(var(--foreground))] capitalize">
                {currentView === 'ai' ? 'Configuração Agente IA' : currentView.replace('-', ' ')}
            </h1>

            <div className="flex items-center space-x-6">
                <button 
                    onClick={() => setIsAiPanelOpen(!isAiPanelOpen)}
                    className={`flex items-center space-x-2 px-3 py-1.5 rounded-full transition-colors ${isAiPanelOpen ? 'bg-[hsl(var(--primary))] text-white ring-2 ring-[hsl(var(--ring))]' : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]'}`}
                >
                    <Bot className="w-4 h-4" />
                    <span className="text-sm font-medium">IA Helper</span>
                </button>

                <div className="relative">
                    <div className="relative cursor-pointer">
                        <Bell className="w-5 h-5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]" />
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[hsl(var(--card))]"></span>
                    </div>
                </div>

                <div className="flex items-center space-x-3 pl-6 border-l border-[hsl(var(--border))]">
                    <img src={user.avatar || 'https://via.placeholder.com/40'} alt={user.name} className="w-8 h-8 rounded-full bg-[hsl(var(--muted))]" />
                    <div className="hidden md:block">
                        <p className="text-sm font-medium text-[hsl(var(--foreground))] leading-tight">{user.name}</p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))] leading-tight capitalize">{user.role}</p>
                    </div>
                    <ChevronDown className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
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
            {isAiPanelOpen && (
                <div className="absolute top-4 right-8 w-80 bg-[hsl(var(--card))] rounded-xl shadow-2xl border border-[hsl(var(--border))] overflow-hidden z-50 flex flex-col max-h-[600px] animate-in slide-in-from-right-10 duration-200">
                    <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4 text-white flex justify-between items-center">
                        <div className="flex items-center space-x-2">
                             <Bot className="w-5 h-5" />
                             <span className="font-bold">CR8 Assistant</span>
                        </div>
                        <button onClick={() => setIsAiPanelOpen(false)} className="hover:bg-white/20 p-1 rounded">✕</button>
                    </div>
                    <div className="p-4 bg-[hsl(var(--secondary))] text-xs text-[hsl(var(--muted-foreground))] border-b border-[hsl(var(--border))]">
                        Contexto atual: <strong>{currentView}</strong>
                    </div>
                    <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[hsl(var(--background))] min-h-[300px]">
                        <div className="bg-[hsl(var(--card))] p-3 rounded-lg rounded-tl-none shadow-sm text-sm text-[hsl(var(--foreground))] border border-[hsl(var(--border))]">
                            Olá! Estou analisando os dados da tela <strong>{currentView}</strong>. Como posso ajudar a otimizar seus resultados hoje?
                        </div>
                    </div>
                    <div className="p-3 border-t border-[hsl(var(--border))] bg-[hsl(var(--card))]">
                        <input 
                            type="text" 
                            placeholder="Pergunte à IA..."
                            className="w-full px-3 py-2 bg-[hsl(var(--input))] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                        />
                    </div>
                </div>
            )}
        </div>
      </main>
    </div>
  );
};
