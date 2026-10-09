import React from 'react';
import { cn } from './cn';

/** O cartão branco em que vive quase todo o conteúdo. */
export function Card({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('bg-white rounded-xl border border-neutral-200 shadow-[0_1px_2px_rgba(24,24,27,0.04)]', className)}
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
    <div className={cn('flex items-center justify-between gap-3 px-4 py-3 border-b border-neutral-100', className)}>
      <div className="flex items-center gap-2.5 min-w-0">
        {icon && (
          <span className="size-7 rounded-md bg-neutral-100 text-neutral-600 flex items-center justify-center shrink-0 [&_svg]:size-3.5">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-13 font-semibold text-neutral-900 truncate">{title}</h2>
          {subtitle && <p className="text-xs text-neutral-500 truncate">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...rest} />;
}
