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
import { KeyRound, Check, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { changePassword } from '@/services/api';
import { Button, IconButton, Card, CardHeader, CardBody, Field, Input } from '@/components/ui';

const MIN_LENGTH = 10;

export const ChangePassword: React.FC = () => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const mismatch = confirm.length > 0 && next !== confirm;
  const tooShort = next.length > 0 && next.length < MIN_LENGTH;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mismatch || tooShort) return;
    setBusy(true);
    setDone(false);
    const res = await changePassword(current, next);
    setBusy(false);
    if (!res.ok) { toast.error(res.error || 'Não foi possível alterar.'); return; }
    setCurrent(''); setNext(''); setConfirm('');
    setDone(true);
  };

  return (
    <Card className="text-xs">
      <CardHeader icon={<KeyRound />} title="Alterar palavra-passe" />
      <form onSubmit={submit}>
        <CardBody className="space-y-3">
          <p className="text-xs text-neutral-500">
            Pelo menos {MIN_LENGTH} caracteres. Uma frase curta que só faça sentido para si é
            mais segura — e mais fácil de lembrar — do que letras soltas com símbolos.
          </p>

          <Field label="Palavra-passe atual" required>
            {(p) => (
              <Input
                {...p}
                type="password" required value={current} onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
              />
            )}
          </Field>

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
                  type={show ? 'text' : 'password'} required value={next}
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

          {done && (
            <p role="status" className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" aria-hidden="true" /> Palavra-passe alterada. As sessões abertas noutros dispositivos foram terminadas.
            </p>
          )}

          <Button type="submit" loading={busy} disabled={mismatch || tooShort} icon={<KeyRound />}>
            Alterar
          </Button>
        </CardBody>
      </form>
    </Card>
  );
};
