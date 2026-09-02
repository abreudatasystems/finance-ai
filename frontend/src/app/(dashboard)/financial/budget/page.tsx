'use client';

/**
 * Orçamento — passou a ser uma vista do Desempenho, ao lado dos projetos: são
 * a mesma pergunta (para onde foi o dinheiro) em dois grãos. Fica a casca para
 * que marcadores e ligações antigas continuem a chegar ao sítio certo.
 */

import React, { Suspense, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { PerformanceView } from '@/components/performance/PerformanceView';

export default function BudgetPage() {
  const { setPageHeader } = useApp();

  useEffect(() => {
    setPageHeader('Desempenho', 'Para onde foi o dinheiro — por categoria e por projeto');
  }, [setPageHeader]);

  return (
    <Suspense fallback={<div className="text-xs text-slate-400 p-8 text-center">A carregar…</div>}>
      <PerformanceView initial="budget" />
    </Suspense>
  );
}
