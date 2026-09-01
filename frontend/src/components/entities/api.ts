/** Data access for the entities module. */

import { apiGet, apiPostOrError, apiPatchOrError, apiDeleteOrError } from '@/services/api';
import { Entity, EntityStatement } from './types';

export type EntityRole = 'all' | 'supplier' | 'customer';

export async function fetchEntities(role: EntityRole = 'all', q?: string): Promise<Entity[]> {
  const search = q ? `&q=${encodeURIComponent(q)}` : '';
  return (await apiGet<Entity[]>(`/entities/?role=${role}${search}`)) || [];
}

/** The account: balances plus every document behind them. */
export async function fetchEntityStatement(id: string): Promise<EntityStatement | null> {
  return apiGet<EntityStatement>(`/entities/${id}`);
}

export async function createEntity(payload: {
  name: string;
  nif?: string;
  email?: string;
  phone?: string;
  address?: string;
  is_supplier?: boolean;
  is_customer?: boolean;
}): Promise<{ data?: Entity; error?: string }> {
  return apiPostOrError<Entity>('/entities/', payload);
}

export async function updateEntity(
  id: string,
  patch: Partial<Pick<Entity, 'name' | 'nif' | 'email' | 'phone' | 'address' | 'is_supplier' | 'is_customer' | 'notes' | 'active'>>,
): Promise<{ data?: Entity; error?: string }> {
  return apiPatchOrError<Entity>(`/entities/${id}`, patch);
}

/** Archives instead of deleting when the entity has movements. */
export async function deleteEntity(
  id: string,
): Promise<{ data?: { status: 'deleted' | 'archived'; message?: string }; error?: string }> {
  return apiDeleteOrError(`/entities/${id}`);
}

export async function mergeEntities(
  keepId: string,
  mergeId: string,
): Promise<{ data?: { movimentos_movidos: number }; error?: string }> {
  return apiPostOrError(`/entities/${keepId}/merge`, { merge_id: mergeId });
}
