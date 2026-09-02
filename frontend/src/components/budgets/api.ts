/** Data access for the budgets module. */

import { apiDeleteOrError, apiGet, apiPostOrError } from '@/services/api';
import { apiFetch, apiError } from '@/services/api';
import { BudgetRow, BudgetYear, Comparison } from './types';

export async function fetchComparison(period: string): Promise<Comparison | null> {
  return apiGet<Comparison>(`/budgets/comparison?period=${period}`);
}

export async function fetchBudgets(period: string): Promise<{ periodo: string; linhas: BudgetRow[] } | null> {
  return apiGet<{ periodo: string; linhas: BudgetRow[] }>(`/budgets/?period=${period}`);
}

export async function fetchYear(year: number): Promise<BudgetYear | null> {
  return apiGet<BudgetYear>(`/budgets/year?year=${year}`);
}

/** PUT, because planning a category for a month is idempotent. */
export async function saveBudget(
  categoryId: string,
  period: string,
  amount: number,
): Promise<{ data?: BudgetRow; error?: string }> {
  const res = await apiFetch('/budgets/', {
    method: 'PUT',
    body: JSON.stringify({ category_id: categoryId, period, amount }),
  });
  if (!res.ok) return { error: (await apiError(res)) || 'Não foi possível guardar o orçamento.' };
  return { data: (await res.json()) as BudgetRow };
}

export async function copyBudget(
  origem: string,
  destino: string,
): Promise<{ data?: { copiados: number; ignorados: number }; error?: string }> {
  return apiPostOrError<{ copiados: number; ignorados: number }>('/budgets/copy', {
    origem, destino,
  });
}

export async function deleteBudget(id: string) {
  return apiDeleteOrError(`/budgets/${id}`);
}
