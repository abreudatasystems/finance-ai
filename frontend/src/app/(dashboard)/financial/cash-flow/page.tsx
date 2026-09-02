'use client';

import React, { Suspense } from 'react';
import { CashFlowContent } from '@/components/cashflow/CashFlowView';

export default function CashFlowPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-400 text-xs">
          A carregar o fluxo de caixa…
        </div>
      }
    >
      <CashFlowContent mode="cash-flow" />
    </Suspense>
  );
}
