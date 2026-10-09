'use client';

/**
 * Aceitar convite — the page the invitation link opens.
 *
 * Two doors, decided by the backend's preview (never by guessing here):
 *  • the email already has a login → sign in and accept;
 *  • it does not → create the account and join in one step. That account is an
 *    "invited" one: it works inside this company and does not open its own.
 */

import React, { useState } from 'react';
import { useLoad } from '@/lib/use-load';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Zap, ShieldCheck, Check, LogIn, UserPlus, AlertCircle } from 'lucide-react';
import { Button, Card, Field, Input, LoadingState } from '@/components/ui';
import { InvitationPreview } from '@/types';
import { previewInvitation, acceptInvitation, registerFromInvitation } from '@/services/data';
import { isAuthenticated, setToken, setActiveCompany } from '@/services/api';

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const token = String(params?.token || '');

  // Sem token não há o que pedir (e a página fica a carregar, como antes).
  const { data: res, loading } = useLoad(() => previewInvitation(token), [token], { enabled: !!token });
  const preview: InvitationPreview | null = res?.data || null;
  const loadError: string | null = res?.error || null;

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const signedIn = isAuthenticated();

  const finish = (companyId: string) => {
    setActiveCompany(companyId);   // land straight in the company that invited them
    setDone(true);
    // Recarga completa: o contexto da app carrega-se de novo com o utilizador novo.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- recarga completa intencional
    setTimeout(() => window.location.assign('/dashboard'), 1200);
  };

  const acceptAsSignedIn = async () => {
    setBusy(true);
    setError(null);
    const res = await acceptInvitation(token);
    setBusy(false);
    if (res.error || !res.data) { setError(res.error || 'Não foi possível aceitar o convite.'); return; }
    finish(res.data.company_id);
  };

  const createAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await registerFromInvitation({ token, name: name.trim(), password });
    setBusy(false);
    if (res.error || !res.data) { setError(res.error || 'Não foi possível criar a conta.'); return; }
    setToken(res.data.access_token);
    finish(res.data.company_id);
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center justify-center gap-2">
          <div className="size-7 rounded-lg bg-neutral-900 flex items-center justify-center">
            <Zap className="size-4 fill-emerald-400 text-emerald-400" aria-hidden="true" />
          </div>
          <span className="font-semibold text-base tracking-tight text-neutral-900">
            Finance <span className="text-emerald-600">AI</span>
          </span>
        </div>

        <Card className="p-5 space-y-3 text-xs">
          {loading ? (
            <LoadingState label="A abrir o convite…" />
          ) : loadError ? (
            <div className="space-y-3">
              <p role="alert" className="flex items-start gap-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 text-xs">
                <AlertCircle className="size-4 shrink-0 mt-0.5" aria-hidden="true" /> {loadError}
              </p>
              <Link
                href="/login"
                className="flex items-center justify-center h-8 px-3 rounded-md border border-neutral-200 bg-white shadow-xs font-medium text-13 text-neutral-800 hover:bg-neutral-50"
              >
                Ir para o início de sessão
              </Link>
            </div>
          ) : done ? (
            <p role="status" className="py-8 text-center text-emerald-700 font-medium flex items-center justify-center gap-2">
              <Check className="size-4" aria-hidden="true" /> Entrou em {preview?.company_name}. A abrir…
            </p>
          ) : preview && (
            <>
              <div className="text-center space-y-1">
                <p className="text-neutral-500">Foi convidado para</p>
                <h1 className="text-lg font-bold text-neutral-900">{preview.company_name}</h1>
                <p className="text-neutral-500">
                  como <b className="text-neutral-800">{preview.role_label}</b>
                  {preview.invited_by_name ? <> · convite de {preview.invited_by_name}</> : null}
                </p>
              </div>

              {preview.message && (
                <p className="px-3 py-2 rounded-lg bg-neutral-50 border border-neutral-200 text-neutral-700 italic">
                  “{preview.message}”
                </p>
              )}

              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
                <ShieldCheck className="size-4 shrink-0 mt-0.5 text-emerald-600" aria-hidden="true" />
                <span>
                  O convite é para <b>{preview.email}</b> e dá acesso apenas a esta empresa.
                </span>
              </div>

              {error && (
                <p role="alert" className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 text-xs">{error}</p>
              )}

              {signedIn ? (
                <Button
                  variant="accent"
                  className="w-full"
                  onClick={acceptAsSignedIn}
                  loading={busy}
                  icon={<Check />}
                >
                  Aceitar convite
                </Button>
              ) : preview.account_exists ? (
                <div className="space-y-2">
                  <p className="text-neutral-600 text-center">
                    Já existe uma conta com este email. Entre com ela para aceitar.
                  </p>
                  <Link
                    href="/login"
                    className="w-full h-8 px-3 rounded-md bg-neutral-900 hover:bg-neutral-800 text-white text-13 font-medium shadow-xs flex items-center justify-center gap-1.5"
                  >
                    <LogIn className="size-4" aria-hidden="true" /> Iniciar sessão
                  </Link>
                  <p className="text-2xs text-neutral-500 text-center">
                    Depois de entrar, volte a abrir este link para concluir.
                  </p>
                </div>
              ) : (
                <form onSubmit={createAccount} className="space-y-3">
                  <Field label="O seu nome">
                    {(p) => (
                      <Input {...p} required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
                    )}
                  </Field>
                  <Field label="Palavra-passe" hint="Mínimo 8 caracteres.">
                    {(p) => (
                      <Input
                        {...p}
                        type="password"
                        required
                        minLength={8}
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    )}
                  </Field>
                  <Button type="submit" className="w-full" loading={busy} icon={<UserPlus />}>
                    Criar conta e entrar
                  </Button>
                </form>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
