import React from 'react';
import { cn } from './cn';

/** O cartão branco em que vive quase todo o conteúdo. */
export function Card({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('bg-white rounded-2xl border border-neutral-200/80 shadow-xs', className)}
      {...rest}
    />
  );
}

interface CardHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  /** Botões ou filtros alinhados à direita. */
  actions?: React.ReactNode;
  className?: string;
}

export function CardHeader({ title, subtitle, icon, actions, className }: CardHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between gap-3 px-5 py-4 border-b border-neutral-100', className)}>
      <div className="flex items-center gap-2.5 min-w-0">
        {icon && (
          <span className="size-8 rounded-lg bg-neutral-100 text-neutral-700 flex items-center justify-center shrink-0 [&_svg]:size-4">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-neutral-900 truncate">{title}</h2>
          {subtitle && <p className="text-xs text-neutral-500 truncate">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...rest} />;
}
