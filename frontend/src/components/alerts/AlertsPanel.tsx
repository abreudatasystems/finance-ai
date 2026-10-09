'use client';

/**
 * O que precisa de atenção.
 *
 * Everything shown here is computed on read, so there is nothing to dismiss:
 * pay the invoice and the warning is gone next time the page loads. Each
 * alert names an amount and a place to go — a warning with neither is
 * decoration, and people learn to ignore decoration.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, AlertCircle, Info, Check, ArrowRight, RefreshCw, ChevronDown,
  Circle,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { formatDate } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { Button, Card, ErrorState, IconButton, LoadingState } from '@/components/ui';
import { Alert, AlertSeverity, AlertsPayload } from './types';
import { fetchAlerts } from './api';

const TONE: Record<AlertSeverity, { box: string; icon: React.ReactNode; label: string }> = {
  danger: {
    box: 'border-neutral-200 bg-white',
    icon: <AlertCircle className="size-4 text-rose-600" />,
    label: 'Crítico',
  },
  warning: {
    box: 'border-neutral-200 bg-white',
    icon: <AlertTriangle className="size-4 text-amber-600" />,
    label: 'Atenção',
  },
  info: {
    box: 'border-neutral-200 bg-neutral-50',
    icon: <Info className="size-4 text-sky-600" />,
    label: 'Informação',
  },
};

interface Props {
  /** Show only the worst few — for the dashboard. */
  limit?: number;
}

export const AlertsPanel: React.FC<Props> = ({ limit }) => {
  const { formatMoney } = useApp();
  const { data, loading, reload: load } = useLoad<AlertsPayload | null>(fetchAlerts, []);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (loading) {
    return (
      <Card>
        <LoadingState label="A verificar o que precisa de atenção…" className="py-5" />
      </Card>
    );
  }

  // fetchAlerts devolve null quando o pedido falha: dizer que falhou, em vez
  // de esconder o painel e deixar parecer que não há nada a tratar.
  if (!data) {
    return (
      <Card>
        <ErrorState
          message="Não foi possível verificar os alertas."
          className="py-5"
          action={<Button variant="secondary" size="sm" onClick={load} icon={<RefreshCw />}>Tentar novamente</Button>}
        />
      </Card>
    );
  }

  const alerts = limit ? data.alertas.slice(0, limit) : data.alertas;
  const hidden = data.alertas.length - alerts.length;

  return (
    <Card className="p-4 space-y-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-amber-600" aria-hidden="true" />
          <h2 className="font-semibold text-13 text-neutral-900">A precisar de atenção</h2>
          {!data.resumo.tudo_em_dia && (
            <span className="text-2xs text-neutral-500 tabular-nums">
              {data.resumo.criticos > 0 && `${data.resumo.criticos} crítico(s) · `}
              {data.resumo.avisos} aviso(s)
            </span>
          )}
        </div>
        <IconButton label="Verificar de novo" onClick={load}>
          <RefreshCw />
        </IconButton>
      </div>

      {data.resumo.sem_dados ? (
        /* Nothing was checked, which is not the same as nothing being wrong. */
        <div className="py-6 text-center space-y-1">
          <Circle className="size-5 text-neutral-300 mx-auto" aria-hidden="true" />
          <p className="text-neutral-700 font-medium">Ainda não há nada para verificar.</p>
          <p className="text-2xs text-neutral-500">
            Registe o primeiro documento e os avisos começam a aparecer aqui.
          </p>
        </div>
      ) : data.resumo.tudo_em_dia ? (
        <div className="py-6 text-center space-y-1">
          <Check className="size-5 text-emerald-500 mx-auto" aria-hidden="true" />
          <p className="text-neutral-700 font-medium">Está tudo em dia.</p>
          <p className="text-2xs text-neutral-500">
            Nada vencido, nada por aprovar, nada por conciliar.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert: Alert) => {
            const tone = TONE[alert.severity];
            const open = expanded === alert.kind;
            return (
              <div key={alert.kind} className={`rounded-lg border px-3 py-2.5 ${tone.box}`}>
                <div className="flex items-start gap-2.5">
                  <span className="shrink-0 mt-0.5">{tone.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-neutral-900">{alert.title}</p>
                    <p className="text-2xs text-neutral-600 mt-0.5">{alert.description}</p>

                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      {alert.action && (
                        <Link
                          href={alert.action}
                          className="text-xs font-medium text-emerald-700 hover:underline flex items-center gap-1"
                        >
                          {alert.action_label || 'Resolver'} <ArrowRight className="size-3" />
                        </Link>
                      )}
                      {alert.items.length > 0 && (
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() => setExpanded(open ? null : alert.kind)}
                          className="text-xs font-medium text-neutral-500 hover:text-neutral-900 flex items-center gap-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                        >
                          {open ? 'Fechar' : 'Ver quais'}
                          <ChevronDown className={`size-3 transition-transform ${open ? 'rotate-180' : ''}`} />
                        </button>
                      )}
                    </div>

                    {open && (
                      <ul className="mt-2 space-y-1 border-t border-neutral-100 pt-2">
                        {alert.items.map((item, index) => (
                          <li key={index} className="text-2xs text-neutral-700 flex justify-between gap-2">
                            <span className="truncate">
                              {String(item.description || item.name || '—')}
                              {item.entity_name ? ` · ${item.entity_name}` : ''}
                              {item.due_date ? ` · vence ${formatDate(String(item.due_date))}` : ''}
                              {item.periodos ? ` · ${item.periodos} período(s)` : ''}
                            </span>
                            <span className="tabular-nums font-medium shrink-0">
                              {formatMoney(Number(item.outstanding ?? item.amount ?? 0))}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {alert.amount > 0 && (
                    <span className="font-semibold tabular-nums text-neutral-900 shrink-0">
                      {formatMoney(alert.amount)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {hidden > 0 && (
            <p className="text-2xs text-neutral-500 text-center">
              e mais {hidden} —{' '}
              <Link href="/alerts" className="font-medium text-emerald-700 hover:underline">ver todos os alertas</Link>
            </p>
          )}
        </div>
      )}
    </Card>
  );
};
