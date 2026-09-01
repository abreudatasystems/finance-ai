import companiesData from '@/mock-db/companies.json';
import usersData from '@/mock-db/users.json';
import categoriesData from '@/mock-db/categories.json';
import suppliersData from '@/mock-db/suppliers.json';
import customersData from '@/mock-db/customers.json';
import costCentersData from '@/mock-db/cost-centers.json';
import transactionsData from '@/mock-db/transactions.json';
import documentsData from '@/mock-db/documents.json';
import approvalsData from '@/mock-db/approvals.json';
import financialEventsData from '@/mock-db/financial-events.json';
import healthScoreData from '@/mock-db/health-score.json';
import aiRulesData from '@/mock-db/ai-rules.json';
import auditLogData from '@/mock-db/audit-log.json';

import {
  Company,
  User,
  Category,
  CategoryGroup,
  ChartTemplate,
  Installment,
  PaymentRecord,
  BankAccount,
  VatPosition,
  RealCash,
  Supplier,
  Customer,
  CostCenter,
  Transaction,
  AIDocument,
  AIApprovalItem,
  FinancialHealthScore,
  FinancialEvent,
  AIRule,
  AuditLogItem,
  UserRole,
  TeamMember,
  Invitation,
  InvitationPreview,
  MemberActivity,
} from '@/types';

import {
  apiGet, apiPatch, apiPost, apiDelete, apiFetch,
  apiPostOrError, apiPatchOrError, apiDeleteOrError, apiError, API_BASE,
} from './api';

export const delay = (ms: number = 100) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchCompanies(): Promise<Company[]> {
  const data = await apiGet<Company[]>('/companies');
  if (data) return data;
  await delay(100);
  return companiesData as Company[];
}

/** The signed-in login, with the real memberships the backend reports. */
export async function fetchCurrentUser(): Promise<User | null> {
  const u = await apiGet<User>('/auth/me');
  if (!u) return null;
  return {
    ...u,
    avatar: u.avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150',
    memberships: u.memberships || [],
  };
}

export async function fetchUsers(): Promise<User[]> {
  const u = await fetchCurrentUser();
  if (u) return [u];
  await delay(100);
  return usersData as User[];
}

export async function fetchHealthScore(): Promise<FinancialHealthScore> {
  const data = await apiGet<FinancialHealthScore>('/dashboard/health-score');
  if (data) return data;
  await delay(150);
  return healthScoreData as FinancialHealthScore;
}

export async function fetchTransactions(companyId: string = 'COMP001'): Promise<Transaction[]> {
  const data = await apiGet<Transaction[]>(`/transactions?company_id=${companyId}`);
  if (data) return data;
  await delay(200);
  return (transactionsData as Transaction[]).filter(t => t.company_id === companyId);
}

export async function fetchTransaction(id: string, companyId: string = 'COMP001'): Promise<Transaction | null> {
  const data = await apiGet<Transaction>(`/transactions/${id}`);
  if (data) return data;
  await delay(120);
  return (transactionsData as Transaction[]).find(t => t.id === id && t.company_id === companyId) || null;
}

export async function updateTransaction(id: string, patch: Partial<Transaction>): Promise<Transaction | null> {
  // Returns the updated transaction from the API, or null in demo/offline mode
  // (the caller keeps the optimistic local copy in that case).
  return apiPatch<Transaction>(`/transactions/${id}`, patch);
}

export async function fetchDocuments(companyId: string = 'COMP001'): Promise<AIDocument[]> {
  const data = await apiGet<AIDocument[]>(`/documents?company_id=${companyId}`);
  if (data) return data;
  await delay(200);
  return (documentsData as AIDocument[]).filter(d => d.company_id === companyId);
}

export async function fetchApprovals(companyId: string = 'COMP001'): Promise<AIApprovalItem[]> {
  const data = await apiGet<AIApprovalItem[]>(`/approvals?company_id=${companyId}`);
  if (data) return data;
  await delay(150);
  return (approvalsData as AIApprovalItem[]).filter(a => a.company_id === companyId);
}

export async function fetchCategories(companyId: string = 'COMP001'): Promise<Category[]> {
  const data = await apiGet<Category[]>(`/categories?company_id=${companyId}`);
  if (data) return data;
  await delay(150);
  return (categoriesData as Category[]).filter(c => c.company_id === companyId);
}

export async function fetchSuppliers(companyId: string = 'COMP001'): Promise<Supplier[]> {
  const data = await apiGet<Supplier[]>(`/suppliers?company_id=${companyId}`);
  if (data) return data;
  await delay(150);
  return (suppliersData as Supplier[]).filter(s => s.company_id === companyId);
}

export async function fetchCustomers(companyId: string = 'COMP001'): Promise<Customer[]> {
  const data = await apiGet<Customer[]>(`/customers?company_id=${companyId}`);
  if (data) return data;
  await delay(150);
  return (customersData as Customer[]).filter(c => c.company_id === companyId);
}

export async function fetchCostCenters(companyId: string = 'COMP001'): Promise<CostCenter[]> {
  await delay(150);
  return (costCentersData as CostCenter[]).filter(cc => cc.company_id === companyId);
}

export async function fetchFinancialEvents(companyId: string = 'COMP001'): Promise<FinancialEvent[]> {
  const data = await apiGet<FinancialEvent[]>(`/events?company_id=${companyId}`);
  if (data) return data;
  await delay(150);
  return (financialEventsData as FinancialEvent[]).filter(e => e.company_id === companyId);
}

export async function fetchAIRules(companyId: string = 'COMP001'): Promise<AIRule[]> {
  const data = await apiGet<AIRule[]>(`/settings/rules?company_id=${companyId}`);
  if (data) return data;
  await delay(150);
  return (aiRulesData as AIRule[]).filter(r => r.company_id === companyId);
}

export async function fetchAuditLogs(companyId: string = 'COMP001'): Promise<AuditLogItem[]> {
  const data = await apiGet<AuditLogItem[]>(`/audit?company_id=${companyId}`);
  if (data) return data;
  await delay(150);
  return (auditLogData as AuditLogItem[]).filter(a => a.company_id === companyId);
}

// ── Dashboard real-time endpoints ──
export async function fetchDashboardSummary<T = Record<string, unknown>>(): Promise<T[]> {
  const data = await apiGet<T[]>('/dashboard/summary');
  return data || [];
}

export async function fetchExpensesByCategory<T = Record<string, unknown>>(): Promise<T[]> {
  const data = await apiGet<T[]>('/dashboard/expenses-by-category');
  return data || [];
}

// ── Fiscal endpoints ──
export async function fetchVatSummary<T = Record<string, unknown>>(period?: string): Promise<T> {
  const url = period ? `/fiscal/vat-summary?period=${period}` : '/fiscal/vat-summary';
  const data = await apiGet<T>(url);
  return data || ({ breakdown: [], totals: {} } as unknown as T);
}

export async function fetchVatPosition(period?: string): Promise<VatPosition | null> {
  return apiGet<VatPosition>(period ? `/fiscal/vat-position?period=${period}` : '/fiscal/vat-position');
}

export async function fetchRealCash(): Promise<RealCash | null> {
  return apiGet<RealCash>('/fiscal/real-cash');
}

export async function updateCompany(
  companyId: string,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  return apiPatch<Record<string, unknown>>(`/companies/${companyId}`, patch);
}

// ── Bank Reconciliation ──
export async function fetchBankStatements<T = Record<string, unknown>>(): Promise<T[]> {
  const data = await apiGet<T[]>('/bank/statements');
  return data || [];
}

export async function fetchBankStatementEntries<T = Record<string, unknown>>(statementId: string): Promise<T[]> {
  const data = await apiGet<T[]>(`/bank/statements/${statementId}/entries`);
  return data || [];
}


// ── Approvals Action ──
export async function actionApproval(
  approvalId: string,
  action: 'approved' | 'rejected',
  notes?: string
): Promise<Record<string, unknown> | null> {
  const data = await apiPost<Record<string, unknown>>(`/approvals/${approvalId}/action?action=${action}`, {
    rejection_reason: notes,
  });
  return data;
}

// ── Document Upload ──
export async function uploadInvoiceDocument(file: File, channel: string = 'upload'): Promise<Record<string, unknown>> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('channel', channel);

  const res = await apiFetch('/documents/upload', {
    method: 'POST',
    body: formData,
  });

  if (res.ok) {
    return (await res.json()) as Record<string, unknown>;
  }
  const err = (await res.json().catch(() => ({}))) as { detail?: string };
  throw new Error(err.detail || 'Erro ao processar fatura.');
}

// ── Registry Deletions ──
export async function deleteSupplier(id: string): Promise<boolean> {
  const res = await apiDelete<Record<string, unknown>>(`/suppliers/${id}`);
  return !!res;
}

export async function deleteCustomer(id: string): Promise<boolean> {
  const res = await apiDelete<Record<string, unknown>>(`/customers/${id}`);
  return !!res;
}

export async function updateCustomer(id: string, patch: Partial<Customer>): Promise<Customer | null> {
  return apiPatch<Customer>(`/customers/${id}`, patch);
}

export async function updateSupplier(id: string, patch: Partial<Supplier>): Promise<Supplier | null> {
  return apiPatch<Supplier>(`/suppliers/${id}`, patch);
}

export async function fetchInstallments(trxId: string): Promise<Installment[]> {
  return (await apiGet<Installment[]>(`/transactions/${trxId}/installments`)) || [];
}

export async function previewInstallments(
  trxId: string, count: number, firstDueDate?: string,
): Promise<{ number: number; label: string; due_date: string; amount: number }[]> {
  const q = new URLSearchParams({ count: String(count) });
  if (firstDueDate) q.set('first_due_date', firstDueDate);
  return (await apiGet(`/transactions/${trxId}/installments/preview?${q}`)) || [];
}

export async function createInstallments(
  trxId: string, count: number, firstDueDate?: string,
): Promise<Installment[] | null> {
  return apiPost<Installment[]>(`/transactions/${trxId}/installments`, {
    count, first_due_date: firstDueDate,
  });
}

export async function fetchPayments(trxId: string): Promise<PaymentRecord[]> {
  return (await apiGet<PaymentRecord[]>(`/transactions/${trxId}/payments`)) || [];
}

export interface SettlementResult {
  payment: PaymentRecord;
  transaction: { id: string; paid_amount: number; outstanding_amount: number; payment_status: string };
}

export async function registerPayment(trxId: string, payload: {
  amount?: number;
  payment_date?: string;
  installment_id?: string;
  bank_account_id?: string;
  payment_method?: string;
  reference?: string;
  notes?: string;
}): Promise<SettlementResult | null> {
  return apiPost<SettlementResult>(`/transactions/${trxId}/payments`, payload);
}

export async function deletePayment(trxId: string, paymentId: string): Promise<boolean> {
  return !!(await apiDelete<Record<string, unknown>>(`/transactions/${trxId}/payments/${paymentId}`));
}

export async function fetchBankAccounts(): Promise<BankAccount[]> {
  return (await apiGet<BankAccount[]>('/bank-accounts/')) || [];
}

export async function fetchChartTemplates(): Promise<ChartTemplate[]> {
  return (await apiGet<ChartTemplate[]>('/chart-templates/')) || [];
}

export interface RestoreChartResult {
  created: number;
  skipped: number;
  message: string;
}

export async function restoreChartDefaults(templateCode?: string): Promise<RestoreChartResult | null> {
  return apiPost<RestoreChartResult>('/chart-templates/restore', { template_code: templateCode });
}

export async function fetchCategoryGroups(): Promise<CategoryGroup[]> {
  return (await apiGet<CategoryGroup[]>('/category-groups/')) || [];
}

export async function createCategoryGroup(
  payload: { name: string; kind: 'income' | 'expense'; icon?: string; color?: string; description?: string },
): Promise<CategoryGroup | null> {
  return apiPost<CategoryGroup>('/category-groups/', payload);
}

export async function updateCategoryGroup(
  id: string,
  patch: Partial<Pick<CategoryGroup, 'name' | 'kind' | 'icon' | 'color' | 'description' | 'active'>>,
): Promise<CategoryGroup | null> {
  return apiPatch<CategoryGroup>(`/category-groups/${id}`, patch);
}

export async function deleteCategoryGroup(id: string): Promise<boolean> {
  return !!(await apiDelete<Record<string, unknown>>(`/category-groups/${id}`));
}

export async function createCategory(payload: {
  name: string;
  group_id?: string;
  parent_id?: string;
  description?: string;
  keywords?: string[];
}): Promise<Category | null> {
  return apiPost<Category>('/categories/', payload);
}

export async function updateCategory(
  id: string,
  patch: Partial<Pick<Category, 'name' | 'description' | 'group_id' | 'active'>> & { keywords?: string[] },
): Promise<Category | null> {
  return apiPatch<Category>(`/categories/${id}`, patch);
}

export async function deleteCategory(id: string): Promise<boolean> {
  const res = await apiDelete<Record<string, unknown>>(`/categories/${id}`);
  return !!res;
}



/* ------------------------------------------------------------------------ */
/* Team & tenancy                                                            */
/*                                                                           */
/* A login can belong to several companies. The active one travels in the    */
/* X-Company-Id header (see services/api.ts) and the backend only accepts it */
/* after checking the membership — so switching company here can never leak  */
/* data from another one.                                                    */
/* ------------------------------------------------------------------------ */

export async function createCompany(payload: {
  name: string;
  nif?: string;
  currency?: string;
  legal_form?: string;
  vat_regime?: string;
  vat_periodicity?: string;
  cae?: string;
}): Promise<{ data?: Company; error?: string }> {
  return apiPostOrError<Company>('/companies/', payload);
}

export async function fetchTeamMembers(companyId: string): Promise<TeamMember[]> {
  return (await apiGet<TeamMember[]>(`/companies/${companyId}/members`)) || [];
}

export async function updateMemberRole(
  companyId: string,
  userId: string,
  role: UserRole,
): Promise<{ data?: { role: UserRole; role_label: string }; error?: string }> {
  return apiPatchOrError(`/companies/${companyId}/members/${userId}`, { role });
}

export async function removeMember(
  companyId: string,
  userId: string,
): Promise<{ error?: string }> {
  const res = await apiDeleteOrError(`/companies/${companyId}/members/${userId}`);
  return { error: res.error };
}

export async function fetchMemberActivity(
  companyId: string,
  userId: string,
): Promise<MemberActivity | null> {
  return apiGet<MemberActivity>(`/companies/${companyId}/members/${userId}/activity`);
}

export async function fetchInvitations(companyId: string): Promise<Invitation[]> {
  return (await apiGet<Invitation[]>(`/invitations/company/${companyId}`)) || [];
}

export async function createInvitation(
  companyId: string,
  payload: { email: string; role: UserRole; message?: string },
): Promise<{ data?: Invitation; error?: string }> {
  return apiPostOrError<Invitation>(`/invitations/company/${companyId}`, payload);
}

export async function revokeInvitation(invitationId: string): Promise<{ error?: string }> {
  const res = await apiDeleteOrError(`/invitations/${invitationId}`);
  return { error: res.error };
}

/** Public: what the invited person sees before deciding. */
export async function previewInvitation(
  token: string,
): Promise<{ data?: InvitationPreview; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/invitations/token/${token}`);
    if (res.ok) return { data: (await res.json()) as InvitationPreview };
    return { error: (await apiError(res)) || 'Convite inválido.' };
  } catch {
    return { error: 'Não foi possível contactar o servidor.' };
  }
}

/** Accept with the login you are already signed in as. */
export async function acceptInvitation(
  token: string,
): Promise<{ data?: { company_id: string; company_name: string; role: UserRole }; error?: string }> {
  return apiPostOrError('/invitations/accept', { token });
}

/** Create the invited account and join in one step. Returns a session token. */
export async function registerFromInvitation(payload: {
  token: string;
  name: string;
  password: string;
}): Promise<{ data?: { access_token: string; company_id: string }; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/invitations/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) return { data: await res.json() };
    return { error: (await apiError(res)) || 'Não foi possível criar a conta.' };
  } catch {
    return { error: 'Não foi possível contactar o servidor.' };
  }
}

/** Invitations waiting for the signed-in user's email. */
export async function fetchMyInvitations(): Promise<Invitation[]> {
  return (await apiGet<Invitation[]>('/invitations/mine')) || [];
}
