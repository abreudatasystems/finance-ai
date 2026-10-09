'use client';

/**
 * Verificação em dois passos (TOTP).
 *
 * - `TwoFactorSetupFlow`: QR + chave manual → confirmar código → mostrar os
 *   códigos de recuperação uma única vez, com confirmação "guardei".
 * - `TwoFactorSettings`: o cartão "Segurança" das configurações (ativar,
 *   desativar e, para quem administra, obrigar a equipa a usar).
 * - `TwoFactorGate`: leva ao ecrã de configuração quem pertence a uma empresa
 *   que obriga a 2FA e ainda não a ativou.
 *
 * O QR vem do servidor já em SVG — o frontend não precisa de biblioteca.
 */

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Check, Copy, ShieldCheck, ShieldOff, Smartphone, Users } from 'lucide-react';
import { toast } from 'sonner';
import { apiError, apiFetch, apiGet, apiPostOrError } from '@/services/api';
import { useLoad } from '@/lib/use-load';
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, LoadingState } from '@/components/ui';

export interface TwoFactorStatus {
  enabled: boolean;
  enabled_at: string | null;
  recovery_codes_remaining: number;
  setup_required: boolean;
  company_id: string;
  company_requires: boolean;
  can_manage_policy: boolean;
}

interface SetupData {
  secret: string;
  otpauth_uri: string;
  qr_svg: string;
}

const groupKey = (secret: string) => secret.replace(/(.{4})/g, '$1 ').trim();

// --------------------------------------------------------------------------
// Configuração (usada nas configurações e no ecrã obrigatório)
// --------------------------------------------------------------------------

export function TwoFactorSetupFlow({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);

  const start = async () => {
    setBusy(true);
    setError(null);
    const res = await apiPostOrError<SetupData>('/auth/2fa/setup', {});
    setBusy(false);
    if (res.error || !res.data) { setError(res.error || 'Não foi possível começar.'); return; }
    setSetup(res.data);
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiPostOrError<{ recovery_codes: string[] }>('/auth/2fa/enable', { code: code.trim() });
    setBusy(false);
    if (res.error || !res.data) { setError(res.error || 'Código inválido.'); return; }
    setRecovery(res.data.recovery_codes);
  };

  const copyCodes = async () => {
    if (!recovery) return;
    try {
      await navigator.clipboard.writeText(recovery.join('\n'));
      toast.success('Códigos copiados.');
    } catch {
      toast.error('Não foi possível copiar — selecione e copie à mão.');
    }
  };

  if (recovery) {
    return (
      <div className="space-y-3">
        <p role="status" className="rounded-lg border px-3 py-2 text-xs bg-emerald-50 border-emerald-200 text-emerald-900 flex items-center gap-1.5">
          <Check className="size-3.5" aria-hidden="true" /> Verificação em dois passos ativa.
        </p>
        <div className="space-y-1">
          <p className="text-13 font-semibold text-neutral-800">Códigos de recuperação</p>
          <p className="text-xs text-neutral-500">
            Se perder o telemóvel, cada um destes códigos permite entrar uma vez. Guarde-os num
            local seguro (gestor de palavras-passe, papel guardado) — <strong>não voltam a ser mostrados</strong>.
          </p>
        </div>
        <ul className="grid grid-cols-2 gap-1.5 px-3 py-2 rounded-lg bg-neutral-50 border border-neutral-200 font-mono text-sm select-all">
          {recovery.map((c) => <li key={c}>{c}</li>)}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm" icon={<Copy />} onClick={copyCodes}>Copiar códigos</Button>
          <label className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)}
              className="size-4 accent-emerald-600" />
            Copiei e guardei os códigos
          </label>
        </div>
        <Button disabled={!saved} onClick={onDone} icon={<Check />}>Concluir</Button>
      </div>
    );
  }

  if (!setup) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-neutral-500">
          Além da palavra-passe, passa a ser pedido um código de 6 dígitos gerado por uma app no
          telemóvel (Google Authenticator, Microsoft Authenticator, 1Password…). Quem descobrir a
          sua palavra-passe continua sem conseguir entrar.
        </p>
        {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
        <div className="flex gap-2">
          <Button onClick={start} loading={busy} icon={<Smartphone />}>Configurar</Button>
          {onCancel && <Button variant="ghost" onClick={onCancel}>Cancelar</Button>}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={confirm} className="space-y-4">
      <ol className="text-xs text-neutral-600 list-decimal pl-4 space-y-1">
        <li>Abra a app de autenticação no telemóvel e escolha adicionar conta.</li>
        <li>Leia o código QR — ou, se não conseguir, escreva a chave manual.</li>
        <li>Introduza o código de 6 dígitos que a app mostra.</li>
      </ol>
      <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG gerado pelo servidor, em data URI */}
        <img src={setup.qr_svg} alt="Código QR para a app de autenticação"
          className="size-44 rounded-lg border border-neutral-200 bg-white p-1" />
        <div className="space-y-1 min-w-0">
          <p className="text-xs font-medium text-neutral-700">Chave manual</p>
          <code className="block text-sm font-mono break-all bg-neutral-50 border border-neutral-200 rounded-lg px-2 py-1.5 select-all">
            {groupKey(setup.secret)}
          </code>
          <p className="text-2xs text-neutral-500">Tipo: baseada no tempo (TOTP), 6 dígitos.</p>
        </div>
      </div>
      <Field label="Código da app" required error={error}>
        {(p) => (
          <Input
            {...p}
            required autoFocus inputMode="numeric" autoComplete="one-time-code"
            pattern="[0-9 ]{6,7}" maxLength={7} placeholder="123456"
            className="tracking-widest font-mono max-w-40"
            value={code} onChange={(e) => setCode(e.target.value)}
          />
        )}
      </Field>
      <div className="flex gap-2">
        <Button type="submit" loading={busy} icon={<ShieldCheck />}>Confirmar e ativar</Button>
        {onCancel && <Button variant="ghost" onClick={onCancel}>Cancelar</Button>}
      </div>
    </form>
  );
}

// --------------------------------------------------------------------------
// Cartão "Segurança"
// --------------------------------------------------------------------------

export const TwoFactorSettings: React.FC = () => {
  // Depois de cada mudança volta a ler em silêncio (sem voltar ao "a carregar").
  const { data: status, loading, refresh: load } = useLoad(
    () => apiGet<TwoFactorStatus>('/auth/2fa/status'), [],
  );
  const [settingUp, setSettingUp] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [policyBusy, setPolicyBusy] = useState(false);

  const disable = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await apiPostOrError('/auth/2fa/disable', { password, code: code.trim() });
    setBusy(false);
    if (res.error) { toast.error(res.error); return; }
    toast.success('Verificação em dois passos desativada.');
    setPassword(''); setCode(''); setDisabling(false);
    load();
  };

  const setPolicy = async (require: boolean) => {
    setPolicyBusy(true);
    try {
      const res = await apiFetch('/auth/2fa/policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ require_two_factor: require }),
      });
      const error = await apiError(res);
      if (error) toast.error(error);
      else toast.success(require ? 'A equipa passa a ter de usar verificação em dois passos.'
        : 'A verificação em dois passos deixou de ser obrigatória.');
    } catch {
      toast.error('Não foi possível contactar o servidor.');
    }
    setPolicyBusy(false);
    load();
  };

  return (
    <Card className="text-xs">
      <CardHeader
        icon={<ShieldCheck />}
        title="Segurança — verificação em dois passos"
        actions={status && (status.enabled
          ? <Badge tone="success">Ativa</Badge>
          : <Badge tone={status.setup_required ? 'warning' : 'neutral'}>
              {status.setup_required ? 'Obrigatória' : 'Desativada'}
            </Badge>)}
      />
      <CardBody className="space-y-3">
        {loading ? (
          <LoadingState />
        ) : !status ? (
          <p className="text-xs text-rose-700">Não foi possível carregar o estado da verificação.</p>
        ) : status.enabled ? (
          <div className="space-y-3">
            <p className="text-xs text-neutral-600">
              Ao entrar, é pedido o código da app de autenticação.
              {' '}Restam <strong>{status.recovery_codes_remaining}</strong> código(s) de recuperação.
            </p>
            {disabling ? (
              <form onSubmit={disable} className="space-y-3 p-3 rounded-lg border border-neutral-200 bg-neutral-50">
                <p className="text-xs text-neutral-700">
                  Para desativar, confirme a palavra-passe e um código da app (ou de recuperação).
                </p>
                <Field label="Palavra-passe" required>
                  {(p) => (
                    <Input {...p} type="password" required autoComplete="current-password"
                      value={password} onChange={(e) => setPassword(e.target.value)} />
                  )}
                </Field>
                <Field label="Código" required>
                  {(p) => (
                    <Input {...p} required autoComplete="one-time-code" className="font-mono max-w-48"
                      value={code} onChange={(e) => setCode(e.target.value)} />
                  )}
                </Field>
                {status.company_requires && (
                  <p className="text-xs text-amber-700">
                    A empresa obriga a usar verificação em dois passos: vai ter de a configurar de novo.
                  </p>
                )}
                <div className="flex gap-2">
                  <Button type="submit" variant="danger" loading={busy} icon={<ShieldOff />}>Desativar</Button>
                  <Button variant="ghost" onClick={() => setDisabling(false)}>Cancelar</Button>
                </div>
              </form>
            ) : (
              <Button variant="secondary" size="sm" icon={<ShieldOff />} onClick={() => setDisabling(true)}>
                Desativar
              </Button>
            )}
          </div>
        ) : settingUp ? (
          <TwoFactorSetupFlow
            onDone={() => { setSettingUp(false); load(); }}
            onCancel={() => setSettingUp(false)}
          />
        ) : (
          <div className="space-y-3">
            {status.setup_required && (
              <p className="rounded-lg border px-3 py-2 text-xs bg-amber-50 border-amber-200 text-amber-900">
                Uma empresa a que pertence obriga a usar verificação em dois passos.
              </p>
            )}
            <p className="text-xs text-neutral-500">
              Proteja a conta com um código do telemóvel, além da palavra-passe.
            </p>
            <Button icon={<Smartphone />} onClick={() => setSettingUp(true)}>Ativar</Button>
          </div>
        )}

        {status?.can_manage_policy && (
          <div className="pt-3 border-t border-neutral-100 space-y-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-emerald-600"
                checked={status.company_requires}
                disabled={policyBusy || (!status.enabled && !status.company_requires)}
                onChange={(e) => setPolicy(e.target.checked)}
              />
              <span className="space-y-0.5">
                <span className="flex items-center gap-1.5 text-xs font-medium text-neutral-800">
                  <Users className="size-3.5" aria-hidden="true" /> Obrigar a equipa a usar
                </span>
                <span className="block text-xs text-neutral-500">
                  Todos os membros desta empresa terão de configurar a verificação em dois passos
                  antes de usar a aplicação.
                  {!status.enabled && !status.company_requires && ' Ative-a primeiro na sua conta.'}
                </span>
              </span>
            </label>
          </div>
        )}
      </CardBody>
    </Card>
  );
};

// --------------------------------------------------------------------------
// Política obrigatória: encaminha para a configuração
// --------------------------------------------------------------------------

/** Leva ao ecrã de configuração quem tem a 2FA em falta e é obrigado a tê-la. */
export function TwoFactorGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let alive = true;
    apiGet<{ two_factor_setup_required?: boolean }>('/auth/me').then((me) => {
      if (alive && me?.two_factor_setup_required) router.replace('/setup-2fa');
    });
    return () => { alive = false; };
  }, [router, pathname]);

  return <>{children}</>;
}
