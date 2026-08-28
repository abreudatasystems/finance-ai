'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 flex items-center justify-center p-4 font-sans select-none">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6">
        
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center font-bold text-white text-2xl mx-auto shadow-lg shadow-indigo-900/50">
            ◉
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center justify-center gap-1.5 pt-2">
            Finance <span className="text-indigo-400">AI</span>
          </h1>
          <p className="text-xs text-slate-400 font-medium">Criar Conta SaaS Multi-Empresa</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-3.5 text-xs">
          <div className="space-y-1">
            <label className="font-semibold text-slate-300">O seu Nome</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="João Silva"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-300">Nome da Empresa</label>
            <input
              type="text"
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="TechStart Lda"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-300">Email Empresarial</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="joao@empresa.com"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-300">Palavra-passe</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-xs rounded-xl transition-all shadow-lg shadow-indigo-900/40 flex items-center justify-center gap-2 active:scale-98 mt-2"
          >
            <span>Iniciar Teste Gratuito</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="text-center text-xs text-slate-400 pt-2 border-t border-slate-800">
          Já tem conta?{' '}
          <Link href="/login" className="text-indigo-400 font-bold hover:underline">
            Fazer login &rarr;
          </Link>
        </div>

      </div>
    </div>
  );
}
