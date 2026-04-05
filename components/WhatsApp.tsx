import React, { useState } from 'react';
import { MessageCircle, Megaphone, FileText, UserX } from 'lucide-react';
import { isSupabaseConfigured } from '../lib/supabase';
import { Role } from '../types';
import { WhatsAppCampaigns } from './WhatsAppCampaigns';
import { WhatsAppOptOut } from './WhatsAppOptOut';
import { WhatsAppTemplates } from './WhatsAppTemplates';

type Tab = 'campaigns' | 'templates' | 'optout';

const TAB_CONFIG: { id: Tab; label: string; icon: React.ElementType; desc: string }[] = [
  { id: 'campaigns', label: 'Campanhas',  icon: Megaphone, desc: 'Disparos em massa' },
  { id: 'templates', label: 'Templates',  icon: FileText,  desc: 'Mensagens aprovadas' },
  { id: 'optout',    label: 'Opt-out',    icon: UserX,     desc: 'Descadastros' },
];

export function WhatsApp({ companyId, role }: { companyId?: string; role: Role }) {
  const [tab, setTab] = useState<Tab>('campaigns');

  if (!isSupabaseConfigured()) {
    return (
      <div className="flex items-center justify-center h-full text-[hsl(var(--muted-foreground))]">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
            <MessageCircle className="w-7 h-7 text-emerald-400/60" />
          </div>
          <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">WhatsApp</h3>
          <p className="text-sm mt-1">Configure o Supabase para habilitar este modulo.</p>
        </div>
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="flex items-center justify-center h-full text-[hsl(var(--muted-foreground))]">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
            <MessageCircle className="w-7 h-7 text-emerald-400/60" />
          </div>
          <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">WhatsApp</h3>
          <p className="text-sm mt-1">Selecione ou crie uma empresa para habilitar o WhatsApp.</p>
        </div>
      </div>
    );
  }

  const activeTab = TAB_CONFIG.find((t) => t.id === tab)!;

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="px-6 pt-6 pb-0 border-b border-[hsl(var(--border))]"
           style={{ background: 'linear-gradient(180deg, hsl(220 20% 8%) 0%, hsl(220 18% 7%) 100%)' }}>
        <div className="flex items-center gap-4 mb-5">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <MessageCircle className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[hsl(var(--foreground))]">WhatsApp</h1>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
              Cloud API oficial — disparos, templates e opt-out integrado ao Live Chat
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          {TAB_CONFIG.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-xl border border-b-0 transition-all ${
                  active
                    ? 'bg-[hsl(var(--background))] border-[hsl(var(--border))] text-[hsl(var(--foreground))]'
                    : 'border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]/40'
                }`}
              >
                <t.icon className={`w-3.5 h-3.5 ${active ? 'text-emerald-400' : ''}`} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto bg-[hsl(var(--background))]">
        <div className="p-6">
          {tab === 'campaigns' && <WhatsAppCampaigns companyId={companyId} role={role} />}
          {tab === 'templates' && <WhatsAppTemplates companyId={companyId} role={role} />}
          {tab === 'optout'    && <WhatsAppOptOut    companyId={companyId} role={role} />}
        </div>
      </div>
    </div>
  );
}
