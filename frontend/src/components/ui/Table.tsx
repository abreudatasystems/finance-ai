import React from 'react';
import { cn } from './cn';

/**
 * Tabela padrão. Dinheiro e números vão em <Td numeric>: alinhados à direita e
 * com algarismos de largura fixa, para as colunas se lerem de cima a baixo.
 * Envolva-a num <Card className="overflow-hidden">.
 */
export function Table({ className, ...rest }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full text-left border-collapse text-xs', className)} {...rest} />
    </div>
  );
}

export function THead({ className, ...rest }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('bg-neutral-50/80 border-b border-neutral-200', className)} {...rest} />;
}

export function TBody({ className, ...rest }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-neutral-100 text-neutral-800', className)} {...rest} />;
}

interface CellProps {
  /** Números e dinheiro: à direita, algarismos alinhados. */
  numeric?: boolean;
  align?: 'left' | 'center' | 'right';
}

export function Th({ numeric, align, className, ...rest }: React.ThHTMLAttributes<HTMLTableCellElement> & CellProps) {
  return (
    <th
      scope="col"
      className={cn(
        'h-8 px-3 text-2xs font-medium text-neutral-500 whitespace-nowrap',
        (numeric || align === 'right') && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
      {...rest}
    />
  );
}

export function Tr({ className, onClick, ...rest }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      onClick={onClick}
      className={cn('transition-colors hover:bg-neutral-50/80', onClick && 'cursor-pointer', className)}
      {...rest}
    />
  );
}

export function Td({ numeric, align, className, ...rest }: React.TdHTMLAttributes<HTMLTableCellElement> & CellProps) {
  return (
    <td
      className={cn(
        'px-3 py-2 h-10 align-middle',
        (numeric || align === 'right') && 'text-right tabular-nums whitespace-nowrap',
        align === 'center' && 'text-center',
        className,
      )}
      {...rest}
    />
  );
}

/** Linha que ocupa a tabela inteira — para "sem resultados" ou "a carregar". */
export function TableMessage({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-2">
        {children}
      </td>
    </tr>
  );
}
