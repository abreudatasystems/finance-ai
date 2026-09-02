'use client';

/**
 * Orçamento face ao realizado.
 *
 * The product could say what happened and what is coming, and nothing about
 * what was intended. Without that a month can only be compared against the
 * month before, which says whether things changed, never whether they went
 * well.
 *
 * Each row is a plan and a reality on the same scale, so the bar is a single
 * track with the realizado drawn inside the orçamento: over-budget overflows
 * the track and reads as overflow without needing a legend. Colour repeats
 * what the words already say — *favorável* / *desfavorável* — because the
 * direction of a deviation depends on the row's nature and a lone signed
 * number would read backwards on half of them.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, Target, Copy, Check, AlertTriangle, Pencil, RefreshCw,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Comparison, ComparisonLine, Side } from './types';
import { copyBudget, fetchComparison, saveBudget } from './api';

const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const periodLabel = (period: string) => {
  const [year, month] = period.split('-');
  return `${MONTHS[Number(month) - 1]} de ${year}`;
};

const previousPeriod = (period: string) => {
  const [year, month] = period.split('-').map(Number);
  return month === 1
    ? `${year - 1}-12`
    : `${year}-${String(month - 1).padStart(2, '0')}`;
};

/** The last 12 months plus the next 3 — you plan ahead and review behind. */
const periodOptions = (): string[] => {
  const now = new Date();
  const options: string[] = [];
  for (let offset = 3; offset >= -12; offset -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    options.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return options;
};

/** Plan and reality on one track: over budget overflows, and looks it. */
const ProgressTrack: React.FC<{ line: ComparisonLine }> = ({ line }) => {
  if (line.orcamento <= 0) {
    return (
      <div className="h-1.5 w-full rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-slate-400" style={{ width: '100%' }} />
      </div>
    );
  }
  const ratio = line.realizado / line.orcamento;
  const filled = Math.min(ratio, 1) * 100;
  const over = Math.min(Math.max(ratio - 1, 0), 1) * 100;
  const tone = line.sentido === 'favorável' ? 'bg-emerald-500' : 'bg-rose-500';

  return (
    <div className="flex h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
      <div className={`h-full ${tone}`} style={{ width: `${filled}%` }} />
      {over > 0 && <div className="h-full bg-rose-700" style={{ width: `${over}%` }} />}
    </div>
  );
};

const SideCard: React.FC<{
  title: string;
  side: Side;
  formatMoney: (n: number) => string;
}> = ({ title, side, formatMoney }) => (
  <div className="p-3 rounded-xl bg-white border border-slate-200">
    <p className="text-[9px] uppercase font-bold text-slate-500">{title} <span className="text-slate-400">· sem IVA</span></p>
    <p className="font-bold text-slate-900 text-sm mt-0.5">{formatMoney(side.realizado)}</p>
    <p className="text-[10px] text-slate-400 mt-0.5">
      orçamento {formatMoney(side.orcamento)}
    </p>
    {side.relevante && (
      <p className={`text-[10px] font-bold mt-1 ${
        side.sentido === 'favorável' ? 'text-emerald-700' : 'text-rose-700'
      }`}>
        {side.desvio > 0 ? '+' : ''}{formatMoney(side.desvio)}
        {side.desvio_pct !== null && ` (${side.desvio_pct > 0 ? '+' : ''}${side.desvio_pct}%)`}
      </p>
    )}
  </div>
);

export const BudgetView: React.FC = () => {
  const { formatMoney } = useApp();
  const now = new Date();
  const [period, setPeriod] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
  );
  const [data, setData] = useState<Comparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setData(await fetchComparison(period));
    setLoading(false);
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const options = useMemo(() => periodOptions(), []);

  const startEdit = (line: ComparisonLine) => {
    setEditing(line.category_id);
    setDraft(line.orcamento ? String(line.orcamento) : '');
    setError(null);
  };

  const commit = async (line: ComparisonLine) => {
    const amount = Number(draft.replace(',', '.'));
    if (!Number.isFinite(amount) || amount < 0) {
      setError('Indique um valor, por exemplo 1200,00');
      return;
    }
    const { error: failure } = await saveBudget(line.category_id, period, amount);
    setEditing(null);
    if (failure) setError(failure);
    else load();
  };

  const carryForward = async () => {
    setNotice(null);
    setError(null);
    const source = previousPeriod(period);
    const { data: result, error: failure } = await copyBudget(source, period);
    if (failure) setError(failure);
    else if (result) {
      setNotice(
        `${result.copiados} categoria(s) copiadas de ${periodLabel(source)}` +
        (result.ignorados ? `; ${result.ignorados} já tinham orçamento aqui.` : '.'),
      );
      load();
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> A comparar o plano com a realidade…
      </div>
    );
  }
  if (!data) return null;

  const income = data.linhas.filter((l) => l.tipo === 'income');
  const expense = data.linhas.filter((l) => l.tipo === 'expense');

  const renderRows = (rows: ComparisonLine[]) => rows.map((line) => (
    <tr key={line.category_id} className="hover:bg-slate-50/60">
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-800">{line.categoria}</span>
          {line.sem_orcamento && line.realizado > 0 && (
            <span className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[9px] font-bold uppercase">
              Sem orçamento
            </span>
          )}
        </div>
        <div className="mt-1.5 max-w-[220px]"><ProgressTrack line={line} /></div>
      </td>

      <td className="px-4 py-2.5 text-right">
        {editing === line.category_id ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commit(line)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit(line);
              if (e.key === 'Escape') setEditing(null);
            }}
            inputMode="decimal"
            placeholder="sem IVA"
            aria-label={`Orçamento sem IVA para ${line.categoria}`}
            className="w-24 px-2 py-1 text-right text-xs rounded-lg border border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
          />
        ) : (
          <button
            onClick={() => startEdit(line)}
            className="inline-flex items-center gap-1.5 font-semibold text-slate-700 hover:text-indigo-600 group"
          >
            {line.orcamento ? formatMoney(line.orcamento) : <span className="text-slate-300">definir</span>}
            <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100" />
          </button>
        )}
      </td>

      <td className="px-4 py-2.5 text-right font-bold text-slate-900">
        {formatMoney(line.realizado)}
      </td>

      <td className={`px-4 py-2.5 text-right font-bold ${
        !line.relevante ? 'text-slate-300'
          : line.sentido === 'favorável' ? 'text-emerald-700' : 'text-rose-700'
      }`}>
        {line.desvio > 0 ? '+' : ''}{formatMoney(line.desvio)}
      </td>

      <td className="px-4 py-2.5 text-right text-slate-500">
        {line.desvio_pct !== null ? `${line.desvio_pct > 0 ? '+' : ''}${line.desvio_pct}%` : '—'}
      </td>
    </tr>
  ));

  return (
    <div className="space-y-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-indigo-600" />
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 bg-white font-bold focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
          >
            {options.map((p) => (
              <option key={p} value={p}>{periodLabel(p)}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={carryForward}
            className="px-3 py-1.5 rounded-xl text-[11px] font-bold border border-slate-200 hover:bg-slate-50 flex items-center gap-1.5"
            title={`Copiar o orçamento de ${periodLabel(previousPeriod(period))}`}
          >
            <Copy className="w-3 h-3" /> Copiar do mês anterior
          </button>
          <button onClick={load} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* The sentence first: it says how the month went before any row does. */}
      <div className={`rounded-2xl border p-4 flex items-start gap-3 ${
        data.sem_orcamento ? 'bg-slate-50 border-slate-200 text-slate-700'
          : data.resultado.sentido === 'favorável'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
            : 'bg-amber-50 border-amber-200 text-amber-900'
      }`}>
        {data.sem_orcamento ? <Target className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
          : data.resultado.sentido === 'favorável' ? <Check className="w-4 h-4 shrink-0 mt-0.5" />
          : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
        <p className="font-semibold leading-relaxed">{data.mensagem}</p>
      </div>

      {notice && (
        <div className="rounded-xl bg-slate-900 text-white px-3 py-2 font-semibold">{notice}</div>
      )}
      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-800 px-3 py-2 font-semibold">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SideCard title="Rendimentos" side={data.rendimentos} formatMoney={formatMoney} />
        <SideCard title="Gastos" side={data.gastos} formatMoney={formatMoney} />
        <SideCard title="Resultado" side={data.resultado} formatMoney={formatMoney} />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-[9px] uppercase text-slate-500 font-bold">
              <tr>
                <th className="px-4 py-2.5">Categoria</th>
                {/* Said here, not only in a footnote: a rent typed from the
                    invoice (with VAT) against a realizado net of it produces a
                    favourable deviation that does not exist. */}
                <th className="px-4 py-2.5 text-right">Orçamento <span className="normal-case font-semibold text-slate-400">(sem IVA)</span></th>
                <th className="px-4 py-2.5 text-right">Realizado</th>
                <th className="px-4 py-2.5 text-right">Desvio</th>
                <th className="px-4 py-2.5 text-right">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {income.length > 0 && (
                <tr className="bg-slate-50/70">
                  <td colSpan={5} className="px-4 py-1.5 text-[9px] uppercase font-bold text-emerald-700">
                    Rendimentos
                  </td>
                </tr>
              )}
              {renderRows(income)}

              {expense.length > 0 && (
                <tr className="bg-slate-50/70">
                  <td colSpan={5} className="px-4 py-1.5 text-[9px] uppercase font-bold text-rose-700">
                    Gastos
                  </td>
                </tr>
              )}
              {renderRows(expense)}

              {!data.linhas.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    Sem orçamento e sem movimentos neste mês.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[10px] text-slate-400 px-1">
        O realizado vem dos documentos com data neste mês, sem IVA — a mesma base
        da Demonstração de Resultados, para que os dois relatórios nunca discordem.
      </p>
    </div>
  );
};
