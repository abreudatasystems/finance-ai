'use client';

import React, { useId } from 'react';
import { cn } from './cn';

/** Classes do campo, para casos que não cabem nos componentes abaixo. */
export const inputClass =
  'w-full h-8 px-2.5 rounded-md border border-neutral-200 bg-white text-13 text-neutral-900 shadow-xs ' +
  'placeholder:text-neutral-400 transition-colors hover:border-neutral-300 ' +
  'focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 ' +
  'disabled:bg-neutral-50 disabled:text-neutral-500 aria-[invalid=true]:border-rose-400';

interface FieldProps {
  label: React.ReactNode;
  /** Texto de ajuda por baixo do campo. */
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  /** Recebe o id que liga a etiqueta ao campo. */
  children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => React.ReactNode;
}

/**
 * Etiqueta + campo + ajuda/erro, ligados entre si. Uso:
 *   <Field label="NIF">{(p) => <Input {...p} value={nif} onChange={...} />}</Field>
 */
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn('space-y-1', className)}>
      <label htmlFor={id} className="block text-xs font-medium text-neutral-700">
        {label}
        {required && <span className="text-rose-500 ml-0.5" aria-hidden="true">*</span>}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-rose-600">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-neutral-500">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(inputClass, className)} {...rest} />;
  },
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...rest }, ref) {
    return <select ref={ref} className={cn(inputClass, 'pr-8 cursor-pointer', className)} {...rest} />;
  },
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cn(inputClass, 'h-auto min-h-20 py-2', className)} {...rest} />;
  },
);
