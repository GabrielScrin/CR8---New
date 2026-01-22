import { useEffect, useState } from 'react';
import { Layout } from './components/Layout';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { TrafficAnalytics } from './components/TrafficAnalytics';
import { CRM } from './components/CRM';
import { LiveChat } from './components/LiveChat';
import { CompanySetup } from './components/CompanySetup';
import { ContactsLeads } from './components/ContactsLeads';
import { AIAgent } from './components/AIAgent';
import { SettingsView } from './components/SettingsView';
import { Role, User } from './types';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import { loadSelectedCompanyId, saveSelectedCompanyId } from './lib/companySelection';

const PlaceholderView = ({ title }: { title: string }) => (
  <div className="flex flex-col items-center justify-center h-full text-[hsl(var(--muted-foreground))]">
    <div className="text-6xl mb-4 font-thin opacity-20">CR8</div>
    <h3 className="text-xl font-medium text-[hsl(var(--foreground))]">Módulo {title}</h3>
    <p className="mt-2 text-sm">Esta funcionalidade estará disponível na próxima versão.</p>
  </div>
);

const LoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
    <div className="flex flex-col items-center gap-4">
      <div className="h-16 w-16 rounded-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] shadow-lg flex items-center justify-center overflow-hidden">
        <img src="/cr8-logo.svg" alt="CR8" className="h-14 w-14 object-contain" />
      </div>
      <div className="text-center">
        <div className="text-2xl font-extrabold cr8-text-gradient">CR8</div>
        <div className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Carregando sessão…</div>
      </div>
      <div className="h-8 w-8 rounded-full border-2 border-[hsl(var(--border))] border-t-[hsl(var(--primary))] animate-spin" />
    </div>
  </div>
);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState('dashboard');
  const [loadingSession, setLoadingSession] = useState(true);

  // Keep hooks unconditional: enforce client-portal view restrictions via an effect,
  // even during the loading/login/setup renders.
  useEffect(() => {
    if (!user) return;
    if (user.role !== 'empresa') return;
    const allowed = new Set(['dashboard', 'traffic']);
    if (!allowed.has(currentView)) setCurrentView('dashboard');
  }, [currentView, user?.role]);

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
        const [{ data: profile }, { data: memberships }] = await Promise.all([
          supabase.from('users').select('full_name, avatar_url, role').eq('id', sessionUser.id).maybeSingle(),
          supabase.from('company_members').select('company_id,created_at').order('created_at', { ascending: true }),
        ]);

        const membershipIds = (memberships ?? []).map((m: any) => m.company_id).filter(Boolean);
        const preferred = loadSelectedCompanyId(sessionUser.id);
        const companyId = preferred && membershipIds.includes(preferred) ? preferred : membershipIds[0] ?? fallback.companyId;

        return {
          ...fallback,
          name: profile?.full_name || fallback.name,
          avatar: profile?.avatar_url || fallback.avatar,
          role: (profile?.role as Role) || fallback.role,
          companyId,
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

  if (loadingSession) return <LoadingScreen />;

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  if (isSupabaseConfigured() && !user.companyId) {
    return <CompanySetup onDone={(companyId) => setUser({ ...user, companyId })} />;
  }

  const handleCompanyChange = (companyId: string) => {
    saveSelectedCompanyId(user.id, companyId);
    setUser({ ...user, companyId });
  };

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard companyId={user.companyId} variant={user.role === 'empresa' ? 'client' : 'agency'} />;
      case 'traffic':
        return <TrafficAnalytics companyId={user.companyId} />;
      case 'crm':
        return <CRM companyId={user.companyId} />;
      case 'livechat':
        return <LiveChat companyId={user.companyId} userId={user.id} />;
      case 'contacts':
        return <ContactsLeads companyId={user.companyId} />;
      case 'forms':
        return <PlaceholderView title="Quiz & Formulários" />;
      case 'instagram':
        return <PlaceholderView title="Instagram Mirror" />;
      case 'whatsapp':
        return <PlaceholderView title="Disparador WhatsApp" />;
      case 'ai':
        return <AIAgent companyId={user.companyId} userId={user.id} />;
      case 'settings':
        return <SettingsView companyId={user.companyId} role={user.role} />;
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
      onCompanyChange={handleCompanyChange}
    >
      {renderView()}
    </Layout>
  );
}
