import React, { useEffect, useState } from 'react';
import { Lead } from '../types';
import { MoreHorizontal, Phone, Mail, MessageCircle, RefreshCw } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const mockLeads: Lead[] = [
  { id: '1', name: 'Juliana Silva', phone: '11999999999', email: 'juliana@email.com', status: 'new', source: 'Instagram', lastInteraction: '10 min atrás', value: 1500 },
  { id: '2', name: 'Marcos Oliveira', phone: '11988888888', email: 'marcos@email.com', status: 'contacted', source: 'WhatsApp', lastInteraction: '2 horas atrás', value: 2990 },
  { id: '3', name: 'Empresa XYZ', phone: '11977777777', email: 'contato@xyz.com', status: 'proposal', source: 'Manual', lastInteraction: '1 dia atrás', value: 5000 },
  { id: '4', name: 'Roberto Santos', phone: '11966666666', email: 'roberto@email.com', status: 'won', source: 'WhatsApp', lastInteraction: '3 dias atrás', value: 1500 },
];

export const CRM: React.FC = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLeads = async () => {
    if (!isSupabaseConfigured()) {
        setLeads(mockLeads);
        return;
    }

    setLoading(true);
    try {
        const { data, error } = await supabase.from('leads').select('*');
        if (error) {
            console.error('Error fetching leads:', error);
            setLeads(mockLeads); // Fallback
        } else {
            // Mapping Snake_case DB to CamelCase TS Type if necessary
            // Assuming DB matches structure for simplicity in this demo, or we map it:
            const mappedLeads: Lead[] = data.map((d: any) => ({
                id: d.id,
                name: d.name,
                phone: d.phone,
                email: d.email,
                status: d.status,
                source: d.source,
                lastInteraction: d.last_interaction || 'Recentemente',
                value: d.value,
                utm_source: d.utm_source
            }));
            setLeads(mappedLeads.length > 0 ? mappedLeads : mockLeads);
        }
    } catch (err) {
        console.error(err);
        setLeads(mockLeads);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  const columns = [
    { id: 'new', title: 'Novos Leads', color: 'border-blue-400' },
    { id: 'contacted', title: 'Em Contato', color: 'border-yellow-400' },
    { id: 'proposal', title: 'Proposta Enviada', color: 'border-purple-400' },
    { id: 'won', title: 'Fechado/Ganho', color: 'border-green-400' },
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Pipeline de Vendas</h2>
        <div className="flex space-x-2">
            <button 
                onClick={fetchLeads}
                className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
                title="Atualizar"
            >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
            + Novo Lead
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto">
        <div className="flex space-x-4 min-w-[1000px] h-full pb-4">
          {columns.map((col) => (
            <div key={col.id} className="flex-1 bg-gray-50 rounded-xl p-4 flex flex-col border border-gray-200 min-w-[250px]">
              <div className={`flex justify-between items-center mb-4 pb-2 border-b-2 ${col.color}`}>
                <h3 className="font-semibold text-gray-700">{col.title}</h3>
                <span className="bg-gray-200 text-gray-600 text-xs px-2 py-1 rounded-full">
                  {leads.filter(l => l.status === col.id).length}
                </span>
              </div>

              <div className="space-y-3 overflow-y-auto scrollbar-hide flex-1">
                {leads.filter(l => l.status === col.id).map(lead => (
                  <div key={lead.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer group">
                    <div className="flex justify-between items-start mb-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold tracking-wider ${
                        lead.source === 'WhatsApp' ? 'bg-green-100 text-green-700' : 
                        lead.source === 'Instagram' ? 'bg-pink-100 text-pink-700' : 
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {lead.source}
                      </span>
                      <button className="text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <h4 className="font-medium text-gray-900 mb-1">{lead.name}</h4>
                    <p className="text-sm text-gray-500 mb-3 truncate">{lead.email}</p>
                    
                    <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-50">
                        <div className="font-semibold text-gray-700 text-sm">
                            R$ {lead.value?.toLocaleString()}
                        </div>
                        <div className="flex space-x-2">
                             <button className="p-1.5 text-gray-400 hover:text-green-500 hover:bg-green-50 rounded-md">
                                <MessageCircle className="w-4 h-4" />
                            </button>
                            <button className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-md">
                                <Phone className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};