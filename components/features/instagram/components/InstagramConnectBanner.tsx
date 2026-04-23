import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Instagram, AlertCircle, ChevronRight, RefreshCw, CheckCircle, ExternalLink } from 'lucide-react';
import {
  DEFAULT_FACEBOOK_SCOPES,
  INSTAGRAM_BUSINESS_MANAGER_EXTRA_SCOPES,
  mergeScopes,
} from '../../../../lib/facebookScopes';
import { supabase } from '../../../../lib/supabase';
import { useInstagramConnect, IgPage, INSTAGRAM_REQUIRED_SCOPES } from '../hooks/useInstagramConnect';

interface InstagramConnectBannerProps {
  companyId: string;
  companyName: string;
  onConnected: (igUserId: string, igUsername: string) => void;
}

export const InstagramConnectBanner: React.FC<InstagramConnectBannerProps> = ({
  companyId,
  companyName,
  onConnected,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [selected, setSelected] = useState<IgPage | null>(null);
  const {
    pages,
    loading,
    error,
    needsReconnect,
    reconnectReason,
    fetchPages,
    saveAccount,
    saving,
  } = useInstagramConnect();
  const reconnectScopes = mergeScopes(
    DEFAULT_FACEBOOK_SCOPES,
    INSTAGRAM_BUSINESS_MANAGER_EXTRA_SCOPES,
  );

  const handleOpenModal = async () => {
    setShowModal(true);
    setSelected(null);
    await fetchPages();
  };

  const handleReconnectFacebook = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'facebook',
      options: {
        scopes: reconnectScopes,
        redirectTo: window.location.origin,
        queryParams: { auth_type: 'rerequest' },
      },
    });
  };

  const handleConfirm = async () => {
    if (!selected) return;

    try {
      await saveAccount(selected, companyId);
      setShowModal(false);
      onConnected(selected.igUserId, selected.igUsername);
    } catch {
      // O hook ja expoe a mensagem.
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="flex h-full flex-col items-center justify-center px-6 py-16 text-center"
      >
        <div
          className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl shadow-lg"
          style={{
            background: 'linear-gradient(135deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)',
          }}
        >
          <Instagram className="h-10 w-10 text-white" />
        </div>

        <h2 className="mb-2 text-2xl font-bold text-[hsl(var(--foreground))]">
          Conectar Instagram
        </h2>
        <p className="mb-2 max-w-md text-sm text-[hsl(var(--muted-foreground))]">
          Visualize alcance, engajamento, posts e audiencia de{' '}
          <span className="font-semibold text-[hsl(var(--foreground))]">{companyName}</span>{' '}
          diretamente no CR8, sem abrir ferramentas externas.
        </p>
        <p className="mb-8 max-w-sm text-xs text-[hsl(var(--muted-foreground))]">
          Requer uma conta Instagram Business ou Creator vinculada a uma Pagina do Facebook.
        </p>

        <div className="mb-8 flex flex-wrap justify-center gap-3">
          {[
            'Alcance organico',
            'Posts e Reels',
            'Audiencia por cidade, idade e genero',
            'Cruzamento com leads',
          ].map((item) => (
            <span
              key={item}
              className="rounded-full border border-[hsl(var(--border))] px-3 py-1.5 text-xs text-[hsl(var(--muted-foreground))]"
            >
              {item}
            </span>
          ))}
        </div>

        <button
          onClick={handleOpenModal}
          className="flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
          style={{
            background: 'linear-gradient(135deg, #833ab4 0%, #fd1d1d 50%, #fcb045 100%)',
            boxShadow: '0 4px 20px rgba(220, 39, 67, 0.3)',
          }}
        >
          <Instagram className="h-4 w-4" />
          Conectar Instagram
          <ChevronRight className="h-4 w-4" />
        </button>

        <p className="mt-4 max-w-xs text-xs text-[hsl(var(--muted-foreground))]">
          Pode ser necessario reconectar sua conta Facebook para autorizar as permissoes do Instagram.
        </p>
      </motion.div>

      <AnimatePresence>
        {showModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              onClick={() => !saving && setShowModal(false)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={(event) => event.stopPropagation()}
            >
              <div
                className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex-shrink-0 border-b border-[hsl(var(--border))] p-6">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl"
                      style={{
                        background: 'linear-gradient(135deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)',
                      }}
                    >
                      <Instagram className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-[hsl(var(--foreground))]">
                        Selecionar conta Instagram
                      </h3>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        Escolha qual perfil conectar em {companyName}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-6">
                  {loading && (
                    <div className="flex flex-col items-center gap-3 py-8">
                      <RefreshCw className="h-6 w-6 animate-spin text-[hsl(var(--muted-foreground))]" />
                      <p className="text-sm text-[hsl(var(--muted-foreground))]">
                        Buscando paginas do Facebook...
                      </p>
                    </div>
                  )}

                  {!loading && error && (
                    <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
                        <p className="text-sm text-red-300">{error}</p>
                      </div>

                      {needsReconnect && (
                        <div className="mt-3 border-t border-red-500/20 pt-3">
                          <p className="mb-2 text-xs text-red-300">
                            {reconnectReason === 'missing_token'
                              ? 'Reconecte o Facebook para renovar a autorizacao do app com estes escopos:'
                              : 'Reconecte o Facebook autorizando estes escopos:'}
                          </p>
                          <code className="block break-all rounded bg-black/20 p-2 text-xs text-red-200">
                            {INSTAGRAM_REQUIRED_SCOPES.join(',')}
                          </code>
                          <p className="mt-2 text-xs text-red-300">
                            Se a Pagina foi compartilhada via Business Manager, a Meta tambem exige <code className="font-mono">ads_management</code> alem de <code className="font-mono">ads_read</code>.
                          </p>
                          <button
                            onClick={handleReconnectFacebook}
                            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-400/30 px-3 py-2 text-xs font-medium text-red-200 hover:bg-red-500/10"
                          >
                            <RefreshCw className="h-3 w-3" />
                            Reconectar com Facebook
                          </button>
                          <a
                            href="https://developers.facebook.com/docs/instagram-platform/insights"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 inline-flex items-center gap-1 text-xs text-red-300 hover:text-red-200"
                          >
                            Ver documentacao oficial
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      )}

                      <button
                        onClick={fetchPages}
                        className="mt-3 text-xs text-red-300 underline hover:text-red-200"
                      >
                        Tentar novamente
                      </button>
                    </div>
                  )}

                  {!loading && pages.length > 0 && (
                    <div className="space-y-2">
                      <p className="mb-3 text-xs text-[hsl(var(--muted-foreground))]">
                        {pages.length} conta{pages.length > 1 ? 's' : ''} encontrada{pages.length > 1 ? 's' : ''}
                      </p>
                      <div className="max-h-[42vh] space-y-2 overflow-y-auto pr-1">
                        {pages.map((page) => (
                          <button
                            key={page.igUserId}
                            onClick={() => setSelected(page)}
                            className="w-full rounded-xl border p-3 text-left transition-all"
                            style={{
                              borderColor: selected?.igUserId === page.igUserId
                                ? 'hsl(var(--primary))'
                                : 'hsl(var(--border))',
                              background: selected?.igUserId === page.igUserId
                                ? 'hsl(var(--primary) / 0.08)'
                                : 'transparent',
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
                                style={{
                                  background: 'linear-gradient(135deg, #f09433 0%, #dc2743 50%, #bc1888 100%)',
                                }}
                              >
                                <Instagram className="h-5 w-5 text-white" />
                              </div>

                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-[hsl(var(--foreground))]">
                                  @{page.igUsername || page.name}
                                </p>
                                <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">
                                  Pagina: {page.name}
                                </p>
                              </div>

                              {selected?.igUserId === page.igUserId && (
                                <CheckCircle className="h-5 w-5 flex-shrink-0" style={{ color: 'hsl(var(--primary))' }} />
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-shrink-0 items-center justify-end gap-3 border-t border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 pb-6 pt-4">
                  <button
                    onClick={() => setShowModal(false)}
                    disabled={saving}
                    className="rounded-lg border border-[hsl(var(--border))] px-4 py-2 text-sm text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))] disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleConfirm}
                    disabled={!selected || saving}
                    className="flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold text-white transition-all disabled:cursor-not-allowed disabled:opacity-40"
                    style={{
                      background: selected && !saving
                        ? 'linear-gradient(135deg, #833ab4 0%, #fd1d1d 50%, #fcb045 100%)'
                        : 'hsl(var(--muted))',
                    }}
                  >
                    {saving ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4" />
                        Conectar
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
