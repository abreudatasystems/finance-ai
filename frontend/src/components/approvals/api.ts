/** The approvals module's own data access — nothing else imports these paths. */

import { apiGet, apiPostOrError } from '@/services/api';
import { ApprovalDetail, ApprovalDecision, ApprovalRow, ApprovalSummary } from './types';

export type QueueFilter = 'pending' | 'approved' | 'rejected' | 'all';

export async function fetchQueue(status: QueueFilter = 'pending'): Promise<ApprovalRow[]> {
  return (await apiGet<ApprovalRow[]>(`/approvals/?status=${status}`)) || [];
}

export async function fetchSummary(): Promise<ApprovalSummary | null> {
  return apiGet<ApprovalSummary>('/approvals/summary');
}

export async function fetchApproval(id: string): Promise<ApprovalDetail | null> {
  return apiGet<ApprovalDetail>(`/approvals/${id}`);
}

export interface DecisionResult {
  action: string;
  transaction_id?: string;
  payment_status?: string;
  outstanding_amount?: number;
}

/** `edited` is sent when the reviewer changed anything, so the trail says so. */
export async function decide(
  id: string,
  action: 'approved' | 'edited' | 'rejected',
  decision: ApprovalDecision = {},
): Promise<{ data?: DecisionResult; error?: string }> {
  return apiPostOrError<DecisionResult>(`/approvals/${id}/action?action=${action}`, decision);
}

export interface BatchResult {
  status: 'success' | 'partial';
  decididos: number;
  falhados: number;
  erros: Array<{ approval_id: string; detail: string }>;
}

export async function decideMany(
  approvalIds: string[],
  action: 'approved' | 'rejected',
  rejectionReason?: string,
): Promise<{ data?: BatchResult; error?: string }> {
  return apiPostOrError<BatchResult>('/approvals/batch', {
    approval_ids: approvalIds,
    action,
    rejection_reason: rejectionReason,
  });
}
