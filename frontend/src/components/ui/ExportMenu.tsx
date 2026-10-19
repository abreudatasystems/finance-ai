'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/services/api';
import { Button } from './Button';
import { cn } from './cn';

export type ExportColumnType = 'text' | 'money' | 'number' | 'date' | 'percent';
export interface ExportColumn { key: string; label: string; type?: ExportColumnType }
export type ExportRow = Record<string, string | number | null | undefined>;

export interface ExportTable {
  title: string;
  subtitle?: string;
  columns: ExportColumn[];
  rows: ExportRow[];
  /** Linha final com totais (mesmas chaves das colunas). */
  totals?: ExportRow;
}

/** Pede ao servidor o ficheiro e descarrega-o. Devolve uma mensagem de erro, ou null. */
export async function downloadTable(table: ExportTable, format: 'xlsx' | 'pdf'): Promise<string | null> {
  try {
    const res = await apiFetch('/reports/export/table', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...table, format }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return typeof body?.detail === 'string' ? body.detail : 'Não foi possível gerar o ficheiro.';
    }
    const blob = await res.blob();
    const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1]
      ?? `exportacao.${format}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    return null;
  } catch {
    return 'Erro de comunicação ao exportar.';
  }
}

/**
 * Botão "Exportar" com Excel e PDF. Exporta exactamente o que está no ecrã:
 * `build` é chamado no momento do clique, com os filtros que estiverem activos.
 */
export function ExportMenu({ build, disabled, size = 'md', className }: {
  build: () => ExportTable;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'xlsx' | 'pdf' | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const run = async (format: 'xlsx' | 'pdf') => {
    setOpen(false);
    setBusy(format);
    const error = await downloadTable(build(), format);
    setBusy(null);
    if (error) toast.error(error);
    else toast.success(format === 'pdf' ? 'PDF descarregado.' : 'Excel descarregado.');
  };

  const item = 'flex w-full items-center gap-2 px-3 py-2 text-xs text-neutral-800 hover:bg-neutral-50 text-left cursor-pointer [&_svg]:size-4';

  return (
    <div ref={ref} className={cn('relative inline-block', className)}>
      <Button
        variant="secondary"
        size={size}
        icon={<Download />}
        loading={busy !== null}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Exportar
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-md border border-neutral-200 bg-white shadow-lg">
          <button type="button" role="menuitem" className={item} onClick={() => run('xlsx')}>
            <FileSpreadsheet className="text-emerald-600" aria-hidden="true" /> Excel (.xlsx)
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => run('pdf')}>
            <FileText className="text-rose-600" aria-hidden="true" /> PDF
          </button>
        </div>
      )}
    </div>
  );
}
