'use client';

/**
 * Conta-corrente — one account for a counterparty, both sides of it.
 *
 * Suppliers and customers are one register now, so a company you buy from and
 * also invoice shows a single balance: what we still owe them, what they still
 * owe us, and the difference. Every figure is derived from the documents on
 * the right, which is why they can never drift apart.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Scale, ArrowDownLeft, ArrowUpRight, Loader2, FileText, AlertCircle, Clock,
} from 'lucide-react';
import Link from 'next/link';
import { EntityStatement } from './types';
import { fetchEntityStatement } from './api';

interface Props {
  entityId: string;
  formatMoney: (n: number) => string;
  /** Show only one side when the page is already about suppliers or customers. */
  focus?: 'all' | 'compras' | 'vendas';
}

const statusStyle = (status: string) =>
  status === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : status === 'partially_paid' ? 'bg-amber-50 text-amber-700 border-amber-200'
    : status === 'overdue' ? 'bg-rose-50 text-rose-700 border-rose-200'
    : 'bg-slate-100 text-slate-600 border-slate-200';

const statusLabel = (status: string) =>
  ({ paid: 'Liquidado', partially_paid: 'Parcial', overdue: 'Vencido', pending: 'Em aberto', cancelled: 'Anulado' } as Record<string, string>)[status] || status;

export const EntityAccount: React.FC<Props> = ({ entityId, formatMoney, focus = 'all' }) => {
  const [data, setData] = useState<EntityStatement | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setData(await fetchEntityStatement(entityId));
    setLoading(false);
  }, [entityId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> A carregar conta-corrente…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
        <AlertCircle className="w-4 h-4" /> Sem conta-corrente para esta entidade.
      </div>
    );
  }

  const e = data.entidade;
  const showBuy = focus !== 'vendas' && (e.is_supplier || e.compras.documentos > 0);
  const showSell = focus !== 'compras' && (e.is_customer || e.vendas.documentos > 0);

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs p-5 space-y-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-indigo-600" />
          <h3 className="font-bold text-sm text-slate-900">Conta-corrente</h3>
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200">
            {e.papel}
          </span>
        </div>
        {e.ultimo_movimento && (
          <span className="text-[10px] text-slate-400 flex items-center gap-1">
            <Clock className="w-3 h-3" /> último movimento {e.ultimo_movimento}
          </span>
        )}
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        {showBuy && (
          <div className="p-3 rounded-xl border border-rose-100 bg-rose-50/40">
            <p className="text-[9px] uppercase font-bold text-rose-600 flex items-center gap-1">
              <ArrowDownLeft className="w-3 h-3" /> Compras
            </p>
            <p className="font-bold text-slate-900 text-sm mt-0.5">{formatMoney(e.compras.faturado)}</p>
            <p className="text-[10px] text-slate-600 mt-1">
              pago {formatMoney(e.compras.pago)} · <b className="text-rose-700">em dívida {formatMoney(e.compras.em_divida)}</b>
            </p>
          </div>
        )}
        {showSell && (
          <div className="p-3 rounded-xl border border-emerald-100 bg-emerald-50/40">
            <p className="text-[9px] uppercase font-bold text-emerald-600 flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3" /> Vendas
            </p>
            <p className="font-bold text-slate-900 text-sm mt-0.5">{formatMoney(e.vendas.faturado)}</p>
            <p className="text-[10px] text-slate-600 mt-1">
              recebido {formatMoney(e.vendas.recebido)} · <b className="text-emerald-700">por receber {formatMoney(e.vendas.por_receber)}</b>
            </p>
          </div>
        )}
        <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
          <p className="text-[9px] uppercase font-bold text-slate-500">Saldo</p>
          <p className={`font-bold text-sm mt-0.5 ${e.saldo > 0 ? 'text-rose-700' : e.saldo < 0 ? 'text-emerald-700' : 'text-slate-700'}`}>
            {formatMoney(Math.abs(e.saldo))}
          </p>
          <p className="text-[10px] text-slate-600 mt-1">
            {e.saldo > 0 ? 'a nosso débito — devemos-lhe'
              : e.saldo < 0 ? 'a nosso crédito — devem-nos'
              : 'contas saldadas'}
          </p>
        </div>
      </div>

      {data.movimentos.length === 0 ? (
        <p className="py-4 text-center text-slate-400 text-[11px]">Ainda não há movimentos com esta entidade.</p>
      ) : (
        <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden max-h-80 overflow-y-auto">
          {data.movimentos.map((m) => (
            <Link
              key={m.id}
              href={`/financial/cash-flow/${m.id}`}
              className="px-3 py-2 flex items-center gap-3 hover:bg-slate-50"
            >
              <FileText className="w-3.5 h-3.5 text-slate-300 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 truncate">
                  {m.document_number ? `${m.document_number} · ` : ''}{m.description}
                </p>
                <p className="text-[10px] text-slate-500">
                  {m.date}{m.due_date ? ` · vence ${m.due_date}` : ''}{m.category_name ? ` · ${m.category_name}` : ''}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className={`font-bold font-mono ${m.type === 'income' ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {m.type === 'income' ? '+' : '−'}{formatMoney(m.amount)}
                </p>
                {m.outstanding_amount > 0 && (
                  <p className="text-[9px] text-slate-400 font-mono">falta {formatMoney(m.outstanding_amount)}</p>
                )}
              </div>
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border shrink-0 ${statusStyle(m.payment_status)}`}>
                {statusLabel(m.payment_status)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
