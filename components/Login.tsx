import React, { useState } from 'react';
import { User } from '../types';
import { ShieldCheck, Facebook, AlertCircle, Mail, Lock, ArrowRight } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface LoginProps {
  onLogin: (user: User) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  // Check backend status
  const isBackendReady = isSupabaseConfigured();

  const handleFacebookLogin = async () => {
    if (!acceptedTerms) return alert("Você precisa aceitar os Termos.");
    setErrorMsg(null);

    // Fluxo Real
    // Se o backend não estiver configurado (ex: chaves placeholder), usamos o demo.
    // Se estiver configurado, tentamos o login real.
    setIsLoading(true);

    if (!isBackendReady) {
       demoLogin();
       return;
    }

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'facebook',
        options: { 
            // Redireciona de volta para a URL atual do navegador após o login
            redirectTo: window.location.origin
        }
      });
      if (error) throw error;
    } catch (error: any) {
      // Se houver erro, provavelmente é configuração do Facebook (URI de redirecionamento)
      console.error("Erro Facebook:", error);
      
      // Fallback para permitir que o usuário entre no modo demo caso a config falhe
      const wantDemo = window.confirm(`Erro ao conectar com Facebook: ${error.message || 'Configuração incompleta'}.\n\nDeseja entrar no modo DEMO para testar o sistema?`);
      if (wantDemo) {
          demoLogin();
      } else {
          setErrorMsg(error.message || "Erro ao conectar com Facebook. Verifique as configurações de URI no painel do Facebook.");
          setIsLoading(false);
      }
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acceptedTerms) return alert("Você precisa aceitar os Termos.");
    setIsLoading(true);
    setErrorMsg(null);

    if (!isBackendReady) {
        demoLogin();
        return;
    }

    try {
      let result;
      if (isSignUp) {
        result = await supabase.auth.signUp({
          email,
          password,
        });
        if (result.data.user && !result.data.session) {
           alert("Verifique seu e-mail para confirmar o cadastro!");
           setIsLoading(false);
           return;
        }
      } else {
        result = await supabase.auth.signInWithPassword({
          email,
          password,
        });
      }

      if (result.error) throw result.error;
      
      // If successful, the onAuthStateChange in App.tsx will handle the user set
    } catch (error: any) {
      setErrorMsg(error.message);
      setIsLoading(false);
    }
  };

  const demoLogin = () => {
    console.warn("Supabase not configured or Demo requested. Using Mock Login.");
    setTimeout(() => {
     const mockUser: User = {
       id: '1',
       name: 'Carlos Gestor (Demo)',
       email: 'carlos@8engage.com',
       role: 'gestor',
       avatar: 'https://picsum.photos/100/100'
     };
     onLogin(mockUser);
     setIsLoading(false);
   }, 1500);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4">
      <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-indigo-600 mb-2">CR-8</h1>
          <p className="text-gray-500">Sistema Operacional de Tráfego & CRM</p>
        </div>

        {errorMsg && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-center">
                <AlertCircle className="w-4 h-4 mr-2" />
                {errorMsg}
            </div>
        )}

        {/* Email/Pass Form */}
        <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700">E-mail</label>
                <div className="mt-1 relative rounded-md shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Mail className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-2 border"
                        placeholder="seu@email.com"
                    />
                </div>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700">Senha</label>
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
                        className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-2 border"
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
                    className="w-4 h-4 border border-gray-300 rounded bg-gray-50 focus:ring-3 focus:ring-indigo-300"
                />
                </div>
                <label htmlFor="terms" className="ml-2 text-sm font-medium text-gray-900">
                Aceito os <a href="#" className="text-indigo-600 hover:underline">Termos de Uso</a>.
                </label>
            </div>

            <button
                type="submit"
                disabled={!acceptedTerms || isLoading}
                className={`w-full flex items-center justify-center px-5 py-3 text-base font-medium text-white rounded-lg transition-colors ${
                acceptedTerms && !isLoading
                    ? 'bg-indigo-600 hover:bg-indigo-700'
                    : 'bg-gray-400 cursor-not-allowed'
                }`}
            >
                {isLoading ? 'Processando...' : (isSignUp ? 'Criar Conta' : 'Entrar')}
                {!isLoading && <ArrowRight className="ml-2 w-4 h-4" />}
            </button>
        </form>

        <div className="relative">
            <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Ou continue com</span>
            </div>
        </div>

        <button
            onClick={handleFacebookLogin}
            type="button"
            className="w-full flex items-center justify-center px-5 py-3 border border-gray-300 shadow-sm text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50"
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
        
        <div className="text-center text-xs text-gray-400 mt-4">
          {!isBackendReady && <span className="text-yellow-500 block mb-1">⚠️ Modo Demo Ativo</span>}
          &copy; 2024 8 Engage.
        </div>
      </div>
    </div>
  );
};