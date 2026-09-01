/** Recurrence shapes, mirroring app/services/recurrences.py. */

export type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface Recurrence {
  id: string;
  company_id: string;
  name: string;
  type: 'expense' | 'income';
  description: string;
  entity_id?: string | null;
  entity_name?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  amount: number;
  vat_rate?: number | null;
  payment_method?: string | null;
  notes?: string | null;
  frequency: Frequency;
  frequency_label: string;
  interval: number;
  day_of_month?: number | null;
  start_date: string;
  end_date?: string | null;
  lead_days: number;
  active: boolean;
  last_generated_period?: string | null;
  occurrences_created: number;
  /** When this rule fires next, or null once it has ended. */
  proximo_vencimento?: string | null;
}

export interface RecurrenceOccurrence {
  id: string;
  period: string;
  due_date: string;
  amount: number;
  status: 'generated' | 'skipped';
  transaction_id?: string | null;
}

export interface UpcomingOccurrence {
  recurrence_id: string;
  name: string;
  type: 'expense' | 'income';
  period: string;
  due_date: string;
  amount: number;
  entity_name?: string | null;
  category_name?: string | null;
}

export interface RunResult {
  gerados: number;
  message: string;
  detalhe: Array<{
    recurrence_id: string;
    name: string;
    lancamentos: Array<{ period: string; due_date: string; amount: number; transaction_id: string }>;
  }>;
}
