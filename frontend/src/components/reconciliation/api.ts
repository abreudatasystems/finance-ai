/** The reconciliation module's own data access. */

import { apiGet, apiPostOrError } from '@/services/api';
import { BankEntry, MatchSuggestion, ReconciliationOverview } from './types';

export type EntryFilter = 'all' | 'unmatched' | 'suggested' | 'matched' | 'ignored';

export async function fetchEntries(status: EntryFilter = 'all'): Promise<BankEntry[]> {
  return (await apiGet<BankEntry[]>(`/bank/entries?status=${status}`)) || [];
}

export async function fetchOverview(): Promise<ReconciliationOverview | null> {
  return apiGet<ReconciliationOverview>('/bank/reconciliation/overview');
}

/** `todos`: every open document in the same direction, not only exact amounts. */
export async function fetchSuggestions(entryId: string, todos = false): Promise<MatchSuggestion[]> {
  const query = todos ? '?todos=true' : '';
  return (await apiGet<MatchSuggestion[]>(`/bank/entries/${entryId}/suggestions${query}`)) || [];
}

export interface MatchResult {
  entry_id: string;
  payment_id: string;
  transaction_id: string;
  /** True when the payment did not exist and was created from the bank line. */
  criou_pagamento: boolean;
  payment_status?: string | null;
  outstanding_amount?: number | null;
}

/** Liga a linha a um documento em aberto (cria o pagamento) ou a um pagamento já registado (confirma-o). */
export async function matchEntry(
  entryId: string,
  target: { transactionId?: string; paymentId?: string },
): Promise<{ data?: MatchResult; error?: string }> {
  return apiPostOrError<MatchResult>(
    `/bank/entries/${entryId}/match`,
    target.paymentId ? { payment_id: target.paymentId } : { transaction_id: target.transactionId },
  );
}

export async function unmatchEntry(
  entryId: string,
): Promise<{ data?: { pagamento_removido: boolean; payment_status?: string | null }; error?: string }> {
  return apiPostOrError(`/bank/entries/${entryId}/unmatch`, {});
}

export async function ignoreEntry(
  entryId: string,
  ignored = true,
): Promise<{ data?: { entry_status: string }; error?: string }> {
  return apiPostOrError(`/bank/entries/${entryId}/ignore?ignored=${ignored}`, {});
}
