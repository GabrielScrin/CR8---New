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
import { QuizForms } from './components/QuizForms';
import { PublicQuiz } from './components/PublicQuiz';
import { WhatsApp } from './components/WhatsApp';
import { Join } from './components/Join';
import { Role, User, isClientRole, normalizeRole } from './types';
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
  const publicQuizId = (() => {
    try {
      const path = window.location.pathname || '';
      const parts = path.split('/').filter(Boolean);
      if (parts.length >= 2 && parts[0] === 'quiz') return parts[1];
      return null;
    } catch {
      return null;
    }
  })();

  const joinToken = (() => {
    try {
      const path = (window.location.pathname || '').replace(/\/+$/, '');
      if (path !== '/join') return null;
      const qs = new URLSearchParams(window.location.search || '');
      return qs.get('token');
    } catch {
      return null;
    }
  })();

  const [user, setUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState('dashboard');
  const [loadingSession, setLoadingSession] = useState(() => !publicQuizId && !joinToken);

  // Keep hooks unconditional: enforce client-portal view restrictions via an effect,
  // even during the loading/login/setup renders.
  useEffect(() => {
    if (!user) return;
    if (!isClientRole(user.role)) return;
    const allowed = new Set(['dashboard', 'traffic']);
    if (!allowed.has(currentView)) setCurrentView('dashboard');
  }, [currentView, user?.role]);

  useEffect(() => {
    if (publicQuizId) return;
    if (joinToken) return;
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
        // If Phase 5 invites exist, accept any pending invites for this user (idempotent).
        // Ignore failures when the migration isn't applied yet.
        try {
          await supabase.rpc('accept_company_invites_for_current_user');
        } catch {
          // ignore
        }

        const [{ data: profile }, { data: memberships }] = await Promise.all([
          supabase.from('users').select('full_name, avatar_url, role').eq('id', sessionUser.id).maybeSingle(),
          supabase
            .from('company_members')
            .select('company_id,created_at,member_role')
            .eq('user_id', sessionUser.id)
            .order('created_at', { ascending: true }),
        ]);

        const membershipIds = (memberships ?? []).map((m: any) => m.company_id).filter(Boolean);
        const preferred = loadSelectedCompanyId(sessionUser.id);

        // Prefer last selected company (localStorage) even if the membership list fails to load for some reason.
        // If the user isn't a member, subsequent queries will naturally be blocked by RLS.
        const companyId =
          (preferred && membershipIds.includes(preferred) ? preferred : undefined) ??
          preferred ??
          membershipIds[0] ??
          fallback.companyId;

        const membershipForSelectedCompany = (memberships ?? []).find((m: any) => m.company_id === companyId);
        const companyRole = (membershipForSelectedCompany?.member_role as Role | undefined) ?? null;

        return {
          ...fallback,
          name: profile?.full_name || fallback.name,
          avatar: profile?.avatar_url || fallback.avatar,
          // Role should be per-company (company_members.member_role), falling back to profile role for legacy paths.
          role: normalizeRole(companyRole || (profile?.role as Role) || fallback.role),
          companyId,
        };
      } catch {
        // As a last resort, try to keep the user's last selected company so they don't get stuck in "Primeiro Setup"
        // on refresh/tab switch.
        const preferred = loadSelectedCompanyId(sessionUser.id);
        return preferred ? { ...fallback, companyId: preferred } : fallback;
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

  if (publicQuizId) return <PublicQuiz publicId={publicQuizId} />;

  if (joinToken) return <Join token={joinToken} />;

  if (loadingSession) return <LoadingScreen />;

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  if (isSupabaseConfigured() && !user.companyId) {
    return (
      <CompanySetup
        onDone={(companyId) => {
          saveSelectedCompanyId(user.id, companyId);
          // Set immediately so refreshes / tab switches don't bounce back to setup.
          setUser({ ...user, companyId });

          void (async () => {
            let nextRole: Role = user.role;

            const { data: membership } = await supabase
              .from('company_members')
              .select('member_role')
              .eq('user_id', user.id)
              .eq('company_id', companyId)
              .maybeSingle();

            if (membership?.member_role) nextRole = membership.member_role as Role;

            setUser({ ...user, companyId, role: nextRole });
          })();
        }}
      />
    );
  }

  const handleCompanyChange = (companyId: string) => {
    saveSelectedCompanyId(user.id, companyId);
    // Optimistic update: keep the selected company immediately.
    setUser({ ...user, companyId });

    void (async () => {
      let nextRole: Role = user.role;
      if (isSupabaseConfigured()) {
        const { data: membership } = await supabase
          .from('company_members')
          .select('member_role')
          .eq('user_id', user.id)
          .eq('company_id', companyId)
          .maybeSingle();

        if (membership?.member_role) nextRole = membership.member_role as Role;
      }

      setUser({ ...user, companyId, role: nextRole });
    })();
  };

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard companyId={user.companyId} variant={isClientRole(user.role) ? 'client' : 'agency'} />;
      case 'traffic':
        return <TrafficAnalytics companyId={user.companyId} />;
      case 'crm':
        return <CRM companyId={user.companyId} />;
      case 'livechat':
        return <LiveChat companyId={user.companyId} userId={user.id} />;
      case 'contacts':
        return <ContactsLeads companyId={user.companyId} />;
      case 'forms':
        return <QuizForms companyId={user.companyId} />;
      case 'instagram':
        return <PlaceholderView title="Instagram Mirror" />;
      case 'whatsapp':
        return <WhatsApp companyId={user.companyId} role={user.role} />;
      case 'ai':
        return <AIAgent companyId={user.companyId} userId={user.id} />;
      case 'settings':
        return <SettingsView companyId={user.companyId} role={user.role} userId={user.id} />;
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
