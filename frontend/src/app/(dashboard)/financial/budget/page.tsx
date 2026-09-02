'use client';

/**
 * Orçamento — a casca; a comparação vive em src/components/budgets.
 */

import React, { useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { BudgetView } from '@/components/budgets/BudgetView';

export default function BudgetPage() {
  const { setPageHeader } = useApp();

  useEffect(() => {
    setPageHeader('Orçamento', 'O que estava planeado, face ao que aconteceu');
  }, [setPageHeader]);

  return <BudgetView />;
}
