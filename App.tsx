import { useEffect, useState } from 'react';
import { Layout } from './components/Layout';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { TrafficAnalytics } from './components/TrafficAnalytics';
import { CRM } from './components/CRM';
import { LiveChat } from './components/LiveChat';
import { CompanySetup } from './components/CompanySetup';
import { Role, User } from './types';
import { isSupabaseConfigured, supabase } from './lib/supabase';

const PlaceholderView = ({ title }: { title: string }) => (
  <div className="flex flex-col items-center justify-center h-full text-gray-400">
    <div className="text-6xl mb-4 font-thin opacity-20">CR8</div>
    <h3 className="text-xl font-medium text-gray-600">Módulo {title}</h3>
    <p className="mt-2 text-sm">Esta funcionalidade estará disponível na próxima versão.</p>
  </div>
);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState('dashboard');
  const [loadingSession, setLoadingSession] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoadingSession(false);
      return;
    }

    const hydrateUser = async (sessionUser: any): Promise<User> => {
      const fallback: User = {
        id: sessionUser.id,
        name: sessionUser.user_metadata?.full_name || sessionUser.email || 'Usuário',
        email: sessionUser.email || '',
        role: 'gestor',
        avatar: sessionUser.user_metadata?.avatar_url,
      };

      try {
        const [{ data: profile }, { data: membership }] = await Promise.all([
          supabase.from('users').select('full_name, avatar_url, role').eq('id', sessionUser.id).maybeSingle(),
          supabase.from('company_members').select('company_id').limit(1).maybeSingle(),
        ]);

        return {
          ...fallback,
          name: profile?.full_name || fallback.name,
          avatar: profile?.avatar_url || fallback.avatar,
          role: (profile?.role as Role) || fallback.role,
          companyId: membership?.company_id || fallback.companyId,
        };
      } catch {
        return fallback;
      }
    };

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setUser(await hydrateUser(session.user));
      }
      setLoadingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        void hydrateUser(session.user).then(setUser);
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

  if (isSupabaseConfigured() && !user.companyId) {
    return <CompanySetup onDone={(companyId) => setUser({ ...user, companyId })} />;
  }

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard companyId={user.companyId} />;
      case 'traffic':
        return <TrafficAnalytics companyId={user.companyId} />;
      case 'crm':
        return <CRM companyId={user.companyId} />;
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
    <Layout user={user} currentView={currentView} setCurrentView={setCurrentView} onLogout={handleLogout}>
      {renderView()}
    </Layout>
  );
}
