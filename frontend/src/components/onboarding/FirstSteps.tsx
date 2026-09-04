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

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Circle, Loader2, Rocket, Wallet, X } from 'lucide-react';
import { BankAccountRow, OnboardingStatus } from './types';
import { fetchAccounts, fetchOnboarding, setOpeningBalance } from './api';

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
    if (failure) setError(failure);
    else onDone();
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <div className="relative">
        <Wallet className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
          placeholder="0,00"
          inputMode="decimal"
          aria-label={`Saldo de ${account?.name || 'conta'}`}
          className="w-36 pl-8 pr-2 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
        />
      </div>
      <span className="text-[10px] text-slate-400">
        {account ? `em ${account.name}` : 'a carregar conta…'}
      </span>
      <button
        onClick={save}
        disabled={saving || !account || !value}
        className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40"
      >
        {saving ? 'A guardar…' : 'Guardar'}
      </button>
      {error && <span className="text-[10px] font-semibold text-rose-600">{error}</span>}
    </div>
  );
};

export const FirstSteps: React.FC = () => {
  const [data, setData] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  const load = useCallback(async () => {
    setData(await fetchOnboarding());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-400 text-xs flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> A verificar a configuração…
      </div>
    );
  }
  // Nothing left to do, or the person put it away for this session. It comes
  // back on reload only while something is still missing.
  if (!data || data.completo || dismissed) return null;

  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5 space-y-4 text-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Rocket className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-bold text-sm text-slate-900">Primeiros passos</h3>
            <p className="text-slate-600 mt-1 leading-relaxed max-w-2xl">{data.mensagem}</p>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 rounded-lg hover:bg-white/70 shrink-0"
          aria-label="Esconder primeiros passos"
        >
          <X className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 rounded-full bg-white overflow-hidden">
          <div
            className="h-full bg-indigo-600 transition-all"
            style={{ width: `${data.progresso}%` }}
          />
        </div>
        <span className="text-[10px] font-bold text-slate-600 tabular-nums">
          {data.concluidos}/{data.total}
        </span>
      </div>

      <ul className="space-y-2.5">
        {data.passos.map((step) => (
          <li key={step.chave} className="flex items-start gap-2.5">
            {step.feito
              ? <Check className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
              : <Circle className="w-3.5 h-3.5 text-slate-300 mt-0.5 shrink-0" />}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`font-bold ${step.feito ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                  {step.titulo}
                </span>
                {!step.feito && step.essencial && (
                  <span className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[9px] font-bold uppercase">
                    Essencial
                  </span>
                )}
              </div>

              {!step.feito && (
                <>
                  <p className="text-slate-500 mt-0.5 leading-relaxed">{step.porque}</p>
                  {step.chave === 'saldo_inicial'
                    ? <OpeningBalanceField onDone={load} />
                    : step.accao && (
                        <Link
                          href={step.onde}
                          className="inline-block mt-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border border-slate-300 bg-white hover:bg-slate-50"
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
    </div>
  );
};
