import React, { useState } from 'react';
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
    <div className="min-h-screen bg-gray-100 flex font-sans">
      <Sidebar 
        currentView={currentView} 
        setCurrentView={setCurrentView} 
        role={user.role} 
        onLogout={onLogout}
      />

      <main className="flex-1 ml-64 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8 sticky top-0 z-40">
            <h1 className="text-xl font-bold text-gray-800 capitalize">
                {currentView === 'ai' ? 'Configuração Agente IA' : currentView.replace('-', ' ')}
            </h1>

            <div className="flex items-center space-x-6">
                <button 
                    onClick={() => setIsAiPanelOpen(!isAiPanelOpen)}
                    className={`flex items-center space-x-2 px-3 py-1.5 rounded-full transition-colors ${isAiPanelOpen ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                    <Bot className="w-4 h-4" />
                    <span className="text-sm font-medium">IA Helper</span>
                </button>

                <div className="relative">
                    <div className="relative cursor-pointer">
                        <Bell className="w-5 h-5 text-gray-500 hover:text-gray-700" />
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
                    </div>
                </div>

                <div className="flex items-center space-x-3 pl-6 border-l border-gray-200">
                    <img src={user.avatar || 'https://via.placeholder.com/40'} alt={user.name} className="w-8 h-8 rounded-full bg-gray-200" />
                    <div className="hidden md:block">
                        <p className="text-sm font-medium text-gray-700 leading-tight">{user.name}</p>
                        <p className="text-xs text-gray-500 leading-tight capitalize">{user.role}</p>
                    </div>
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                </div>
            </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 p-8 overflow-y-auto relative">
            {children}
            
            {/* AI Floating Panel */}
            {isAiPanelOpen && (
                <div className="absolute top-4 right-8 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-50 flex flex-col max-h-[600px] animate-in slide-in-from-right-10 duration-200">
                    <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4 text-white flex justify-between items-center">
                        <div className="flex items-center space-x-2">
                             <Bot className="w-5 h-5" />
                             <span className="font-bold">CR-8 Assistant</span>
                        </div>
                        <button onClick={() => setIsAiPanelOpen(false)} className="hover:bg-white/20 p-1 rounded">✕</button>
                    </div>
                    <div className="p-4 bg-indigo-50 text-xs text-indigo-800 border-b border-indigo-100">
                        Contexto atual: <strong>{currentView}</strong>
                    </div>
                    <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-gray-50 min-h-[300px]">
                        <div className="bg-white p-3 rounded-lg rounded-tl-none shadow-sm text-sm text-gray-700 border border-gray-200">
                            Olá! Estou analisando os dados da tela <strong>{currentView}</strong>. Como posso ajudar a otimizar seus resultados hoje?
                        </div>
                    </div>
                    <div className="p-3 border-t border-gray-200 bg-white">
                        <input 
                            type="text" 
                            placeholder="Pergunte à IA..."
                            className="w-full px-3 py-2 bg-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                </div>
            )}
        </div>
      </main>
    </div>
  );
};