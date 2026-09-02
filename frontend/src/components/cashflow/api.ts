/** Data access for the cash-flow module. */

import { apiGet, apiPostOrError } from '@/services/api';
import { CashForecast, SettleResult } from './types';

export async function fetchForecast(weeks = 13): Promise<CashForecast | null> {
  return apiGet<CashForecast>(`/transactions/cash-forecast?weeks=${weeks}`);
}

/** Settle one obligation for whatever it still owes.
 *
 * A real payment, not a flag: the settlement state is derived from payments,
 * so writing "paid" on the document would change nothing and show green.
 */
export async function settleOne(
  transactionId: string,
  paymentDate?: string,
): Promise<{ data?: { transaction: { payment_status: string; outstanding_amount: number } }; error?: string }> {
  return apiPostOrError(`/transactions/${transactionId}/payments`, {
    payment_date: paymentDate,
  });
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
