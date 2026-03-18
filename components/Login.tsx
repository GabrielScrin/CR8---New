import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Facebook, AlertCircle, Mail, Lock, ArrowRight } from 'lucide-react';
import { getSupabaseConfigHints, isSupabaseConfigured, supabase } from '../lib/supabase';
import { User } from '../types';

interface LoginProps {
  onLogin: (user: User) => void;
}

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
    const parts = scopes
      .split(/[,\s]+/g)
      .map((s) => s.trim())
      .filter(Boolean);
    return Array.from(new Set(parts)).join(' ');
  };

  // OBS: alguns apps do Facebook retornam "Invalid Scopes: email".
  // Por padrão não pedimos `email` e deixamos configurável via env.
  const facebookScopes: string = normalizeScopes(import.meta.env.VITE_FACEBOOK_SCOPES ?? 'public_profile ads_read');

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

    if (!isBackendReady) {
      demoLogin();
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'facebook',
        options: {
          // OAuth escopos padrão são separados por espaço.
          // Se aparecer "Invalid Scopes: email" no popup do Facebook, ajuste via `VITE_FACEBOOK_SCOPES`.
          scopes: facebookScopes,
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (error: any) {
      console.error('Erro Facebook:', error);
      const wantDemo = window.confirm(
        `Erro ao conectar com Facebook: ${error.message || 'Configuração incompleta'}.\n\nDeseja entrar no modo DEMO para testar o sistema?`,
      );
      if (wantDemo) {
        demoLogin();
      } else {
        setErrorMsg(
          error.message ||
            'Erro ao conectar com Facebook. Verifique as configurações de URI de redirecionamento no painel do Facebook e no Supabase.',
        );
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

    if (!isBackendReady) {
      demoLogin();
      return;
    }

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
      // onAuthStateChange em App.tsx irá atualizar o estado do usuário
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
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      setInfoMsg('Se o e-mail existir, enviaremos um link para redefinir sua senha.');
    } catch (error: any) {
      setErrorMsg(error.message || 'Não foi possível enviar o link de recuperação.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--background))] px-4">
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="bg-[hsl(var(--card))] text-[hsl(var(--foreground))] border border-[hsl(var(--border))] p-8 rounded-2xl shadow-2xl w-full max-w-md space-y-6"
      >
        <div className="text-center">
          <div className="mx-auto mb-3 h-12 w-12 rounded-xl bg-transparent flex items-center justify-center overflow-hidden ring-1 ring-[hsl(var(--border))]">
            <img src="/cr8-logo.svg" alt="CR8" className="h-12 w-12 object-contain" />
          </div>
          <h1 className="text-4xl font-extrabold mb-2 cr8-text-gradient">CR8</h1>
          <p className="text-[hsl(var(--muted-foreground))]">Sistema Operacional de Tráfego & CRM</p>
        </div>

        {errorMsg && (
          <div className="bg-red-500/10 text-red-300 p-3 rounded-lg text-sm flex items-center border border-red-500/20">
            <AlertCircle className="w-4 h-4 mr-2" />
            {errorMsg}
          </div>
        )}

        {infoMsg && (
          <div className="bg-emerald-500/10 text-emerald-300 p-3 rounded-lg text-sm border border-emerald-500/20">
            {infoMsg}
          </div>
        )}

        <form onSubmit={handleEmailLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">E-mail</label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="focus:ring-[hsl(var(--ring))] focus:border-[hsl(var(--ring))] block w-full pl-10 sm:text-sm border-[hsl(var(--border))] rounded-md py-2 border bg-[hsl(var(--input))] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]"
                placeholder="seu@email.com"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Senha</label>
              {!isSignUp && (
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={isLoading}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Esqueci minha senha
                </button>
              )}
            </div>
            <div className="mt-1 relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="focus:ring-[hsl(var(--ring))] focus:border-[hsl(var(--ring))] block w-full pl-10 sm:text-sm border-[hsl(var(--border))] rounded-md py-2 border bg-[hsl(var(--input))] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]"
                placeholder="••••••"
              />
            </div>
          </div>

          <div className="flex items-start py-2">
            <div className="flex items-center h-5">
              <input
                id="terms"
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="w-4 h-4 border border-[hsl(var(--border))] rounded bg-[hsl(var(--input))] focus:ring-2 focus:ring-[hsl(var(--ring))]"
              />
            </div>
            <label htmlFor="terms" className="ml-2 text-sm font-medium text-[hsl(var(--foreground))]">
              Aceito os <a href="#" className="text-indigo-600 hover:underline">Termos de Uso</a>.
            </label>
          </div>

          <button
            type="submit"
            disabled={!acceptedTerms || isLoading}
            className={`w-full flex items-center justify-center px-5 py-3 text-base font-medium text-white rounded-lg transition-colors ${
              acceptedTerms && !isLoading
                ? 'bg-[hsl(var(--primary))] hover:opacity-90'
                : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] cursor-not-allowed'
            }`}
          >
            {isLoading ? 'Processando...' : isSignUp ? 'Criar Conta' : 'Entrar'}
            {!isLoading && <ArrowRight className="ml-2 w-4 h-4" />}
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[hsl(var(--border))]"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))]">Ou continue com</span>
          </div>
        </div>

        <button
          onClick={handleFacebookLogin}
          type="button"
          className="w-full flex items-center justify-center px-5 py-3 border border-[hsl(var(--border))] shadow-sm text-sm font-medium rounded-lg text-[hsl(var(--foreground))] bg-[hsl(var(--secondary))] hover:opacity-90"
        >
          <Facebook className="w-5 h-5 mr-3 text-blue-600" />
          Facebook
        </button>

        <div className="text-center mt-4">
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-sm text-indigo-600 hover:text-indigo-500 font-medium"
          >
            {isSignUp ? 'Já tem uma conta? Entre' : 'Não tem conta? Cadastre-se'}
          </button>
        </div>

        <div className="text-center text-xs text-[hsl(var(--muted-foreground))] mt-4">
          {!isBackendReady && (
            <span className="text-yellow-400 block mb-1">
              Modo Demo Ativo (faltando: {supabaseHints.missing.join(', ')})
            </span>
          )}
          &copy; 2024 8 Engage.
        </div>
      </motion.div>
    </div>
  );
};
