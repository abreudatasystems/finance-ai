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

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api/v1';

export const delay = (ms: number = 100) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchCompanies(): Promise<Company[]> {
  try {
    const res = await fetch(`${API_BASE}/companies`);
    if (res.ok) return await res.json();
  } catch (e) {
    // Fallback to simulation layer
  }
  await delay(100);
  return companiesData as Company[];
}

export async function fetchUsers(): Promise<User[]> {
  try {
    const res = await fetch(`${API_BASE}/auth/me`);
    if (res.ok) {
      const u = await res.json();
      return [{
        id: u.id,
        name: u.name,
        email: u.email,
        avatar: u.avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150',
        memberships: [{ company_id: 'COMP001', role: 'owner', joined_at: '2026-01-15' }]
      }];
    }
  } catch (e) {
    // Fallback
  }
  await delay(100);
  return usersData as User[];
}

export async function fetchHealthScore(): Promise<FinancialHealthScore> {
  try {
    const res = await fetch(`${API_BASE}/dashboard/health-score`);
    if (res.ok) return await res.json();
  } catch (e) {
    // Fallback
  }
  await delay(150);
  return healthScoreData as FinancialHealthScore;
}

export async function fetchTransactions(companyId: string = 'COMP001'): Promise<Transaction[]> {
  try {
    const res = await fetch(`${API_BASE}/transactions?company_id=${companyId}`);
    if (res.ok) return await res.json();
  } catch (e) {
    // Fallback
  }
  await delay(200);
  return (transactionsData as Transaction[]).filter(t => t.company_id === companyId);
}

export async function fetchDocuments(companyId: string = 'COMP001'): Promise<AIDocument[]> {
  try {
    const res = await fetch(`${API_BASE}/documents?company_id=${companyId}`);
    if (res.ok) return await res.json();
  } catch (e) {
    // Fallback
  }
  await delay(200);
  return (documentsData as AIDocument[]).filter(d => d.company_id === companyId);
}

export async function fetchApprovals(companyId: string = 'COMP001'): Promise<AIApprovalItem[]> {
  try {
    const res = await fetch(`${API_BASE}/approvals?company_id=${companyId}`);
    if (res.ok) return await res.json();
  } catch (e) {
    // Fallback
  }
  await delay(150);
  return (approvalsData as AIApprovalItem[]).filter(a => a.company_id === companyId);
}

export async function fetchCategories(companyId: string = 'COMP001'): Promise<Category[]> {
  try {
    const res = await fetch(`${API_BASE}/categories?company_id=${companyId}`);
    if (res.ok) return await res.json();
  } catch (e) {
    // Fallback
  }
  await delay(150);
  return (categoriesData as Category[]).filter(c => c.company_id === companyId);
}

export async function fetchSuppliers(companyId: string = 'COMP001'): Promise<Supplier[]> {
  try {
    const res = await fetch(`${API_BASE}/suppliers?company_id=${companyId}`);
    if (res.ok) return await res.json();
  } catch (e) {
    // Fallback
  }
  await delay(150);
  return (suppliersData as Supplier[]).filter(s => s.company_id === companyId);
}

export async function fetchCustomers(companyId: string = 'COMP001'): Promise<Customer[]> {
  try {
    const res = await fetch(`${API_BASE}/customers?company_id=${companyId}`);
    if (res.ok) return await res.json();
  } catch (e) {
    // Fallback
  }
  await delay(150);
  return (customersData as Customer[]).filter(c => c.company_id === companyId);
}

export async function fetchCostCenters(companyId: string = 'COMP001'): Promise<CostCenter[]> {
  await delay(150);
  return (costCentersData as CostCenter[]).filter(cc => cc.company_id === companyId);
}

export async function fetchFinancialEvents(companyId: string = 'COMP001'): Promise<FinancialEvent[]> {
  try {
    const res = await fetch(`${API_BASE}/events?company_id=${companyId}`);
    if (res.ok) return await res.json();
  } catch (e) {
    // Fallback
  }
  await delay(150);
  return (financialEventsData as FinancialEvent[]).filter(e => e.company_id === companyId);
}

export async function fetchAIRules(companyId: string = 'COMP001'): Promise<AIRule[]> {
  try {
    const res = await fetch(`${API_BASE}/settings/rules?company_id=${companyId}`);
    if (res.ok) return await res.json();
  } catch (e) {
    // Fallback
  }
  await delay(150);
  return (aiRulesData as AIRule[]).filter(r => r.company_id === companyId);
}

export async function fetchAuditLogs(companyId: string = 'COMP001'): Promise<AuditLogItem[]> {
  try {
    const res = await fetch(`${API_BASE}/audit?company_id=${companyId}`);
    if (res.ok) return await res.json();
  } catch (e) {
    // Fallback
  }
  await delay(150);
  return (auditLogData as AuditLogItem[]).filter(a => a.company_id === companyId);
}
