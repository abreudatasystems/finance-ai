'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { fetchTransactions } from '@/services/data';
import { Transaction } from '@/types';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Filter,
  Search,
  Plus,
  FileText,
  Clock,
  CheckCircle2,
  X,
  Sparkles,
  ChevronRight,
  Tag,
  ShieldCheck,
  Calendar,
  Building2,
  RefreshCcw
} from 'lucide-react';

export default function CashFlowPage() {
  const router = useRouter();
  const { formatMoney } = useApp();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'income' | 'expense' | 'pending'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    async function load() {
      const trxs = await fetchTransactions();
      setTransactions(trxs);
    }
    load();
  }, []);

  const filteredTransactions = transactions.filter((t) => {
    const matchesTab =
      activeTab === 'all' ? true :
      activeTab === 'income' ? t.type === 'income' :
      activeTab === 'expense' ? t.type === 'expense' :
      t.status === 'pending_approval' || t.status === 'pending_ai';

    const matchesSearch =
      t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.entity_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.category_name.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesTab && matchesSearch;
  });

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight">
            Fluxo de Caixa &amp; Movimentos
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Gestão profissional de todas as entradas, saídas e previsões de caixa
          </p>
        </div>
      </div>

      {/* Tabs & Filter Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
        
        {/* Navigation Tabs */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-600 w-full sm:w-auto">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg transition-all ${
              activeTab === 'all' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'hover:text-slate-900'
            }`}
          >
            Todos os Lançamentos ({transactions.length})
          </button>
          <button
            onClick={() => setActiveTab('income')}
            className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg transition-all ${
              activeTab === 'income' ? 'bg-white text-emerald-600 shadow-2xs font-bold' : 'hover:text-slate-900'
            }`}
          >
            Receitas (+ €)
          </button>
          <button
            onClick={() => setActiveTab('expense')}
            className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg transition-all ${
              activeTab === 'expense' ? 'bg-white text-rose-600 shadow-2xs font-bold' : 'hover:text-slate-900'
            }`}
          >
            Despesas (- €)
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg transition-all ${
              activeTab === 'pending' ? 'bg-white text-amber-600 shadow-2xs font-bold' : 'hover:text-slate-900'
            }`}
          >
            Pendentes IA 🤖
          </button>
        </div>

        {/* Filter Input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filtrar por movimento ou fornecedor..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
          />
        </div>

      </div>

      {/* MAIN TRANSACTIONS TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] tracking-wider font-bold">
                <th className="p-3.5">Data</th>
                <th className="p-3.5">Descrição Profissional</th>
                <th className="p-3.5">Entidade (Fornecedor/Cliente)</th>
                <th className="p-3.5">Categoria (Hierarquia)</th>
                <th className="p-3.5">Centro Custo</th>
                <th className="p-3.5">Valor Total</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Origem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTransactions.map((trx) => (
                <tr
                  key={trx.id}
                  onClick={() => router.push(`/financial/cash-flow/${trx.id}`)}
                  className="hover:bg-indigo-50/40 transition-colors cursor-pointer font-medium"
                >
                  <td className="p-3.5 text-slate-500 font-mono text-[11px]">{trx.date}</td>
                  <td className="p-3.5 font-bold text-slate-900">{trx.description}</td>
                  <td className="p-3.5 text-slate-700 font-medium">{trx.entity_name}</td>
                  <td className="p-3.5 text-slate-600">{trx.category_name}</td>
                  <td className="p-3.5 text-slate-500">{trx.cost_center_name || 'Geral'}</td>
                  <td className={`p-3.5 font-extrabold ${trx.type === 'income' ? 'text-emerald-600' : 'text-slate-900'}`}>
                    {trx.type === 'income' ? '+' : '-'}{formatMoney(trx.amount)}
                  </td>
                  <td className="p-3.5">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                      trx.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                      trx.status === 'approved' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                      'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {trx.status}
                    </span>
                  </td>
                  <td className="p-3.5 text-right font-mono text-[11px] text-slate-500">
                    {trx.source === 'ai' ? '🤖 IA' : '✋ Manual'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
