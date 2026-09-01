/** Data access for the invoice-lines module. */

import { apiGet, apiDeleteOrError, apiFetch, apiError } from '@/services/api';
import { LinesResponse } from './types';

export async function fetchLines(trxId: string): Promise<LinesResponse | null> {
  return apiGet<LinesResponse>(`/transactions/${trxId}/lines`);
}

export interface LinePayload {
  description: string;
  quantity?: number;
  unit_price?: number;
  net_amount?: number;
  vat_rate?: number;
  vat_amount?: number;
  vat_exemption_reason?: string;
}

export interface ReplaceResult {
  linhas: LinesResponse['linhas'];
  por_taxa: LinesResponse['por_taxa'];
  totais: {
    lines: number;
    net_amount: number;
    vat_amount: number;
    gross_amount: number;
    vat_rate: number | null;
    mixed: boolean;
  };
}

/** Replace all lines at once — a document is a whole, not a series of edits. */
export async function replaceLines(
  trxId: string,
  lines: LinePayload[],
): Promise<{ data?: ReplaceResult; error?: string }> {
  try {
    const res = await apiFetch(`/transactions/${trxId}/lines`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines }),
    });
    if (res.ok) return { data: (await res.json()) as ReplaceResult };
    return { error: (await apiError(res)) || 'Não foi possível guardar as linhas.' };
  } catch {
    return { error: 'Não foi possível contactar o servidor.' };
  }
}

export async function clearLines(trxId: string): Promise<{ error?: string }> {
  const res = await apiDeleteOrError(`/transactions/${trxId}/lines`);
  return { error: res.error };
}
