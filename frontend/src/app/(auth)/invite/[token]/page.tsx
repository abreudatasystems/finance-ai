'use client';

/**
 * Aceitar convite — the page the invitation link opens.
 *
 * Two doors, decided by the backend's preview (never by guessing here):
 *  • the email already has a login → sign in and accept;
 *  • it does not → create the account and join in one step. That account is an
 *    "invited" one: it works inside this company and does not open its own.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Zap, Loader2, ShieldCheck, Check, LogIn, UserPlus, AlertCircle } from 'lucide-react';
import { InvitationPreview } from '@/types';
import { previewInvitation, acceptInvitation, registerFromInvitation } from '@/services/data';
import { isAuthenticated, setToken, setActiveCompany } from '@/services/api';

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = String(params?.token || '');

  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const signedIn = isAuthenticated();

  const load = useCallback(async () => {
    if (!token) return;
    const res = await previewInvitation(token);
    setPreview(res.data || null);
    setLoadError(res.error || null);
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const finish = (companyId: string) => {
    setActiveCompany(companyId);   // land straight in the company that invited them
    setDone(true);
    setTimeout(() => router.push('/dashboard'), 1200);
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
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center justify-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-black flex items-center justify-center border border-neutral-800">
            <Zap className="w-4 h-4 fill-emerald-400 text-emerald-400" />
          </div>
          <span className="font-extrabold text-lg tracking-tight text-neutral-900">
            Finance <span className="text-emerald-600">AI</span>
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4 text-xs">
          {loading ? (
            <p className="py-8 text-center text-slate-400 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> A abrir o convite…
            </p>
          ) : loadError ? (
            <div className="space-y-3">
              <p className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-[11px]">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {loadError}
              </p>
              <Link href="/login" className="block text-center px-3 py-2 rounded-xl border border-slate-200 font-bold text-slate-700 hover:bg-slate-50">
                Ir para o início de sessão
              </Link>
            </div>
          ) : done ? (
            <p className="py-8 text-center text-emerald-700 font-bold flex items-center justify-center gap-2">
              <Check className="w-4 h-4" /> Entrou em {preview?.company_name}. A abrir…
            </p>
          ) : preview && (
            <>
              <div className="text-center space-y-1">
                <p className="text-slate-500">Foi convidado para</p>
                <h1 className="text-lg font-extrabold text-slate-900">{preview.company_name}</h1>
                <p className="text-slate-500">
                  como <b className="text-slate-800">{preview.role_label}</b>
                  {preview.invited_by_name ? <> · convite de {preview.invited_by_name}</> : null}
                </p>
              </div>

              {preview.message && (
                <p className="px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 italic">
                  “{preview.message}”
                </p>
              )}

              <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-indigo-50/60 border border-indigo-100 text-[11px] text-indigo-900">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-indigo-600" />
                <span>
                  O convite é para <b>{preview.email}</b> e dá acesso apenas a esta empresa.
                </span>
              </div>

              {error && (
                <p className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-[11px]">{error}</p>
              )}

              {signedIn ? (
                <button
                  onClick={acceptAsSignedIn} disabled={busy}
                  className="w-full px-3 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Aceitar convite
                </button>
              ) : preview.account_exists ? (
                <div className="space-y-2">
                  <p className="text-slate-600 text-center">
                    Já existe uma conta com este email. Entre com ela para aceitar.
                  </p>
                  <Link
                    href="/login"
                    className="w-full px-3 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center justify-center gap-1.5"
                  >
                    <LogIn className="w-4 h-4" /> Iniciar sessão
                  </Link>
                  <p className="text-[10px] text-slate-400 text-center">
                    Depois de entrar, volte a abrir este link para concluir.
                  </p>
                </div>
              ) : (
                <form onSubmit={createAccount} className="space-y-3">
                  <label className="space-y-1.5 block">
                    <span className="font-bold text-slate-700">O seu nome</span>
                    <input
                      required value={name} onChange={(e) => setName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
                    />
                  </label>
                  <label className="space-y-1.5 block">
                    <span className="font-bold text-slate-700">Palavra-passe</span>
                    <input
                      type="password" required minLength={8} value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
                    />
                    <span className="text-[10px] text-slate-400">Mínimo 8 caracteres.</span>
                  </label>
                  <button
                    type="submit" disabled={busy}
                    className="w-full px-3 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                    Criar conta e entrar
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
