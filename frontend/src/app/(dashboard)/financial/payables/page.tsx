'use client';

import React, { Suspense } from 'react';
import { CashFlowContent } from '@/components/cashflow/CashFlowView';
import { Card, LoadingState } from '@/components/ui';

export default function PayablesPage() {
  return (
    <Suspense
      fallback={
        <Card>
          <LoadingState label="A carregar contas a pagar…" />
        </Card>
      }
    >
      <CashFlowContent mode="payables" />
    </Suspense>
  );
}
