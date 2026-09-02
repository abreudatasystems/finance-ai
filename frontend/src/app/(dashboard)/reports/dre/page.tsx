'use client';

/**
 * DRE — a casca; a demonstração vive em src/components/reports.
 */

import React, { useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { IncomeStatementView } from '@/components/reports/IncomeStatementView';

export default function IncomeStatementPage() {
  const { setPageHeader } = useApp();

  useEffect(() => {
    setPageHeader('Demonstração de Resultados', 'Por naturezas · sem IVA · regime de acréscimo');
  }, [setPageHeader]);

  return <IncomeStatementView />;
}
