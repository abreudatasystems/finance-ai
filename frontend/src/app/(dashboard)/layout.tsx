import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { TwoFactorGate } from '@/components/settings/TwoFactorSettings';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // A empresa pode obrigar a usar 2FA: quem ainda não a tem vai configurá-la primeiro.
  return <AppLayout><TwoFactorGate>{children}</TwoFactorGate></AppLayout>;
}
