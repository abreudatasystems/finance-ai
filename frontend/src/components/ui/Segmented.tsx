'use client';

import React from 'react';
import { cn } from './cn';

interface SegmentedProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: React.ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  /** Diz a um leitor de ecrã o que se está a escolher. */
  'aria-label': string;
  className?: string;
}

/** Escolha entre poucas opções (separadores, períodos, filtros). Igual em todas as páginas. */
export function Segmented<T extends string>({ options, value, onChange, className, ...rest }: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={rest['aria-label']}
      className={cn('inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-neutral-100 border border-neutral-200/70', className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'h-7 px-2.5 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60',
              active ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
