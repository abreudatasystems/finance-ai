export type Currency = 'EUR' | 'USD' | 'BRL' | 'GBP';

export type UserRole = 'owner' | 'admin' | 'finance_manager' | 'viewer';

export interface Company {
  id: string;
  name: string;
  nif: string;
  currency: Currency;
  fiscal_year_start: string;
  created_at: string;
}

export interface UserMembership {
  company_id: string;
  role: UserRole;
  joined_at: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  memberships: UserMembership[];
}

export type TransactionType = 'income' | 'expense' | 'transfer';

export type TransactionStatus = 
  | 'draft' 
  | 'pending_ai' 
  | 'pending_approval' 
  | 'approved' 
  | 'paid' 
  | 'received' 
  | 'cancelled';

export type TransactionSource = 'manual' | 'ai' | 'bank' | 'import';

export interface CategoryGroup {
  id: string;
  company_id: string;
  name: string;
  /** The financial nature the group behaves as in cash flow, dashboard and VAT reports. */
  kind: 'income' | 'expense';
  icon?: string;
  color?: string;
  description?: string;
  /** System groups (Receita, Despesa) cannot be renamed, re-typed or deleted. */
  is_system: boolean;
  sort_order: number;
  active: boolean;
  category_count?: number;
}

export interface Category {
  id: string;
  company_id: string;
  type: 'income' | 'expense';
  group_id?: string | null;
  name: string;
  parent_id?: string | null;
  description?: string;
  keywords?: string[];
  active: boolean;
  children?: Category[];
}

export interface Supplier {
  id: string;
  company_id: string;
  name: string;
  nif: string;
  email: string;
  phone?: string;
  address?: string;
  default_category_id?: string;
  default_category_name?: string;
  total_spent: number;
  last_transaction_date?: string;
}

export interface Customer {
  id: string;
  company_id: string;
  name: string;
  nif: string;
  email: string;
  phone?: string;
  default_category_id?: string;
  default_category_name?: string;
  total_revenue: number;
}

export interface CostCenter {
  id: string;
  company_id: string;
  code: string;
  name: string;
  budget: number;
  spent: number;
  active: boolean;
}

export interface Transaction {
  id: string;
  company_id: string;
  date: string;
  due_date?: string;
  payment_date?: string;
  type: TransactionType;
  description: string;
  entity_name: string;
  entity_id?: string;
  category_id: string;
  category_name: string;
  cost_center_id?: string;
  cost_center_name?: string;
  amount: number;
  // Financial breakdown
  net_amount?: number;
  vat_rate?: number;
  vat_amount?: number;
  gross_amount?: number;
  vat_exemption_reason?: string;
  currency?: Currency;
  exchange_rate?: number;
  // Payment settlement (separate from approval)
  paid_amount?: number;
  outstanding_amount?: number;
  payment_status?: PaymentStatus;
  status: TransactionStatus;
  source: TransactionSource;
  ai_confidence?: number;
  // Source document
  document_id?: string;
  document_name?: string;
  document_number?: string;
  document_type?: string;
  document_date?: string;
  document_url?: string;
  is_recurring?: boolean;
  recurrence_period?: 'monthly' | 'weekly' | 'yearly';
  payment_method?: string;
  payment_reference?: string;
  bank_account_id?: string;
  notes?: string;
  tags?: string[];
  // Audit / control
  created_by?: string;
  approved_by?: string;
  approved_at?: string;
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface Installment {
  id: string;
  transaction_id: string;
  number: number;
  total_count: number;
  label: string;
  due_date: string;
  amount: number;
  paid_amount: number;
  outstanding_amount: number;
  status: 'pending' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';
}

export interface PaymentRecord {
  id: string;
  transaction_id: string;
  installment_id?: string | null;
  bank_account_id?: string | null;
  /** out = pagamento (saída), in = recebimento (entrada). */
  direction: 'in' | 'out';
  kind: 'pagamento' | 'recebimento';
  amount: number;
  payment_date: string;
  payment_method?: string;
  reference?: string;
  notes?: string;
  created_by?: string;
}

export interface BankAccount {
  id: string;
  company_id: string;
  name: string;
  bank_name?: string;
  iban?: string;
  currency: string;
  opening_balance: number;
  current_balance?: number | null;
  is_default: boolean;
  active: boolean;
}

export type PaymentStatus = 'pending' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';

export type DocumentChannel = 'email' | 'whatsapp' | 'upload' | 'drive';

export type DocumentStatus = 'uploading' | 'processing' | 'processed' | 'extracted' | 'needs_review' | 'pending_approval' | 'error';

export interface AIDocument {
  id: string;
  company_id: string;
  file_name: string;
  file_size: string;
  file_type: string;
  channel: DocumentChannel;
  status: DocumentStatus;
  upload_date: string;
  file_url?: string;
  file_hash?: string;
  document_number?: string;
  document_type?: string;
  document_date?: string;
  extracted_supplier?: string;
  extracted_nif?: string;
  extracted_amount?: number;
  extracted_net?: number;
  extracted_vat?: number;
  extracted_vat_rate?: number;
  extracted_date?: string;
  extracted_due_date?: string;
  suggested_category?: string;
  suggested_category_id?: string;
  ai_confidence?: number;
  is_recurring?: boolean;
  validation_status?: string;
  validation_report?: string;
  uploaded_by?: string;
  error_message?: string;
}

export interface AIApprovalItem {
  id: string;
  company_id: string;
  document_id: string;
  document_name: string;
  supplier_name: string;
  amount: number;
  vat: number;
  date: string;
  suggested_category: string;
  suggested_category_id: string;
  suggested_cost_center?: string;
  ai_confidence: number;
  status: 'pending' | 'approved' | 'rejected' | 'edited';
  created_at: string;
}

export interface FinancialHealthScore {
  score: number;
  trend: number;
  status_label: 'Excelente' | 'Bom' | 'Atenção' | 'Crítico';
  liquidity_score: number;
  profitability_score: number;
  cost_control_score: number;
  predictability_score: number;
  runway_months: number;
  operating_margin: number;
  current_balance: number;
  monthly_result: number;
  ai_explanation: string[];
  key_insights: Array<{
    type: 'danger' | 'warning' | 'success' | 'info';
    text: string;
  }>;
}

export interface FinancialEvent {
  id: string;
  company_id: string;
  type: 'price_increase' | 'payment_overdue' | 'revenue_below_avg' | 'recurring_missing' | 'new_supplier' | 'category_anomaly' | 'confidence_low' | 'approval_pending';
  severity: 'info' | 'warning' | 'danger' | 'success';
  title: string;
  description: string;
  entity_type?: string;
  entity_id?: string;
  data?: Record<string, unknown>;
  status: 'unread' | 'read';
  created_at: string;
}

export interface AuditLogItem {
  id: string;
  company_id: string;
  timestamp: string;
  user: string;
  action: string;
  module: string;
  description: string;
  entity_id?: string;
}

export interface AIRule {
  id: string;
  company_id: string;
  supplier_name: string;
  category_name: string;
  category_id: string;
  confidence: number;
  uses_count: number;
  created_at: string;
}
