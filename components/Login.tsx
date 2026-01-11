import React, { useState } from 'react';
import { User } from '../types';
import { ShieldCheck, Facebook, AlertCircle } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface LoginProps {
  onLogin: (user: User) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFacebookLogin = async () => {
    if (!acceptedTerms) {
      alert("Você precisa aceitar os Termos de Uso e Política de Privacidade.");
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    // If Supabase is not configured, fall back to demo mode
    if (!isSupabaseConfigured()) {
       console.warn("Supabase not configured. Using Mock Login.");
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
      return;
    }

    // Actual Supabase Login
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'facebook',
        options: {
          redirectTo: window.location.origin // Redirect back to this app
        }
      });

      if (error) throw error;
      // Note: OAuth redirects, so code execution stops here usually.
    } catch (error: any) {
      console.error("Login error:", error);
      setErrorMsg(error.message || "Erro ao conectar com Facebook.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md space-y-8">
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

        <div className="space-y-4">
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
            <h3 className="text-sm font-semibold text-blue-800 mb-2 flex items-center">
              <ShieldCheck className="w-4 h-4 mr-2" />
              Segurança & LGPD
            </h3>
            <p className="text-xs text-blue-600">
              Seus dados estão protegidos. Ao entrar, você concorda com o processamento de dados para fins de gestão de tráfego e CRM.
            </p>
          </div>

          <div className="flex items-start">
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
              Li e concordo com os <a href="#" className="text-indigo-600 hover:underline">Termos de Uso</a> e <a href="#" className="text-indigo-600 hover:underline">Política de Privacidade</a>.
            </label>
          </div>

          <button
            onClick={handleFacebookLogin}
            disabled={!acceptedTerms || isLoading}
            className={`w-full flex items-center justify-center px-5 py-3 text-base font-medium text-white rounded-lg transition-colors ${
              acceptedTerms && !isLoading
                ? 'bg-[#1877F2] hover:bg-[#166fe5]'
                : 'bg-gray-400 cursor-not-allowed'
            }`}
          >
            {isLoading ? (
              <span className="animate-pulse">Conectando...</span>
            ) : (
              <>
                <Facebook className="w-5 h-5 mr-3" />
                Entrar com Facebook
              </>
            )}
          </button>
        </div>
        
        <div className="text-center text-xs text-gray-400 mt-4">
          {!isSupabaseConfigured() && <span className="text-yellow-500 block mb-1">⚠️ Modo Demo (Sem Backend Configurado)</span>}
          &copy; 2024 8 Engage. Todos os direitos reservados.
        </div>
      </div>
    </div>
  );
};