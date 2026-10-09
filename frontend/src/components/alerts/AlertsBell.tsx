'use client';

/**
 * Sino dos alertas na barra de topo: mostra quantos alertas há e abre-os num
 * painel por cima da página, sem sair do sítio onde se está. A página
 * /alerts continua a existir para a vista completa.
 */

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, Bell } from 'lucide-react';
import { AlertsPanel } from './AlertsPanel';
import { fetchAlerts } from './api';
import type { AlertsPayload } from './types';

export function AlertsBell() {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<AlertsPayload['resumo'] | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Recontar ao mudar de página: resolver um alerta noutra página muda o número.
  useEffect(() => {
    let cancelled = false;
    fetchAlerts().then((d) => { if (!cancelled) setSummary(d?.resumo ?? null); });
    return () => { cancelled = true; };
  }, [pathname]);

  // Fechar ao clicar fora ou com Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const count = summary ? summary.criticos + summary.avisos : 0;
  const critical = (summary?.criticos ?? 0) > 0;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={count > 0 ? `Alertas: ${count} por tratar` : 'Alertas'}
        title="Alertas"
        className={`relative size-8 flex items-center justify-center rounded-md transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 ${
          open ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100'
        }`}
      >
        <Bell className="size-4" />
        {count > 0 && (
          <span
            className={`absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full text-[10px] leading-4 font-semibold text-white text-center tabular-nums ${
              critical ? 'bg-rose-600' : 'bg-amber-500'
            }`}
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Alertas"
          className="absolute top-full right-0 mt-1.5 w-[420px] max-w-[calc(100vw-1.5rem)] max-h-[75vh] overflow-y-auto rounded-xl border border-neutral-200 shadow-xl z-50 bg-white animate-in fade-in zoom-in-95 duration-150"
          // Um clique num "Resolver" leva a outra página: o painel fecha-se.
          onClick={(e) => { if ((e.target as HTMLElement).closest('a')) setOpen(false); }}
        >
          <AlertsPanel limit={5} />
          <Link
            href="/alerts"
            className="flex items-center justify-center gap-1 h-9 text-xs font-medium text-emerald-700 hover:bg-neutral-50 border-t border-neutral-100"
          >
            Abrir a página de alertas <ArrowRight className="size-3" aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  );
}
