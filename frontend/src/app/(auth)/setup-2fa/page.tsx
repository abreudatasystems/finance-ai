'use client';

/**
 * Configuração obrigatória da verificação em dois passos.
 *
 * Quem pertence a uma empresa que a exige chega aqui depois de entrar e só
 * segue para a aplicação quando a tiver ativado.
 */

import React, { useEffect, useState } from 'react';
import { LogOut, ShieldCheck } from 'lucide-react';
import { Button, LoadingState } from '@/components/ui';
import { apiGet, clearToken, isAuthenticated, redirectToLogin } from '@/services/api';
import { TwoFactorSetupFlow } from '@/components/settings/TwoFactorSettings';
import { AuthShell } from '../AuthShell';

export default function SetupTwoFactorPage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) { redirectToLogin(); return; }
    apiGet<{ two_factor_enabled?: boolean; two_factor_setup_required?: boolean }>('/auth/me').then((me) => {
      // Já está ativa (ou já não é obrigatória): nada a fazer aqui.
      if (me && !me.two_factor_setup_required) {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- recarga completa intencional
        window.location.assign('/companies');
        return;
      }
      setReady(true);
    });
  }, []);

  const logout = () => {
    clearToken();
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- recarga completa intencional
    window.location.assign('/login');
  };

  return (
    <AuthShell wide>
      <div className="flex items-start gap-3">
        <div className="size-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
          <ShieldCheck className="size-4 text-emerald-700" aria-hidden="true" />
        </div>
        <div className="space-y-0.5">
          <h1 className="text-base font-semibold">Ative a verificação em dois passos</h1>
          <p className="text-xs text-neutral-500">
            A sua empresa exige-a a todos os membros. Leva um minuto e só precisa do telemóvel.
          </p>
        </div>
      </div>

      {ready ? (
        <TwoFactorSetupFlow
          onDone={() => {
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- recarga completa intencional
            window.location.assign('/companies');
          }}
        />
      ) : (
        <LoadingState />
      )}

      <div className="pt-3 border-t border-neutral-100">
        <Button variant="ghost" size="sm" icon={<LogOut />} onClick={logout}>Terminar sessão</Button>
      </div>
    </AuthShell>
  );
}
