'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, ShieldCheck, Zap } from 'lucide-react';
import { Button, Card, Field, Input } from '@/components/ui';
import { landingPath, loginWithCode, loginWithPassword } from '../auth-client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Segundo passo, quando a conta tem verificação em dois passos.
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);

  const enter = async () => {
    const path = await landingPath();
    // Recarga completa: o contexto da app (empresas, utilizador, papel) é
    // carregado uma vez; com router.push ficava vazio ou com o da sessão anterior.
    window.location.assign(path);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await loginWithPassword(email, password);
    if (result.kind === 'done') { await enter(); return; }
    setLoading(false);
    if (result.kind === 'two_factor') {
      setChallenge(result.challenge);
      setCode('');
      setUseRecovery(false);
      return;
    }
    setError(result.error);
  };

  const handleCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challenge) return;
    setError(null);
    setLoading(true);
    const result = await loginWithCode(challenge, code.trim());
    if (result.kind === 'done') { await enter(); return; }
    setLoading(false);
    if (result.kind === 'error') setError(result.error);
  };

  const backToPassword = () => {
    setChallenge(null);
    setCode('');
    setPassword('');
    setError(null);
  };

  const errorBox = error && (
    <div role="alert" className="text-xs text-rose-900 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
      {error}
    </div>
  );

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md space-y-4">

        {/* Marca */}
        <div className="text-center space-y-2">
          <div className="size-9 rounded-lg bg-neutral-900 flex items-center justify-center mx-auto">
            <Zap className="size-4 fill-emerald-400 text-emerald-400" aria-hidden="true" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">
            Finance <span className="text-emerald-600">AI</span>
          </h1>
          <p className="text-xs text-neutral-500 font-medium">A sua equipa financeira, com inteligência artificial</p>
        </div>

        <Card className="p-5 space-y-4">
          {challenge ? (
            <form onSubmit={handleCode} className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="size-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                  <ShieldCheck className="size-4 text-emerald-700" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-13 font-semibold">Verificação em dois passos</h2>
                  <p className="text-xs text-neutral-500">
                    {useRecovery
                      ? 'Introduza um dos códigos de recuperação que guardou. Cada código só serve uma vez.'
                      : 'Abra a app de autenticação no telemóvel e introduza o código de 6 dígitos.'}
                  </p>
                </div>
              </div>

              <Field label={useRecovery ? 'Código de recuperação' : 'Código de 6 dígitos'}>
                {(p) => (
                  <Input
                    {...p}
                    key={useRecovery ? 'recovery' : 'totp'}
                    required
                    autoFocus
                    autoComplete="one-time-code"
                    inputMode={useRecovery ? 'text' : 'numeric'}
                    pattern={useRecovery ? undefined : '[0-9 ]{6,7}'}
                    maxLength={useRecovery ? 11 : 7}
                    placeholder={useRecovery ? 'xxxxx-xxxxx' : '123456'}
                    className="tracking-widest font-mono"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                )}
              </Field>

              {errorBox}

              <Button type="submit" loading={loading} className="w-full">
                Confirmar
                {!loading && <ArrowRight className="text-emerald-400" />}
              </Button>

              <div className="flex items-center justify-between text-xs">
                <Button variant="ghost" size="sm" onClick={backToPassword} icon={<ArrowLeft aria-hidden="true" />} className="-ml-2.5">
                  Voltar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setUseRecovery((v) => !v); setCode(''); setError(null); }}
                  className="-mr-2.5 text-emerald-700 hover:text-emerald-800"
                >
                  {useRecovery ? 'Usar o código da app' : 'Usar código de recuperação'}
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-3">
              <Field label="Email profissional">
                {(p) => (
                  <Input
                    {...p}
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                )}
              </Field>

              <div className="space-y-1">
                <Field label="Palavra-passe">
                  {(p) => (
                    <Input
                      {...p}
                      type="password"
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  )}
                </Field>
                <p className="text-2xs text-right">
                  <Link href="/forgot-password" className="text-emerald-700 font-medium hover:underline">
                    Esqueceu-se da palavra-passe?
                  </Link>
                </p>
              </div>

              {errorBox}

              <Button type="submit" loading={loading} className="w-full">
                Entrar
                {!loading && <ArrowRight className="text-emerald-400" />}
              </Button>
            </form>
          )}

          <div className="text-center text-xs text-neutral-500 pt-3 border-t border-neutral-100">
            Ainda não tem conta?{' '}
            <Link href="/register" className="text-emerald-700 font-medium hover:underline">
              Criar conta de teste &rarr;
            </Link>
          </div>
        </Card>

      </div>
    </div>
  );
}
