/** Shapes the approvals module works with, mirroring app/services/approvals.py. */

export interface ApprovalRow {
  id: string;
  company_id: string;
  document_id: string;
  document_name: string;
  document_number?: string | null;
  document_type?: string | null;
  extraction_id?: string | null;
  supplier_name: string;
  entity_id?: string | null;
  amount: number;
  net_amount?: number | null;
  vat_rate?: number | null;
  vat?: number | null;
  date: string;
  due_date?: string | null;
  suggested_category: string;
  suggested_category_id: string;
  suggested_cost_center?: string | null;
  ai_confidence: number;
  /** True when the confidence is below the queue's threshold. */
  needs_attention: boolean;
  status: 'pending' | 'approved' | 'edited' | 'rejected';
  transaction_id?: string | null;
  decided_by?: string | null;
  decided_at?: string | null;
  rejection_reason?: string | null;
  created_at?: string | null;
  file_url?: string | null;
  file_type?: string | null;
  file_name?: string | null;
  channel?: string | null;
}

/** What the AI read — kept apart from what the reviewer decides. */
export interface ExtractionDetail {
  id: string;
  supplier?: string | null;
  nif?: string | null;
  document_number?: string | null;
  document_date?: string | null;
  due_date?: string | null;
  net_amount?: number | null;
  vat_rate?: number | null;
  vat_amount?: number | null;
  gross_amount?: number | null;
  currency?: string | null;
  confidence?: number | null;
  validation_status?: string | null;
  ai_model?: string | null;
  processed_at?: string | null;
}

export interface ValidationCheck {
  check: string;
  ok: boolean;
  detail?: string;
}

export interface ApprovalDetail {
  approval: ApprovalRow;
  extraction: ExtractionDetail | null;
  validation: ValidationCheck[];
}

export interface ApprovalSummary {
  pendentes: number;
  valor_pendente: number;
  por_rever: number;
  aprovados: number;
  rejeitados: number;
  limite_confianca: number;
}

/** Corrections the reviewer may apply before approving. */
export interface ApprovalDecision {
  amount?: number;
  net_amount?: number;
  vat_rate?: number;
  vat_amount?: number;
  category_id?: string;
  category_name?: string;
  cost_center_name?: string;
  due_date?: string;
  rejection_reason?: string;
}
