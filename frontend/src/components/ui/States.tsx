import React from 'react';
import { Inbox, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from './cn';

/** "A carregar…" — sempre igual em toda a aplicação. */
export function LoadingState({ label = 'A carregar…', className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cn('flex items-center justify-center gap-2 py-10 text-xs text-neutral-500', className)}>
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      {label}
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  /** Normalmente um <Button> para criar o primeiro registo. */
  action?: React.ReactNode;
  className?: string;
}

/** Quando não há nada para mostrar: diz o quê e, se fizer sentido, como começar. */
export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-10 px-4', className)}>
      <span className="size-10 rounded-xl bg-neutral-100 text-neutral-400 flex items-center justify-center mb-3 [&_svg]:size-5">
        {icon ?? <Inbox />}
      </span>
      <p className="text-sm font-semibold text-neutral-800">{title}</p>
      {description && <p className="text-xs text-neutral-500 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Um pedido falhou: diz que falhou, em vez de mostrar zeros. */
export function ErrorState({ message, action, className }: { message: string; action?: React.ReactNode; className?: string }) {
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center text-center py-10 px-4', className)}>
      <span className="size-10 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center mb-3">
        <AlertTriangle className="size-5" aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold text-neutral-800">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
