'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Zap } from 'lucide-react';
import { login } from '@/services/api';
import { Button, Card, Field, Input } from '@/components/ui';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    // On success, or when the backend is unreachable (demo mode), enter the app.
    if (result.ok || result.error === 'network') {
      // Recarga completa: o contexto da app (empresas, utilizador, papel) é
      // carregado uma vez; com router.push ficava vazio ou com o da sessão anterior.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- recarga completa intencional
      window.location.assign('/dashboard');
    } else {
      setError(result.error || 'Não foi possível iniciar sessão');
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md space-y-4">

        {/* Marca */}
        <div className="text-center space-y-2">
          <div className="size-11 rounded-xl bg-black flex items-center justify-center mx-auto border border-neutral-800">
            <Zap className="size-5 fill-emerald-400 text-emerald-400" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            Finance <span className="text-emerald-600">AI</span>
          </h1>
          <p className="text-xs text-neutral-500 font-medium">A sua equipa financeira, com inteligência artificial</p>
        </div>

        <Card className="p-6 space-y-5">
          <form onSubmit={handleLogin} className="space-y-4">
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
              {/* Não há reposição por email: quem esquece a palavra-passe pede-a
                  a quem administra a empresa, que a pode convidar de novo. */}
              <p className="text-2xs text-neutral-500 text-right">
                Esqueceu-se da palavra-passe? Fale com o administrador da empresa.
              </p>
            </div>

            {error && (
              <div role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 font-medium">
                {error}
              </div>
            )}

            <Button type="submit" loading={loading} className="w-full">
              Entrar
              {!loading && <ArrowRight className="text-emerald-400" />}
            </Button>
          </form>

          <div className="text-center text-xs text-neutral-500 pt-4 border-t border-neutral-100">
            Ainda não tem conta?{' '}
            <Link href="/register" className="text-emerald-700 font-bold hover:underline">
              Criar conta de teste &rarr;
            </Link>
          </div>
        </Card>

      </div>
    </div>
  );
}
