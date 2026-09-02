/** Data access for the reports module. */

import { apiGet } from '@/services/api';
import { IncomeStatement } from './types';

export async function fetchIncomeStatement(period?: string): Promise<IncomeStatement | null> {
  const query = period ? `?period=${encodeURIComponent(period)}` : '';
  return apiGet<IncomeStatement>(`/reports/income-statement${query}`);
}
