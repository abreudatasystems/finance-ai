'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { fetchTransactions } from '@/services/data';
import { settleMany } from '@/components/cashflow/api';
import { ForecastPanel } from '@/components/cashflow/ForecastPanel';
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
  const [activeTab, setActiveTab] = useState<'all' | 'income' | 'expense' | 'pending' | 'open'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  // A list of every movement ever is unusable after two months. The period is
  // the first thing a cash flow needs.
  const [period, setPeriod] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [settling, setSettling] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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

  const periodOptions = React.useMemo(() => {
    const out: { value: string; label: string }[] = [{ value: 'all', label: 'Tudo' }];
    const now = new Date();
    for (let i = 0; i < 12; i += 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push({
        value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' }),
      });
    }
    return out;
  }, []);

  const filteredTransactions = transactions.filter((t) => {
    const matchesPeriod = period === 'all' || (t.date || '').startsWith(period);
    const matchesTab =
      activeTab === 'all' ? true :
      activeTab === 'income' ? t.type === 'income' :
      activeTab === 'expense' ? t.type === 'expense' :
      t.status === 'pending_approval' || t.status === 'pending_ai';

    const matchesSearch =
      t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.entity_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.category_name.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesOpen = activeTab !== 'open' || Number(t.outstanding_amount ?? 0) > 0;
    return matchesPeriod && matchesTab && matchesSearch && matchesOpen;
  });

  /* Totals for what is on screen — a cash flow without them is a list. */
  const totals = filteredTransactions.reduce(
    (acc, t) => {
      const gross = Number(t.gross_amount ?? t.amount ?? 0);
      if (t.type === 'income') acc.entradas += gross; else acc.saidas += gross;
      acc.aberto += Number(t.outstanding_amount ?? 0);
      return acc;
    },
    { entradas: 0, saidas: 0, aberto: 0 },
  );

  /* Oldest first, carrying a running balance — how a cash flow is read. */
  const withRunning = React.useMemo(() => {
    const ordered = [...filteredTransactions].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    let running = 0;
    const map = new Map<string, number>();
    ordered.forEach((t) => {
      running += t.type === 'income'
        ? Number(t.gross_amount ?? t.amount ?? 0)
        : -Number(t.gross_amount ?? t.amount ?? 0);
      map.set(t.id, running);
    });
    return map;
  }, [filteredTransactions]);

  const settleSelected = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Marcar ${selected.size} lançamento(s) como liquidado(s) hoje?`)) return;
    setSettling(true);
    setNotice(null);
    const res = await settleMany([...selected]);
    setSettling(false);
    if (res.error || !res.data) { setNotice(res.error || 'Não foi possível liquidar.'); return; }
    const { liquidados, falhados, total } = res.data;
    setNotice(
      falhados
        ? `${liquidados} liquidado(s) (${formatMoney(total)}), ${falhados} por liquidar.`
        : `${liquidados} lançamento(s) liquidado(s) — ${formatMoney(total)}.`,
    );
    setSelected(new Set());
    setTransactions(await fetchTransactions());
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  return (
    <div className="space-y-4 animate-in fade-in duration-300">

      {/* Will the money be there? Everything else on this page is history;
          this is the only part that looks forward. */}
      <ForecastPanel />

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
            onClick={() => setActiveTab('open')}
            className={`px-3.5 py-1.5 rounded-lg transition-all flex-shrink-0 ${
              activeTab === 'open' ? 'bg-white text-indigo-600 shadow-2xs font-bold' : 'hover:text-slate-900'
            }`}
          >
            Em aberto
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

        {/* Period — the first thing a cash flow needs */}
        <select
          value={period} onChange={(e) => setPeriod(e.target.value)}
          className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 bg-white font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
        >
          {periodOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

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

      {/* Totals for what is on screen, and the batch action */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-white border border-emerald-100">
          <p className="text-[9px] uppercase font-bold text-emerald-600">Entradas do período</p>
          <p className="font-bold text-emerald-700 text-sm mt-0.5">{formatMoney(totals.entradas)}</p>
        </div>
        <div className="p-3 rounded-xl bg-white border border-rose-100">
          <p className="text-[9px] uppercase font-bold text-rose-600">Saídas do período</p>
          <p className="font-bold text-rose-700 text-sm mt-0.5">{formatMoney(totals.saidas)}</p>
        </div>
        <div className="p-3 rounded-xl bg-white border border-slate-200">
          <p className="text-[9px] uppercase font-bold text-slate-500">Resultado do período</p>
          <p className={`font-bold text-sm mt-0.5 ${
            totals.entradas - totals.saidas < 0 ? 'text-rose-700' : 'text-slate-900'
          }`}>
            {formatMoney(totals.entradas - totals.saidas)}
          </p>
        </div>
        <div className="p-3 rounded-xl bg-white border border-slate-200">
          <p className="text-[9px] uppercase font-bold text-slate-500">Ainda em aberto</p>
          <p className="font-bold text-slate-900 text-sm mt-0.5">{formatMoney(totals.aberto)}</p>
        </div>
      </div>

      {notice && (
        <p className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs">{notice}</p>
      )}

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs">
          <span className="font-bold">{selected.size} selecionado(s)</span>
          <button
            onClick={settleSelected} disabled={settling}
            className="ml-auto px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 font-bold flex items-center gap-1.5 disabled:opacity-50"
          >
            {settling ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            Marcar como liquidado hoje
          </button>
          <button onClick={() => setSelected(new Set())} className="px-2 py-1.5 rounded-lg hover:bg-white/10">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* MAIN TRANSACTIONS TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] tracking-wider font-bold">
                <th className="p-3.5 w-8"></th>
                <th className="p-3.5">Data</th>
                <th className="p-3.5">Descrição Profissional</th>
                <th className="p-3.5 hidden md:table-cell">Entidade (Fornecedor/Cliente)</th>
                <th className="p-3.5 hidden lg:table-cell">Categoria (Hierarquia)</th>
                <th className="p-3.5 hidden xl:table-cell">Centro Custo</th>
                <th className="p-3.5 hidden xl:table-cell">IVA</th>
                <th className="p-3.5">Valor Total</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 hidden sm:table-cell">Pagamento</th>
                <th className="p-3.5 text-right hidden lg:table-cell">Saldo acumulado</th>
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
                  <td className="p-3.5" onClick={(e) => e.stopPropagation()}>
                    {Number(trx.outstanding_amount ?? 0) > 0 ? (
                      <input
                        type="checkbox" checked={selected.has(trx.id)}
                        onChange={() => toggle(trx.id)}
                        className="rounded"
                        title="Selecionar para liquidar"
                      />
                    ) : (
                      <span className="text-slate-200">—</span>
                    )}
                  </td>
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
                  <td className={`p-3.5 text-right font-mono text-[11px] hidden lg:table-cell ${
                    (withRunning.get(trx.id) ?? 0) < 0 ? 'text-rose-600 font-bold' : 'text-slate-500'
                  }`}>
                    {formatMoney(withRunning.get(trx.id) ?? 0)}
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
