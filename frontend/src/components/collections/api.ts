/** Data access for the collections module. */

import { apiGet, apiPostOrError } from '@/services/api';
import { Aging, CollectionsOverview, ReminderDraft } from './types';

export async function fetchCollections(): Promise<CollectionsOverview | null> {
  return apiGet<CollectionsOverview>('/collections/');
}

export async function fetchAging(kind: 'income' | 'expense'): Promise<Aging | null> {
  return apiGet<Aging>(`/collections/aging?kind=${kind}`);
}

/** Compose a chaser. The backend drafts it; sending stays a human decision. */
export async function draftReminder(
  transactionIds: string[],
  entityName?: string,
  entityId?: string | null,
): Promise<{ data?: ReminderDraft; error?: string }> {
  return apiPostOrError<ReminderDraft>('/collections/reminder', {
    transaction_ids: transactionIds,
    entity_name: entityName,
    entity_id: entityId,
  });
}
