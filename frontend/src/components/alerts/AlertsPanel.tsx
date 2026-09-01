'use client';

/**
 * O que precisa de atenção.
 *
 * Everything shown here is computed on read, so there is nothing to dismiss:
 * pay the invoice and the warning is gone next time the page loads. Each
 * alert names an amount and a place to go — a warning with neither is
 * decoration, and people learn to ignore decoration.
 */

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, AlertCircle, Info, Check, Loader2, ArrowRight, RefreshCw, ChevronDown,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Alert, AlertSeverity, AlertsPayload } from './types';
import { fetchAlerts } from './api';

const TONE: Record<AlertSeverity, { box: string; icon: React.ReactNode; label: string }> = {
  danger: {
    box: 'border-rose-200 bg-rose-50/60',
    icon: <AlertCircle className="w-4 h-4 text-rose-600" />,
    label: 'Crítico',
  },
  warning: {
    box: 'border-amber-200 bg-amber-50/60',
    icon: <AlertTriangle className="w-4 h-4 text-amber-600" />,
    label: 'Atenção',
  },
  info: {
    box: 'border-slate-200 bg-slate-50',
    icon: <Info className="w-4 h-4 text-slate-500" />,
    label: 'Informação',
  },
};

interface Props {
  /** Show only the worst few — for the dashboard. */
  limit?: number;
}

export const AlertsPanel: React.FC<Props> = ({ limit }) => {
  const { formatMoney } = useApp();
  const [data, setData] = useState<AlertsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setData(await fetchAlerts());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> A verificar o que precisa de atenção…
      </div>
    );
  }

  if (!data) return null;

  const alerts = limit ? data.alertas.slice(0, limit) : data.alertas;
  const hidden = data.alertas.length - alerts.length;

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs p-5 space-y-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-indigo-600" />
          <h3 className="font-bold text-sm text-slate-900">A precisar de atenção</h3>
          {!data.resumo.tudo_em_dia && (
            <span className="text-[10px] text-slate-400 font-mono">
              {data.resumo.criticos > 0 && `${data.resumo.criticos} crítico(s) · `}
              {data.resumo.avisos} aviso(s)
            </span>
          )}
        </div>
        <button onClick={load} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" title="Verificar de novo">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {data.resumo.tudo_em_dia ? (
        <div className="py-6 text-center space-y-1">
          <Check className="w-7 h-7 text-emerald-500 mx-auto" />
          <p className="text-slate-700 font-semibold">Está tudo em dia.</p>
          <p className="text-[11px] text-slate-400">
            Nada vencido, nada por aprovar, nada por conciliar.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert: Alert) => {
            const tone = TONE[alert.severity];
            const open = expanded === alert.kind;
            return (
              <div key={alert.kind} className={`rounded-xl border p-3 ${tone.box}`}>
                <div className="flex items-start gap-2.5">
                  <span className="shrink-0 mt-0.5">{tone.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900">{alert.title}</p>
                    <p className="text-[11px] text-slate-600 mt-0.5">{alert.description}</p>

                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      {alert.action && (
                        <Link
                          href={alert.action}
                          className="text-[11px] font-bold text-indigo-700 hover:underline flex items-center gap-1"
                        >
                          {alert.action_label || 'Resolver'} <ArrowRight className="w-3 h-3" />
                        </Link>
                      )}
                      {alert.items.length > 0 && (
                        <button
                          onClick={() => setExpanded(open ? null : alert.kind)}
                          className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1"
                        >
                          {open ? 'Fechar' : 'Ver quais'}
                          <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
                        </button>
                      )}
                    </div>

                    {open && (
                      <ul className="mt-2 space-y-1 border-t border-slate-200/70 pt-2">
                        {alert.items.map((item, index) => (
                          <li key={index} className="text-[11px] text-slate-700 flex justify-between gap-2">
                            <span className="truncate">
                              {String(item.description || item.name || '—')}
                              {item.entity_name ? ` · ${item.entity_name}` : ''}
                              {item.due_date ? ` · vence ${item.due_date}` : ''}
                              {item.periodos ? ` · ${item.periodos} período(s)` : ''}
                            </span>
                            <span className="font-mono font-bold shrink-0">
                              {formatMoney(Number(item.outstanding ?? item.amount ?? 0))}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {alert.amount > 0 && (
                    <span className="font-bold font-mono text-slate-900 shrink-0">
                      {formatMoney(alert.amount)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {hidden > 0 && (
            <p className="text-[11px] text-slate-400 text-center">
              e mais {hidden} — veja a lista completa no painel.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
