import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { TrafficAnalytics } from './components/TrafficAnalytics';
import { CRM } from './components/CRM';
import { LiveChat } from './components/LiveChat';
import { User, Role } from './types';
import { supabase, isSupabaseConfigured } from './lib/supabase';

// Simple placeholder components for views not fully implemented in this demo
const PlaceholderView = ({ title }: { title: string }) => (
  <div className="flex flex-col items-center justify-center h-full text-gray-400">
    <div className="text-6xl mb-4 font-thin opacity-20">CR-8</div>
    <h3 className="text-xl font-medium text-gray-600">Módulo {title}</h3>
    <p className="mt-2 text-sm">Esta funcionalidade estará disponível na próxima versão.</p>
  </div>
);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState('dashboard');
  const [loadingSession, setLoadingSession] = useState(true);

  useEffect(() => {
    // If supabase isn't configured, skip session check
    if (!isSupabaseConfigured()) {
        setLoadingSession(false);
        return;
    }

    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({
            id: session.user.id,
            name: session.user.user_metadata.full_name || session.user.email || 'Usuário',
            email: session.user.email || '',
            role: 'gestor', // Default role for now
            avatar: session.user.user_metadata.avatar_url
        });
      }
      setLoadingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
            setUser({
                id: session.user.id,
                name: session.user.user_metadata.full_name || session.user.email || 'Usuário',
                email: session.user.email || '',
                role: 'gestor',
                avatar: session.user.user_metadata.avatar_url
            });
        } else {
            setUser(null);
        }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = (userData: User) => {
    setUser(userData);
  };

  const handleLogout = async () => {
    if (isSupabaseConfigured()) {
        await supabase.auth.signOut();
    }
    setUser(null);
    setCurrentView('dashboard');
  };

  if (loadingSession) {
      return <div className="min-h-screen flex items-center justify-center bg-gray-100 text-gray-500">Carregando sessão...</div>;
  }

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard />;
      case 'traffic':
        return <TrafficAnalytics />;
      case 'crm':
        return <CRM />;
      case 'livechat':
        return <LiveChat />;
      case 'contacts':
        return <PlaceholderView title="Contatos & Leads" />;
      case 'forms':
        return <PlaceholderView title="Quiz & Formulários" />;
      case 'instagram':
        return <PlaceholderView title="Instagram Mirror" />;
      case 'whatsapp':
        return <PlaceholderView title="Disparador WhatsApp" />;
      case 'ai':
        return <PlaceholderView title="Configuração de Agente" />;
      case 'settings':
        return <PlaceholderView title="Configurações Gerais" />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <Layout 
      user={user} 
      currentView={currentView} 
      setCurrentView={setCurrentView}
      onLogout={handleLogout}
    >
      {renderView()}
    </Layout>
  );
}