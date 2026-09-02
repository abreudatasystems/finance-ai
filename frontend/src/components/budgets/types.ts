/** Budget shapes, mirroring app/services/budgets.py. */

export interface BudgetRow {
  id: string;
  category_id: string;
  categoria: string;
  tipo: 'income' | 'expense';
  periodo: string;
  valor: number;
  notas: string | null;
}

/** A deviation carries its own reading: less cost is good, less revenue is not. */
export interface Deviation {
  desvio: number;
  desvio_pct: number | null;
  sentido: 'favorável' | 'desfavorável';
  relevante: boolean;
}

export interface ComparisonLine extends Deviation {
  budget_id: string | null;
  category_id: string;
  categoria: string;
  tipo: 'income' | 'expense';
  orcamento: number;
  realizado: number;
  documentos: number;
  /** Spent on but never planned — the finding a budget report exists for. */
  sem_orcamento: boolean;
}

export interface Side extends Deviation {
  orcamento: number;
  realizado: number;
}

export interface Comparison {
  periodo: string;
  inicio: string;
  fim: string;
  linhas: ComparisonLine[];
  rendimentos: Side;
  gastos: Side;
  resultado: Side;
  sem_orcamento: boolean;
  mensagem: string;
}

export interface YearMonth {
  periodo: string;
  mes: number;
  rendimentos: { orcamento: number; realizado: number };
  gastos: { orcamento: number; realizado: number };
  resultado: { orcamento: number; realizado: number };
  tem_orcamento: boolean;
}

export interface BudgetYear {
  ano: number;
  meses: YearMonth[];
}
