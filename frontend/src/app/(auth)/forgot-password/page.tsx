'use client';

/**
 * Esqueceu-se da palavra-passe — pede um link por email.
 *
 * A resposta é sempre a mesma, exista ou não a conta: a página nunca diz
 * "esse email não está registado".
 */

import React, { useEffect, useState } from 'react';
import { clearToken } from '@/services/api';
import Link from 'next/link';
import { ArrowLeft, Mail, MailCheck } from 'lucide-react';
import { Button, Field, Input } from '@/components/ui';
import { AuthShell } from '../AuthShell';
import { requestPasswordReset } from '../auth-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  // Uma sessão antiga guardada neste navegador faria a app mandar para o login
  // (401) a meio da recuperação. Corre antes do efeito do AppProvider.
  useEffect(() => { clearToken(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await requestPasswordReset(email.trim());
    setBusy(false);
    if (res.ok) setSent(res.message);
    else setError(res.message);
  };

  return (
    <AuthShell>
      <div className="space-y-1">
        <h1 className="text-base font-semibold">Recuperar a palavra-passe</h1>
        <p className="text-xs text-neutral-500">
          Indique o email com que entra no Finance AI. Enviamos um link para escolher uma nova
          palavra-passe.
        </p>
      </div>

      {sent ? (
        <div role="status" className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs space-y-1">
          <p className="flex items-center gap-1.5 font-medium">
            <MailCheck className="size-4" aria-hidden="true" /> Pedido recebido
          </p>
          <p>{sent}</p>
          <p className="text-emerald-700">Não chegou nada? Veja a pasta de spam ou peça de novo dentro de alguns minutos.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <Field label="Email">
            {(p) => (
              <Input
                {...p}
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </Field>

          {error && (
            <div role="alert" className="text-xs text-rose-900 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <Button type="submit" loading={busy} className="w-full" icon={<Mail />}>
            Enviar link
          </Button>
        </form>
      )}

      <div className="pt-3 border-t border-neutral-100 text-xs">
        <Link href="/login" className="inline-flex items-center gap-1 text-neutral-500 hover:text-neutral-800">
          <ArrowLeft className="size-3.5" aria-hidden="true" /> Voltar ao início de sessão
        </Link>
      </div>
    </AuthShell>
  );
}
