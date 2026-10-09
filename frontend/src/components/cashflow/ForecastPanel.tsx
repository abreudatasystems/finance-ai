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

import React, { useMemo, useState } from 'react';
import {
  TrendingDown, AlertCircle, Check, ChevronDown, RefreshCw, Wallet,
  FileText, Repeat, Landmark, CalendarClock,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { CashForecast, ForecastMovement, ForecastWeek } from './types';
import { fetchForecast } from './api';
import {
  Badge, Button, IconButton, Card, CardHeader, CardBody, LoadingState, ErrorState, Segmented, Stat, cn,
} from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useLoad } from '@/lib/use-load';

const HORIZONS = [
  { weeks: 4, label: '4 semanas' },
  { weeks: 13, label: '13 semanas' },
  { weeks: 26, label: '6 meses' },
];

const ORIGIN_ICON: Record<ForecastMovement['origin'], React.ReactNode> = {
  'documento': <FileText className="size-3" aria-hidden="true" />,
  'recorrência': <Repeat className="size-3" aria-hidden="true" />,
  'IVA': <Landmark className="size-3" aria-hidden="true" />,
};

/** Só para o eixo do gráfico: "08 out" cabe por baixo de um ponto, dd/mm/aaaa não. */
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
              stroke="#d4d4d4" strokeWidth="1" strokeDasharray="3 3" />
        <text x={padding.left} y={y(0) - 4} className="fill-neutral-500" style={{ fontSize: 11 }}>0 €</text>

        <path d={area} fill="#262626" fillOpacity="0.06" />
        <path d={line} fill="none" stroke="#262626" strokeWidth="2"
              strokeLinejoin="round" strokeLinecap="round" />

        {/* the low point, labelled directly rather than left to the legend */}
        <circle cx={x(lowIndex)} cy={y(values[lowIndex])} r="4"
                fill={goesNegative ? '#e11d48' : '#262626'} stroke="#fff" strokeWidth="2" />
        <text x={Math.min(x(lowIndex), width - 90)} y={Math.max(y(values[lowIndex]) - 10, 12)}
              className={goesNegative ? 'fill-rose-600' : 'fill-neutral-600'}
              style={{ fontSize: 11, fontWeight: 600 }}>
          mínimo {formatMoney(values[lowIndex])}
        </text>

        {points.map((point, index) => (
          <g key={index}>
            <rect x={x(index) - innerW / points.length / 2} y={0}
                  width={innerW / points.length} height={height}
                  fill="transparent" onMouseEnter={() => setHover(index)}
                  onMouseLeave={() => setHover(null)} />
            {hover === index && (
              <circle cx={x(index)} cy={y(point.value)} r="4" fill="#262626" stroke="#fff" strokeWidth="2" />
            )}
          </g>
        ))}

        {points.map((point, index) =>
          index % Math.ceil(points.length / 7) === 0 || index === points.length - 1 ? (
            <text key={index} x={x(index)} y={height - 6} textAnchor="middle"
                  className="fill-neutral-500" style={{ fontSize: 11 }}>
              {point.label}
            </text>
          ) : null,
        )}
      </svg>

      {hover != null && (
        <div className="absolute top-0 right-0 px-2.5 py-1.5 rounded-md bg-neutral-900 text-white text-2xs font-mono tabular-nums shadow-lg pointer-events-none">
          {points[hover].label}: {formatMoney(points[hover].value)}
        </div>
      )}
    </div>
  );
};

export const ForecastPanel: React.FC = () => {
  const { formatMoney } = useApp();
  const [weeks, setWeeks] = useState(13);
  // Só a resposta mais recente conta (o useLoad ignora as antigas): trocar
  // depressa o horizonte deixava a projecção antiga por baixo do número de
  // semanas novo.
  const { data, loading, reload: load } = useLoad<CashForecast | null>(() => fetchForecast(weeks), [weeks]);
  const [open, setOpen] = useState<number | null>(null);

  if (loading) {
    return (
      <Card>
        <LoadingState label="A projetar as próximas semanas…" />
      </Card>
    );
  }
  if (!data) {
    return (
      <Card>
        <ErrorState
          message="Não foi possível calcular a previsão de tesouraria."
          action={<Button variant="secondary" size="sm" icon={<RefreshCw />} onClick={load}>Tentar novamente</Button>}
        />
      </Card>
    );
  }

  const tight = data.resumo.aperta;
  const empty = data.resumo.sem_dados;

  return (
    <div className="space-y-4 text-xs">
      <Card>
        <CardHeader
          icon={<CalendarClock />}
          title="Previsão de tesouraria"
          subtitle={`até ${formatDate(data.horizonte)}`}
          className="flex-wrap"
          actions={
            <>
              <Segmented
                aria-label="Horizonte da previsão"
                value={String(weeks)}
                onChange={(v) => setWeeks(Number(v))}
                options={HORIZONS.map((h) => ({ value: String(h.weeks), label: h.label }))}
              />
              <IconButton label="Actualizar projecção" onClick={load}>
                <RefreshCw />
              </IconButton>
            </>
          }
        />

        <CardBody className="space-y-4">
          {/* The sentence first: it is the whole answer. On an empty company the
              honest answer is that there is not one yet — a flat line at zero
              must never be dressed as good news. */}
          <div className={cn(
            'flex items-start gap-2 px-3 py-2 rounded-lg border',
            empty ? 'bg-neutral-50 border-neutral-200 text-neutral-700'
              : tight ? 'bg-rose-50 border-rose-200 text-rose-900'
              : 'bg-emerald-50 border-emerald-100 text-emerald-900',
          )}>
            {empty ? <AlertCircle className="size-4 shrink-0 mt-0.5 text-neutral-400" aria-hidden="true" />
              : tight ? <TrendingDown className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
              : <Check className="size-4 shrink-0 mt-0.5" aria-hidden="true" />}
            <p className="font-medium">{data.resumo.mensagem}</p>
          </div>

          {!empty && (
            <BalanceChart weeks={data.semanas} opening={data.saldo_inicial} formatMoney={formatMoney} />
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Saldo hoje" icon={<Wallet />} value={formatMoney(data.saldo_inicial)} className="shadow-none" />
            <Stat label="Entradas previstas" value={formatMoney(data.total_entradas)} tone="positive" className="shadow-none" />
            <Stat label="Saídas previstas" value={formatMoney(data.total_saidas)} tone="negative" className="shadow-none" />
            <Stat
              label="Saldo no fim"
              value={formatMoney(data.saldo_final)}
              tone={data.saldo_final < 0 ? 'negative' : 'neutral'}
              className="shadow-none"
            />
          </div>

          {data.resumo.saidas_previstas_sem_documento > 0 && (
            <p className="text-2xs text-neutral-500">
              Inclui {formatMoney(data.resumo.saidas_previstas_sem_documento)} de custos recorrentes
              ainda por lançar (renda, salários, avenças) — previstos, não documentados.
            </p>
          )}
        </CardBody>
      </Card>

      {/* ----------------------------------------------------- week by week */}
      <Card className="overflow-hidden">
        <CardHeader title="Semana a semana" />
        <div className="divide-y divide-neutral-100 max-h-[26rem] overflow-y-auto">
          {data.semanas.map((week) => {
            const isOpen = open === week.semana;
            const negative = week.saldo_final < 0;
            const quiet = week.movimentos.length === 0;
            return (
              <div key={week.semana}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : week.semana)}
                  disabled={quiet}
                  aria-expanded={quiet ? undefined : isOpen}
                  className="w-full px-4 py-2 flex items-center gap-3 hover:bg-neutral-50 text-left cursor-pointer disabled:cursor-default disabled:hover:bg-transparent focus-visible:outline-none focus-visible:bg-neutral-50"
                >
                  <span className="text-2xs font-mono tabular-nums text-neutral-500 w-40 shrink-0">
                    {formatDate(week.inicio)} – {formatDate(week.fim)}
                  </span>
                  <span className="flex-1 min-w-0 text-neutral-600 tabular-nums">
                    {quiet ? (
                      <span className="text-neutral-400">sem movimentos</span>
                    ) : (
                      <>
                        <span className="text-emerald-700 font-semibold">+{formatMoney(week.entradas)}</span>
                        {' '}
                        <span className="text-rose-700 font-semibold">−{formatMoney(week.saidas)}</span>
                        <span className="text-neutral-500"> · {week.movimentos.length} movimento(s)</span>
                      </>
                    )}
                  </span>
                  <span className={cn('font-mono tabular-nums font-semibold shrink-0', negative ? 'text-rose-700' : 'text-neutral-900')}>
                    {formatMoney(week.saldo_final)}
                  </span>
                  {negative && (
                    <Badge tone="danger" className="shrink-0">a descoberto</Badge>
                  )}
                  {!quiet && (
                    <ChevronDown className={cn('size-3.5 text-neutral-400 shrink-0 transition-transform', isOpen && 'rotate-180')} aria-hidden="true" />
                  )}
                </button>

                {isOpen && (
                  <ul className="px-4 pb-3 space-y-1 bg-neutral-50/60">
                    {week.movimentos.map((movement, index) => (
                      <li key={index} className="flex items-center gap-2 text-xs">
                        <span className="text-neutral-400 shrink-0" aria-label={movement.origin}>{ORIGIN_ICON[movement.origin]}</span>
                        <span className="text-neutral-500 font-mono tabular-nums w-20 shrink-0">{formatDate(movement.date)}</span>
                        <span className="flex-1 min-w-0 truncate text-neutral-700">{movement.label}</span>
                        {movement.certainty !== 'confirmado' && (
                          <Badge tone={movement.certainty === 'vencido' ? 'warning' : 'neutral'} className="shrink-0">
                            {movement.certainty}
                          </Badge>
                        )}
                        <span className={cn(
                          'font-mono tabular-nums font-semibold shrink-0',
                          movement.kind === 'in' ? 'text-emerald-700' : 'text-rose-700',
                        )}>
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
      </Card>

      <p className="text-2xs text-neutral-500 flex items-start gap-1.5">
        <AlertCircle className="size-3 shrink-0 mt-0.5" aria-hidden="true" />
        A previsão parte do saldo real das contas e junta o que está por receber e por pagar
        nas datas de vencimento, os custos recorrentes ainda não lançados e o IVA na data
        legal de pagamento. Uma fatura já vencida entra hoje, porque é o mais cedo que pode entrar.
      </p>
    </div>
  );
};
