/** Data access for the accounting export. */

import { apiGet, apiFetch, API_BASE } from '@/services/api';

export interface AccountingPackage {
  empresa: { nome: string; nif: string; regime_iva: string };
  periodo: { label: string; key: string; inicio: string; fim: string };
  razao: Array<Record<string, string | number>>;
  iva: Array<Record<string, string | number>>;
  apuramento: { saldo: number; a_entregar: number; a_recuperar: number; situacao: string };
  prazos: { declaracao_ate: string; pagamento_ate: string };
  totais: {
    linhas: number;
    receita_base: number; receita_iva: number; receita_total: number;
    despesa_base: number; despesa_iva: number; despesa_total: number;
  };
}

export async function fetchAccountingPackage(period?: string): Promise<AccountingPackage | null> {
  const q = period ? `?period=${encodeURIComponent(period)}` : '';
  return apiGet<AccountingPackage>(`/reports/accounting${q}`);
}

/**
 * Download a CSV. It goes through apiFetch rather than a plain link because
 * the request needs the session token and the active company header — a bare
 * <a href> would arrive unauthenticated, or worse, scoped to another company.
 */
export async function downloadCsv(
  kind: 'ledger' | 'vat',
  period?: string,
): Promise<{ ok: boolean; error?: string }> {
  const q = period ? `?period=${encodeURIComponent(period)}` : '';
  try {
    const res = await apiFetch(`/reports/accounting/${kind}.csv${q}`);
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      return { ok: false, error: detail.detail || 'Não foi possível gerar o ficheiro.' };
    }
    const blob = await res.blob();
    const disposition = res.headers.get('content-disposition') || '';
    const match = disposition.match(/filename="?([^"]+)"?/);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = match?.[1] || `${kind}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return { ok: true };
  } catch {
    return { ok: false, error: `Não foi possível contactar o servidor (${API_BASE}).` };
  }
}
