/** Data access for the retentions module. */

import { apiGet, apiFetch, apiError } from '@/services/api';
import {
  EntityYearRow, PendingDelivery, RetentionPosition, RetentionType,
} from './types';

export async function fetchTypes(
  side?: 'expense' | 'income',
): Promise<{ tipos: RetentionType[]; nota: string } | null> {
  return apiGet(`/retentions/types${side ? `?side=${side}` : ''}`);
}

export async function fetchPosition(period: string): Promise<RetentionPosition | null> {
  return apiGet<RetentionPosition>(`/retentions/position?period=${period}`);
}

export async function fetchPending(): Promise<
  { hoje: string; entregas: PendingDelivery[]; total: number; em_atraso: number } | null
> {
  return apiGet('/retentions/pending');
}

export async function fetchByEntity(
  year: number,
  side: 'expense' | 'income' = 'expense',
): Promise<{ ano: number; total: number; entidades: EntityYearRow[]; nota: string } | null> {
  return apiGet(`/retentions/by-entity?year=${year}&side=${side}`);
}

/** A counterparty's withholding is a property of the counterparty. */
export async function setEntityDefault(
  entityId: string,
  retentionCode: string | null,
): Promise<{ error?: string }> {
  const res = await apiFetch(`/retentions/entities/${entityId}/default`, {
    method: 'PUT',
    body: JSON.stringify({ retention_code: retentionCode }),
  });
  if (!res.ok) return { error: (await apiError(res)) || 'Não foi possível guardar.' };
  return {};
}
