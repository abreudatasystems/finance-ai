/** Formatação partilhada de datas e estados para o ecrã.
 *
 *  As tabelas mostravam a data ISO crua ("2026-08-31") e o estado em inglês
 *  como vem da API ("pending_approval"). Isto converte para o que um
 *  utilizador em Portugal espera ler. */

/** "2026-08-31" → "31/08/2026". O que não for uma data volta tal e qual. */
export function formatDate(value?: string | null): string {
  if (!value) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value;
}

const DOCUMENT_STATUS: Record<string, string> = {
  draft: 'Rascunho',
  approved: 'Aprovado',
  pending_approval: 'Por aprovar',
  pending_ai: 'Em leitura',
  paid: 'Pago',
  received: 'Recebido',
  cancelled: 'Anulado',
};

/** O estado do documento em português; um estado desconhecido não se esconde. */
export function documentStatusLabel(status?: string | null): string {
  if (!status) return '—';
  // Só chaves próprias: "toString" ou "constructor" devolviam uma função.
  return Object.prototype.hasOwnProperty.call(DOCUMENT_STATUS, status) ? DOCUMENT_STATUS[status] : status;
}
