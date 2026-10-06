'use client';

/**
 * Recorrências — a casca; tudo vive no módulo src/components/recurrences.
 */

import React, { useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { RecurrencesPanel } from '@/components/recurrences/RecurrencesPanel';

export default function RecurrencesPage() {
  const { setPageHeader } = useApp();

  useEffect(() => {
    setPageHeader('Recorrências', 'O que se repete todos os meses, lançado uma vez por período');
  }, [setPageHeader]);

  return <RecurrencesPanel />;
}
