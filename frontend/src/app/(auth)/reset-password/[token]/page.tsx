'use client';

/**
 * Definir nova palavra-passe — a página que o link do email abre.
 *
 * O link é de uso único e expira numa hora; as regras da palavra-passe são as
 * do servidor, ditas antes e não depois de uma recusa.
 */

import React, { useEffect, useState } from 'react';
import { clearToken } from '@/services/api';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Check, Eye, EyeOff, KeyRound } from 'lucide-react';
import { Button, Field, IconButton, Input } from '@/components/ui';
import { AuthShell } from '../../AuthShell';
import { resetPassword } from '../../auth-client';

const MIN_LENGTH = 10;

export default function ResetPasswordPage() {
  const params = useParams<{ token: string }>();
  const token = String(params?.token || '');

  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Uma sessão antiga guardada neste navegador faria a app mandar para o login
  // (401) antes de a pessoa usar o link. Corre antes do efeito do AppProvider.
  useEffect(() => { clearToken(); }, []);

  const mismatch = confirm.length > 0 && next !== confirm;
  const tooShort = next.length > 0 && next.length < MIN_LENGTH;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mismatch || tooShort) return;
    setError(null);
    setBusy(true);
    const res = await resetPassword(token, next);
    setBusy(false);
    if (res.ok) setDone(res.message);
    else setError(res.message);
  };

  return (
    <AuthShell>
      <div className="space-y-1">
        <h1 className="text-base font-bold">Nova palavra-passe</h1>
        <p className="text-xs text-neutral-500">
          Pelo menos {MIN_LENGTH} caracteres. Uma frase curta que só faça sentido para si é mais
          segura — e mais fácil de lembrar — do que letras soltas com símbolos.
        </p>
      </div>

      {done ? (
        <div className="space-y-4">
          <p role="status" className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-1.5">
            <Check className="size-3.5" aria-hidden="true" /> {done}
          </p>
          <Link href="/login"
            className="flex h-9 w-full items-center justify-center rounded-lg bg-neutral-900 text-sm font-semibold text-white hover:bg-black">
            Iniciar sessão
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field
            label="Nova palavra-passe"
            required
            hint={tooShort ? (
              <span className="text-amber-700">Faltam {MIN_LENGTH - next.length} caractere(s).</span>
            ) : undefined}
          >
            {(p) => (
              <div className="relative">
                <Input
                  {...p}
                  type={show ? 'text' : 'password'} required autoFocus value={next}
                  onChange={(e) => setNext(e.target.value)} autoComplete="new-password"
                  className="pr-10"
                />
                <IconButton
                  label={show ? 'Esconder palavra-passe' : 'Mostrar palavra-passe'}
                  onClick={() => setShow((v) => !v)}
                  aria-pressed={show}
                  className="absolute right-0.5 top-1/2 -translate-y-1/2"
                >
                  {show ? <EyeOff /> : <Eye />}
                </IconButton>
              </div>
            )}
          </Field>

          <Field label="Repetir a nova" required error={mismatch ? 'As duas não coincidem.' : null}>
            {(p) => (
              <Input
                {...p}
                type={show ? 'text' : 'password'} required value={confirm}
                onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password"
              />
            )}
          </Field>

          {error && (
            <div role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 font-medium space-y-1">
              <p>{error}</p>
              <Link href="/forgot-password" className="underline font-semibold">Pedir um link novo</Link>
            </div>
          )}

          <Button type="submit" loading={busy} disabled={mismatch || tooShort || !token}
            className="w-full" icon={<KeyRound />}>
            Guardar nova palavra-passe
          </Button>
        </form>
      )}

      <div className="pt-4 border-t border-neutral-100 text-xs">
        <Link href="/login" className="inline-flex items-center gap-1 text-neutral-500 hover:text-neutral-800">
          <ArrowLeft className="size-3.5" aria-hidden="true" /> Voltar ao início de sessão
        </Link>
      </div>
    </AuthShell>
  );
}
