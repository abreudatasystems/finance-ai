/** Entity shapes, mirroring app/services/entities.py. */

export interface EntityBalances {
  compras: { faturado: number; pago: number; em_divida: number; documentos: number };
  vendas: { faturado: number; recebido: number; por_receber: number; documentos: number };
  /** Positive: we owe them more than they owe us. */
  saldo: number;
  ultimo_movimento?: string | null;
}

export interface Entity extends Partial<EntityBalances> {
  id: string;
  company_id: string;
  name: string;
  nif?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  is_supplier: boolean;
  is_customer: boolean;
  /** "Fornecedor", "Cliente" or "Fornecedor e cliente". */
  papel: string;
  default_category_id?: string | null;
  default_category_name?: string | null;
  notes?: string | null;
  active: boolean;
}

export interface EntityMovement {
  id: string;
  date: string;
  due_date?: string | null;
  type: 'income' | 'expense' | 'transfer';
  description: string;
  document_number?: string | null;
  category_name?: string | null;
  amount: number;
  paid_amount: number;
  outstanding_amount: number;
  payment_status: string;
  status: string;
}

export interface EntityStatement {
  entidade: Entity & EntityBalances;
  movimentos: EntityMovement[];
}
