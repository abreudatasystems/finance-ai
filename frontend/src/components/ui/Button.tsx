'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from './cn';

/**
 * O único botão da aplicação.
 *
 * - primary:   a acção principal da página ou do formulário (preto).
 * - accent:    confirmar dinheiro — pagar, receber, aprovar (verde).
 * - secondary: acções de apoio (branco com borda).
 * - danger:    apagar, rejeitar, anular.
 * - ghost:     acções discretas dentro de linhas e cartões.
 */
export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-black text-white border border-black hover:bg-neutral-800',
  accent: 'bg-emerald-600 text-white border border-emerald-600 hover:bg-emerald-700',
  secondary: 'bg-white text-neutral-800 border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300',
  danger: 'bg-rose-600 text-white border border-rose-600 hover:bg-rose-700',
  ghost: 'bg-transparent text-neutral-600 border border-transparent hover:bg-neutral-100 hover:text-neutral-900',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Mostra o indicador e bloqueia o botão enquanto a acção corre. */
  loading?: boolean;
  /** Ícone à esquerda do texto (um ícone lucide; o tamanho é dado aqui). */
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-semibold whitespace-nowrap transition-colors cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1',
        'disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:size-4 [&_svg]:shrink-0',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
});

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Obrigatório: um botão só com ícone não diz a um leitor de ecrã o que faz. */
  label: string;
  variant?: 'ghost' | 'danger' | 'secondary';
  size?: ButtonSize;
  children: React.ReactNode;
}

const ICON_VARIANTS = {
  ghost: 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100',
  danger: 'text-neutral-400 hover:text-rose-600 hover:bg-rose-50',
  secondary: 'text-neutral-700 bg-white border border-neutral-200 hover:bg-neutral-50',
};

/** Botão só com ícone. O `label` aparece como dica e é lido pelos leitores de ecrã. */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = 'ghost', size = 'sm', className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center rounded-lg transition-colors cursor-pointer shrink-0',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
        'disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:size-4',
        size === 'sm' ? 'size-8' : 'size-9',
        ICON_VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
