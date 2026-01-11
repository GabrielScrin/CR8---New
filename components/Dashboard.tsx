import React from 'react';
import { TrendingUp, Users, DollarSign, Activity } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const data = [
  { name: '01', leads: 400, sales: 240 },
  { name: '05', leads: 300, sales: 139 },
  { name: '10', leads: 200, sales: 980 },
  { name: '15', leads: 278, sales: 390 },
  { name: '20', leads: 189, sales: 480 },
  { name: '25', leads: 239, sales: 380 },
  { name: '30', leads: 349, sales: 430 },
];

export const Dashboard: React.FC = () => {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Visão Geral</h2>
      
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-blue-100 p-3 rounded-lg">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <span className="text-green-500 text-sm font-medium flex items-center">
              +12% <TrendingUp className="w-3 h-3 ml-1" />
            </span>
          </div>
          <h3 className="text-gray-500 text-sm font-medium">Total de Leads</h3>
          <p className="text-2xl font-bold text-gray-900">2,543</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-green-100 p-3 rounded-lg">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
            <span className="text-green-500 text-sm font-medium flex items-center">
              +8% <TrendingUp className="w-3 h-3 ml-1" />
            </span>
          </div>
          <h3 className="text-gray-500 text-sm font-medium">Receita Total</h3>
          <p className="text-2xl font-bold text-gray-900">R$ 45.200</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-purple-100 p-3 rounded-lg">
              <Activity className="w-6 h-6 text-purple-600" />
            </div>
            <span className="text-red-500 text-sm font-medium flex items-center">
              -2% <TrendingUp className="w-3 h-3 ml-1 rotate-180" />
            </span>
          </div>
          <h3 className="text-gray-500 text-sm font-medium">CPA Médio</h3>
          <p className="text-2xl font-bold text-gray-900">R$ 12.40</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-orange-100 p-3 rounded-lg">
              <Users className="w-6 h-6 text-orange-600" />
            </div>
            <span className="text-green-500 text-sm font-medium flex items-center">
              +5% <TrendingUp className="w-3 h-3 ml-1" />
            </span>
          </div>
          <h3 className="text-gray-500 text-sm font-medium">Novos Clientes</h3>
          <p className="text-2xl font-bold text-gray-900">124</p>
        </div>
      </div>

      {/* Chart Section */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold mb-6 text-gray-700">Performance de Leads vs Vendas</h3>
        <div className="h-80 w-full">
           <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#82ca9d" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="name" stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" />
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <Tooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'}} />
              <Area type="monotone" dataKey="leads" stroke="#8884d8" fillOpacity={1} fill="url(#colorLeads)" />
              <Area type="monotone" dataKey="sales" stroke="#82ca9d" fillOpacity={1} fill="url(#colorSales)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};