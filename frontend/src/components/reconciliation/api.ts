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

export async function fetchSuggestions(entryId: string): Promise<MatchSuggestion[]> {
  return (await apiGet<MatchSuggestion[]>(`/bank/entries/${entryId}/suggestions`)) || [];
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

export async function matchEntry(
  entryId: string,
  transactionId: string,
): Promise<{ data?: MatchResult; error?: string }> {
  return apiPostOrError<MatchResult>(`/bank/entries/${entryId}/match`, { transaction_id: transactionId });
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
