/** Shapes of the reconciliation module, mirroring app/services/reconciliation.py. */

export interface BankEntry {
  id: string;
  statement_id: string;
  date: string;
  description: string;
  amount: number;
  type: 'debit' | 'credit';
  balance?: number | null;
  status: 'unmatched' | 'suggested' | 'matched' | 'ignored';
  match_confidence?: number | null;
  reconciled_at?: string | null;
  payment_id?: string | null;
  /** `bank` means the payment was created from this line and an unmatch removes it. */
  payment_source?: 'manual' | 'bank' | null;
  transaction?: {
    id: string;
    description: string;
    entity_name: string;
    category_name: string;
    amount: number;
    date: string;
    payment_status: string;
  } | null;
}

export interface MatchSuggestion {
  transaction_id: string;
  description: string;
  entity_name: string;
  category_name: string;
  document_number?: string | null;
  date: string;
  due_date?: string | null;
  amount: number;
  outstanding: number;
  payment_status: string;
  score: number;
  /** Why this was proposed, in words — a score alone explains nothing. */
  porque: string;
}

export interface ReconciliationOverview {
  movimentos: number;
  conciliados: number;
  por_conciliar: number;
  ignorados: number;
  valor_por_conciliar: number;
  pagamentos_sem_extrato: number;
  valor_pagamentos_sem_extrato: number;
  percentagem: number;
}
