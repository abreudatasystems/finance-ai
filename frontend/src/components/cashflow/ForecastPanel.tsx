'use client';

/**
 * Previsão de tesouraria.
 *
 * The question this answers is the one a small company actually asks: *"no dia
 * 28 tenho de pagar salários — vou ter dinheiro?"*. Everything needed was
 * already in the product; nothing put it on one timeline.
 *
 * The chart is a single series over time, so it is a line over an area in one
 * hue, with the zero baseline drawn, the low point directly labelled, and a
 * tooltip per week. No second axis, no colour carrying meaning on its own: the
 * weeks that go negative are marked in the table with a word as well as a tone.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  TrendingDown, Loader2, AlertCircle, Check, ChevronDown, RefreshCw, Wallet,
  FileText, Repeat, Landmark, CalendarClock,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { CashForecast, ForecastMovement, ForecastWeek } from './types';
import { fetchForecast } from './api';

const HORIZONS = [
  { weeks: 4, label: '4 semanas' },
  { weeks: 13, label: '13 semanas' },
  { weeks: 26, label: '6 meses' },
];

const ORIGIN_ICON: Record<ForecastMovement['origin'], React.ReactNode> = {
  'documento': <FileText className="w-3 h-3" />,
  'recorrência': <Repeat className="w-3 h-3" />,
  'IVA': <Landmark className="w-3 h-3" />,
};

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });

/**
 * The projected balance across the weeks. One series, one hue; the reader's job
 * is to spot the dip, so the dip is what gets the label.
 */
const BalanceChart: React.FC<{
  weeks: ForecastWeek[];
  opening: number;
  formatMoney: (n: number) => string;
}> = ({ weeks, opening, formatMoney }) => {
  const [hover, setHover] = useState<number | null>(null);

  const points = useMemo(
    () => [{ label: 'hoje', value: opening },
           ...weeks.map((w) => ({ label: shortDate(w.fim), value: w.saldo_final }))],
    [weeks, opening],
  );

  const width = 720;
  const height = 150;
  const padding = { top: 16, right: 12, bottom: 22, left: 12 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const values = points.map((p) => p.value);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;

  const x = (i: number) => padding.left + (i / Math.max(points.length - 1, 1)) * innerW;
  const y = (v: number) => padding.top + (1 - (v - min) / span) * innerH;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L ${x(points.length - 1).toFixed(1)} ${y(0).toFixed(1)} L ${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`;

  const lowIndex = values.indexOf(Math.min(...values));
  const goesNegative = min < 0;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[150px]" role="img"
           aria-label="Saldo previsto ao longo das próximas semanas">
        {/* zero baseline — recessive, but always drawn: it is the line that matters */}
        <line x1={padding.left} x2={width - padding.right} y1={y(0)} y2={y(0)}
              stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3" />
        <text x={padding.left} y={y(0) - 4} className="fill-slate-400" style={{ fontSize: 9 }}>0 €</text>

        <path d={area} fill="#6366f1" fillOpacity="0.10" />
        <path d={line} fill="none" stroke="#6366f1" strokeWidth="2"
              strokeLinejoin="round" strokeLinecap="round" />

        {/* the low point, labelled directly rather than left to the legend */}
        <circle cx={x(lowIndex)} cy={y(values[lowIndex])} r="4"
                fill={goesNegative ? '#e11d48' : '#6366f1'} stroke="#fff" strokeWidth="2" />
        <text x={Math.min(x(lowIndex), width - 90)} y={Math.max(y(values[lowIndex]) - 10, 12)}
              className={goesNegative ? 'fill-rose-600' : 'fill-slate-500'}
              style={{ fontSize: 10, fontWeight: 700 }}>
          mínimo {formatMoney(values[lowIndex])}
        </text>

        {points.map((point, index) => (
          <g key={index}>
            <rect x={x(index) - innerW / points.length / 2} y={0}
                  width={innerW / points.length} height={height}
                  fill="transparent" onMouseEnter={() => setHover(index)}
                  onMouseLeave={() => setHover(null)} />
            {hover === index && (
              <circle cx={x(index)} cy={y(point.value)} r="4" fill="#6366f1" stroke="#fff" strokeWidth="2" />
            )}
          </g>
        ))}

        {points.map((point, index) =>
          index % Math.ceil(points.length / 7) === 0 || index === points.length - 1 ? (
            <text key={index} x={x(index)} y={height - 6} textAnchor="middle"
                  className="fill-slate-400" style={{ fontSize: 9 }}>
              {point.label}
            </text>
          ) : null,
        )}
      </svg>

      {hover != null && (
        <div className="absolute top-0 right-0 px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-[10px] font-mono shadow-lg pointer-events-none">
          {points[hover].label}: {formatMoney(points[hover].value)}
        </div>
      )}
    </div>
  );
};

export const ForecastPanel: React.FC = () => {
  const { formatMoney } = useApp();
  const [weeks, setWeeks] = useState(13);
  const [data, setData] = useState<CashForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setData(await fetchForecast(weeks));
    setLoading(false);
  }, [weeks]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> A projetar as próximas semanas…
      </div>
    );
  }
  if (!data) return null;

  const tight = data.resumo.aperta;
  const empty = data.resumo.sem_dados;

  return (
    <div className="space-y-4 text-xs">
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-indigo-600" />
            <h3 className="font-bold text-sm text-slate-900">Previsão de tesouraria</h3>
            <span className="text-[10px] text-slate-400 font-mono">até {shortDate(data.horizonte)}</span>
          </div>
          <div className="flex items-center gap-1">
            {HORIZONS.map((h) => (
              <button
                key={h.weeks} onClick={() => setWeeks(h.weeks)}
                className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] ${
                  weeks === h.weeks ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {h.label}
              </button>
            ))}
            <button onClick={load} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* The sentence first: it is the whole answer. On an empty company the
            honest answer is that there is not one yet — a flat line at zero
            must never be dressed as good news. */}
        <div className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl border ${
          empty ? 'bg-slate-50 border-slate-200 text-slate-700'
            : tight ? 'bg-rose-50 border-rose-200 text-rose-900'
            : 'bg-emerald-50 border-emerald-100 text-emerald-900'
        }`}>
          {empty ? <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
            : tight ? <TrendingDown className="w-4 h-4 shrink-0 mt-0.5" />
            : <Check className="w-4 h-4 shrink-0 mt-0.5" />}
          <p className="font-semibold">{data.resumo.mensagem}</p>
        </div>

        {!empty && (
          <BalanceChart weeks={data.semanas} opening={data.saldo_inicial} formatMoney={formatMoney} />
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
            <p className="text-[9px] uppercase font-bold text-slate-500 flex items-center gap-1">
              <Wallet className="w-3 h-3" /> Saldo hoje
            </p>
            <p className="font-bold text-slate-900 text-sm mt-0.5">{formatMoney(data.saldo_inicial)}</p>
          </div>
          <div className="p-3 rounded-xl border border-emerald-100 bg-emerald-50/40">
            <p className="text-[9px] uppercase font-bold text-emerald-600">Entradas previstas</p>
            <p className="font-bold text-emerald-700 text-sm mt-0.5">{formatMoney(data.total_entradas)}</p>
          </div>
          <div className="p-3 rounded-xl border border-rose-100 bg-rose-50/40">
            <p className="text-[9px] uppercase font-bold text-rose-600">Saídas previstas</p>
            <p className="font-bold text-rose-700 text-sm mt-0.5">{formatMoney(data.total_saidas)}</p>
          </div>
          <div className="p-3 rounded-xl border border-slate-200">
            <p className="text-[9px] uppercase font-bold text-slate-500">Saldo no fim</p>
            <p className={`font-bold text-sm mt-0.5 ${data.saldo_final < 0 ? 'text-rose-700' : 'text-slate-900'}`}>
              {formatMoney(data.saldo_final)}
            </p>
          </div>
        </div>

        {data.resumo.saidas_previstas_sem_documento > 0 && (
          <p className="text-[10px] text-slate-500">
            Inclui {formatMoney(data.resumo.saidas_previstas_sem_documento)} de custos recorrentes
            ainda por lançar (renda, salários, avenças) — previstos, não documentados.
          </p>
        )}
      </div>

      {/* ----------------------------------------------------- week by week */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
          Semana a semana
        </div>
        <div className="divide-y divide-slate-100 max-h-[26rem] overflow-y-auto">
          {data.semanas.map((week) => {
            const isOpen = open === week.semana;
            const negative = week.saldo_final < 0;
            const quiet = week.movimentos.length === 0;
            return (
              <div key={week.semana}>
                <button
                  onClick={() => setOpen(isOpen ? null : week.semana)}
                  disabled={quiet}
                  className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50 text-left disabled:hover:bg-transparent"
                >
                  <span className="text-[10px] font-mono text-slate-400 w-24 shrink-0">
                    {shortDate(week.inicio)} – {shortDate(week.fim)}
                  </span>
                  <span className="flex-1 min-w-0 text-slate-600">
                    {quiet ? (
                      <span className="text-slate-300">sem movimentos</span>
                    ) : (
                      <>
                        <span className="text-emerald-700 font-semibold">+{formatMoney(week.entradas)}</span>
                        {' '}
                        <span className="text-rose-700 font-semibold">−{formatMoney(week.saidas)}</span>
                        <span className="text-slate-400"> · {week.movimentos.length} movimento(s)</span>
                      </>
                    )}
                  </span>
                  <span className={`font-mono font-bold shrink-0 ${negative ? 'text-rose-700' : 'text-slate-900'}`}>
                    {formatMoney(week.saldo_final)}
                  </span>
                  {negative && (
                    <span className="text-[9px] font-bold uppercase text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded shrink-0">
                      a descoberto
                    </span>
                  )}
                  {!quiet && (
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-300 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  )}
                </button>

                {isOpen && (
                  <ul className="px-4 pb-3 space-y-1 bg-slate-50/60">
                    {week.movimentos.map((movement, index) => (
                      <li key={index} className="flex items-center gap-2 text-[11px]">
                        <span className="text-slate-300 shrink-0">{ORIGIN_ICON[movement.origin]}</span>
                        <span className="text-slate-400 font-mono w-14 shrink-0">{shortDate(movement.date)}</span>
                        <span className="flex-1 min-w-0 truncate text-slate-700">{movement.label}</span>
                        {movement.certainty !== 'confirmado' && (
                          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border shrink-0 ${
                            movement.certainty === 'vencido'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-slate-100 text-slate-500 border-slate-200'
                          }`}>
                            {movement.certainty}
                          </span>
                        )}
                        <span className={`font-mono font-bold shrink-0 ${
                          movement.kind === 'in' ? 'text-emerald-700' : 'text-rose-700'
                        }`}>
                          {movement.kind === 'in' ? '+' : '−'}{formatMoney(movement.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[10px] text-slate-400 flex items-start gap-1.5">
        <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
        A previsão parte do saldo real das contas e junta o que está por receber e por pagar
        nas datas de vencimento, os custos recorrentes ainda não lançados e o IVA na data
        legal de pagamento. Uma fatura já vencida entra hoje, porque é o mais cedo que pode entrar.
      </p>
    </div>
  );
};
