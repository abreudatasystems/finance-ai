/** Data access for the cash-flow module. */

import { apiGet, apiPostOrError } from '@/services/api';
import { CashForecast, SettleResult } from './types';

export async function fetchForecast(weeks = 13): Promise<CashForecast | null> {
  return apiGet<CashForecast>(`/transactions/cash-forecast?weeks=${weeks}`);
}

/** Settle several obligations at once — "hoje paguei estas cinco coisas". */
export async function settleMany(
  transactionIds: string[],
  paymentDate?: string,
): Promise<{ data?: SettleResult; error?: string }> {
  return apiPostOrError<SettleResult>('/transactions/settle', {
    transaction_ids: transactionIds,
    payment_date: paymentDate,
  });
}
