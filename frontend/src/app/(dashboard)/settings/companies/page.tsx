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
  Building2, Plus, Check, ArrowLeft, Users, ShieldCheck, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, CardHeader, CardBody, Field, Input, Select, Badge } from '@/components/ui';
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
  const [created, setCreated] = useState<string | null>(null);

  useEffect(() => {
    setPageHeader('As minhas empresas', 'Cada empresa é independente: dados, equipa e IVA separados');
  }, [setPageHeader]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await createCompany({
      name: name.trim(),
      nif: nif.trim() || undefined,
      legal_form: legalForm,
      vat_regime: regime,
      vat_periodicity: periodicity,
    });
    setBusy(false);
    if (res.error) { toast.error(res.error); return; }
    setCreated(res.data?.name || name);
    setName(''); setNif('');
    setOpen(false);
    await refreshCompanies();
  };

  return (
    <div className="space-y-5 text-xs">
      <Link href="/settings" className="inline-flex items-center gap-1.5 text-neutral-500 hover:text-neutral-800 font-semibold">
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> Voltar às configurações
      </Link>

      <Card>
        <CardHeader
          icon={<Building2 />}
          title="Empresas deste login"
          subtitle={`${companies.length} empresa(s)`}
          actions={canCreateCompanies ? (
            <Button size="sm" onClick={() => setOpen((v) => !v)} icon={<Plus />} aria-expanded={open}>
              Nova empresa
            </Button>
          ) : undefined}
        />
        <CardBody className="space-y-4">
          {!canCreateCompanies && (
            <div className="flex items-start gap-2.5 p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900">
              <Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                Esta conta entrou por convite, por isso participa nas empresas para onde foi convidada
                mas não abre empresas próprias. Para ter as suas, registe uma conta própria.
              </span>
            </div>
          )}

          {created && (
            <p role="status" className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" aria-hidden="true" /> Empresa <b>{created}</b> criada com o plano de contas padrão.
            </p>
          )}

          {open && canCreateCompanies && (
            <form onSubmit={submit} className="p-4 rounded-xl border border-neutral-200 bg-neutral-50/60 space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Nome da empresa" required>
                  {(p) => (
                    <Input
                      {...p}
                      required value={name} onChange={(e) => setName(e.target.value)}
                      placeholder="Ex.: Consultoria Silva Unipessoal Lda"
                    />
                  )}
                </Field>
                <Field label="NIF">
                  {(p) => (
                    <Input {...p} value={nif} onChange={(e) => setNif(e.target.value)} placeholder="PT500000000" className="font-mono" />
                  )}
                </Field>
                <Field label="Forma jurídica">
                  {(p) => (
                    <Select {...p} value={legalForm} onChange={(e) => setLegalForm(e.target.value)}>
                      {LEGAL_FORMS.map((f) => <option key={f} value={f}>{f}</option>)}
                    </Select>
                  )}
                </Field>
                <Field label="Regime de IVA">
                  {(p) => (
                    <Select {...p} value={regime} onChange={(e) => setRegime(e.target.value)}>
                      <option value="normal">Regime normal (liquida e deduz)</option>
                      <option value="isencao_art53">Isenção — art.º 53.º</option>
                    </Select>
                  )}
                </Field>
                {regime === 'normal' && (
                  <Field label="Periodicidade">
                    {(p) => (
                      <Select {...p} value={periodicity} onChange={(e) => setPeriodicity(e.target.value)}>
                        <option value="quarterly">Trimestral (volume &lt; 650.000 €)</option>
                        <option value="monthly">Mensal (volume ≥ 650.000 €)</option>
                      </Select>
                    )}
                  </Field>
                )}
              </div>
              <Button type="submit" size="sm" loading={busy} icon={<Plus />}>
                Criar empresa
              </Button>
            </form>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            {companies.map((comp) => {
              const active = comp.id === currentCompany?.id;
              return (
                <div
                  key={comp.id}
                  className={`p-4 rounded-xl border ${active ? 'border-emerald-300 bg-emerald-50/40' : 'border-neutral-200 bg-white'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-neutral-900 truncate">{comp.name}</p>
                      <p className="text-2xs text-neutral-500 font-mono mt-0.5">{comp.nif}</p>
                    </div>
                    {active && (
                      <Badge tone="success" className="uppercase shrink-0">Ativa</Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-3 mt-3 text-2xs text-neutral-600">
                    <span className="flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-neutral-400" aria-hidden="true" /> {comp.role_label || comp.role}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3 text-neutral-400" aria-hidden="true" /> {comp.member_count ?? 1} membro(s)
                    </span>
                  </div>

                  {!active && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-3 w-full"
                      onClick={() => switchCompany(comp.id)}
                    >
                      Trabalhar nesta empresa
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
