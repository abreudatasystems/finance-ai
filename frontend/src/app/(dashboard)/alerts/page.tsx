'use client';

/**
 * Alertas — a casca; a lógica vive em src/components/alerts.
 */

import React, { useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { AlertsPanel } from '@/components/alerts/AlertsPanel';

export default function AlertsPage() {
  const { setPageHeader } = useApp();

  useEffect(() => {
    setPageHeader('Alertas', 'O que está vencido, por decidir ou por conciliar');
  }, [setPageHeader]);

  return <AlertsPanel />;
}
