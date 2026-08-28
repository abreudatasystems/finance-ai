'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('joao@techstart.pt');
  const [password, setPassword] = useState('••••••••');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 flex items-center justify-center p-4 font-sans select-none">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6">
        
        {/* Brand */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center font-bold text-white text-2xl mx-auto shadow-lg shadow-indigo-900/50">
            ◉
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center justify-center gap-1.5 pt-2">
            Finance <span className="text-indigo-400">AI</span>
          </h1>
          <p className="text-xs text-slate-400 font-medium">Your AI Finance Team for Business</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4 text-xs">
          <div className="space-y-1">
            <label className="font-semibold text-slate-300">Email Empresarial</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between">
              <label className="font-semibold text-slate-300">Palavra-passe</label>
              <a href="#" className="text-indigo-400 hover:underline text-[11px]">Esqueceu-se?</a>
            </div>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-xs rounded-xl transition-all shadow-lg shadow-indigo-900/40 flex items-center justify-center gap-2 active:scale-98"
          >
            <span>Entrar na Plataforma</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="text-center text-xs text-slate-400 pt-2 border-t border-slate-800">
          Ainda não tem conta?{' '}
          <Link href="/register" className="text-indigo-400 font-bold hover:underline">
            Criar conta de teste &rarr;
          </Link>
        </div>

      </div>
    </div>
  );
}
