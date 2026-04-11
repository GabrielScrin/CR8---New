import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Instagram, AlertCircle, ChevronRight, RefreshCw, CheckCircle, ExternalLink } from 'lucide-react';
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
  const { pages, loading, error, missingScopes, fetchPages, saveAccount, saving } = useInstagramConnect();

  const handleOpenModal = async () => {
    setShowModal(true);
    setSelected(null);
    await fetchPages();
  };

  const handleConfirm = async () => {
    if (!selected) return;
    try {
      await saveAccount(selected, companyId);
      setShowModal(false);
      onConnected(selected.igUserId, selected.igUsername);
    } catch {
      // erro já está no hook
    }
  };

  return (
    <>
      {/* ── Banner principal ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="flex flex-col items-center justify-center h-full px-6 py-16 text-center"
      >
        {/* Ícone com gradiente instagram */}
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6 shadow-lg"
          style={{
            background: 'linear-gradient(135deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)',
          }}
        >
          <Instagram className="w-10 h-10 text-white" />
        </div>

        <h2 className="text-2xl font-bold text-[hsl(var(--foreground))] mb-2">
          Conectar Instagram
        </h2>
        <p className="text-sm text-[hsl(var(--muted-foreground))] max-w-md mb-2">
          Visualize alcance, engajamento, posts e audiência de{' '}
          <span className="font-semibold text-[hsl(var(--foreground))]">{companyName}</span>{' '}
          diretamente no CR8 — sem abrir Looker Studio ou ferramentas externas.
        </p>
        <p className="text-xs text-[hsl(var(--muted-foreground))] max-w-sm mb-8">
          Requer uma conta Instagram Business ou Creator vinculada a uma Página do Facebook.
        </p>

        {/* Benefícios */}
        <div className="flex flex-wrap justify-center gap-3 mb-8">
          {[
            'Alcance orgânico',
            'Posts & Reels',
            'Audiência (cidade, idade, gênero)',
            'Cruzamento com leads',
          ].map((item) => (
            <span
              key={item}
              className="text-xs px-3 py-1.5 rounded-full border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]"
            >
              {item}
            </span>
          ))}
        </div>

        <button
          onClick={handleOpenModal}
          className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
          style={{
            background: 'linear-gradient(135deg, #833ab4 0%, #fd1d1d 50%, #fcb045 100%)',
            boxShadow: '0 4px 20px rgba(220, 39, 67, 0.3)',
          }}
        >
          <Instagram className="w-4 h-4" />
          Conectar Instagram
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* Nota sobre escopos */}
        <p className="mt-4 text-xs text-[hsl(var(--muted-foreground))] max-w-xs">
          Pode ser necessário reconectar sua conta Facebook para autorizar as permissões do Instagram.
        </p>
      </motion.div>

      {/* ── Modal de seleção de conta ── */}
      <AnimatePresence>
        {showModal && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              onClick={() => !saving && setShowModal(false)}
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="w-full max-w-md rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header do modal */}
                <div className="p-6 border-b border-[hsl(var(--border))]">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{
                        background: 'linear-gradient(135deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)',
                      }}
                    >
                      <Instagram className="w-5 h-5 text-white" />
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

                {/* Corpo do modal */}
                <div className="p-6">

                  {/* Loading */}
                  {loading && (
                    <div className="flex flex-col items-center gap-3 py-8">
                      <RefreshCw className="w-6 h-6 text-[hsl(var(--muted-foreground))] animate-spin" />
                      <p className="text-sm text-[hsl(var(--muted-foreground))]">
                        Buscando páginas do Facebook...
                      </p>
                    </div>
                  )}

                  {/* Erro */}
                  {!loading && error && (
                    <div className="rounded-xl p-4 bg-red-500/10 border border-red-500/20 mb-4">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-red-300">{error}</p>
                      </div>

                      {/* Escopos faltando — orienta re-auth */}
                      {missingScopes && (
                        <div className="mt-3 pt-3 border-t border-red-500/20">
                          <p className="text-xs text-red-300 mb-2">
                            Adicione estes escopos ao <code className="font-mono">VITE_FACEBOOK_SCOPES</code> no seu <code className="font-mono">.env.local</code> e reconecte:
                          </p>
                          <code className="block text-xs bg-black/20 rounded p-2 text-red-200 break-all">
                            {INSTAGRAM_REQUIRED_SCOPES.join(',')}
                          </code>
                          <a
                            href="https://developers.facebook.com/docs/instagram-api/getting-started"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 mt-2 text-xs text-red-300 hover:text-red-200"
                          >
                            Ver guia de configuração
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}

                      <button
                        onClick={fetchPages}
                        className="mt-3 text-xs text-red-300 hover:text-red-200 underline"
                      >
                        Tentar novamente
                      </button>
                    </div>
                  )}

                  {/* Lista de páginas */}
                  {!loading && pages.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-[hsl(var(--muted-foreground))] mb-3">
                        {pages.length} conta{pages.length > 1 ? 's' : ''} encontrada{pages.length > 1 ? 's' : ''}
                      </p>
                      {pages.map((page) => (
                        <button
                          key={page.igUserId}
                          onClick={() => setSelected(page)}
                          className="w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left"
                          style={{
                            borderColor: selected?.igUserId === page.igUserId
                              ? 'hsl(var(--primary))'
                              : 'hsl(var(--border))',
                            background: selected?.igUserId === page.igUserId
                              ? 'hsl(var(--primary) / 0.08)'
                              : 'transparent',
                          }}
                        >
                          {/* Avatar */}
                          {page.igProfilePicture ? (
                            <img
                              src={page.igProfilePicture}
                              alt={page.igUsername}
                              className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                            />
                          ) : (
                            <div
                              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{
                                background: 'linear-gradient(135deg, #f09433 0%, #dc2743 50%, #bc1888 100%)',
                              }}
                            >
                              <Instagram className="w-5 h-5 text-white" />
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[hsl(var(--foreground))] truncate">
                              @{page.igUsername || page.name}
                            </p>
                            <p className="text-xs text-[hsl(var(--muted-foreground))] truncate">
                              Página: {page.name}
                            </p>
                          </div>

                          {selected?.igUserId === page.igUserId && (
                            <CheckCircle className="w-5 h-5 flex-shrink-0" style={{ color: 'hsl(var(--primary))' }} />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer do modal */}
                <div className="px-6 pb-6 flex items-center justify-end gap-3">
                  <button
                    onClick={() => setShowModal(false)}
                    disabled={saving}
                    className="px-4 py-2 text-sm rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleConfirm}
                    disabled={!selected || saving}
                    className="flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      background: selected && !saving
                        ? 'linear-gradient(135deg, #833ab4 0%, #fd1d1d 50%, #fcb045 100%)'
                        : 'hsl(var(--muted))',
                    }}
                  >
                    {saving ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
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
