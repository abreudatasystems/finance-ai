'use client';

/**
 * Desempenho — a casca; as duas vistas vivem em src/components/performance.
 */

import React, { Suspense, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { PerformanceView } from '@/components/performance/PerformanceView';

export default function PerformancePage() {
  const { setPageHeader } = useApp();

  useEffect(() => {
    setPageHeader('Desempenho', 'Para onde foi o dinheiro — por categoria e por projeto');
  }, [setPageHeader]);

  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-400 text-xs">
          A carregar…
        </div>
      }
    >
      <PerformanceView />
    </Suspense>
  );
}
