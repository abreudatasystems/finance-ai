'use client';

import React, { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { fetchTransactions } from '@/services/data';
import { settleOne } from '@/components/cashflow/api';
import { Transaction } from '@/types';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function ReceivablesPage() {
  const { formatMoney, setPageHeader } = useApp();
  const router = useRouter();
  const [receivables, setReceivables] = useState<Transaction[]>([]);
  const [receivedIds, setReceivedIds] = useState<string[]>([]);
  const [loadingReceivedId, setLoadingReceivedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const trxs = await fetchTransactions();
      setReceivables(trxs.filter(t => t.type === 'income'));
    }
    load();
  }, []);

  useEffect(() => {
    setPageHeader('Contas a Receber', 'Gestão de faturas emitidas e cobranças de clientes');
  }, [setPageHeader]);

  /* Registar um recebimento a sério — ver a nota em contas a pagar: escrever
   * o estado por PATCH pintava o ecrã de verde sem mover dinheiro nenhum. */
  const handleMarkReceived = async (id: string) => {
    setLoadingReceivedId(id);
    setError(null);
    const { error: failure } = await settleOne(id);
    setLoadingReceivedId(null);
    if (failure) {
      setError(failure);
      return;
    }
    setReceivables((await fetchTransactions()).filter((t) => t.type === 'income'));
  };

  /* O que move no banco: o total menos a retenção na fonte, que vai para o
     Estado e nunca chega à contraparte. Somar o bruto exagerava cada
     documento retido pelo valor da retenção. */
  const moves = (t: Transaction) =>
    Number(t.payable_amount ?? t.gross_amount ?? t.amount ?? 0);

  const todayStr = new Date().toISOString().slice(0, 10);
  const currentMonthStr = todayStr.slice(0, 7);
  const next7DaysDate = new Date();
  next7DaysDate.setDate(next7DaysDate.getDate() + 7);
  const next7DaysStr = next7DaysDate.toISOString().slice(0, 10);

  const pendingReceivables = receivables.filter(t => !receivedIds.includes(t.id) && t.status !== 'received' && t.status !== 'paid' && t.payment_status !== 'paid');
  const totalPending = pendingReceivables.reduce((acc, curr) => acc + moves(curr), 0);

  const receivedThisMonth = receivables.filter(t => {
    const isRec = receivedIds.includes(t.id) || t.status === 'received' || t.status === 'paid' || t.payment_status === 'paid';
    const dt = t.payment_date || t.date;
    return isRec && dt.startsWith(currentMonthStr);
  });
  const totalReceivedThisMonth = receivedThisMonth.reduce((acc, curr) => acc + moves(curr), 0);

  const next7Days = pendingReceivables.filter(t => {
    const d = t.due_date || t.date;
    return d >= todayStr && d <= next7DaysStr;
  });
  const totalNext7Days = next7Days.reduce((acc, curr) => acc + moves(curr), 0);

  const totalCount = receivables.length;
  const collectionRate = totalCount > 0 ? (((totalCount - pendingReceivables.length) / totalCount) * 100).toFixed(1) : '100.0';

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-800 px-3 py-2 text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-semibold text-slate-500">Total a Receber</span>
          <div className="text-xl font-extrabold text-emerald-600 mt-1">{formatMoney(totalPending)}</div>
          <span className="text-[10px] text-slate-400 font-medium">{pendingReceivables.length} recebimentos previstos</span>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-emerald-200 shadow-xs bg-emerald-50/20">
          <span className="text-xs font-semibold text-emerald-700">Recebido este Mês</span>
          <div className="text-xl font-extrabold text-emerald-700 mt-1">{formatMoney(totalReceivedThisMonth)}</div>
          <span className="text-[10px] text-emerald-600 font-medium">{receivedThisMonth.length} faturas liquidadas</span>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-semibold text-slate-500">Próximos 7 Dias</span>
          <div className="text-xl font-extrabold text-slate-900 mt-1">{formatMoney(totalNext7Days)}</div>
          <span className="text-[10px] text-slate-400 font-medium">{next7Days.length} faturas programadas</span>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-semibold text-slate-500">Taxa de Cobrança</span>
          <div className="text-xl font-extrabold text-slate-900 mt-1">{collectionRate}%</div>
          <span className="text-[10px] text-slate-400 font-medium">Eficiência de liquidação</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] tracking-wider font-bold">
              <th className="p-3.5">Vencimento</th>
              <th className="p-3.5">Cliente</th>
              <th className="p-3.5">Descrição</th>
              <th className="p-3.5">Categoria</th>
              <th className="p-3.5">Valor Total</th>
              <th className="p-3.5">Status</th>
              <th className="p-3.5 text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {receivables.map((item) => {
              const isReceived = receivedIds.includes(item.id) || item.status === 'received' || item.status === 'paid';
              return (
                <tr 
                  key={item.id} 
                  onClick={() => router.push(`/financial/cash-flow/${item.id}`)}
                  className="hover:bg-slate-50 transition-colors font-medium cursor-pointer"
                >
                  <td className="p-3.5 text-slate-600 font-mono">{item.due_date || item.date}</td>
                  <td className="p-3.5 font-bold text-slate-900">{item.entity_name}</td>
                  <td className="p-3.5 text-slate-700">{item.description}</td>
                  <td className="p-3.5 text-slate-600">{item.category_name}</td>
                  <td className="p-3.5 font-extrabold text-emerald-600">+{formatMoney(moves(item))}</td>
                  <td className="p-3.5">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                      isReceived ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
                    }`}>
                      {isReceived ? 'Recebido' : 'Pendente'}
                    </span>
                  </td>
                  <td className="p-3.5 text-right">
                    {isReceived ? (
                      <span className="text-emerald-600 font-bold flex items-center justify-end gap-1">
                        <CheckCircle2 className="w-4 h-4" /> Confirmado
                      </span>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarkReceived(item.id);
                        }}
                        disabled={loadingReceivedId === item.id}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs transition-colors shadow-2xs flex items-center gap-1.5 ml-auto disabled:opacity-50"
                      >
                        {loadingReceivedId === item.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        <span>Confirmar Recebimento</span>
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </div>
  );
}

