'use client';

/**
 * Os campos da ficha da empresa, por secções. Os mesmos ao criar a empresa
 * (com a conta bancária) e ao editá-la nas Configurações.
 */

import React from 'react';
import {
  Building2, MapPin, Receipt, Landmark, UserCheck, CalendarClock,
} from 'lucide-react';
import { Field, Input, Select } from '@/components/ui';
import type { CompanyProfile, ProfileErrors } from './profile';

const LEGAL_FORMS = ['ENI', 'Unipessoal Lda', 'Lda', 'SA', 'Associação', 'Cooperativa', 'Outra'];
const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const TERMS = ['0', '15', '30', '45', '60', '90', '120'];

function Section({ icon, title, hint, children }: {
  icon: React.ReactNode; title: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-start gap-2 pt-1">
        <span className="size-6 rounded-md bg-neutral-100 text-neutral-600 flex items-center justify-center shrink-0 [&_svg]:size-3.5">
          {icon}
        </span>
        <div>
          <h3 className="text-13 font-semibold text-neutral-900">{title}</h3>
          {hint && <p className="text-2xs text-neutral-500">{hint}</p>}
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">{children}</div>
    </section>
  );
}

interface Props {
  value: CompanyProfile;
  onChange: (patch: Partial<CompanyProfile>) => void;
  errors?: ProfileErrors;
  /** Só na criação: a conta bancária principal e o saldo de partida. */
  includeBank?: boolean;
  /** Mostrar só estas secções (uma etapa do assistente). Sem isto, todas. */
  only?: SectionKey[];
}

export type SectionKey = 'id' | 'sede' | 'fiscal' | 'banco' | 'contabilista' | 'prazos';

/** Que campos vivem em cada secção — para validar uma etapa antes de avançar. */
export const SECTION_FIELDS: Record<SectionKey, (keyof CompanyProfile)[]> = {
  id: ['name', 'trade_name', 'nif', 'legal_form', 'cae', 'share_capital', 'incorporation_date'],
  sede: ['address', 'postal_code', 'city', 'email', 'phone', 'website'],
  fiscal: ['vat_regime', 'vat_periodicity', 'irc_regime', 'fiscal_year_start', 'niss'],
  banco: ['bank_name', 'iban', 'opening_balance'],
  contabilista: ['accountant_name', 'accountant_nif', 'accountant_email'],
  prazos: ['customer_terms_days', 'supplier_terms_days'],
};

export function CompanyProfileFields({ value: v, onChange, errors = {}, includeBank = false, only }: Props) {
  const show = (k: SectionKey) => !only || only.includes(k);
  const text = (key: keyof CompanyProfile, label: string, opts: {
    placeholder?: string; required?: boolean; mono?: boolean; type?: string; hint?: string; full?: boolean;
    inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  } = {}) => (
    <Field label={label} required={opts.required} error={errors[key]} hint={opts.hint} className={opts.full ? 'sm:col-span-2' : undefined}>
      {(p) => (
        <Input
          {...p}
          type={opts.type || 'text'}
          inputMode={opts.inputMode}
          required={opts.required}
          value={v[key]}
          onChange={(e) => onChange({ [key]: e.target.value } as Partial<CompanyProfile>)}
          placeholder={opts.placeholder}
          className={opts.mono ? 'font-mono' : undefined}
        />
      )}
    </Field>
  );

  return (
    <div className="space-y-5">
      {show('id') && (
      <Section icon={<Building2 />} title="Identificação" hint="Como a empresa aparece nas faturas e na AT.">
        {text('name', 'Denominação social', { required: true, placeholder: 'Ex.: Consultoria Silva, Unipessoal Lda', full: true })}
        {text('trade_name', 'Nome comercial', { placeholder: 'Se for diferente da denominação' })}
        {text('nif', 'NIF / NIPC', { placeholder: '500000000', mono: true, inputMode: 'numeric' })}
        <Field label="Forma jurídica">
          {(p) => (
            <Select {...p} value={v.legal_form} onChange={(e) => onChange({ legal_form: e.target.value })}>
              <option value="">Não definida</option>
              {LEGAL_FORMS.map((f) => <option key={f} value={f}>{f}</option>)}
            </Select>
          )}
        </Field>
        {text('cae', 'CAE principal', { placeholder: '62010', mono: true, inputMode: 'numeric', hint: 'Código de atividade económica (5 dígitos).' })}
        {text('share_capital', 'Capital social (€)', { placeholder: '5 000,00', inputMode: 'decimal' })}
        {text('incorporation_date', 'Data de constituição', { type: 'date' })}
      </Section>

      )}

      {show('sede') && (
      <Section icon={<MapPin />} title="Sede e contactos">
        {text('address', 'Morada', { placeholder: 'Rua, número, andar', full: true })}
        {text('postal_code', 'Código postal', { placeholder: '4050-262', mono: true })}
        {text('city', 'Localidade', { placeholder: 'Porto' })}
        {text('email', 'Email geral', { type: 'email', placeholder: 'geral@empresa.pt' })}
        {text('phone', 'Telefone', { type: 'tel', placeholder: '+351 220 000 000' })}
        {text('website', 'Website', { placeholder: 'empresa.pt', full: true })}
      </Section>

      )}

      {show('fiscal') && (
      <Section icon={<Receipt />} title="Fiscalidade" hint="Decide como se calcula o IVA e os prazos de entrega.">
        <Field label="Regime de IVA">
          {(p) => (
            <Select {...p} value={v.vat_regime} onChange={(e) => onChange({ vat_regime: e.target.value })}>
              <option value="normal">Regime normal (liquida e deduz)</option>
              <option value="isencao_art53">Isenção — art.º 53.º</option>
            </Select>
          )}
        </Field>
        <Field label="Periodicidade do IVA">
          {(p) => (
            <Select
              {...p}
              value={v.vat_periodicity}
              onChange={(e) => onChange({ vat_periodicity: e.target.value })}
              disabled={v.vat_regime === 'isencao_art53'}
            >
              <option value="quarterly">Trimestral (volume &lt; 650.000 €)</option>
              <option value="monthly">Mensal (volume ≥ 650.000 €)</option>
            </Select>
          )}
        </Field>
        <Field label="Regime de IRC">
          {(p) => (
            <Select {...p} value={v.irc_regime} onChange={(e) => onChange({ irc_regime: e.target.value })}>
              <option value="">Não definido</option>
              <option value="geral">Regime geral</option>
              <option value="simplificado">Regime simplificado</option>
              <option value="isento">Isento</option>
              <option value="nao_aplicavel">Não aplicável (ENI — IRS)</option>
            </Select>
          )}
        </Field>
        <Field label="Início do ano fiscal">
          {(p) => (
            <Select {...p} value={v.fiscal_year_start} onChange={(e) => onChange({ fiscal_year_start: e.target.value })}>
              {MONTHS.map((m, i) => {
                const val = String(i + 1).padStart(2, '0');
                return <option key={val} value={val}>{m}</option>;
              })}
            </Select>
          )}
        </Field>
        {text('niss', 'NISS (Segurança Social)', { placeholder: '20000000000', mono: true, inputMode: 'numeric' })}
      </Section>

      )}

      {includeBank && show('banco') && (
        <Section
          icon={<Landmark />}
          title="Conta bancária principal"
          hint="O saldo de hoje é o ponto de partida da tesouraria e da conciliação."
        >
          {text('bank_name', 'Banco', { placeholder: 'Caixa Geral de Depósitos' })}
          {text('opening_balance', 'Saldo atual (€)', { placeholder: '0,00', inputMode: 'decimal' })}
          {text('iban', 'IBAN', { placeholder: 'PT50 0000 0000 0000 0000 0000 0', mono: true, full: true })}
        </Section>
      )}

      {show('contabilista') && (
      <Section icon={<UserCheck />} title="Contabilista certificado" hint="A quem se enviam as exportações e o SAF-T.">
        {text('accountant_name', 'Nome', { placeholder: 'Nome ou gabinete', full: true })}
        {text('accountant_nif', 'NIF', { mono: true, inputMode: 'numeric' })}
        {text('accountant_email', 'Email', { type: 'email', placeholder: 'contabilidade@gabinete.pt' })}
      </Section>

      )}

      {show('prazos') && (
      <Section
        icon={<CalendarClock />}
        title="Prazos de pagamento habituais"
        hint="Um documento lançado sem data de vencimento vence a data dele mais este prazo."
      >
        <Field label="Clientes pagam em">
          {(p) => (
            <Select {...p} value={v.customer_terms_days} onChange={(e) => onChange({ customer_terms_days: e.target.value })}>
              <option value="">Não definido (vence na data do documento)</option>
              {TERMS.map((d) => <option key={d} value={d}>{d === '0' ? 'Pronto pagamento' : `${d} dias`}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Fornecedores são pagos em">
          {(p) => (
            <Select {...p} value={v.supplier_terms_days} onChange={(e) => onChange({ supplier_terms_days: e.target.value })}>
              <option value="">Não definido (vence na data do documento)</option>
              {TERMS.map((d) => <option key={d} value={d}>{d === '0' ? 'Pronto pagamento' : `${d} dias`}</option>)}
            </Select>
          )}
        </Field>
      </Section>
      )}
    </div>
  );
}
