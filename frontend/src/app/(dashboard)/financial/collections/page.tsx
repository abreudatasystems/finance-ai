'use client';

/**
 * Cobranças — a casca; o painel vive em src/components/collections.
 */

import React, { useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { CollectionsPanel } from '@/components/collections/CollectionsPanel';

export default function CollectionsPage() {
  const { setPageHeader } = useApp();

  useEffect(() => {
    setPageHeader('Cobranças', 'Quem deve, há quanto tempo, e quando costuma pagar');
  }, [setPageHeader]);

  return <CollectionsPanel />;
}
