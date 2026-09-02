'use client';

/**
 * Alterar a palavra-passe.
 *
 * The current password is required: it is what stops a borrowed session from
 * becoming permanent access. The rules are stated up front rather than after
 * a rejection, and they are the server's rules — a passphrase beats letters
 * with symbols, which is what the field says.
 */

import React, { useState } from 'react';
import { KeyRound, Loader2, Check, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { changePassword } from '@/services/api';

const MIN_LENGTH = 10;

export const ChangePassword: React.FC = () => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mismatch = confirm.length > 0 && next !== confirm;
  const tooShort = next.length > 0 && next.length < MIN_LENGTH;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mismatch || tooShort) return;
    setBusy(true);
    setError(null);
    setDone(false);
    const res = await changePassword(current, next);
    setBusy(false);
    if (!res.ok) { setError(res.error || 'Não foi possível alterar.'); return; }
    setCurrent(''); setNext(''); setConfirm('');
    setDone(true);
  };

  return (
    <form onSubmit={submit} className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-3 text-xs">
      <div className="flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-indigo-600" />
        <h3 className="font-bold text-sm text-slate-900">Alterar palavra-passe</h3>
      </div>

      <p className="text-[11px] text-slate-500">
        Pelo menos {MIN_LENGTH} caracteres. Uma frase curta que só faça sentido para si é
        mais segura — e mais fácil de lembrar — do que letras soltas com símbolos.
      </p>

      <label className="space-y-1.5 block">
        <span className="font-bold text-slate-700">Palavra-passe atual</span>
        <input
          type="password" required value={current} onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
        />
      </label>

      <label className="space-y-1.5 block">
        <span className="font-bold text-slate-700">Nova palavra-passe</span>
        <div className="relative">
          <input
            type={show ? 'text' : 'password'} required value={next}
            onChange={(e) => setNext(e.target.value)} autoComplete="new-password"
            className="w-full px-3 py-2 pr-9 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
          />
          <button
            type="button" onClick={() => setShow((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
            title={show ? 'Esconder' : 'Mostrar'}
          >
            {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
        {tooShort && (
          <span className="text-[10px] text-amber-700">
            Faltam {MIN_LENGTH - next.length} caractere(s).
          </span>
        )}
      </label>

      <label className="space-y-1.5 block">
        <span className="font-bold text-slate-700">Repetir a nova</span>
        <input
          type={show ? 'text' : 'password'} required value={confirm}
          onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password"
          className={`w-full px-3 py-2 rounded-xl border focus:outline-hidden focus:ring-2 ${
            mismatch ? 'border-rose-300 focus:ring-rose-100' : 'border-slate-200 focus:ring-indigo-100'
          }`}
        />
        {mismatch && <span className="text-[10px] text-rose-600">As duas não coincidem.</span>}
      </label>

      {error && (
        <p className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-[11px] flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{error}
        </p>
      )}
      {done && (
        <p className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-[11px] flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5" /> Palavra-passe alterada. As sessões abertas continuam válidas.
        </p>
      )}

      <button
        type="submit" disabled={busy || mismatch || tooShort}
        className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] flex items-center gap-1.5 disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
        Alterar
      </button>
    </form>
  );
};
