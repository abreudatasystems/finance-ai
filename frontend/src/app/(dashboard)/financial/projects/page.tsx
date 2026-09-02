'use client';

/**
 * Projetos — ver a nota em ../budget: é agora uma vista do Desempenho.
 */

import React, { Suspense, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { PerformanceView } from '@/components/performance/PerformanceView';

export default function ProjectsPage() {
  const { setPageHeader } = useApp();

  useEffect(() => {
    setPageHeader('Desempenho', 'Para onde foi o dinheiro — por categoria e por projeto');
  }, [setPageHeader]);

  return (
    <Suspense fallback={<div className="text-xs text-slate-400 p-8 text-center">A carregar…</div>}>
      <PerformanceView initial="projects" />
    </Suspense>
  );
}
