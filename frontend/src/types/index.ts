export type Currency = 'EUR' | 'USD' | 'BRL' | 'GBP';

export type UserRole = 'owner' | 'admin' | 'finance_manager' | 'viewer';

export interface Company {
  id: string;
  name: string;
  nif: string;
  currency: Currency;
  fiscal_year_start: string;
  created_at: string;
  country?: string;
  legal_form?: string | null;
  vat_regime?: string;
  vat_periodicity?: string;
  cae?: string | null;
  /** The role the signed-in login holds in THIS company. */
  role?: UserRole;
  role_label?: string;
  member_count?: number;
}

export interface VatRateLine {
  vat_rate: number | null;
  label: string;
  base_tributavel: number;
  iva: number;
  total: number;
  num_documentos: number;
}

export interface VatSide {
  total: number;
  base_tributavel: number;
  num_documentos: number;
  breakdown: VatRateLine[];
}

/** Apuramento do IVA: liquidado − dedutível = a entregar (ou a recuperar). */
export interface VatPosition {
  period: { key: string; label: string; start: string; end: string; periodicity: string; periodicity_label: string };
  regime: { code: string; label: string; exempt: boolean; legal_form?: string | null; nif?: string | null };
  iva_liquidado: VatSide;
  iva_dedutivel: VatSide;
  apuramento: {
    saldo: number;
    a_entregar: number;
    a_recuperar: number;
    situacao: 'a_entregar' | 'a_recuperar' | 'neutro' | 'isento';
  };
  prazos: { declaracao_ate: string; pagamento_ate: string };
  nota: string;
}

export interface RealCash {
  saldo_caixa: number;
  recebido: number;
  pago: number;
  iva_a_entregar: number;
  iva_a_recuperar: number;
  dinheiro_real: number;
  periodo_iva: string;
  prazo_pagamento_iva: string;
  alerta: string | null;
}

export interface UserMembership {
  company_id: string;
  company_name?: string;
  role: UserRole;
  joined_at: string;
}

/**
 * How the account came to exist.
 * `full` — registered on their own; may open as many companies as they want.
 * `invited` — exists because a company invited them; participates only there.
 */
export type AccountType = 'full' | 'invited';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  account_type?: AccountType;
  can_create_companies?: boolean;
  memberships: UserMembership[];
}

/** A person inside one company, with what they have been moving. */
export interface TeamMember {
  user_id: string;
  name: string;
  email: string;
  avatar?: string;
  account_type: AccountType;
  role: UserRole;
  role_label: string;
  joined_at?: string | null;
  invited_by?: string | null;
  is_you: boolean;
  movimentos: number;
}

export interface Invitation {
  id: string;
  company_id: string;
  company_name?: string;
  email: string;
  role: UserRole;
  role_label: string;
  status: 'pending' | 'accepted' | 'revoked';
  message?: string | null;
  invited_by_name?: string | null;
  created_at?: string | null;
  expires_at?: string | null;
  accepted_at?: string | null;
  /** Only present while the invitation is still open. */
  token?: string;
  accept_path?: string;
  /** The full address to send, built from the app's public URL. */
  accept_url?: string;
  /** What happened to the email — never a reason to consider the invite failed. */
  email_result?: {
    enviado: boolean;
    motivo: 'sent' | 'not_configured' | 'failed';
    detalhe?: string | null;
  };
}

export interface InvitationPreview {
  company_name: string;
  email: string;
  role: UserRole;
  role_label: string;
  invited_by_name?: string | null;
  message?: string | null;
  expires_at?: string | null;
  /** True when the invited email already has a login and should just sign in. */
  account_exists: boolean;
}

export interface MemberActivity {
  user_id: string;
  name: string;
  lancamentos: number;
  total_entradas: number;
  total_saidas: number;
  ultimo_lancamento?: string | null;
  movimentos: Array<{
    id: string;
    date: string;
    description: string;
    type: TransactionType;
    amount: number;
    status: string;
  }>;
  acoes: Array<{ timestamp: string; action: string; module: string; description: string }>;
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
  /** Came from the standard chart template: read-only (cannot be edited or deleted). */
  is_system?: boolean;
  source_key?: string | null;
  snc_code?: string | null;
  children?: Category[];
}

export interface ChartTemplate {
  code: string;
  name: string;
  description: string;
  country: string;
  standard?: string | null;
  category_count: number;
  active?: boolean;
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
  // New fields
  sub_account?: string;
  contact_name?: string;
  contact_role?: string;
  mobile?: string;
  website?: string;
  contact_type?: string;
  is_taxable?: boolean;
  vat_cash_regime?: boolean;
  is_vat_exempt?: boolean;
  address_name?: string;
  postal_code?: string;
  city?: string;
  country?: string;
  discharge_address?: string;
  document_observations?: string;
  internal_observations?: string;
  auto_invoicing?: boolean;
  model_10?: boolean;
  accept_ad_emails?: boolean;
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
  // New fields
  sub_account?: string;
  contact_name?: string;
  mobile?: string;
  website?: string;
  is_taxable?: boolean;
  vat_cash_regime?: boolean;
  is_vat_exempt?: boolean;
  address_name?: string;
  postal_code?: string;
  city?: string;
  country?: string;
  discharge_address?: string;
  document_observations?: string;
  internal_observations?: string;
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
  // Retenção na fonte: o total do documento não é o que se move no banco.
  retention_code?: string | null;
  retention_rate?: number | null;
  retention_amount?: number;
  /** gross - retention: o valor que entra ou sai da conta. */
  payable_amount?: number;
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
  /** Gasto médio mensal — o que dita quantos meses o saldo aguenta. */
  burn_rate: number;
  operating_margin: number;
  current_balance: number;
  monthly_result: number;
  month_income: number;
  month_expense: number;
  /** O que está por pagar e por receber nos próximos 30 dias. */
  upcoming_payables: number;
  upcoming_receivables: number;
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

export interface Item {
  id: string;
  company_id: string;
  kind: 'product' | 'service';
  code: string;
  family?: string;
  description: string;
  unit?: string;
  ean?: string;
  notes?: string;
  active: boolean;
  vat_rate?: string;
  price_1: number;
  price_2: number;
  price_3: number;
  price_includes_vat: boolean;
  // Product specific
  product_type?: string;
  purchase_price: number;
  financial_cost: number;
  transport_cost: number;
  customs_cost: number;
  other_costs: number;
  total_estimated_cost: number;
  // Service specific
  service_group?: string;
  created_at: string;
  updated_at: string;
}
