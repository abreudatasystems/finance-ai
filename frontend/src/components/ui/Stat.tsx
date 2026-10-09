import React from 'react';
import { cn } from './cn';

export type StatTone = 'neutral' | 'positive' | 'negative' | 'warning';

const VALUE_TONE: Record<StatTone, string> = {
  neutral: 'text-neutral-900',
  positive: 'text-emerald-700',
  negative: 'text-rose-600',
  warning: 'text-amber-600',
};

const DOT_TONE: Record<StatTone, string> = {
  neutral: 'bg-neutral-300',
  positive: 'bg-emerald-500',
  negative: 'bg-rose-500',
  warning: 'bg-amber-500',
};

interface StatProps {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Linha pequena por baixo: contagem, variação, link. */
  hint?: React.ReactNode;
  /** A cor vai só para o valor e para o ponto — nunca para a borda do cartão. */
  tone?: StatTone;
  icon?: React.ReactNode;
  className?: string;
}

/** Cartão de número (KPI). Igual em todas as páginas. */
export function Stat({ label, value, hint, tone = 'neutral', icon, className }: StatProps) {
  return (
    <div
      className={cn(
        'bg-white rounded-xl border border-neutral-200 shadow-[0_1px_2px_rgba(24,24,27,0.04)] px-3.5 py-3 min-w-0',
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-xs text-neutral-500 font-medium min-w-0">
        {icon ? (
          <span className="text-neutral-400 [&_svg]:size-3.5 shrink-0">{icon}</span>
        ) : (
          <span className={cn('size-1.5 rounded-full shrink-0', DOT_TONE[tone])} aria-hidden="true" />
        )}
        <span className="truncate">{label}</span>
      </div>
      <p className={cn('mt-1 text-lg font-semibold tracking-tight tabular-nums truncate', VALUE_TONE[tone])}>{value}</p>
      {hint && <div className="mt-0.5 text-2xs text-neutral-500 truncate">{hint}</div>}
    </div>
  );
}
