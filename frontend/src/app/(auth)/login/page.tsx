'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2, Zap } from 'lucide-react';
import { login } from '@/services/api';

export default function LoginPage() {
  const router = useRouter();
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
    if (result.ok) {
      router.push('/dashboard');
    } else if (result.error === 'network') {
      // Entering anyway landed on a dashboard that could load nothing.
      setError('Não foi possível contactar o servidor. Tente novamente dentro de instantes.');
    } else {
      setError(result.error || 'Não foi possível iniciar sessão');
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4 font-sans select-none">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-8 shadow-2xl space-y-6">
        
        {/* Brand */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-black border border-neutral-700 flex items-center justify-center mx-auto shadow-lg">
            <Zap className="w-6 h-6 fill-emerald-400 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center justify-center gap-1.5 pt-2">
            Finance <span className="text-emerald-400">AI</span>
          </h1>
          <p className="text-xs text-neutral-400 font-medium">A sua equipa financeira, com IA</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4 text-xs">
          <div className="space-y-1">
            <label htmlFor="login-email" className="font-semibold text-neutral-300">Email Empresarial</label>
            <input
              id="login-email"
              autoComplete="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="login-password" className="font-semibold text-neutral-300">Palavra-passe</label>
            <input
              id="login-password"
              autoComplete="current-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
            />
          </div>

          {error && (
            <div className="text-[11px] text-rose-300 bg-rose-950/40 border border-rose-900/60 rounded-lg px-3 py-2 font-medium">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs rounded-xl transition-all shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 active:scale-98 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Entrar na Plataforma</span>}
            {!loading && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>

        <div className="text-center text-xs text-neutral-400 pt-2 border-t border-neutral-800">
          Ainda não tem conta?{' '}
          <Link href="/register" className="text-emerald-400 font-bold hover:underline">
            Criar conta &rarr;
          </Link>
        </div>

      </div>
    </div>
  );
}
