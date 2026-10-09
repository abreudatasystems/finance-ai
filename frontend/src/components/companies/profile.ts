/**
 * Ficha da empresa: o formulário (strings, como os campos as dão), a
 * conversão para a API e as validações portuguesas (NIF, IBAN, código postal).
 */

import type { Company } from '@/types';

export interface CompanyProfile {
  name: string;
  trade_name: string;
  nif: string;
  legal_form: string;
  cae: string;
  share_capital: string;
  incorporation_date: string;
  address: string;
  postal_code: string;
  city: string;
  email: string;
  phone: string;
  website: string;
  vat_regime: string;
  vat_periodicity: string;
  irc_regime: string;
  fiscal_year_start: string;
  niss: string;
  accountant_name: string;
  accountant_nif: string;
  accountant_email: string;
  customer_terms_days: string;
  supplier_terms_days: string;
  // Só na criação: a conta principal e o saldo de partida.
  bank_name: string;
  iban: string;
  opening_balance: string;
}

export const EMPTY_PROFILE: CompanyProfile = {
  name: '', trade_name: '', nif: '', legal_form: 'Unipessoal Lda', cae: '', share_capital: '',
  incorporation_date: '', address: '', postal_code: '', city: '', email: '', phone: '', website: '',
  vat_regime: 'normal', vat_periodicity: 'quarterly', irc_regime: 'geral', fiscal_year_start: '01', niss: '',
  accountant_name: '', accountant_nif: '', accountant_email: '',
  customer_terms_days: '30', supplier_terms_days: '30',
  bank_name: '', iban: '', opening_balance: '',
};

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

export function profileFromCompany(c: Company): CompanyProfile {
  const r = c as unknown as Record<string, unknown>;
  const out = { ...EMPTY_PROFILE };
  (Object.keys(out) as (keyof CompanyProfile)[]).forEach((k) => {
    if (k in r) out[k] = str(r[k]);
  });
  // Um NIF provisório do sistema não é para mostrar como se fosse o da empresa.
  if (out.nif === 'PT000000000') out.nif = '';
  out.vat_regime ||= 'normal';
  out.vat_periodicity ||= 'quarterly';
  out.fiscal_year_start ||= '01';
  return out;
}

const NUMBER_FIELDS = new Set<keyof CompanyProfile>([
  'share_capital', 'customer_terms_days', 'supplier_terms_days', 'opening_balance',
]);
const BANK_FIELDS = new Set<keyof CompanyProfile>(['bank_name', 'iban', 'opening_balance']);

/** Número escrito à portuguesa ("12 500,50") ou à inglesa ("12500.50"). */
export function parseAmount(raw: string): number | null {
  const t = raw.trim().replace(/\s|€/g, '');
  if (!t) return null;
  const normalised = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(normalised);
  return Number.isFinite(n) ? n : null;
}

/**
 * O que vai para a API. Na criação os campos vazios ficam de fora; na edição
 * vão como `null`, para se poder apagar um valor.
 */
export function toPayload(p: CompanyProfile, mode: 'create' | 'update'): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  (Object.keys(p) as (keyof CompanyProfile)[]).forEach((k) => {
    if (mode === 'update' && BANK_FIELDS.has(k)) return;
    const raw = p[k].trim();
    if (!raw) {
      if (mode === 'update' && k !== 'name') out[k] = null;
      return;
    }
    if (NUMBER_FIELDS.has(k)) {
      const n = parseAmount(raw);
      out[k] = k.endsWith('_days') && n !== null ? Math.round(n) : n;
    } else if (k === 'iban' || k === 'nif' || k === 'accountant_nif') {
      out[k] = raw.replace(/\s/g, '').toUpperCase();
    } else {
      out[k] = raw;
    }
  });
  if (out.vat_regime === 'isencao_art53') delete out.vat_periodicity;
  return out;
}

// ------------------------------------------------------------------ validação

/** NIF português: 9 dígitos com dígito de controlo (módulo 11). Aceita o prefixo PT. */
export function isValidNif(raw: string): boolean {
  const nif = raw.replace(/\s/g, '').toUpperCase().replace(/^PT/, '');
  if (!/^\d{9}$/.test(nif)) return false;
  const sum = nif.slice(0, 8).split('').reduce((acc, d, i) => acc + Number(d) * (9 - i), 0);
  const check = 11 - (sum % 11);
  return (check >= 10 ? 0 : check) === Number(nif[8]);
}

/** IBAN (qualquer país): estrutura e controlo módulo 97. */
export function isValidIban(raw: string): boolean {
  const iban = raw.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  if (iban.startsWith('PT') && iban.length !== 25) return false;
  const moved = iban.slice(4) + iban.slice(0, 4);
  const digits = moved.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let rest = 0;
  for (const d of digits) rest = (rest * 10 + Number(d)) % 97;
  return rest === 1;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ProfileErrors = Partial<Record<keyof CompanyProfile, string>>;

export function validateProfile(p: CompanyProfile, mode: 'create' | 'update'): ProfileErrors {
  const e: ProfileErrors = {};
  if (!p.name.trim()) e.name = 'O nome é obrigatório.';
  if (p.nif.trim() && !isValidNif(p.nif)) e.nif = 'NIF inválido — confirme os 9 dígitos.';
  if (p.accountant_nif.trim() && !isValidNif(p.accountant_nif)) e.accountant_nif = 'NIF inválido.';
  if (p.postal_code.trim() && !/^\d{4}-\d{3}$/.test(p.postal_code.trim())) e.postal_code = 'Use o formato 0000-000.';
  if (p.email.trim() && !EMAIL.test(p.email.trim())) e.email = 'Email inválido.';
  if (p.accountant_email.trim() && !EMAIL.test(p.accountant_email.trim())) e.accountant_email = 'Email inválido.';
  if (p.cae.trim() && !/^\d{5}$/.test(p.cae.trim())) e.cae = 'O CAE tem 5 dígitos.';
  if (p.niss.trim() && !/^\d{11}$/.test(p.niss.trim())) e.niss = 'O NISS tem 11 dígitos.';
  if (p.share_capital.trim() && (parseAmount(p.share_capital) ?? -1) < 0) e.share_capital = 'Valor inválido.';
  if (mode === 'create') {
    if (p.iban.trim() && !isValidIban(p.iban)) e.iban = 'IBAN inválido — confirme os dígitos.';
    if (p.opening_balance.trim() && parseAmount(p.opening_balance) === null) e.opening_balance = 'Valor inválido.';
  }
  return e;
}
