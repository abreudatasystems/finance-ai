'use client';

import React, { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { fetchTransactions } from '@/services/data';
import { settleOne } from '@/components/cashflow/api';
import { Transaction } from '@/types';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function PayablesPage() {
  const { formatMoney, setPageHeader } = useApp();
  const router = useRouter();
  const [payables, setPayables] = useState<Transaction[]>([]);
  const [paidIds, setPaidIds] = useState<string[]>([]);
  const [loadingPaymentId, setLoadingPaymentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const trxs = await fetchTransactions();
      setPayables(trxs.filter(t => t.type === 'expense'));
    }
    load();
  }, []);

  useEffect(() => {
    setPageHeader('Contas a Pagar', 'Gestão de obrigações e pagamentos a fornecedores');
  }, [setPageHeader]);

  /* Registar um pagamento a sério.
   *
   * Antes escrevia-se payment_status e paid_amount por PATCH — campos que o
   * backend recusa de propósito, porque o estado de liquidação é derivado dos
   * pagamentos. O resultado era um ecrã verde sem que dinheiro nenhum se
   * movesse, e um catch vazio marcava pago até quando o pedido falhava. */
  const handleMarkAsPaid = async (id: string) => {
    setLoadingPaymentId(id);
    setError(null);
    const { error: failure } = await settleOne(id);
    setLoadingPaymentId(null);
    if (failure) {
      setError(failure);
      return;
    }
    // Reler do servidor: o valor liquidado é o pagável, que já desconta a
    // retenção na fonte, e é ele que fecha o documento.
    setPayables((await fetchTransactions()).filter((t) => t.type === 'expense'));
  };

  /* O que move no banco: o total menos a retenção na fonte, que vai para o
     Estado e nunca chega à contraparte. Somar o bruto exagerava cada
     documento retido pelo valor da retenção. */
  const moves = (t: Transaction) =>
    Number(t.payable_amount ?? t.gross_amount ?? t.amount ?? 0);

  const todayStr = new Date().toISOString().slice(0, 10);
  const next7DaysDate = new Date();
  next7DaysDate.setDate(next7DaysDate.getDate() + 7);
  const next7DaysStr = next7DaysDate.toISOString().slice(0, 10);

  const unpaidPayables = payables.filter(t => !paidIds.includes(t.id) && t.payment_status !== 'paid' && t.status !== 'paid');
  const totalUnpaid = unpaidPayables.reduce((acc, curr) => acc + moves(curr), 0);
  const dueToday = unpaidPayables.filter(t => (t.due_date || t.date) === todayStr);
  const totalDueToday = dueToday.reduce((acc, curr) => acc + moves(curr), 0);
  const overdue = unpaidPayables.filter(t => (t.due_date || t.date) < todayStr);
  const totalOverdue = overdue.reduce((acc, curr) => acc + moves(curr), 0);
  const next7Days = unpaidPayables.filter(t => {
    const d = t.due_date || t.date;
    return d >= todayStr && d <= next7DaysStr;
  });
  const totalNext7Days = next7Days.reduce((acc, curr) => acc + moves(curr), 0);

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
          <span className="text-xs font-semibold text-slate-500">Total a Pagar</span>
          <div className="text-xl font-extrabold text-slate-900 mt-1">{formatMoney(totalUnpaid)}</div>
          <span className="text-[10px] text-slate-400 font-medium">{unpaidPayables.length} faturas pendentes</span>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-amber-200 shadow-xs bg-amber-50/20">
          <span className="text-xs font-semibold text-amber-700">Vence Hoje</span>
          <div className="text-xl font-extrabold text-amber-700 mt-1">{formatMoney(totalDueToday)}</div>
          <span className="text-[10px] text-amber-600 font-medium">{dueToday.length} faturas</span>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-rose-200 shadow-xs bg-rose-50/20">
          <span className="text-xs font-semibold text-rose-700">Em Atraso ({overdue.length} {overdue.length === 1 ? 'Fatura' : 'Faturas'})</span>
          <div className="text-xl font-extrabold text-rose-700 mt-1">{formatMoney(totalOverdue)}</div>
          <span className="text-[10px] text-rose-600 font-medium">Requer atenção imediata</span>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-semibold text-slate-500">Próximos 7 Dias</span>
          <div className="text-xl font-extrabold text-slate-900 mt-1">{formatMoney(totalNext7Days)}</div>
          <span className="text-[10px] text-slate-400 font-medium">{next7Days.length} faturas programadas</span>
        </div>
      </div>


      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] tracking-wider font-bold">
              <th className="p-3.5">Vencimento</th>
              <th className="p-3.5">Fornecedor</th>
              <th className="p-3.5">Descrição</th>
              <th className="p-3.5">Categoria</th>
              <th className="p-3.5">Valor Total</th>
              <th className="p-3.5">Status</th>
              <th className="p-3.5 text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {payables.map((item) => {
              const isPaid = paidIds.includes(item.id) || item.status === 'paid';
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
                  <td className="p-3.5 font-extrabold text-slate-900">{formatMoney(moves(item))}</td>
                  <td className="p-3.5">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                      isPaid ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {isPaid ? 'Pago' : 'Pendente'}
                    </span>
                  </td>
                  <td className="p-3.5 text-right">
                    {isPaid ? (
                      <span className="text-emerald-600 font-bold flex items-center justify-end gap-1">
                        <CheckCircle2 className="w-4 h-4" /> Liquidado
                      </span>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarkAsPaid(item.id);
                        }}
                        disabled={loadingPaymentId === item.id}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold text-xs transition-colors flex items-center gap-1.5 ml-auto disabled:opacity-50"
                      >
                        {loadingPaymentId === item.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        <span>Marcar Pago</span>
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
