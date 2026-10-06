'use client';

/**
 * Retenções na fonte — a casca; o apuramento vive em src/components/retentions.
 */

import React, { useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { RetentionsView } from '@/components/retentions/RetentionsView';

export default function RetentionsPage() {
  const { setPageHeader } = useApp();

  useEffect(() => {
    setPageHeader('Retenções na Fonte', 'O que retém, o que lhe retêm, e o que entrega ao Estado');
  }, [setPageHeader]);

  return <RetentionsView />;
}
