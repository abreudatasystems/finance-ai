'use client';

import React, { Suspense } from 'react';
import { CashFlowContent } from '@/components/cashflow/CashFlowView';
import { Card, LoadingState } from '@/components/ui';

export default function CashFlowPage() {
  return (
    <Suspense
      fallback={
        <Card>
          <LoadingState label="A carregar o fluxo de caixa…" />
        </Card>
      }
    >
      <CashFlowContent mode="cash-flow" />
    </Suspense>
  );
}
