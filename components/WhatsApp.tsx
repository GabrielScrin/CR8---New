import React, { useState } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { Role } from '../types';
import { WhatsAppCampaigns } from './WhatsAppCampaigns';
import { WhatsAppOptOut } from './WhatsAppOptOut';
import { WhatsAppTemplates } from './WhatsAppTemplates';

const Tabs = ({
  value,
  onChange,
  items,
}: {
  value: string;
  onChange: (v: string) => void;
  items: Array<{ id: string; label: string }>;
}) => {
  return (
    <div className="inline-flex rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-1">
      {items.map((it) => {
        const active = it.id === value;
        return (
          <button
            key={it.id}
            onClick={() => onChange(it.id)}
            className={`px-3 py-2 text-sm rounded-lg transition-colors ${
              active
                ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]'
            }`}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
};

export function WhatsApp({ companyId, role }: { companyId?: string; role: Role }) {
  if (!isSupabaseConfigured()) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold text-[hsl(var(--foreground))]">WhatsApp</h1>
        <p className="mt-2 text-[hsl(var(--muted-foreground))]">
          Configure o Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) para habilitar este módulo.
        </p>
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold text-[hsl(var(--foreground))]">WhatsApp</h1>
        <p className="mt-2 text-[hsl(var(--muted-foreground))]">Selecione/crie uma empresa para habilitar o WhatsApp.</p>
      </div>
    );
  }

  const [tab, setTab] = useState<'campaigns' | 'templates' | 'optout'>('campaigns');

  return (
    <div className="p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[hsl(var(--foreground))]">WhatsApp</h1>
          <p className="mt-2 text-[hsl(var(--muted-foreground))]">
            Disparos em massa (campanhas) e opt-out. Usa a Cloud API oficial e alimenta o Live Chat.
          </p>
        </div>
        <Tabs
          value={tab}
          onChange={(v) => setTab(v as any)}
          items={[
            { id: 'campaigns', label: 'Campanhas' },
            { id: 'templates', label: 'Templates' },
            { id: 'optout', label: 'Opt-out' },
          ]}
        />
      </div>

      <div className="mt-6">
        {tab === 'campaigns' ? <WhatsAppCampaigns companyId={companyId} role={role} /> : null}
        {tab === 'templates' ? <WhatsAppTemplates companyId={companyId} role={role} /> : null}
        {tab === 'optout' ? <WhatsAppOptOut companyId={companyId} role={role} /> : null}
      </div>
    </div>
  );
}
