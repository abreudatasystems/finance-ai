'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Landmark, Plus, Loader2, Check, Trash2, AlertTriangle, CalendarClock, ArrowDownLeft, ArrowUpRight,
} from 'lucide-react';
import {
  fetchInstallments, fetchPayments, fetchBankAccounts,
  registerPayment, deletePayment, createInstallments,
} from '@/services/data';
import { Installment, PaymentRecord, BankAccount, Transaction } from '@/types';

const METHODS = [
  { value: 'bank_transfer', label: 'Transferência' },
  { value: 'card', label: 'Cartão' },
  { value: 'direct_debit', label: 'Débito direto' },
  { value: 'cash', label: 'Numerário' },
  { value: 'other', label: 'Outro' },
];

const INST_STATUS: Record<string, { label: string; cls: string }> = {
  paid: { label: 'Paga', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  partially_paid: { label: 'Parcial', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  overdue: { label: 'Vencida', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  pending: { label: 'Pendente', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

interface Props {
  transaction: Transaction;
  formatMoney: (n: number) => string;
  /** Called after any settlement change so the parent can refresh the transaction. */
  onChanged: () => void;
}

export const SettlementPanel: React.FC<Props> = ({ transaction, formatMoney, onChanged }) => {
  const isIncome = transaction.type === 'income';
  const noun = isIncome ? 'Recebimento' : 'Pagamento';

  const [installments, setInstallments] = useState<Installment[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // register form
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [method, setMethod] = useState('bank_transfer');
  const [accountId, setAccountId] = useState('');
  const [targetInstallment, setTargetInstallment] = useState<string>('');

  // split form
  const [splitCount, setSplitCount] = useState(2);
  const [splitting, setSplitting] = useState(false);

  const gross = Number(transaction.gross_amount ?? transaction.amount ?? 0);
  const paid = Number(transaction.paid_amount ?? 0);
  const outstanding = Number(transaction.outstanding_amount ?? Math.max(gross - paid, 0));
  const settled = outstanding <= 0.004;
  const progress = gross > 0 ? Math.min(100, (paid / gross) * 100) : 0;

  const load = useCallback(async () => {
    setLoading(true);
    const [i, p, a] = await Promise.all([
      fetchInstallments(transaction.id),
      fetchPayments(transaction.id),
      fetchBankAccounts(),
    ]);
    setInstallments(i);
    setPayments(p);
    setAccounts(a);
    if (!accountId) {
      const def = a.find((x) => x.is_default) || a[0];
      if (def) setAccountId(def.id);
    }
    setLoading(false);
  }, [transaction.id, accountId]);

  useEffect(() => { load(); }, [load]);

  const openFor = (inst?: Installment) => {
    setError(null);
    setTargetInstallment(inst?.id || '');
    setAmount(String(inst ? inst.outstanding_amount : outstanding));
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await registerPayment(transaction.id, {
      amount: Number(amount),
      payment_date: payDate,
      installment_id: targetInstallment || undefined,
      bank_account_id: accountId || undefined,
      payment_method: method,
    });
    setBusy(false);
    if (!result) {
      setError(`Não foi possível registar o ${noun.toLowerCase()}. Verifique se o valor não excede o que está em aberto.`);
      return;
    }
    setOpen(false);
    await load();
    onChanged();
  };

  const undo = async (p: PaymentRecord) => {
    setBusy(true);
    setError(null);
    const ok = await deletePayment(transaction.id, p.id);
    setBusy(false);
    if (!ok) { setError('Não foi possível anular este movimento.'); return; }
    await load();
    onChanged();
  };

  const split = async () => {
    setSplitting(true);
    setError(null);
    const result = await createInstallments(transaction.id, splitCount, transaction.due_date || undefined);
    setSplitting(false);
    if (!result) {
      setError('Não foi possível criar as parcelas. Se já existem parcelas pagas, o plano não pode ser refeito.');
      return;
    }
    await load();
    onChanged();
  };

  const schedulePreview = useMemo(() => {
    if (installments.length || gross <= 0 || splitCount < 2) return [];
    const base = Math.round((gross / splitCount) * 100) / 100;
    const rows: { n: number; amount: number }[] = [];
    let running = 0;
    for (let n = 1; n <= Math.min(splitCount, 4); n++) {
      const value = n < splitCount ? base : Math.round((gross - running) * 100) / 100;
      running = Math.round((running + value) * 100) / 100;
      rows.push({ n, amount: value });
    }
    return rows;
  }, [installments.length, gross, splitCount]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
          <span className="text-indigo-600"><Landmark className="w-4 h-4" /></span>
          {isIncome ? 'Recebimentos' : 'Pagamentos'}
        </h3>
        {!settled && (
          <button
            onClick={() => openFor()}
            className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" /> Registar {noun.toLowerCase()}
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-medium">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[11px] font-semibold">
          <span className="text-slate-500">{isIncome ? 'Recebido' : 'Pago'} {formatMoney(paid)}</span>
          <span className={settled ? 'text-emerald-700' : 'text-slate-800'}>
            {settled ? 'Liquidado' : `Em aberto ${formatMoney(outstanding)}`}
          </span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${settled ? 'bg-emerald-500' : 'bg-indigo-500'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-xs py-4">
          <Loader2 className="w-4 h-4 animate-spin" /> A carregar…
        </div>
      ) : (
        <>
          {/* Installments */}
          {installments.length > 0 ? (
            <div className="space-y-1.5">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Parcelas ({installments.length})
              </h4>
              {installments.map((i) => {
                const st = INST_STATUS[i.status] || INST_STATUS.pending;
                return (
                  <div key={i.id} className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50/60">
                    <span className="w-10 text-[11px] font-black text-slate-700 font-mono shrink-0">{i.label}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-800">{formatMoney(i.amount)}</div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1">
                        <CalendarClock className="w-2.5 h-2.5" /> vence {i.due_date}
                        {i.paid_amount > 0 && i.status !== 'paid' && (
                          <span className="ml-1">· pago {formatMoney(i.paid_amount)}</span>
                        )}
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border shrink-0 ${st.cls}`}>
                      {st.label}
                    </span>
                    {i.status !== 'paid' && (
                      <button
                        onClick={() => openFor(i)}
                        className="px-2 py-1 rounded-lg border border-indigo-200 text-indigo-700 text-[10px] font-bold hover:bg-indigo-50 shrink-0"
                      >
                        Liquidar
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            !settled && (
              <div className="p-3 rounded-xl border border-dashed border-slate-200 space-y-2">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dividir em parcelas</h4>
                <div className="flex items-center gap-2 flex-wrap">
                  {[2, 3, 4, 6, 12].map((n) => (
                    <button
                      key={n}
                      onClick={() => setSplitCount(n)}
                      className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold ${
                        splitCount === n ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      {n}x
                    </button>
                  ))}
                  <input
                    type="number"
                    min={2}
                    max={120}
                    value={splitCount}
                    onChange={(e) => setSplitCount(Math.min(120, Math.max(2, Number(e.target.value) || 2)))}
                    aria-label="Número de parcelas"
                    className="w-16 px-2 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-center focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  <button
                    onClick={split}
                    disabled={splitting}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold flex items-center gap-1.5 disabled:opacity-60"
                  >
                    {splitting && <Loader2 className="w-3 h-3 animate-spin" />} Criar plano
                  </button>
                </div>
                {schedulePreview.length > 0 && (
                  <p className="text-[10px] text-slate-400">
                    {splitCount}× de {formatMoney(schedulePreview[0].amount)}
                    {splitCount > 1 && ` (a última ajusta para somar ${formatMoney(gross)})`}
                  </p>
                )}
              </div>
            )
          )}

          {/* Payment history */}
          <div className="space-y-1.5">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Movimentos ({payments.length})
            </h4>
            {payments.length === 0 ? (
              <p className="text-[11px] text-slate-400">
                Ainda não há {isIncome ? 'recebimentos' : 'pagamentos'} registados.
              </p>
            ) : (
              payments.map((p) => (
                <div key={p.id} className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    p.direction === 'in' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                  }`}>
                    {p.direction === 'in' ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-800">{formatMoney(p.amount)}</div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {p.payment_date}
                      {p.payment_method ? ` · ${METHODS.find((m) => m.value === p.payment_method)?.label || p.payment_method}` : ''}
                      {p.created_by ? ` · ${p.created_by}` : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => undo(p)}
                    disabled={busy}
                    aria-label="Anular movimento"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 shrink-0 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          {settled && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold">
              <Check className="w-3.5 h-3.5" /> Totalmente liquidado.
            </div>
          )}
        </>
      )}

      {/* Register form */}
      {open && (
        <form onSubmit={submit} className="p-3 rounded-xl border border-indigo-200 bg-indigo-50/40 space-y-2.5">
          <h4 className="text-[11px] font-bold text-indigo-900">
            Registar {noun.toLowerCase()}
            {targetInstallment && ` · parcela ${installments.find((i) => i.id === targetInstallment)?.label}`}
          </h4>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Valor</label>
              <input
                type="number" step="0.01" min="0" required autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Data</label>
              <input
                type="date" required
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Método</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Conta</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
          <p className="text-[10px] text-slate-500">
            Máximo em aberto: <b>{formatMoney(outstanding)}</b>. Valores parciais são aceites.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 font-semibold text-[11px]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              {busy && <Loader2 className="w-3 h-3 animate-spin" />} Confirmar
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
