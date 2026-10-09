'use client';

/**
 * Primeiros passos.
 *
 * A company registered five minutes ago used to open the product and be told,
 * on three separate screens, that everything was fine. This card is the
 * correction: it says what is missing, why it matters, and where to do it —
 * and it disappears for good once the list is done.
 *
 * The opening balance is handled inline rather than by a link, because it is
 * the one step that makes every cash figure in the product wrong until it is
 * answered, and sending someone to settings to find a field is how a step
 * stays undone.
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Check, Circle, Rocket, Wallet, X } from 'lucide-react';
import { Badge, Button, Card, IconButton, Input, LoadingState } from '@/components/ui';
import { BankAccountRow, OnboardingStatus } from './types';
import { fetchAccounts, fetchOnboarding, setOpeningBalance } from './api';
import { useLoad } from '@/lib/use-load';

/** Asked inline: the balance question is too important to be a link. */
const OpeningBalanceField: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [account, setAccount] = useState<BankAccountRow | null>(null);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAccounts().then((rows) => {
      if (rows?.length) setAccount(rows.find((r) => r.is_default) || rows[0]);
    });
  }, []);

  const save = async () => {
    if (!account) return;
    const amount = Number(value.replace(',', '.'));
    if (!Number.isFinite(amount)) {
      setError('Indique um valor, por exemplo 4200,00');
      return;
    }
    setSaving(true);
    setError(null);
    const { error: failure } = await setOpeningBalance(account.id, amount);
    setSaving(false);
    if (failure) toast.error(failure);
    else onDone();
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <div className="relative">
        <Wallet className="size-3.5 text-neutral-400 absolute left-2.5 top-2.5 pointer-events-none" aria-hidden="true" />
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
          placeholder="0,00"
          inputMode="decimal"
          aria-label={`Saldo de ${account?.name || 'conta'}`}
          aria-invalid={error ? true : undefined}
          className="w-36 pl-8 tabular-nums"
        />
      </div>
      <span className="text-2xs text-neutral-500">
        {account ? `em ${account.name}` : 'a carregar conta…'}
      </span>
      <Button size="sm" onClick={save} loading={saving} disabled={!account || !value}>
        {saving ? 'A guardar…' : 'Guardar'}
      </Button>
      {error && <span role="alert" className="text-2xs font-medium text-rose-600">{error}</span>}
    </div>
  );
};

export const FirstSteps: React.FC = () => {
  // Depois de gravar o saldo inicial volta a ler em silêncio: o cartão fica à
  // vista em vez de piscar o "a verificar".
  const { data, loading, refresh: load } = useLoad<OnboardingStatus | null>(fetchOnboarding, []);
  const [dismissed, setDismissed] = useState(false);

  if (loading) {
    return (
      <Card>
        <LoadingState label="A verificar a configuração…" className="py-5" />
      </Card>
    );
  }
  // Nothing left to do, or the person put it away for this session. It comes
  // back on reload only while something is still missing.
  if (!data || data.completo || dismissed) return null;

  return (
    <Card className="p-4 space-y-3 text-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="size-7 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Rocket className="size-3.5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-semibold text-13 text-neutral-900">Primeiros passos</h2>
            <p className="text-neutral-500 mt-0.5 leading-relaxed max-w-2xl">{data.mensagem}</p>
          </div>
        </div>
        <IconButton label="Esconder primeiros passos" onClick={() => setDismissed(true)}>
          <X />
        </IconButton>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 rounded-full bg-neutral-100 overflow-hidden">
          <div
            className="h-full bg-emerald-600 transition-all"
            style={{ width: `${data.progresso}%` }}
          />
        </div>
        <span className="text-2xs font-medium text-neutral-600 tabular-nums">
          {data.concluidos}/{data.total}
        </span>
      </div>

      <ul className="space-y-2">
        {data.passos.map((step) => (
          <li key={step.chave} className="flex items-start gap-2.5">
            {step.feito
              ? <Check className="size-3.5 text-emerald-600 mt-0.5 shrink-0" />
              : <Circle className="size-3.5 text-neutral-300 mt-0.5 shrink-0" />}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`font-medium ${step.feito ? 'text-neutral-400 line-through' : 'text-neutral-800'}`}>
                  {step.titulo}
                </span>
                {!step.feito && step.essencial && (
                  <Badge tone="warning">Essencial</Badge>
                )}
              </div>

              {!step.feito && (
                <>
                  <p className="text-neutral-500 mt-0.5 leading-relaxed">{step.porque}</p>
                  {step.chave === 'saldo_inicial'
                    ? <OpeningBalanceField onDone={load} />
                    : step.accao && (
                        <Link
                          href={step.onde}
                          className="inline-flex items-center mt-1.5 h-7 px-2.5 rounded-md text-xs font-medium border border-neutral-200 bg-white text-neutral-800 shadow-xs hover:bg-neutral-50 hover:border-neutral-300 transition-colors"
                        >
                          {step.accao}
                        </Link>
                      )}
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
};
