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
  Supplier,
  Customer,
  CostCenter,
  Transaction,
  AIDocument,
  AIApprovalItem,
  FinancialHealthScore,
  FinancialEvent,
  AIRule,
  AuditLogItem
} from '@/types';

import { apiGet, apiPatch } from './api';

export const delay = (ms: number = 100) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchCompanies(): Promise<Company[]> {
  const data = await apiGet<Company[]>('/companies');
  if (data) return data;
  await delay(100);
  return companiesData as Company[];
}

export async function fetchUsers(): Promise<User[]> {
  const u = await apiGet<{ id: string; name: string; email: string; avatar?: string; role?: string }>('/auth/me');
  if (u) {
    return [{
      id: u.id,
      name: u.name,
      email: u.email,
      avatar: u.avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150',
      memberships: [{ company_id: 'COMP001', role: (u.role as User['memberships'][number]['role']) || 'owner', joined_at: '2026-01-15' }]
    }];
  }
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
