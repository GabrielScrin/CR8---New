import React, { useState } from 'react';
import { ChatSession, ChatMessage } from '../types';
import { Search, Bot, Paperclip, Send, User as UserIcon, MessageCircle } from 'lucide-react';
import { isSupabaseConfigured } from '../lib/supabase';

const mockSessions: ChatSession[] = [
  { id: '1', contactName: 'Ana Souza', platform: 'whatsapp', lastMessage: 'Gostaria de saber mais sobre o plano.', unread: 2, aiActive: true, tags: ['Interesse'] },
  { id: '2', contactName: '@pedro.marketing', platform: 'instagram', lastMessage: 'Qual o valor da consultoria?', unread: 0, aiActive: false, tags: ['Frio'] },
  { id: '3', contactName: 'Lucas Lima', platform: 'whatsapp', lastMessage: 'Obrigado pelo atendimento.', unread: 0, aiActive: true, tags: ['Cliente'] },
];

const mockMessages: ChatMessage[] = [
  { id: '1', sender: 'user', content: 'Olá, gostaria de saber mais sobre o plano.', timestamp: new Date(), platform: 'whatsapp' },
  { id: '2', sender: 'agent', content: 'Olá! Claro, sou o assistente virtual da 8 Engage. Qual sua principal dúvida?', timestamp: new Date(), platform: 'whatsapp' },
];

export const LiveChat: React.FC = () => {
  if (isSupabaseConfigured()) {
    return (
      <div className="flex h-[calc(100vh-8rem)] bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden items-center justify-center">
        <div className="max-w-md text-center px-6">
          <h2 className="text-xl font-bold text-gray-800">Live Chat</h2>
          <p className="text-gray-500 mt-2 text-sm">
            Integração WhatsApp/Instagram é a Fase 3. Aqui ficará a central omnichannel.
          </p>
        </div>
      </div>
    );
  }

  const [activeSessionId, setActiveSessionId] = useState<string | null>(mockSessions[0].id);
  const [messageInput, setMessageInput] = useState('');

  const activeSession = mockSessions.find(s => s.id === activeSessionId);

  return (
    <div className="flex h-[calc(100vh-8rem)] bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Sidebar List */}
      <div className="w-80 border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
            <input 
              type="text" 
              placeholder="Buscar conversa..." 
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {mockSessions.map(session => (
            <div 
              key={session.id}
              onClick={() => setActiveSessionId(session.id)}
              className={`p-4 border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors ${activeSessionId === session.id ? 'bg-indigo-50 border-l-4 border-l-indigo-600' : ''}`}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="font-semibold text-gray-800 text-sm">{session.contactName}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${
                    session.platform === 'whatsapp' ? 'bg-green-100 text-green-700' : 'bg-pink-100 text-pink-700'
                }`}>
                    {session.platform === 'whatsapp' ? 'WA' : 'IG'}
                </span>
              </div>
              <p className="text-xs text-gray-500 truncate mb-2">{session.lastMessage}</p>
              <div className="flex justify-between items-center">
                 <div className="flex gap-1">
                    {session.tags.map(tag => (
                        <span key={tag} className="bg-gray-100 text-gray-500 text-[10px] px-1 rounded">{tag}</span>
                    ))}
                 </div>
                 {session.aiActive && (
                     <Bot className="w-3 h-3 text-indigo-500" />
                 )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col bg-slate-50">
        {activeSession ? (
            <>
                {/* Chat Header */}
                <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
                    <div className="flex items-center">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 mr-3">
                            <UserIcon className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-800">{activeSession.contactName}</h3>
                            <span className="text-xs text-green-500 flex items-center">Online</span>
                        </div>
                    </div>
                    <div className="flex items-center space-x-3">
                         <div className="flex items-center space-x-2 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100">
                             <Bot className="w-4 h-4 text-indigo-600" />
                             <span className="text-xs font-medium text-indigo-700">IA Ativa</span>
                             <div className="w-8 h-4 bg-indigo-600 rounded-full relative cursor-pointer">
                                 <div className="w-3 h-3 bg-white rounded-full absolute right-0.5 top-0.5"></div>
                             </div>
                         </div>
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {mockMessages.map(msg => (
                        <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-start' : 'justify-end'}`}>
                            <div className={`max-w-[70%] p-4 rounded-xl shadow-sm text-sm ${
                                msg.sender === 'user' 
                                    ? 'bg-white text-gray-800 rounded-tl-none' 
                                    : 'bg-indigo-600 text-white rounded-tr-none'
                            }`}>
                                {msg.content}
                                <div className={`text-[10px] mt-1 text-right ${msg.sender === 'user' ? 'text-gray-400' : 'text-indigo-200'}`}>
                                    10:42 AM
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Input Area */}
                <div className="p-4 bg-white border-t border-gray-200">
                    <div className="flex items-center space-x-3 bg-gray-50 p-2 rounded-xl border border-gray-200 focus-within:ring-2 focus-within:ring-indigo-200 transition-shadow">
                        <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg">
                            <Paperclip className="w-5 h-5" />
                        </button>
                        <input 
                            type="text" 
                            value={messageInput}
                            onChange={(e) => setMessageInput(e.target.value)}
                            placeholder="Digite sua mensagem..." 
                            className="flex-1 bg-transparent border-none focus:ring-0 text-sm"
                        />
                        <button className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-sm transition-transform active:scale-95">
                            <Send className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </>
        ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                <MessageCircle className="w-16 h-16 mb-4 opacity-20" />
                <p>Selecione uma conversa para iniciar</p>
            </div>
        )}
      </div>
    </div>
  );
};
