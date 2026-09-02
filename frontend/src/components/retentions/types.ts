/** Retention shapes, mirroring app/services/retentions.py. */

export interface RetentionType {
  codigo: string;
  label: string;
  taxa: number;
  imposto: 'irs' | 'irc';
  categoria: string;
  /** The article the rate comes from, so a figure can be checked. */
  base_legal: string;
  aplica_a: Array<'expense' | 'income'>;
  nota: string | null;
}

export interface RetentionRow {
  id: string;
  data: string;
  documento: string | null;
  descricao: string;
  entity_id: string | null;
  entidade: string;
  tipo: 'expense' | 'income';
  /** The taxable base — the retention rides on this, never on the total. */
  base: number;
  total: number;
  codigo: string | null;
  retencao_label: string | null;
  base_legal: string | null;
  taxa: number | null;
  retido: number;
  /** total - retido: what actually moves through the bank. */
  a_pagar: number;
}

export interface RateGroup {
  codigo: string | null;
  label: string | null;
  base_legal: string | null;
  taxa: number | null;
  base: number;
  retido: number;
  documentos: number;
}

export interface RetentionSide {
  total: number;
  documentos: number;
  por_taxa: RateGroup[];
  linhas: RetentionRow[];
}

export interface RetentionPosition {
  periodo: { key: string; inicio: string; fim: string };
  retido_a_terceiros: RetentionSide;
  retido_por_terceiros: RetentionSide;
  entrega: { valor: number; ate: string; em_atraso: boolean; dias: number };
  base: { incidencia: string; prazo: string; nota_credito: string };
  mensagem: string;
}

export interface PendingDelivery {
  periodo: string;
  valor: number;
  ate: string;
  em_atraso: boolean;
  documentos: number;
}

export interface EntityYearRow {
  entity_id: string | null;
  entidade: string;
  nif: string | null;
  base: number;
  retido: number;
  documentos: number;
  codigos: string[];
}
