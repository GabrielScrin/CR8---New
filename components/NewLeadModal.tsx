import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Lead } from '../types';

interface NewLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (newLead: Lead) => void;
  companyId?: string;
}

export const NewLeadModal: React.FC<NewLeadModalProps> = ({ isOpen, onClose, onSave, companyId }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [value, setValue] = useState('');
  const [source, setSource] = useState('Manual');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !companyId) {
      setError('O nome do lead é obrigatório.');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      // Usaremos um RPC para centralizar a lógica de criação e distribuição
      const { data, error: rpcError } = await supabase.rpc('create_lead_manual', {
        p_company_id: companyId,
        p_name: name,
        p_email: email || null,
        p_phone: phone || null,
        p_value: value ? parseFloat(value) : null,
        p_source: source,
      });

      if (rpcError) throw rpcError;

      // O RPC retorna o lead criado, podemos usar para atualizar a UI
      const newLead = data[0];

      onSave({
        ...newLead,
        // O RPC deve retornar todos os campos necessários,
        // mas podemos preencher alguns defaults caso não venham.
        id: newLead.id,
        status: newLead.status || 'new',
        lastInteraction: 'Agora',
      });
      
      handleClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Ocorreu um erro ao criar o lead.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    // Reset state
    setName('');
    setEmail('');
    setPhone('');
    setValue('');
    setSource('Manual');
    setError(null);
    setLoading(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center">
      <div className="bg-white rounded-lg p-8 shadow-2xl w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6">Adicionar Novo Lead</h2>
        
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">Nome *</label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                required
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700">Telefone</label>
              <input
                type="tel"
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div className="flex space-x-4">
                <div className="flex-1">
                    <label htmlFor="value" className="block text-sm font-medium text-gray-700">Valor (R$)</label>
                    <input
                        type="number"
                        id="value"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="1500.00"
                    />
                </div>
                <div className="flex-1">
                    <label htmlFor="source" className="block text-sm font-medium text-gray-700">Fonte</label>
                    <select
                        id="source"
                        value={source}
                        onChange={(e) => setSource(e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                    >
                        <option>Manual</option>
                        <option>Instagram</option>
                        <option>WhatsApp</option>
                        <option>Facebook</option>
                        <option>Site</option>
                    </select>
                </div>
            </div>
          </div>

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

          <div className="mt-8 flex justify-end space-x-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading ? 'Salvando...' : 'Salvar Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
