'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Zap } from 'lucide-react';
import { register } from '@/services/api';
import { Button, Card, Field, Input } from '@/components/ui';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 10) {
      setError('A palavra-passe deve ter pelo menos 10 caracteres');
      return;
    }
    setLoading(true);
    const result = await register(name, companyName, email, password);
    setLoading(false);
    if (result.ok || result.error === 'network') {
      // Recarga completa: o contexto da app (empresas, utilizador, papel) é
      // carregado uma vez; com router.push ficava vazio ou com o da sessão anterior.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- recarga completa intencional
      window.location.assign('/companies');
    } else {
      setError(result.error || 'Não foi possível criar a conta');
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md space-y-4">

        <div className="text-center space-y-2">
          <div className="size-9 rounded-lg bg-neutral-900 flex items-center justify-center mx-auto">
            <Zap className="size-4 fill-emerald-400 text-emerald-400" aria-hidden="true" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">
            Finance <span className="text-emerald-600">AI</span>
          </h1>
          <p className="text-xs text-neutral-500 font-medium">Criar conta — várias empresas na mesma conta</p>
        </div>

        <Card className="p-5 space-y-4">
          <form onSubmit={handleRegister} className="space-y-3">
            <Field label="O seu nome">
              {(p) => (
                <Input
                  {...p}
                  type="text"
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="João Silva"
                />
              )}
            </Field>

            <Field label="Nome da empresa">
              {(p) => (
                <Input
                  {...p}
                  type="text"
                  required
                  autoComplete="organization"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="TechStart Lda"
                />
              )}
            </Field>

            <Field label="Email profissional">
              {(p) => (
                <Input
                  {...p}
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="joao@empresa.pt"
                />
              )}
            </Field>

            <Field label="Palavra-passe" hint="Pelo menos 10 caracteres.">
              {(p) => (
                <Input
                  {...p}
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Uma frase curta que só você saiba"
                />
              )}
            </Field>

            {error && (
              <div role="alert" className="text-xs text-rose-900 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <Button type="submit" loading={loading} className="w-full">
              Começar o teste gratuito
              {!loading && <ArrowRight className="text-emerald-400" />}
            </Button>
          </form>

          <div className="text-center text-xs text-neutral-500 pt-3 border-t border-neutral-100">
            Já tem conta?{' '}
            <Link href="/login" className="text-emerald-700 font-medium hover:underline">
              Iniciar sessão &rarr;
            </Link>
          </div>
        </Card>

      </div>
    </div>
  );
}
