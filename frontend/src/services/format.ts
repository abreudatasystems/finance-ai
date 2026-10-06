/**
 * How dates and statuses read on screen. The API speaks ISO dates and English
 * status codes; the person reading the page should see neither.
 */

import { TransactionStatus } from '@/types';

/** `2026-04-03` → `03/04/2026`. Anything that is not an ISO date comes back as it was. */
export function formatDate(iso?: string | number | null): string {
  if (iso == null || iso === '') return '';
  const text = String(iso);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : text;
}

export const TRANSACTION_STATUS_LABEL: Record<TransactionStatus, string> = {
  draft: 'Rascunho',
  pending_ai: 'A ler (IA)',
  pending_approval: 'Por aprovar',
  approved: 'Aprovado',
  paid: 'Pago',
  received: 'Recebido',
  cancelled: 'Anulado',
};

export function transactionStatusLabel(status?: string | null): string {
  if (!status) return '';
  return TRANSACTION_STATUS_LABEL[status as TransactionStatus] ?? status;
}

/** `2026-10-06T17:05:48` → `06/10/2026 17:05`. */
export function formatDateTime(iso?: string | null): string {
  if (!iso) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]} ${match[4]}:${match[5]}` : formatDate(iso);
}

/** `plural(1, 'documento')` → "documento", `plural(3, 'documento')` → "documentos". */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm;
}
