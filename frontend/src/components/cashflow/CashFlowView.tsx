'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useApp } from '@/context/AppContext';
import { fetchTransactions } from '@/services/data';
import { settleMany } from '@/components/cashflow/api';
import { ForecastPanel } from '@/components/cashflow/ForecastPanel';
import { Transaction } from '@/types';
import {Search, CheckCircle2, X, RefreshCcw, Bot, User} from 'lucide-react';

export interface CashFlowViewProps {
  mode?: 'cash-flow' | 'payables' | 'receivables';
}
export function CashFlowContent({ mode = 'cash-flow' }: CashFlowViewProps) {
  const router = useRouter();
  const { formatMoney, setPageHeader } = useApp();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'income' | 'expense' | 'pending' | 'open'>(mode === 'cash-flow' ? 'all' : 'open');
  const [searchTerm, setSearchTerm] = useState('');
  // A list of every movement ever is unusable after two months. The period is
  // the first thing a cash flow needs.
  // Enquanto se olha para o que está em aberto, o sentido é a pergunta
  // seguinte: pagar e receber são duas listas de trabalho diferentes.
  const [direction, setDirection] = React.useState<'all' | 'expense' | 'income'>(mode === 'payables' ? 'expense' : mode === 'receivables' ? 'income' : 'all');
  const params = useSearchParams();

  // As contas a pagar e a receber encaminham para aqui; um marcador antigo ou
  // um alerta tem de aterrar já no separador e no sentido certos.
  useEffect(() => {
    const tab = params.get('tab');
    const dir = params.get('dir');
    if (tab === 'open') setActiveTab('open');
    if (dir === 'expense' || dir === 'income') setDirection(dir);
  }, [params]);
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
    if (mode === 'payables') {
      setPageHeader('Contas a Pagar', 'Gestão de despesas e obrigações financeiras pendentes');
    } else if (mode === 'receivables') {
      setPageHeader('Contas a Receber', 'Gestão de receitas e recebimentos pendentes');
    } else {
      setPageHeader('Fluxo de Caixa & Movimentos', 'Gestão profissional de todas as entradas, saídas e previsões de caixa');
    }
  }, [setPageHeader, mode]);

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
    const matchesPeriod = period === 'all' || activeTab === 'open' || (t.date || '').startsWith(period);
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
    const matchesDirection =
      activeTab !== 'open' || direction === 'all' || t.type === direction;
    return matchesPeriod && matchesTab && matchesSearch && matchesOpen && matchesDirection;
  });

  /* What actually moves through the bank. Not the document total: any
     retention at source goes to the State, so a cash flow that sums the gross
     overstates every retained invoice by the withholding. */
  const moves = (t: Transaction) =>
    Number(t.payable_amount ?? t.gross_amount ?? t.amount ?? 0);

  /* Totals for what is on screen — a cash flow without them is a list. */
  const totals = filteredTransactions.reduce(
    (acc, t) => {
      const amount = moves(t);
      if (t.type === 'income') acc.entradas += amount; else acc.saidas += amount;
      acc.aberto += Number(t.outstanding_amount ?? 0);
      acc.retido += Number(t.retention_amount ?? 0);
      return acc;
    },
    { entradas: 0, saidas: 0, aberto: 0, retido: 0 },
  );

  /* Vencido, hoje, próximos sete dias.
     A antiguidade de saldos das Cobranças responde "há quanto tempo"; isto
     responde "o que tenho de tratar esta semana", que é outra pergunta e a
     razão de este separador existir. */
  const buckets = React.useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 7);
    const week = horizon.toISOString().slice(0, 10);

    const open = filteredTransactions.filter((t) => Number(t.outstanding_amount ?? 0) > 0);
    const due = (t: Transaction) => t.due_date || t.date || '';
    const sum = (rows: Transaction[]) =>
      rows.reduce((acc, t) => acc + Number(t.outstanding_amount ?? 0), 0);

    const overdue = open.filter((t) => due(t) < today);
    const dueToday = open.filter((t) => due(t) === today);
    const dueWeek = open.filter((t) => due(t) > today && due(t) <= week);

    return {
      vencido: { total: sum(overdue), count: overdue.length },
      hoje: { total: sum(dueToday), count: dueToday.length },
      semana: { total: sum(dueWeek), count: dueWeek.length },
      aberto: { total: sum(open), count: open.length },
    };
  }, [filteredTransactions]);

  /* Oldest first, carrying a running balance — how a cash flow is read. */
  const withRunning = React.useMemo(() => {
    const ordered = [...filteredTransactions].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    let running = 0;
    const map = new Map<string, number>();
    ordered.forEach((t) => {
      const amount = Number(t.payable_amount ?? t.gross_amount ?? t.amount ?? 0);
      running += t.type === 'income' ? amount : -amount;
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
      {mode === 'cash-flow' && <ForecastPanel />}

      {/* Tabs & Filter Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
        
        {/* Navigation Tabs */}
        {mode === 'cash-flow' && (
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
        </div>
        )}

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

      {/* Em aberto: o sentido e os prazos, que é a lista de trabalho da semana.
          As contas a pagar e a receber viviam em páginas próprias a fazer isto
          pior; agora estão aqui, ao lado de quem as liquida. */}
      {activeTab === 'open' && (
        <div className="space-y-3">
          {mode === 'cash-flow' && (
            <div className="flex items-center bg-slate-100 p-1 rounded-xl w-full sm:w-auto sm:inline-flex">
            {([
              ['all', `Tudo (${buckets.aberto.count})`],
              ['expense', 'A pagar'],
              ['income', 'A receber'],
            ] as const).map(([key, label]) => (
              <button
                key={key} onClick={() => setDirection(key)}
                className={`px-3 py-1.5 rounded-lg font-bold text-[11px] flex-1 sm:flex-none ${
                  direction === key ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-white border border-rose-200">
              <p className="text-[9px] uppercase font-bold text-rose-600">Vencido</p>
              <p className="font-bold text-rose-700 text-sm mt-0.5">{formatMoney(buckets.vencido.total)}</p>
              <p className="text-[10px] text-slate-400">{buckets.vencido.count} documento(s)</p>
            </div>
            <div className="p-3 rounded-xl bg-white border border-amber-200">
              <p className="text-[9px] uppercase font-bold text-amber-600">Vence hoje</p>
              <p className="font-bold text-amber-700 text-sm mt-0.5">{formatMoney(buckets.hoje.total)}</p>
              <p className="text-[10px] text-slate-400">{buckets.hoje.count} documento(s)</p>
            </div>
            <div className="p-3 rounded-xl bg-white border border-slate-200">
              <p className="text-[9px] uppercase font-bold text-slate-500">Próximos 7 dias</p>
              <p className="font-bold text-slate-900 text-sm mt-0.5">{formatMoney(buckets.semana.total)}</p>
              <p className="text-[10px] text-slate-400">{buckets.semana.count} documento(s)</p>
            </div>
            <div className="p-3 rounded-xl bg-white border border-slate-200">
              <p className="text-[9px] uppercase font-bold text-slate-500">Total em aberto</p>
              <p className="font-bold text-slate-900 text-sm mt-0.5">{formatMoney(buckets.aberto.total)}</p>
              <p className="text-[10px] text-slate-400">
                <Link href="/financial/collections" className="hover:text-indigo-600">
                  ver antiguidade →
                </Link>
              </p>
            </div>
          </div>
        </div>
      )}

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
          {/* Money that never reaches either side: it goes to the State. */}
          {totals.retido > 0 && (
            <p className="text-[10px] font-bold text-amber-700 mt-0.5">
              {formatMoney(totals.retido)} retidos na fonte
            </p>
          )}
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
                    {trx.type === 'income' ? '+' : '-'}{formatMoney(moves(trx))}
                    {Number(trx.retention_amount ?? 0) > 0 && (
                      <span
                        className="block text-[9px] font-bold text-amber-700 normal-case"
                        title={`Documento de ${formatMoney(Number(trx.gross_amount ?? trx.amount))}, com ${formatMoney(Number(trx.retention_amount))} de retenção na fonte`}
                      >
                        ret. −{formatMoney(Number(trx.retention_amount))}
                      </span>
                    )}
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

