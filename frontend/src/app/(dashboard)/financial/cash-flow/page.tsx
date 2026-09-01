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
  Building2,
  RefreshCcw,
  Bot,
  User
} from 'lucide-react';

export default function CashFlowPage() {
  const router = useRouter();
  const { formatMoney, setPageHeader } = useApp();
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

  useEffect(() => {
    setPageHeader('Fluxo de Caixa & Movimentos', 'Gestão profissional de todas as entradas, saídas e previsões de caixa');
  }, [setPageHeader]);

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
      

      {/* Tabs & Filter Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
        
        {/* Navigation Tabs */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-600 w-full sm:w-auto overflow-x-auto whitespace-nowrap hide-scrollbar">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3.5 py-1.5 rounded-lg transition-all flex-shrink-0 ${
              activeTab === 'all' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'hover:text-slate-900'
            }`}
          >
            Todos os Lançamentos ({transactions.length})
          </button>
          <button
            onClick={() => setActiveTab('income')}
            className={`px-3.5 py-1.5 rounded-lg transition-all flex-shrink-0 ${
              activeTab === 'income' ? 'bg-white text-emerald-600 shadow-2xs font-bold' : 'hover:text-slate-900'
            }`}
          >
            Receitas (+ €)
          </button>
          <button
            onClick={() => setActiveTab('expense')}
            className={`px-3.5 py-1.5 rounded-lg transition-all flex-shrink-0 ${
              activeTab === 'expense' ? 'bg-white text-rose-600 shadow-2xs font-bold' : 'hover:text-slate-900'
            }`}
          >
            Despesas (- €)
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 flex-shrink-0 ${
              activeTab === 'pending' ? 'bg-white text-amber-600 shadow-2xs font-bold' : 'hover:text-slate-900'
            }`}
          >
            <span>Pendentes IA</span> <Bot className="w-3.5 h-3.5" />
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
                <th className="p-3.5 hidden md:table-cell">Entidade (Fornecedor/Cliente)</th>
                <th className="p-3.5 hidden lg:table-cell">Categoria (Hierarquia)</th>
                <th className="p-3.5 hidden xl:table-cell">Centro Custo</th>
                <th className="p-3.5 hidden xl:table-cell">IVA</th>
                <th className="p-3.5">Valor Total</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 hidden sm:table-cell">Pagamento</th>
                <th className="p-3.5 text-right hidden xl:table-cell">Origem</th>
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
                  <td className="p-3.5 text-slate-700 font-medium hidden md:table-cell">{trx.entity_name}</td>
                  <td className="p-3.5 text-slate-600 hidden lg:table-cell">{trx.category_name}</td>
                  <td className="p-3.5 text-slate-500 hidden xl:table-cell">{trx.cost_center_name || 'Geral'}</td>
                  <td className="p-3.5 text-slate-500 whitespace-nowrap hidden xl:table-cell">
                    {trx.vat_amount ? (
                      <>
                        {formatMoney(Number(trx.vat_amount))}
                        {trx.vat_rate ? <span className="text-[10px] text-slate-400 ml-1">({trx.vat_rate}%)</span> : null}
                      </>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className={`p-3.5 font-extrabold ${trx.type === 'income' ? 'text-emerald-600' : 'text-slate-900'}`}>
                    {trx.type === 'income' ? '+' : '-'}{formatMoney(Number(trx.gross_amount ?? trx.amount))}
                  </td>
                  <td className="p-3.5">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase whitespace-nowrap ${
                      trx.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                      trx.status === 'approved' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                      'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {trx.status}
                    </span>
                  </td>
                  <td className="p-3.5 hidden sm:table-cell">
                    {trx.payment_status ? (
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border whitespace-nowrap ${
                        trx.payment_status === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        trx.payment_status === 'partially_paid' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                        trx.payment_status === 'overdue' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                        'bg-slate-100 text-slate-600 border-slate-200'
                      }`}>
                        {trx.payment_status === 'paid' ? 'Pago'
                          : trx.payment_status === 'partially_paid' ? 'Parcial'
                          : trx.payment_status === 'overdue' ? 'Vencido'
                          : 'Pendente'}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="p-3.5 text-right font-mono text-[11px] text-slate-500 hidden xl:table-cell">
                    {trx.source === 'ai' ? (
                      <span className="flex items-center justify-end gap-1"><Bot className="w-3.5 h-3.5" /> IA</span>
                    ) : (
                      <span className="flex items-center justify-end gap-1"><User className="w-3.5 h-3.5" /> Manual</span>
                    )}
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
