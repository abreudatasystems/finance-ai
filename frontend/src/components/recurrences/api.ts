/** Data access for the recurrences module. */

import { apiGet, apiPostOrError, apiPatchOrError, apiDeleteOrError } from '@/services/api';
import { Recurrence, RecurrenceOccurrence, RunResult, UpcomingOccurrence } from './types';

export async function fetchRecurrences(): Promise<Recurrence[]> {
  return (await apiGet<Recurrence[]>('/recurrences/')) || [];
}

export async function fetchUpcoming(days = 60): Promise<UpcomingOccurrence[]> {
  return (await apiGet<UpcomingOccurrence[]>(`/recurrences/upcoming?days=${days}`)) || [];
}

export async function fetchRecurrence(
  id: string,
): Promise<{ recorrencia: Recurrence; historico: RecurrenceOccurrence[] } | null> {
  return apiGet(`/recurrences/${id}`);
}

export interface RecurrenceInput {
  name: string;
  type: 'expense' | 'income';
  description: string;
  entity_name?: string;
  category_id?: string;
  category_name?: string;
  amount: number;
  vat_rate?: number;
  frequency: string;
  day_of_month?: number;
  start_date: string;
  end_date?: string;
}

export async function createRecurrence(
  payload: RecurrenceInput,
): Promise<{ data?: Recurrence; error?: string }> {
  return apiPostOrError<Recurrence>('/recurrences/', payload);
}

export async function updateRecurrence(
  id: string,
  patch: Partial<RecurrenceInput> & { active?: boolean },
): Promise<{ data?: Recurrence; error?: string }> {
  return apiPatchOrError<Recurrence>(`/recurrences/${id}`, patch);
}

export async function deleteRecurrence(
  id: string,
): Promise<{ data?: { status: 'deleted' | 'paused'; message?: string }; error?: string }> {
  return apiDeleteOrError(`/recurrences/${id}`);
}

/** Idempotent per period: calling it twice cannot book the rent twice. */
export async function runGeneration(
  until?: string,
): Promise<{ data?: RunResult; error?: string }> {
  return apiPostOrError<RunResult>('/recurrences/run', until ? { until } : {});
}

export async function skipPeriod(
  id: string,
  period: string,
): Promise<{ error?: string }> {
  const res = await apiPostOrError(`/recurrences/${id}/skip`, { period });
  return { error: res.error };
}
