'use client';

import React, { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { fetchTransactions } from '@/services/data';
import { Transaction } from '@/types';
import { ArrowUpRight, CheckCircle2 } from 'lucide-react';

export default function ReceivablesPage() {
  const { formatMoney } = useApp();
  const [receivables, setReceivables] = useState<Transaction[]>([]);
  const [receivedIds, setReceivedIds] = useState<string[]>([]);

  useEffect(() => {
    async function load() {
      const trxs = await fetchTransactions();
      setReceivables(trxs.filter(t => t.type === 'income'));
    }
    load();
  }, []);

  const handleMarkReceived = (id: string) => {
    setReceivedIds(prev => [...prev, id]);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight">
            Contas a Receber
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Previsão e confirmação de recebimento de contratos e serviços
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-semibold text-slate-500">Total a Receber</span>
          <div className="text-xl font-extrabold text-emerald-600 mt-1">{formatMoney(8200.00)}</div>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-emerald-200 shadow-xs bg-emerald-50/20">
          <span className="text-xs font-semibold text-emerald-700">Recebido este Mês</span>
          <div className="text-xl font-extrabold text-emerald-700 mt-1">{formatMoney(28500.00)}</div>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-semibold text-slate-500">Próximos 7 Dias</span>
          <div className="text-xl font-extrabold text-slate-900 mt-1">{formatMoney(5000.00)}</div>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-semibold text-slate-500">Taxa de Cobrança</span>
          <div className="text-xl font-extrabold text-slate-900 mt-1">98.5%</div>
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
                <tr key={item.id} className="hover:bg-slate-50/80 transition-colors font-medium">
                  <td className="p-3.5 text-slate-600 font-mono">{item.due_date || item.date}</td>
                  <td className="p-3.5 font-bold text-slate-900">{item.entity_name}</td>
                  <td className="p-3.5 text-slate-700">{item.description}</td>
                  <td className="p-3.5 text-slate-600">{item.category_name}</td>
                  <td className="p-3.5 font-extrabold text-emerald-600">+{formatMoney(item.amount)}</td>
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
                        onClick={() => handleMarkReceived(item.id)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs transition-colors shadow-2xs"
                      >
                        Confirmar Recebimento
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
