/** Data access for the invoice-lines module. */

import { apiGet, apiDeleteOrError, apiFetch, apiError } from '@/services/api';
import { CatalogueItem, LinesResponse, VatRateOption } from './types';

export async function fetchLines(trxId: string): Promise<LinesResponse | null> {
  return apiGet<LinesResponse>(`/transactions/${trxId}/lines`);
}

export interface LinePayload {
  description: string;
  /** O artigo escolhido. O servidor usa-o para preencher o que ficar em falta. */
  item_id?: string | null;
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


/** O catálogo de artigos da empresa activa, para escolher numa linha. */
export async function fetchCatalogue(): Promise<CatalogueItem[]> {
  return (await apiGet<CatalogueItem[]>('/items/')) || [];
}

/**
 * As taxas com nome e a percentagem que valem.
 *
 * O artigo guarda "Normal" e a linha guarda 23. A tradução é do servidor; o
 * editor pede-a para poder mostrar o mesmo número antes de gravar, em vez de
 * manter uma segunda tabela que fica para trás quando a lei muda.
 */
export async function fetchVatRates(): Promise<Record<string, number>> {
  const data = await apiGet<{ regiao: string; taxas: VatRateOption[] }>('/items/vat-rates');
  const table: Record<string, number> = {};
  (data?.taxas || []).forEach((option) => {
    table[option.chave] = option.taxa;
    table[option.label.toLowerCase()] = option.taxa;
  });
  return table;
}
