/** Data access for the onboarding module. */

import { apiGet, apiPatchOrError } from '@/services/api';
import { BankAccountRow, OnboardingStatus } from './types';

export async function fetchOnboarding(): Promise<OnboardingStatus | null> {
  return apiGet<OnboardingStatus>('/onboarding/');
}

export async function fetchAccounts(): Promise<BankAccountRow[] | null> {
  return apiGet<BankAccountRow[]>('/bank-accounts/');
}

/** The first step: what is really in the account today. */
export async function setOpeningBalance(
  accountId: string,
  openingBalance: number,
): Promise<{ data?: BankAccountRow; error?: string }> {
  return apiPatchOrError<BankAccountRow>(`/bank-accounts/${accountId}`, {
    opening_balance: openingBalance,
  });
}
