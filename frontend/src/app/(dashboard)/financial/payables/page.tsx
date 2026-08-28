'use client';

import React, { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { fetchTransactions } from '@/services/data';
import { Transaction } from '@/types';
import { ArrowDownLeft, AlertCircle, Calendar, CheckCircle2, Clock } from 'lucide-react';

export default function PayablesPage() {
  const { formatMoney } = useApp();
  const [payables, setPayables] = useState<Transaction[]>([]);
  const [paidIds, setPaidIds] = useState<string[]>([]);

  useEffect(() => {
    async function load() {
      const trxs = await fetchTransactions();
      setPayables(trxs.filter(t => t.type === 'expense'));
    }
    load();
  }, []);

  const handleMarkAsPaid = (id: string) => {
    setPaidIds(prev => [...prev, id]);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight">
            Contas a Pagar
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Gestão proativa de faturas de fornecedores e datas de vencimento
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-semibold text-slate-500">Total a Pagar</span>
          <div className="text-xl font-extrabold text-slate-900 mt-1">{formatMoney(12450.00)}</div>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-amber-200 shadow-xs bg-amber-50/20">
          <span className="text-xs font-semibold text-amber-700">Vence Hoje</span>
          <div className="text-xl font-extrabold text-amber-700 mt-1">{formatMoney(2300.00)}</div>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-rose-200 shadow-xs bg-rose-50/20">
          <span className="text-xs font-semibold text-rose-700">Em Atraso (🔴 1 Fatura)</span>
          <div className="text-xl font-extrabold text-rose-700 mt-1">{formatMoney(180.00)}</div>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-semibold text-slate-500">Próximos 7 Dias</span>
          <div className="text-xl font-extrabold text-slate-900 mt-1">{formatMoney(5200.00)}</div>
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
                <tr key={item.id} className="hover:bg-slate-50/80 transition-colors font-medium">
                  <td className="p-3.5 text-slate-600 font-mono">{item.due_date || item.date}</td>
                  <td className="p-3.5 font-bold text-slate-900">{item.entity_name}</td>
                  <td className="p-3.5 text-slate-700">{item.description}</td>
                  <td className="p-3.5 text-slate-600">{item.category_name}</td>
                  <td className="p-3.5 font-extrabold text-slate-900">{formatMoney(item.amount)}</td>
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
                        onClick={() => handleMarkAsPaid(item.id)}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold text-xs transition-colors"
                      >
                        Marcar Pago
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
