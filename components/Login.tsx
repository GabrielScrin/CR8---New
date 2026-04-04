import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Facebook, AlertCircle, Mail, Lock, ArrowRight, ChevronRight, Zap, BarChart3, Users } from 'lucide-react';
import { getSupabaseConfigHints, isSupabaseConfigured, supabase } from '../lib/supabase';
import { User } from '../types';

interface LoginProps {
  onLogin: (user: User) => void;
}

const features = [
  { icon: BarChart3, label: 'Tráfego pago unificado', desc: 'Meta, Google e TikTok em um só lugar' },
  { icon: Users, label: 'CRM com IA nativa', desc: 'Leads qualificados automaticamente' },
  { icon: Zap, label: 'Automações em tempo real', desc: 'WhatsApp, e-mail e muito mais' },
];

/* partículas de fundo — pontos animados */
const Dot = ({ x, y, delay }: { x: number; y: number; delay: number }) => (
  <motion.div
    className="absolute rounded-full"
    style={{ left: `${x}%`, top: `${y}%`, width: 3, height: 3, background: 'hsl(220 100% 52% / 0.5)' }}
    animate={{ opacity: [0.15, 0.7, 0.15], scale: [1, 1.6, 1] }}
    transition={{ duration: 3 + delay, repeat: Infinity, delay, ease: 'easeInOut' }}
  />
);

const dots = Array.from({ length: 28 }, (_, i) => ({
  x: Math.round((i * 37 + 11) % 97),
  y: Math.round((i * 53 + 7) % 93),
  delay: (i * 0.23) % 2.8,
}));

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  const isBackendReady = isSupabaseConfigured();
  const supabaseHints = getSupabaseConfigHints();

  const normalizeScopes = (scopes: string) => {
    const parts = scopes.split(/[,\s]+/g).map((s) => s.trim()).filter(Boolean);
    return Array.from(new Set(parts)).join(' ');
  };

  const facebookScopes: string = normalizeScopes(
    import.meta.env.VITE_FACEBOOK_SCOPES ?? 'public_profile ads_read',
  );

  const demoLogin = () => {
    console.warn('Supabase not configured or Demo requested. Using Mock Login.');
    setTimeout(() => {
      const mockUser: User = {
        id: '1',
        name: 'Carlos Gestor (Demo)',
        email: 'carlos@8engage.com',
        role: 'gestor',
        avatar: 'https://picsum.photos/100/100',
      };
      onLogin(mockUser);
      setIsLoading(false);
    }, 800);
  };

  const requireTerms = () => {
    if (acceptedTerms) return true;
    alert('Você precisa aceitar os Termos.');
    return false;
  };

  const handleFacebookLogin = async () => {
    if (!requireTerms()) return;
    setErrorMsg(null);
    setInfoMsg(null);
    setIsLoading(true);

    if (!isBackendReady) { demoLogin(); return; }

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'facebook',
        options: { scopes: facebookScopes, redirectTo: window.location.origin },
      });
      if (error) throw error;
    } catch (error: any) {
      console.error('Erro Facebook:', error);
      const wantDemo = window.confirm(
        `Erro ao conectar com Facebook: ${error.message || 'Configuração incompleta'}.\n\nDeseja entrar no modo DEMO para testar o sistema?`,
      );
      if (wantDemo) { demoLogin(); }
      else {
        setErrorMsg(error.message || 'Erro ao conectar com Facebook. Verifique as configurações de URI de redirecionamento no painel do Facebook e no Supabase.');
        setIsLoading(false);
      }
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireTerms()) return;
    setIsLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);

    if (!isBackendReady) { demoLogin(); return; }

    try {
      const result = isSignUp
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });

      if (result.error) throw result.error;

      if (isSignUp && result.data.user && !result.data.session) {
        alert('Verifique seu e-mail para confirmar o cadastro!');
        setIsLoading(false);
        return;
      }
    } catch (error: any) {
      setErrorMsg(error.message);
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setErrorMsg('Digite seu e-mail para receber o link de redefinição de senha.');
      setInfoMsg(null);
      return;
    }
    setIsLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);

    if (!isBackendReady) {
      setErrorMsg('Recuperação de senha indisponível no modo demo.');
      setIsLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) throw error;
      setInfoMsg('Se o e-mail existir, enviaremos um link para redefinir sua senha.');
    } catch (error: any) {
      setErrorMsg(error.message || 'Não foi possível enviar o link de recuperação.');
    } finally {
      setIsLoading(false);
    }
  };

  /* ─── variantes de animação ─── */
  const containerVariants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.08 } },
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 18 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } },
  };

  return (
    <div className="min-h-screen flex overflow-hidden" style={{ background: 'hsl(220 18% 5%)' }}>

      {/* ═══════════════════════════════════════════════
          PAINEL ESQUERDO — BRANDING
      ═══════════════════════════════════════════════ */}
      <div className="hidden lg:flex lg:w-[58%] relative flex-col justify-between p-14 overflow-hidden">

        {/* fundo animado */}
        <div className="absolute inset-0 pointer-events-none">
          {/* grade sutil */}
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: `linear-gradient(hsl(220 100% 52%) 1px, transparent 1px),
                                linear-gradient(90deg, hsl(220 100% 52%) 1px, transparent 1px)`,
              backgroundSize: '48px 48px',
            }}
          />
          {/* gradiente radial principal */}
          <div
            className="absolute"
            style={{
              top: '-20%', left: '-10%', width: '80%', height: '80%',
              background: 'radial-gradient(ellipse, hsl(220 100% 52% / 0.12) 0%, transparent 70%)',
            }}
          />
          <div
            className="absolute"
            style={{
              bottom: '-10%', right: '-5%', width: '60%', height: '60%',
              background: 'radial-gradient(ellipse, hsl(153 75% 43% / 0.08) 0%, transparent 70%)',
            }}
          />
          {/* pontos animados */}
          {dots.map((d, i) => <Dot key={i} {...d} />)}
        </div>

        {/* logo topo */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="relative flex items-center gap-3"
        >
          <div className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center"
            style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}>
            <img src="/cr8-logo.svg" alt="CR8" className="w-8 h-8 object-contain" />
          </div>
          <span className="text-white font-bold text-lg tracking-wide">CR8</span>
        </motion.div>

        {/* conteúdo central */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="relative flex-1 flex flex-col justify-center gap-10 mt-[-4rem]"
        >
          {/* headline */}
          <div>
            <motion.p
              variants={itemVariants}
              className="text-sm font-semibold tracking-[0.2em] uppercase mb-4"
              style={{ color: 'hsl(153 75% 43%)' }}
            >
              Sistema Operacional de Tráfego
            </motion.p>
            <motion.h1
              variants={itemVariants}
              className="font-extrabold leading-[1.05] text-white"
              style={{ fontSize: 'clamp(3rem, 5.5vw, 5rem)', letterSpacing: '-0.03em' }}
            >
              Tráfego pago<br />
              <span style={{
                backgroundImage: 'linear-gradient(135deg, hsl(220 100% 65%) 0%, hsl(153 75% 55%) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>
                sem fricção.
              </span>
            </motion.h1>
            <motion.p
              variants={itemVariants}
              className="mt-6 text-lg leading-relaxed max-w-md"
              style={{ color: 'hsl(215 20% 55%)' }}
            >
              Centralize campanhas, qualifique leads com IA e feche mais negócios — tudo em um único workspace.
            </motion.p>
          </div>

          {/* features */}
          <motion.div variants={containerVariants} className="flex flex-col gap-3">
            {features.map((f, i) => (
              <motion.div
                key={i}
                variants={itemVariants}
                className="flex items-center gap-4 group"
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'hsl(220 18% 13%)', border: '1px solid hsl(220 12% 26%)' }}
                >
                  <f.icon className="w-4 h-4" style={{ color: 'hsl(220 100% 65%)' }} />
                </div>
                <div>
                  <p className="text-white text-sm font-semibold">{f.label}</p>
                  <p className="text-xs" style={{ color: 'hsl(215 20% 50%)' }}>{f.desc}</p>
                </div>
                <ChevronRight
                  className="w-4 h-4 ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: 'hsl(220 100% 65%)' }}
                />
              </motion.div>
            ))}
          </motion.div>
        </motion.div>

        {/* rodapé esquerdo */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9, duration: 0.6 }}
          className="relative text-xs"
          style={{ color: 'hsl(215 20% 40%)' }}
        >
          © 2024 8 Engage — Todos os direitos reservados
        </motion.p>
      </div>

      {/* ═══════════════════════════════════════════════
          PAINEL DIREITO — FORMULÁRIO
      ═══════════════════════════════════════════════ */}
      <div
        className="w-full lg:w-[42%] flex flex-col justify-center px-8 sm:px-14 lg:px-16 py-12 relative"
        style={{ borderLeft: '1px solid hsl(220 12% 14%)', background: 'hsl(220 18% 7%)' }}
      >
        {/* glow de topo */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 pointer-events-none"
          style={{
            width: '60%', height: '1px',
            background: 'linear-gradient(90deg, transparent, hsl(220 100% 52% / 0.5), transparent)',
          }}
        />

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="w-full max-w-sm mx-auto"
        >
          {/* logo mobile */}
          <motion.div variants={itemVariants} className="flex items-center gap-3 mb-10 lg:hidden">
            <div className="w-8 h-8 rounded-lg overflow-hidden"
              style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}>
              <img src="/cr8-logo.svg" alt="CR8" className="w-full h-full object-contain" />
            </div>
            <span className="text-white font-bold">CR8</span>
          </motion.div>

          {/* cabeçalho do form */}
          <motion.div variants={itemVariants} className="mb-8">
            <h2 className="text-2xl font-bold text-white tracking-tight">
              {isSignUp ? 'Criar conta' : 'Bem-vindo de volta'}
            </h2>
            <p className="mt-1 text-sm" style={{ color: 'hsl(215 20% 50%)' }}>
              {isSignUp
                ? 'Comece agora, grátis por 14 dias'
                : 'Entre na sua conta para continuar'}
            </p>
          </motion.div>

          {/* mensagens de feedback */}
          <AnimatePresence mode="wait">
            {errorMsg && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -8, height: 0 }}
                transition={{ duration: 0.25 }}
                className="flex items-start gap-3 rounded-xl px-4 py-3 mb-6 text-sm"
                style={{
                  background: 'hsl(0 72% 51% / 0.1)',
                  border: '1px solid hsl(0 72% 51% / 0.25)',
                  color: 'hsl(0 80% 70%)',
                }}
              >
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                {errorMsg}
              </motion.div>
            )}
            {infoMsg && (
              <motion.div
                key="info"
                initial={{ opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -8, height: 0 }}
                transition={{ duration: 0.25 }}
                className="rounded-xl px-4 py-3 mb-6 text-sm"
                style={{
                  background: 'hsl(153 75% 43% / 0.1)',
                  border: '1px solid hsl(153 75% 43% / 0.25)',
                  color: 'hsl(153 75% 65%)',
                }}
              >
                {infoMsg}
              </motion.div>
            )}
          </AnimatePresence>

          {/* formulário */}
          <motion.form variants={itemVariants} onSubmit={handleEmailLogin} className="space-y-4">

            {/* campo e-mail */}
            <div>
              <label className="block text-xs font-semibold mb-1.5 tracking-wide uppercase"
                style={{ color: 'hsl(215 20% 55%)' }}>
                E-mail
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                  style={{ color: 'hsl(215 20% 45%)' }} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl outline-none transition-all duration-200"
                  style={{
                    background: 'hsl(220 18% 11%)',
                    border: '1px solid hsl(220 12% 22%)',
                    color: 'hsl(210 40% 98%)',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'hsl(220 100% 52% / 0.6)';
                    e.target.style.boxShadow = '0 0 0 3px hsl(220 100% 52% / 0.1)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'hsl(220 12% 22%)';
                    e.target.style.boxShadow = 'none';
                  }}
                />
              </div>
            </div>

            {/* campo senha */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold tracking-wide uppercase"
                  style={{ color: 'hsl(215 20% 55%)' }}>
                  Senha
                </label>
                {!isSignUp && (
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={isLoading}
                    className="text-xs font-medium transition-colors hover:opacity-80 disabled:opacity-40"
                    style={{ color: 'hsl(220 100% 65%)' }}
                  >
                    Esqueci minha senha
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                  style={{ color: 'hsl(215 20% 45%)' }} />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl outline-none transition-all duration-200"
                  style={{
                    background: 'hsl(220 18% 11%)',
                    border: '1px solid hsl(220 12% 22%)',
                    color: 'hsl(210 40% 98%)',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'hsl(220 100% 52% / 0.6)';
                    e.target.style.boxShadow = '0 0 0 3px hsl(220 100% 52% / 0.1)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'hsl(220 12% 22%)';
                    e.target.style.boxShadow = 'none';
                  }}
                />
              </div>
            </div>

            {/* termos */}
            <div className="flex items-start gap-3 py-1">
              <div className="relative flex-shrink-0 mt-0.5">
                <input
                  id="terms"
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="peer sr-only"
                />
                <label
                  htmlFor="terms"
                  className="flex w-4 h-4 rounded cursor-pointer transition-all duration-200 items-center justify-center"
                  style={{
                    background: acceptedTerms ? 'hsl(220 100% 52%)' : 'hsl(220 18% 11%)',
                    border: `1px solid ${acceptedTerms ? 'hsl(220 100% 52%)' : 'hsl(220 12% 26%)'}`,
                  }}
                >
                  {acceptedTerms && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 12 12">
                      <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </label>
              </div>
              <label htmlFor="terms" className="text-xs leading-relaxed cursor-pointer"
                style={{ color: 'hsl(215 20% 50%)' }}>
                Aceito os{' '}
                <a href="#" className="font-semibold hover:opacity-80 transition-opacity"
                  style={{ color: 'hsl(220 100% 65%)' }}>
                  Termos de Uso
                </a>
              </label>
            </div>

            {/* botão principal */}
            <motion.button
              type="submit"
              disabled={!acceptedTerms || isLoading}
              whileHover={acceptedTerms && !isLoading ? { scale: 1.01 } : {}}
              whileTap={acceptedTerms && !isLoading ? { scale: 0.99 } : {}}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl text-sm font-semibold transition-all duration-200"
              style={{
                background: acceptedTerms && !isLoading
                  ? 'linear-gradient(135deg, hsl(220 100% 52%) 0%, hsl(240 80% 60%) 100%)'
                  : 'hsl(220 12% 18%)',
                color: acceptedTerms && !isLoading ? 'white' : 'hsl(215 20% 40%)',
                cursor: acceptedTerms && !isLoading ? 'pointer' : 'not-allowed',
                boxShadow: acceptedTerms && !isLoading ? '0 0 20px hsl(220 100% 52% / 0.25)' : 'none',
              }}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Processando...
                </span>
              ) : (
                <>
                  {isSignUp ? 'Criar minha conta' : 'Entrar'}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </motion.button>
          </motion.form>

          {/* divisor */}
          <motion.div variants={itemVariants} className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px" style={{ background: 'hsl(220 12% 18%)' }} />
            <span className="text-xs" style={{ color: 'hsl(215 20% 38%)' }}>ou</span>
            <div className="flex-1 h-px" style={{ background: 'hsl(220 12% 18%)' }} />
          </motion.div>

          {/* botão Facebook */}
          <motion.button
            variants={itemVariants}
            onClick={handleFacebookLogin}
            type="button"
            disabled={isLoading}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="w-full flex items-center justify-center gap-3 py-2.5 px-5 rounded-xl text-sm font-semibold transition-all duration-200"
            style={{
              background: 'hsl(220 18% 11%)',
              border: '1px solid hsl(220 12% 22%)',
              color: 'white',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#1877F2';
              (e.currentTarget as HTMLButtonElement).style.background = 'hsl(214 89% 52% / 0.1)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'hsl(220 12% 22%)';
              (e.currentTarget as HTMLButtonElement).style.background = 'hsl(220 18% 11%)';
            }}
          >
            <Facebook className="w-4 h-4 flex-shrink-0" style={{ color: '#1877F2' }} />
            Continuar com Facebook
          </motion.button>

          {/* toggle login / cadastro */}
          <motion.div variants={itemVariants} className="text-center mt-6">
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm transition-colors hover:opacity-80"
              style={{ color: 'hsl(215 20% 50%)' }}
            >
              {isSignUp ? 'Já tem uma conta? ' : 'Não tem conta? '}
              <span className="font-semibold" style={{ color: 'hsl(220 100% 65%)' }}>
                {isSignUp ? 'Entrar' : 'Cadastrar-se'}
              </span>
            </button>
          </motion.div>

          {/* aviso demo */}
          {!isBackendReady && (
            <motion.p
              variants={itemVariants}
              className="text-center text-xs mt-4"
              style={{ color: 'hsl(43 96% 56% / 0.8)' }}
            >
              ⚠ Modo Demo ativo (faltando: {supabaseHints.missing.join(', ')})
            </motion.p>
          )}
        </motion.div>
      </div>
    </div>
  );
};
