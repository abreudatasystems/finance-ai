'use client';

import React, { Suspense } from 'react';
import { CashFlowContent } from '@/components/cashflow/CashFlowView';

export default function ReceivablesPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-400 text-xs">
          A carregar contas a receber…
        </div>
      }
    >
      <CashFlowContent mode="receivables" />
    </Suspense>
  );
}
