'use client';

/**
 * As minhas empresas — the tenant list of one login.
 *
 * A full account may open as many companies as it wants; each is a separate
 * tenant with its own chart of accounts, movements and team, and switching
 * between them never mixes their data. Accounts created through an invitation
 * only participate in the companies that invited them, so the creation form is
 * not shown to them.
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Building2, Plus, Check, Loader2, ArrowLeft, Users, ShieldCheck, Info,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { createCompany } from '@/services/data';

const LEGAL_FORMS = ['Unipessoal Lda', 'Lda', 'SA', 'ENI', 'Associação', 'Outra'];

export default function CompaniesPage() {
  const {
    companies, currentCompany, switchCompany, refreshCompanies, canCreateCompanies, setPageHeader,
  } = useApp();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [nif, setNif] = useState('');
  const [legalForm, setLegalForm] = useState('Unipessoal Lda');
  const [regime, setRegime] = useState('normal');
  const [periodicity, setPeriodicity] = useState('quarterly');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  useEffect(() => {
    setPageHeader('As minhas empresas', 'Cada empresa é independente: dados, equipa e IVA separados');
  }, [setPageHeader]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await createCompany({
      name: name.trim(),
      nif: nif.trim() || undefined,
      legal_form: legalForm,
      vat_regime: regime,
      vat_periodicity: periodicity,
    });
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    setCreated(res.data?.name || name);
    setName(''); setNif('');
    setOpen(false);
    await refreshCompanies();
  };

  return (
    <div className="space-y-5 text-xs">
      <Link href="/settings" className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-800 font-semibold">
        <ArrowLeft className="w-3.5 h-3.5" /> Voltar às configurações
      </Link>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-indigo-600" />
            <h3 className="font-bold text-sm text-slate-900">Empresas deste login</h3>
            <span className="text-[10px] text-slate-400 font-mono">{companies.length}</span>
          </div>
          {canCreateCompanies && (
            <button
              onClick={() => setOpen((v) => !v)}
              className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" /> Nova empresa
            </button>
          )}
        </div>

        {!canCreateCompanies && (
          <div className="flex items-start gap-2.5 p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-900">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Esta conta entrou por convite, por isso participa nas empresas para onde foi convidada
              mas não abre empresas próprias. Para ter as suas, registe uma conta própria.
            </span>
          </div>
        )}

        {created && (
          <p className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-[11px] flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" /> Empresa <b>{created}</b> criada com o plano de contas padrão.
          </p>
        )}
        {error && (
          <p className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-[11px]">{error}</p>
        )}

        {open && canCreateCompanies && (
          <form onSubmit={submit} className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="space-y-1.5">
                <span className="font-bold text-slate-700">Nome da empresa *</span>
                <input
                  required value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Consultoria Silva Unipessoal Lda"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
                />
              </label>
              <label className="space-y-1.5">
                <span className="font-bold text-slate-700">NIF</span>
                <input
                  value={nif} onChange={(e) => setNif(e.target.value)} placeholder="PT500000000"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
                />
              </label>
              <label className="space-y-1.5">
                <span className="font-bold text-slate-700">Forma jurídica</span>
                <select
                  value={legalForm} onChange={(e) => setLegalForm(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
                >
                  {LEGAL_FORMS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="font-bold text-slate-700">Regime de IVA</span>
                <select
                  value={regime} onChange={(e) => setRegime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="normal">Regime normal (liquida e deduz)</option>
                  <option value="isencao_art53">Isenção — art.º 53.º</option>
                </select>
              </label>
              {regime === 'normal' && (
                <label className="space-y-1.5">
                  <span className="font-bold text-slate-700">Periodicidade</span>
                  <select
                    value={periodicity} onChange={(e) => setPeriodicity(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value="quarterly">Trimestral (volume &lt; 650.000 €)</option>
                    <option value="monthly">Mensal (volume ≥ 650.000 €)</option>
                  </select>
                </label>
              )}
            </div>
            <button
              type="submit" disabled={busy}
              className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] flex items-center gap-1.5 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Criar empresa
            </button>
          </form>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          {companies.map((comp) => {
            const active = comp.id === currentCompany?.id;
            return (
              <div
                key={comp.id}
                className={`p-4 rounded-xl border ${active ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200 bg-white'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 truncate">{comp.name}</p>
                    <p className="text-[10px] text-slate-500 font-mono mt-0.5">{comp.nif}</p>
                  </div>
                  {active && (
                    <span className="text-[9px] font-bold uppercase bg-indigo-600 text-white px-2 py-0.5 rounded shrink-0">
                      Ativa
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 mt-3 text-[10px] text-slate-600">
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-slate-400" /> {comp.role_label || comp.role}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3 text-slate-400" /> {comp.member_count ?? 1} membro(s)
                  </span>
                </div>

                {!active && (
                  <button
                    onClick={() => switchCompany(comp.id)}
                    className="mt-3 w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold text-[11px] hover:bg-slate-50"
                  >
                    Trabalhar nesta empresa
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
