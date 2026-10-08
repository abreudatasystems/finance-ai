'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';

interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Acções que apagam ou anulam: botão vermelho. */
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Substitui o window.confirm() do navegador, que não se pode estilizar nem
 * traduzir e que bloqueia a página. Uso:
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: 'Apagar fornecedor?', danger: true }))) return;
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm precisa de <ConfirmProvider> acima na árvore.');
  return ctx;
}

type Pending = ConfirmOptions & { resolve: (value: boolean) => void };

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<ConfirmFn>(
    (options) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    [],
  );

  const close = useCallback(
    (value: boolean) => {
      pending?.resolve(value);
      setPending(null);
    },
    [pending],
  );

  useEffect(() => {
    if (!pending) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pending, close]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="fai-overlay absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => close(false)}
            aria-hidden="true"
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-neutral-200 p-5"
          >
            <div className="flex gap-3">
              {pending.danger && (
                <span className="size-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <AlertTriangle className="size-4" aria-hidden="true" />
                </span>
              )}
              <div className="min-w-0">
                <h2 id="confirm-title" className="text-sm font-bold text-neutral-900">{pending.title}</h2>
                {pending.description && <div className="text-xs text-neutral-600 mt-1">{pending.description}</div>}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="secondary" size="sm" onClick={() => close(false)}>
                {pending.cancelLabel ?? 'Cancelar'}
              </Button>
              <Button
                ref={confirmRef}
                variant={pending.danger ? 'danger' : 'primary'}
                size="sm"
                onClick={() => close(true)}
              >
                {pending.confirmLabel ?? 'Confirmar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
