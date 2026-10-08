'use client';

import React, { Suspense } from 'react';
import { CashFlowContent } from '@/components/cashflow/CashFlowView';
import { Card, LoadingState } from '@/components/ui';

export default function ReceivablesPage() {
  return (
    <Suspense
      fallback={
        <Card>
          <LoadingState label="A carregar contas a receber…" />
        </Card>
      }
    >
      <CashFlowContent mode="receivables" />
    </Suspense>
  );
}
