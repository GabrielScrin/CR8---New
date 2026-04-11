import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Instagram as InstagramIcon, LayoutDashboard, Grid3X3, GitMerge, RefreshCw, AlertTriangle, AlertCircle, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { clearIgTokenCache, setActiveIgCompany } from '../lib/instagramToken';
import { User } from '../types';
import { InstagramConnectBanner } from './features/instagram/components/InstagramConnectBanner';
import { InstagramHeader } from './features/instagram/components/InstagramHeader';
import { InstagramKPICards } from './features/instagram/components/InstagramKPICards';
import { InstagramReachChart } from './features/instagram/components/InstagramReachChart';
import { InstagramEngagementChart } from './features/instagram/components/InstagramEngagementChart';
import { InstagramAudience } from './features/instagram/components/InstagramAudience';
import { InstagramPostsTable } from './features/instagram/components/InstagramPostsTable';
import { InstagramMediaTypeChart } from './features/instagram/components/InstagramMediaTypeChart';
import { InstagramCrossTab } from './features/instagram/components/InstagramCrossTab';
import { useInstagramProfile, IgPeriod } from './features/instagram/hooks/useInstagramProfile';
import { useInstagramMedia, IgMedia } from './features/instagram/hooks/useInstagramMedia';
import { useInstagramCross } from './features/instagram/hooks/useInstagramCross';
import { useInstagramToken } from './features/instagram/hooks/useInstagramToken';

interface InstagramProps {
  user: User;
  companyId?: string;
}

type Tab = 'overview' | 'content' | 'cross';

const TAB_CONFIG: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Visão Geral', icon: LayoutDashboard },
  { id: 'content',  label: 'Conteúdo',   icon: Grid3X3 },
  { id: 'cross',    label: 'Cruzamento', icon: GitMerge },
];

// ── Tab Visão Geral ─────────────────────────────────────────────────────────

interface OverviewTabProps {
  igUserId: string;
}

const OverviewTab: React.FC<OverviewTabProps> = ({ igUserId }) => {
  const [period, setPeriod] = useState<IgPeriod>('7d');
  const { data, loading, error, reload } = useInstagramProfile(igUserId, period);

  return (
    <div className="flex flex-col gap-0">
      {/* Header do perfil + seletor de período */}
      <InstagramHeader
        profilePicture={data.profile?.profilePictureUrl}
        username={data.profile?.username}
        followersCount={data.profile?.followersCount}
        mediaCount={data.profile?.mediaCount}
        period={period}
        onPeriodChange={setPeriod}
        loading={loading}
        onReload={reload}
      />

      {/* Erro de dados */}
      {error && (
        <div className="mx-6 mt-4 rounded-xl p-3 bg-red-500/10 border border-red-500/20 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      {/* KPI Cards */}
      <InstagramKPICards
        totalReach={data.totalReach}
        totalImpressions={data.totalImpressions}
        totalProfileViews={data.totalProfileViews}
        totalFollowerGain={data.totalFollowerGain}
        followersCount={data.profile?.followersCount ?? null}
        loading={loading}
      />

      {/* Divisor */}
      <div className="mx-6 border-t border-[hsl(var(--border))] mb-5" />

      {/* Gráfico de linha */}
      <InstagramReachChart series={data.series} loading={loading} />

      {/* Divisor */}
      <div className="mx-6 border-t border-[hsl(var(--border))] mb-5" />

      {/* Gráfico por dia da semana */}
      <InstagramEngagementChart series={data.series} loading={loading} />

      {/* Divisor */}
      <div className="mx-6 border-t border-[hsl(var(--border))] mb-5" />

      {/* Audiência */}
      <div className="px-6 mb-4">
        <div className="w-0.5 h-5 rounded-full bg-gradient-to-b from-[hsl(var(--primary))] to-[hsl(var(--accent))] inline-block mr-2 align-middle" />
        <span className="text-[15px] font-bold text-[hsl(var(--foreground))]">Audiência</span>
      </div>
      <InstagramAudience
        cities={data.cities}
        ageGroups={data.ageGroups}
        gender={data.gender}
        loading={loading}
      />
    </div>
  );
};

// ── Tab Conteúdo ─────────────────────────────────────────────────────────────

interface ContentTabProps {
  media: IgMedia[];
  loading: boolean;
  error: string | null;
  onReload: () => void;
}

const ContentTab: React.FC<ContentTabProps> = ({ media, loading, error, onReload }) => (
  <div className="flex flex-col gap-0 pt-5">
    <InstagramMediaTypeChart media={media} loading={loading} />
    <div className="mx-6 border-t border-[hsl(var(--border))] mb-5" />
    <InstagramPostsTable media={media} loading={loading} error={error} onReload={onReload} />
  </div>
);

// ── Componente raiz ─────────────────────────────────────────────────────────

export const Instagram: React.FC<InstagramProps> = ({ user, companyId }) => {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [igUserId, setIgUserId] = useState<string | null>(null);
  const [igUsername, setIgUsername] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [loadingAccount, setLoadingAccount] = useState(true);
  const [accountError, setAccountError] = useState<string | null>(null);

  // Sincroniza o módulo de token com a empresa ativa
  useEffect(() => {
    setActiveIgCompany(companyId ?? null);
  }, [companyId]);

  // Status do token de longa duração (para banner de expiração)
  const tokenStatus = useInstagramToken(companyId ?? null);

  // Mídia compartilhada entre Tab Conteúdo e Tab Cruzamento (evita chamada dupla)
  const { media, loading: mediaLoading, error: mediaError, reload: reloadMedia } =
    useInstagramMedia(igUserId);

  // Cruzamento de posts com leads
  const { data: crossData, loading: crossLoading, error: crossError, reload: reloadCross } =
    useInstagramCross(companyId ?? null, media, mediaLoading);

  useEffect(() => {
    if (!companyId) { setLoadingAccount(false); return; }

    setLoadingAccount(true);
    setAccountError(null);

    supabase
      .from('companies')
      .select('name, brand_name, instagram_business_account_id, instagram_username')
      .eq('id', companyId)
      .single()
      .then(({ data, error }) => {
        if (error) {
          const msg = String(error?.message ?? error);
          setAccountError(
            msg.toLowerCase().includes('does not exist') || msg.toLowerCase().includes('column')
              ? 'migration_needed'
              : msg,
          );
          return;
        }
        setCompanyName(data?.brand_name || data?.name || '');
        setIgUserId(data?.instagram_business_account_id ?? null);
        setIgUsername(data?.instagram_username ?? null);
      })
      .finally(() => setLoadingAccount(false));
  }, [companyId]);

  if (loadingAccount) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="w-5 h-5 animate-spin text-[hsl(var(--muted-foreground))]" />
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6">
        <InstagramIcon className="w-10 h-10 text-[hsl(var(--muted-foreground))] mb-3 opacity-30" />
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Selecione uma empresa para ver os dados de Instagram.
        </p>
      </div>
    );
  }

  if (accountError === 'migration_needed') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6 py-16">
        <div className="w-14 h-14 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center mb-4">
          <AlertTriangle className="w-7 h-7 text-yellow-400" />
        </div>
        <h3 className="text-base font-semibold text-[hsl(var(--foreground))] mb-2">Migração SQL necessária</h3>
        <pre className="text-left text-xs bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] rounded-xl p-4 max-w-lg w-full overflow-auto text-[hsl(var(--foreground))]">
{`ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS instagram_business_account_id text,
  ADD COLUMN IF NOT EXISTS instagram_username text;`}
        </pre>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 px-4 py-2 text-sm rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
        >
          Recarregar após executar
        </button>
      </div>
    );
  }

  if (accountError) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6">
        <p className="text-sm text-red-400">{accountError}</p>
      </div>
    );
  }

  if (!igUserId) {
    return (
      <InstagramConnectBanner
        companyId={companyId}
        companyName={companyName}
        onConnected={(id, username) => { setIgUserId(id); setIgUsername(username); }}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col h-full"
    >
      {/* Barra de título fixa */}
      <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[hsl(var(--border))]">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#f09433,#dc2743,#bc1888)' }}
          >
            <InstagramIcon className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-[hsl(var(--foreground))] leading-none">Instagram</h1>
            {igUsername && (
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">@{igUsername}</p>
            )}
          </div>
        </div>
        <button
          onClick={async () => {
            if (!confirm('Desconectar a conta Instagram desta empresa?')) return;
            await supabase
              .from('companies')
              .update({
                meta_page_id: null,
                instagram_business_account_id: null,
                instagram_username: null,
                instagram_access_token: null,
                instagram_token_expires_at: null,
              })
              .eq('id', companyId);
            clearIgTokenCache();
            setIgUserId(null);
            setIgUsername(null);
          }}
          className="text-xs text-[hsl(var(--muted-foreground))] hover:text-red-400 transition-colors"
        >
          Desconectar
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-6 pt-3 pb-0 border-b border-[hsl(var(--border))] flex-shrink-0">
        {TAB_CONFIG.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors relative"
              style={{ color: active ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' }}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
              {active && (
                <motion.div
                  layoutId="ig-tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                  style={{ background: 'linear-gradient(90deg,#833ab4,#fd1d1d)' }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Banner de expiração do token */}
      {(tokenStatus.isExpiring || tokenStatus.isExpired) && (
        <div className={`mx-6 mt-3 rounded-xl p-3 flex items-start gap-2 border ${
          tokenStatus.isExpired
            ? 'bg-red-500/10 border-red-500/20'
            : 'bg-yellow-500/10 border-yellow-500/20'
        }`}>
          <Clock className={`w-4 h-4 mt-0.5 flex-shrink-0 ${tokenStatus.isExpired ? 'text-red-400' : 'text-yellow-400'}`} />
          <div className="flex-1 min-w-0">
            <p className={`text-xs font-medium ${tokenStatus.isExpired ? 'text-red-300' : 'text-yellow-300'}`}>
              {tokenStatus.isExpired
                ? 'Conexão com o Instagram expirou.'
                : `Conexão expira em ${tokenStatus.daysLeft} dia${tokenStatus.daysLeft !== 1 ? 's' : ''}.`}
            </p>
            <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-0.5">
              Desconecte e reconecte a conta para renovar o acesso.
            </p>
          </div>
        </div>
      )}

      {/* Conteúdo scrollável */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'overview' && <OverviewTab igUserId={igUserId} />}
        {activeTab === 'content'  && (
          <ContentTab
            media={media}
            loading={mediaLoading}
            error={mediaError}
            onReload={reloadMedia}
          />
        )}
        {activeTab === 'cross' && (
          <InstagramCrossTab
            data={crossData}
            loading={crossLoading || mediaLoading}
            error={crossError}
            onReload={reloadCross}
          />
        )}
      </div>
    </motion.div>
  );
};
