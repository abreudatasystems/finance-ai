'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Landmark, Plus, Check, Trash2, CalendarClock, ArrowDownLeft, ArrowUpRight,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge, Button, IconButton, Card, CardHeader, CardBody, Field, Input, Select, LoadingState,
  cn, inputClass, useConfirm,
} from '@/components/ui';
import type { BadgeTone } from '@/components/ui';
import { formatDate } from '@/lib/format';
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

const INST_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  paid: { label: 'Paga', tone: 'success' },
  partially_paid: { label: 'Parcial', tone: 'warning' },
  overdue: { label: 'Vencida', tone: 'danger' },
  pending: { label: 'Pendente', tone: 'neutral' },
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
  const confirm = useConfirm();

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
    setTargetInstallment(inst?.id || '');
    setAmount(String(inst ? inst.outstanding_amount : outstanding));
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const result = await registerPayment(transaction.id, {
      amount: Number(amount),
      payment_date: payDate,
      installment_id: targetInstallment || undefined,
      bank_account_id: accountId || undefined,
      payment_method: method,
    });
    setBusy(false);
    if (!result) {
      toast.error(`Não foi possível registar o ${noun.toLowerCase()}. Verifique se o valor não excede o que está em aberto.`);
      return;
    }
    setOpen(false);
    await load();
    onChanged();
  };

  const undo = async (p: PaymentRecord) => {
    if (!(await confirm({
      title: 'Anular este movimento?',
      description: `${formatMoney(p.amount)} de ${formatDate(p.payment_date)} volta a ficar em aberto.`,
      danger: true,
      confirmLabel: 'Anular movimento',
    }))) return;
    setBusy(true);
    const ok = await deletePayment(transaction.id, p.id);
    setBusy(false);
    if (!ok) { toast.error('Não foi possível anular este movimento.'); return; }
    await load();
    onChanged();
  };

  const split = async () => {
    setSplitting(true);
    const result = await createInstallments(transaction.id, splitCount, transaction.due_date || undefined);
    setSplitting(false);
    if (!result) {
      toast.error('Não foi possível criar as prestações. Se já existem prestações pagas, o plano não pode ser refeito.');
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
    <Card>
      <CardHeader
        icon={<Landmark />}
        title={isIncome ? 'Recebimentos' : 'Pagamentos'}
        actions={!settled ? (
          <Button size="sm" icon={<Plus />} onClick={() => openFor()}>
            Registar {noun.toLowerCase()}
          </Button>
        ) : undefined}
      />

      <CardBody className="space-y-4">
        {/* Progress */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-semibold tabular-nums">
            <span className="text-neutral-500">{isIncome ? 'Recebido' : 'Pago'} {formatMoney(paid)}</span>
            <span className={settled ? 'text-emerald-700' : 'text-neutral-800'}>
              {settled ? 'Liquidado' : `Em aberto ${formatMoney(outstanding)}`}
            </span>
          </div>
          <div
            className="h-2 rounded-full bg-neutral-100 overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
            aria-label={isIncome ? 'Percentagem recebida' : 'Percentagem paga'}
          >
            <div
              className={cn('h-full rounded-full transition-all', settled ? 'bg-emerald-500' : 'bg-neutral-800')}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {loading ? (
          <LoadingState className="py-4" />
        ) : (
          <>
            {/* Installments */}
            {installments.length > 0 ? (
              <div className="space-y-1.5">
                <h4 className="text-2xs font-bold text-neutral-500 uppercase tracking-wider">
                  Prestações ({installments.length})
                </h4>
                {installments.map((i) => {
                  const st = INST_STATUS[i.status] || INST_STATUS.pending;
                  return (
                    <div key={i.id} className="flex items-center gap-2 p-2.5 rounded-xl border border-neutral-200 bg-neutral-50/60">
                      <span className="w-10 text-xs font-black text-neutral-700 font-mono shrink-0">{i.label}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-neutral-800 tabular-nums">{formatMoney(i.amount)}</div>
                        <div className="text-2xs text-neutral-500 flex items-center gap-1">
                          <CalendarClock className="w-3 h-3" aria-hidden="true" /> vence {formatDate(i.due_date)}
                          {i.paid_amount > 0 && i.status !== 'paid' && (
                            <span className="ml-1">· pago {formatMoney(i.paid_amount)}</span>
                          )}
                        </div>
                      </div>
                      <Badge tone={st.tone} className="shrink-0">{st.label}</Badge>
                      {i.status !== 'paid' && (
                        <Button variant="accent" size="sm" onClick={() => openFor(i)} className="shrink-0">
                          Liquidar
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              !settled && (
                <div className="p-3 rounded-xl border border-dashed border-neutral-200 space-y-2">
                  <h4 className="text-2xs font-bold text-neutral-500 uppercase tracking-wider">Dividir em prestações</h4>
                  <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Número de prestações">
                    {[2, 3, 4, 6, 12].map((n) => (
                      <button
                        key={n}
                        type="button"
                        aria-pressed={splitCount === n}
                        onClick={() => setSplitCount(n)}
                        className={cn(
                          'h-8 px-2.5 rounded-lg border text-xs font-bold cursor-pointer transition-colors',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
                          splitCount === n
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                            : 'bg-neutral-50 border-neutral-200 text-neutral-600 hover:bg-neutral-100',
                        )}
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
                      aria-label="Número de prestações"
                      className={cn(inputClass, 'w-16 h-8 px-2 text-xs font-bold text-center tabular-nums')}
                    />
                    <Button size="sm" onClick={split} loading={splitting}>
                      Criar plano
                    </Button>
                  </div>
                  {schedulePreview.length > 0 && (
                    <p className="text-2xs text-neutral-500 tabular-nums">
                      {splitCount}× de {formatMoney(schedulePreview[0].amount)}
                      {splitCount > 1 && ` (a última ajusta para somar ${formatMoney(gross)})`}
                    </p>
                  )}
                </div>
              )
            )}

            {/* Payment history */}
            <div className="space-y-1.5">
              <h4 className="text-2xs font-bold text-neutral-500 uppercase tracking-wider">
                Movimentos ({payments.length})
              </h4>
              {payments.length === 0 ? (
                <p className="text-xs text-neutral-500">
                  Ainda não há {isIncome ? 'recebimentos' : 'pagamentos'} registados.
                </p>
              ) : (
                payments.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 p-2.5 rounded-xl border border-neutral-200">
                    <div className={cn(
                      'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                      p.direction === 'in' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600',
                    )}>
                      {p.direction === 'in'
                        ? <ArrowDownLeft className="w-3.5 h-3.5" aria-label="Entrada" />
                        : <ArrowUpRight className="w-3.5 h-3.5" aria-label="Saída" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-neutral-800 tabular-nums">{formatMoney(p.amount)}</div>
                      <div className="text-2xs text-neutral-500 truncate">
                        {formatDate(p.payment_date)}
                        {p.payment_method ? ` · ${METHODS.find((m) => m.value === p.payment_method)?.label || p.payment_method}` : ''}
                        {p.created_by ? ` · ${p.created_by}` : ''}
                      </div>
                    </div>
                    <IconButton label="Anular movimento" variant="danger" onClick={() => undo(p)} disabled={busy}>
                      <Trash2 />
                    </IconButton>
                  </div>
                ))
              )}
            </div>

            {settled && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
                <Check className="w-3.5 h-3.5" aria-hidden="true" /> Totalmente liquidado.
              </div>
            )}
          </>
        )}

        {/* Register form */}
        {open && (
          <form onSubmit={submit} className="p-3 rounded-xl border border-neutral-200 bg-neutral-50 space-y-3">
            <h4 className="text-xs font-bold text-neutral-900">
              Registar {noun.toLowerCase()}
              {targetInstallment && ` · prestação ${installments.find((i) => i.id === targetInstallment)?.label}`}
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Valor">
                {(f) => (
                  <Input
                    {...f}
                    type="number" step="0.01" min="0" required autoFocus
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="tabular-nums"
                  />
                )}
              </Field>
              <Field label="Data">
                {(f) => (
                  <Input
                    {...f}
                    type="date" required
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                  />
                )}
              </Field>
              <Field label="Método">
                {(f) => (
                  <Select {...f} value={method} onChange={(e) => setMethod(e.target.value)}>
                    {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </Select>
                )}
              </Field>
              <Field label="Conta">
                {(f) => (
                  <Select {...f} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </Select>
                )}
              </Field>
            </div>
            <p className="text-2xs text-neutral-500">
              Máximo em aberto: <b className="tabular-nums">{formatMoney(outstanding)}</b>. Valores parciais são aceites.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setOpen(false)} className="flex-1">
                Cancelar
              </Button>
              <Button type="submit" variant="accent" size="sm" loading={busy} className="flex-1">
                Confirmar
              </Button>
            </div>
          </form>
        )}
      </CardBody>
    </Card>
  );
};
