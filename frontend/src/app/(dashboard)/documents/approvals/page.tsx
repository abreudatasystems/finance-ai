'use client';

/**
 * Aprovações — the human gate of the scan → approve → obligation flow.
 *
 * The page is a shell: everything lives in the approvals module
 * (src/components/approvals), so the flow can grow without this file changing.
 */

import React, { useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { ApprovalQueue } from '@/components/approvals/ApprovalQueue';

export default function ApprovalsPage() {
  const { setPageHeader } = useApp();

  useEffect(() => {
    setPageHeader('Aprovações', 'Confirme o que a IA leu antes de virar obrigação');
  }, [setPageHeader]);

  return <ApprovalQueue />;
}
