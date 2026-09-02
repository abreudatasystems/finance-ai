/** Income-statement shapes, mirroring app/services/income_statement.py. */

export interface StatementLine {
  key: string;
  label: string;
  nature: 'income' | 'expense';
  section: 'rendimentos' | 'gastos_operacionais' | 'depreciacoes' | 'financeiro';
  hint?: string | null;
  /** The SNC accounts that feed this line. */
  contas: string[];
  amount: number;
  anterior: number;
  variacao: number;
  variacao_pct: number | null;
  detalhe: Array<{ categoria: string; amount: number }>;
}

export interface StatementSubtotal {
  key: string;
  label: string;
  amount: number;
  emphasis: boolean;
  hint?: string | null;
  anterior: number;
  variacao: number;
  variacao_pct: number | null;
}

export interface IncomeStatement {
  empresa: { nome: string; nif: string };
  periodo: { label: string; key: string; inicio: string; fim: string };
  periodo_anterior: { inicio: string; fim: string };
  linhas: StatementLine[];
  subtotais: StatementSubtotal[];
  margens: { ebitda: number; operacional: number; liquida: number };
  /** Why the result is not the money in the bank. */
  ponte_caixa: {
    resultado: number;
    saldo_em_conta: number;
    a_receber: number;
    a_pagar: number;
    explicacao: string;
  };
  base: { regime: string; iva: string; nota_irc: string };
}
