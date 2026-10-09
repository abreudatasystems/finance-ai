'use client';

/**
 * Nova empresa — uma janela ao centro, por etapas.
 *
 * Cada etapa é uma secção da ficha (components/companies/CompanyProfileFields).
 * Só a denominação é obrigatória; cada etapa é verificada antes de avançar, e
 * no fim tudo é verificado de novo (salta para a primeira etapa com erros).
 */

import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button, IconButton, cn } from '@/components/ui';
import { createCompany } from '@/services/data';
import type { Company } from '@/types';
import { CompanyProfileFields, SECTION_FIELDS, type SectionKey } from './CompanyProfileFields';
import { EMPTY_PROFILE, toPayload, validateProfile, type CompanyProfile, type ProfileErrors } from './profile';

const STEPS: { title: string; hint: string; sections: SectionKey[] }[] = [
  { title: 'Identificação', hint: 'Nome, NIF e forma jurídica', sections: ['id'] },
  { title: 'Sede e contactos', hint: 'Morada, email e telefone', sections: ['sede'] },
  { title: 'Fiscalidade', hint: 'IVA, IRC e ano fiscal', sections: ['fiscal'] },
  { title: 'Conta bancária', hint: 'Banco, IBAN e saldo atual', sections: ['banco'] },
  { title: 'Contabilista', hint: 'Contabilista e prazos de pagamento', sections: ['contabilista', 'prazos'] },
];

const stepFields = (i: number) => STEPS[i].sections.flatMap((s) => SECTION_FIELDS[s]);

function errorsOfStep(all: ProfileErrors, i: number): ProfileErrors {
  const out: ProfileErrors = {};
  stepFields(i).forEach((k) => { if (all[k]) out[k] = all[k]; });
  return out;
}

export function CompanyCreateWizard({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (company: Company | undefined, name: string) => void;
}) {
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [profile, setProfile] = useState<CompanyProfile>(EMPTY_PROFILE);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [busy, setBusy] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const last = step === STEPS.length - 1;

  // Escape fecha; a página por trás não desliza enquanto a janela está aberta.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, busy]);

  // Ao mudar de etapa, o cursor vai para o primeiro campo dela.
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
    body.current?.querySelector<HTMLElement>('input, select')?.focus();
  }, [step]);

  const change = (patch: Partial<CompanyProfile>) => {
    setProfile((p) => ({ ...p, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      (Object.keys(patch) as (keyof CompanyProfile)[]).forEach((k) => delete next[k]);
      return next;
    });
  };

  const goTo = (i: number) => {
    setStep(i);
    setReached((r) => Math.max(r, i));
  };

  const next = () => {
    const found = errorsOfStep(validateProfile(profile, 'create'), step);
    setErrors((e) => ({ ...e, ...found }));
    if (Object.keys(found).length) return;
    goTo(step + 1);
  };

  const create = async () => {
    const all = validateProfile(profile, 'create');
    setErrors(all);
    const firstBad = STEPS.findIndex((_, i) => Object.keys(errorsOfStep(all, i)).length > 0);
    if (firstBad >= 0) {
      setStep(firstBad);
      toast.error(`Corrija os campos da etapa «${STEPS[firstBad].title}».`);
      return;
    }
    setBusy(true);
    const res = await createCompany(toPayload(profile, 'create') as { name: string });
    setBusy(false);
    if (res.error) { toast.error(res.error); return; }
    onCreated(res.data, res.data?.name || profile.name);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (last) void create(); else next();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="fai-overlay fixed inset-0 bg-neutral-900/40 backdrop-blur-[2px]" onClick={() => !busy && onClose()} aria-hidden="true" />

      <form
        role="dialog"
        aria-modal="true"
        aria-label="Nova empresa"
        onSubmit={submit}
        noValidate
        className="relative w-full max-w-2xl max-h-[min(760px,calc(100dvh-1.5rem))] bg-white rounded-2xl shadow-2xl border border-neutral-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* ------------------------------------------------ cabeçalho + etapas */}
        <div className="px-5 pt-4 pb-3 border-b border-neutral-100 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-2xs font-medium text-emerald-700">Etapa {step + 1} de {STEPS.length}</p>
              <h2 className="text-base font-semibold text-neutral-900 tracking-tight">Nova empresa</h2>
            </div>
            <IconButton label="Fechar" onClick={onClose} disabled={busy} size="md">
              <X />
            </IconButton>
          </div>

          <ol className="grid grid-cols-5 gap-2" aria-label="Etapas">
            {STEPS.map((s, i) => {
              const done = i < step;
              const current = i === step;
              const canJump = i <= reached && !busy;
              return (
                <li key={s.title}>
                  <button
                    type="button"
                    onClick={() => canJump && setStep(i)}
                    disabled={!canJump}
                    aria-current={current ? 'step' : undefined}
                    className="w-full text-left group disabled:cursor-default cursor-pointer focus-visible:outline-none"
                  >
                    <span className={cn(
                      'block h-1 rounded-full transition-colors',
                      done || current ? 'bg-emerald-500' : 'bg-neutral-200',
                    )} />
                    <span className="mt-2 flex items-center gap-1.5">
                      <span className={cn(
                        'size-5 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 transition-colors',
                        done ? 'bg-emerald-500 text-white'
                          : current ? 'bg-neutral-900 text-white'
                          : 'bg-neutral-100 text-neutral-500',
                      )}>
                        {done ? <Check className="size-3" aria-hidden="true" /> : i + 1}
                      </span>
                      <span className={cn(
                        'hidden sm:block text-2xs font-medium truncate',
                        current ? 'text-neutral-900' : 'text-neutral-500',
                        canJump && !current && 'group-hover:text-neutral-800',
                      )}>
                        {s.title}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        {/* ------------------------------------------------------------ campos */}
        <div ref={body} className="flex-1 overflow-y-auto px-5 py-5 text-xs">
          <CompanyProfileFields
            value={profile}
            onChange={change}
            errors={errors}
            includeBank
            only={STEPS[step].sections}
          />
          {step > 0 && (
            <p className="mt-5 text-2xs text-neutral-400">
              Pode deixar em branco e completar depois em Configurações → Empresa.
            </p>
          )}
        </div>

        {/* ---------------------------------------------------------- rodapé */}
        <div className="px-5 py-3 border-t border-neutral-100 bg-neutral-50/60 flex items-center justify-between gap-2">
          {step === 0 ? (
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          ) : (
            <Button variant="secondary" onClick={() => setStep(step - 1)} disabled={busy} icon={<ArrowLeft />}>
              Voltar
            </Button>
          )}
          <div className="flex items-center gap-2">
            {!last && step > 0 && (
              <Button variant="ghost" onClick={() => goTo(step + 1)} disabled={busy}>Saltar</Button>
            )}
            {last ? (
              <Button type="submit" variant="accent" loading={busy} icon={<Plus />}>Criar empresa</Button>
            ) : (
              <Button type="submit">
                Continuar <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
