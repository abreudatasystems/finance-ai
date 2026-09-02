/** Project shapes, mirroring app/services/cost_centers.py. */

export interface Project {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  orcamento: number | null;
  valor_contratado: number | null;
  entity_id: string | null;
  cliente: string | null;
  inicio: string | null;
  fim: string | null;
  estado: 'open' | 'closed';
  ativo: boolean;
}

export interface ProfitRow {
  id: string | null;
  codigo: string | null;
  projeto: string;
  cliente: string | null;
  orcamento: number | null;
  valor_contratado: number | null;
  estado: string | null;
  /** Named on documents but never created as a project. */
  por_criar: boolean;
  /** The bucket for everything attributed to nothing. */
  sem_projeto: boolean;
  rendimentos: number;
  gastos: number;
  margem: number;
  margem_pct: number | null;
  orcamento_usado_pct: number | null;
  acima_do_orcamento: boolean;
  documentos: number;
}

export interface Profitability {
  inicio: string;
  fim: string;
  projetos: ProfitRow[];
  totais: {
    rendimentos: number;
    gastos: number;
    margem: number;
    margem_pct: number | null;
    documentos: number;
  };
  nao_atribuido: {
    rendimentos: number;
    gastos: number;
    documentos: number;
    peso_pct: number | null;
  };
  base: string;
  mensagem: string;
}

export interface ProjectMovement {
  id: string;
  data: string;
  tipo: 'income' | 'expense' | 'transfer';
  descricao: string;
  entidade: string;
  categoria: string;
  documento: string | null;
  valor: number;
  estado: string | null;
}

export interface ProjectStatement {
  projeto: Project;
  movimentos: ProjectMovement[];
  rendimentos: number;
  gastos: number;
  margem: number;
  margem_pct: number | null;
  orcamento_usado_pct: number | null;
  acima_do_orcamento: boolean;
  base: string;
}
