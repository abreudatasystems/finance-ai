'use client';

import React, { useEffect, useState } from 'react';
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
  const { formatMoney } = useApp();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'income' | 'expense' | 'pending'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTrx, setSelectedTrx] = useState<Transaction | null>(null);

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
                  onClick={() => setSelectedTrx(trx)}
                  className={`hover:bg-indigo-50/40 transition-colors cursor-pointer font-medium ${
                    selectedTrx?.id === trx.id ? 'bg-indigo-50/70 border-l-4 border-indigo-600' : ''
                  }`}
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

      {/* DETAIL SIDE PANEL (DRAWER) */}
      {selectedTrx && (
        <div className="fixed inset-0 z-50 overflow-hidden select-none">
          <div onClick={() => setSelectedTrx(null)} className="absolute inset-0 bg-slate-900/30 backdrop-blur-xs" />
          <aside className="absolute inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md bg-white shadow-2xl border-l border-slate-200 flex flex-col h-full animate-in slide-in-from-right duration-200 p-6 overflow-y-auto space-y-6">
              
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-bold text-sm text-slate-900">Detalhe Completo do Lançamento</h3>
                </div>
                <button onClick={() => setSelectedTrx(null)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Title & Amount Header */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{selectedTrx.type.toUpperCase()}</span>
                <div className="text-xl font-extrabold text-slate-900">{selectedTrx.description}</div>
                <div className={`text-2xl font-black ${selectedTrx.type === 'income' ? 'text-emerald-600' : 'text-slate-900'}`}>
                  {selectedTrx.type === 'income' ? '+' : '-'}{formatMoney(selectedTrx.amount)}
                </div>
              </div>

              {/* General Information Grid */}
              <div className="space-y-3 text-xs">
                <h4 className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Informações Gerais</h4>
                
                <div className="grid grid-cols-2 gap-2 bg-white p-3 rounded-xl border border-slate-200/80">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Data do Movimento:</span>
                    <span className="font-semibold text-slate-800">{selectedTrx.date}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Vencimento:</span>
                    <span className="font-semibold text-slate-800">{selectedTrx.due_date || selectedTrx.date}</span>
                  </div>
                </div>

                <div className="p-3 bg-white rounded-xl border border-slate-200/80 space-y-2">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Entidade / Fornecedor:</span>
                    <span className="font-bold text-slate-900">{selectedTrx.entity_name}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Categoria Financeira:</span>
                    <span className="font-semibold text-indigo-700">{selectedTrx.category_name}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Centro de Custo:</span>
                    <span className="font-semibold text-slate-700">{selectedTrx.cost_center_name || 'Geral'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Método de Pagamento:</span>
                    <span className="font-medium text-slate-700">{selectedTrx.payment_method || 'Cartão Empresarial'}</span>
                  </div>
                </div>
              </div>

              {/* Recurrence Section */}
              <div className="p-3.5 bg-indigo-50/50 rounded-xl border border-indigo-100 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RefreshCcw className="w-4 h-4 text-indigo-600" />
                  <span className="font-semibold text-indigo-950">Recorrência Automática</span>
                </div>
                <span className="font-bold text-indigo-700 bg-white px-2 py-0.5 rounded border border-indigo-200">
                  {selectedTrx.is_recurring ? 'Sim (Mensal)' : 'Não'}
                </span>
              </div>

              {/* AI Details */}
              <div className="p-3.5 bg-gradient-to-br from-indigo-900 to-slate-900 text-white rounded-xl space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    Origem &amp; Confiança IA
                  </span>
                  <span className="font-mono text-emerald-400 font-bold">{selectedTrx.ai_confidence || 96}%</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Classificado automaticamente com base no histórico do fornecedor e palavras-chave.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex gap-2">
                <button
                  onClick={() => setSelectedTrx(null)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
                >
                  Fechar
                </button>
                <button
                  onClick={() => {
                    alert('Lançamento Aprovado com sucesso!');
                    setSelectedTrx(null);
                  }}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-colors shadow-xs"
                >
                  ✅ Confirmar Lançamento
                </button>
              </div>

            </div>
          </aside>
        </div>
      )}

    </div>
  );
}
