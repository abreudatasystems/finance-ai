'use client';

/**
 * Demonstração de Resultados por naturezas.
 *
 * Two things this page has to be honest about, and says out loud:
 *  • the figures are **net of VAT** — the VAT belongs to the State, so it is
 *    neither income nor expense;
 *  • the basis is **accrual** — an invoice dated in the period counts whether
 *    or not it was paid. The cash bridge at the bottom shows exactly where the
 *    result and the bank balance part company.
 *
 * On the visuals: the statement itself is the table, and a stacked bar of the
 * eight expense lines would only duplicate it in a form that is harder to read
 * (more than ~7 meaningful classes belongs in a table). What earns its place
 * is a row of stat tiles for the three margins, with the change against the
 * previous period — headline numbers, not decoration. Status colour is always
 * paired with a label and an arrow, never carrying meaning on its own.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  FileText, Loader2, CalendarRange, TrendingUp, TrendingDown, Minus, Info,
  ChevronDown, Landmark, AlertCircle,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { IncomeStatement, StatementLine, StatementSubtotal } from './types';
import { fetchIncomeStatement } from './api';

const SECTIONS: Array<{ id: StatementLine['section']; title: string }> = [
  { id: 'rendimentos', title: 'Rendimentos' },
  { id: 'gastos_operacionais', title: 'Gastos operacionais' },
  { id: 'depreciacoes', title: 'Depreciações e amortizações' },
  { id: 'financeiro', title: 'Resultados financeiros' },
];

/** Where each subtotal is printed, in statement order. */
const SUBTOTAL_AFTER: Record<string, string[]> = {
  rendimentos: ['total_rendimentos'],
  gastos_operacionais: ['total_gastos', 'ebitda'],
  depreciacoes: ['ebit'],
  financeiro: ['rai', 'resultado_liquido'],
};

const periodOptions = () => {
  const now = new Date();
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < 6; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' }),
    });
  }
  for (let i = 0; i < 4; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i * 3, 1);
    const q = Math.floor(d.getMonth() / 3) + 1;
    const value = `${d.getFullYear()}-T${q}`;
    if (!out.some((o) => o.value === value)) out.push({ value, label: `${q}.º trimestre de ${d.getFullYear()}` });
  }
  out.push({ value: String(now.getFullYear()), label: `Ano ${now.getFullYear()}` });
  return out;
};

/** A margin, its value, and how it moved. Status colour never travels alone. */
const MarginTile: React.FC<{ label: string; value: number; hint: string; previous?: number }> = ({
  label, value, hint, previous,
}) => {
  const delta = previous == null ? null : Math.round((value - previous) * 10) / 10;
  const tone = value >= 15 ? 'text-emerald-700' : value >= 0 ? 'text-amber-700' : 'text-rose-700';
  const state = value >= 15 ? 'saudável' : value >= 0 ? 'apertada' : 'negativa';

  return (
    <div className="p-4 rounded-xl bg-white border border-slate-200">
      <p className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">{label}</p>
      <p className={`text-2xl font-black mt-1 ${tone}`}>{value.toFixed(1)}%</p>
      <p className="text-[10px] text-slate-500 mt-1">
        <span className={tone}>{state}</span>
        {delta != null && delta !== 0 && (
          <> · {delta > 0 ? '+' : ''}{delta.toFixed(1)} p.p. vs período anterior</>
        )}
      </p>
      <p className="text-[10px] text-slate-400 mt-1.5 leading-snug">{hint}</p>
    </div>
  );
};

const Variation: React.FC<{ value: number; pct: number | null; format: (n: number) => string }> = ({
  value, pct, format,
}) => {
  if (value === 0) {
    return <span className="text-slate-300 flex items-center gap-1 justify-end"><Minus className="w-3 h-3" /></span>;
  }
  const up = value > 0;
  return (
    <span className={`flex items-center gap-1 justify-end ${up ? 'text-emerald-700' : 'text-rose-700'}`}>
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {format(Math.abs(value))}
      {pct != null && <span className="text-slate-400 font-normal">({up ? '+' : '−'}{Math.abs(pct).toFixed(0)}%)</span>}
    </span>
  );
};

export const IncomeStatementView: React.FC = () => {
  const { formatMoney } = useApp();
  const options = periodOptions();

  const [period, setPeriod] = useState(options.find((o) => o.value.includes('T')) ?.value || options[0].value);
  const [data, setData] = useState<IncomeStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setData(await fetchIncomeStatement(period));
    setLoading(false);
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const subtotal = (key: string): StatementSubtotal | undefined =>
    data?.subtotais.find((s) => s.key === key);

  const revenue = subtotal('total_rendimentos')?.amount || 0;
  const share = (amount: number) => (revenue > 0 ? (amount / revenue) * 100 : 0);

  return (
    <div className="space-y-4 text-xs">
      {/* ---------------------------------------------------------- header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-600" />
            <h3 className="font-bold text-sm text-slate-900">Demonstração de Resultados</h3>
            {data && (
              <span className="text-[10px] text-slate-400 font-mono">
                {data.empresa.nome} · {data.periodo.label}
              </span>
            )}
          </div>
          <label className="flex items-center gap-2">
            <CalendarRange className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={period} onChange={(e) => setPeriod(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
            >
              {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </div>

        {data && (
          <p className="flex items-start gap-2 px-3 py-2 rounded-xl bg-indigo-50/60 border border-indigo-100 text-indigo-900 text-[11px]">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Valores <b>sem IVA</b> — o IVA não é rendimento nem gasto. Regime de{' '}
              <b>acréscimo</b>: contam os documentos com data no período, pagos ou não.
            </span>
          </p>
        )}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-400 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> A apurar o período…
        </div>
      ) : !data ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-400 flex items-center justify-center gap-2">
          <AlertCircle className="w-4 h-4" /> Não foi possível carregar a demonstração.
        </div>
      ) : (
        <>
          {/* ------------------------------------------------------ margins */}
          <div className="grid sm:grid-cols-3 gap-3">
            <MarginTile
              label="Margem EBITDA" value={data.margens.ebitda}
              hint="Quanto sobra da operação antes de depreciações, juros e impostos."
            />
            <MarginTile
              label="Margem operacional" value={data.margens.operacional}
              hint="Depois de contar o desgaste do que a empresa possui."
            />
            <MarginTile
              label="Margem líquida" value={data.margens.liquida}
              hint="Depois dos juros. Antes do IRC, que não é apurado aqui."
            />
          </div>

          {/* ---------------------------------------------------- statement */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[9px] uppercase tracking-wider font-bold text-slate-500">
                    <th className="text-left p-3">Rubrica</th>
                    <th className="text-right p-3 w-28">Período</th>
                    <th className="text-right p-3 w-20">% receita</th>
                    <th className="text-right p-3 w-28">Anterior</th>
                    <th className="text-right p-3 w-36">Variação</th>
                  </tr>
                </thead>
                <tbody>
                  {SECTIONS.map((section) => {
                    const lines = data.linhas.filter((l) => l.section === section.id);
                    if (lines.length === 0 && !(SUBTOTAL_AFTER[section.id] || []).length) return null;
                    return (
                      <React.Fragment key={section.id}>
                        <tr className="bg-slate-50/60">
                          <td colSpan={5} className="px-3 py-1.5 text-[9px] uppercase font-bold text-slate-400 tracking-wider">
                            {section.title}
                          </td>
                        </tr>

                        {lines.map((line) => {
                          const open = expanded === line.key;
                          return (
                            <React.Fragment key={line.key}>
                              <tr className="border-b border-slate-100 hover:bg-slate-50/60">
                                <td className="p-3">
                                  <button
                                    onClick={() => setExpanded(open ? null : line.key)}
                                    className="text-left group"
                                    disabled={line.detalhe.length === 0}
                                  >
                                    <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                                      {line.label}
                                      {line.detalhe.length > 0 && (
                                        <ChevronDown className={`w-3 h-3 text-slate-300 transition-transform ${open ? 'rotate-180' : ''}`} />
                                      )}
                                    </span>
                                    {line.contas.length > 0 && (
                                      <span className="text-[9px] font-mono text-slate-400">
                                        conta{line.contas.length > 1 ? 's' : ''} {line.contas.join(', ')}
                                      </span>
                                    )}
                                    {line.hint && (
                                      <span className="block text-[10px] text-slate-400 mt-0.5 max-w-md">{line.hint}</span>
                                    )}
                                  </button>
                                </td>
                                <td className={`p-3 text-right font-mono font-bold ${
                                  line.nature === 'income' ? 'text-slate-900' : 'text-slate-700'
                                }`}>
                                  {line.nature === 'expense' && line.amount > 0 ? '−' : ''}{formatMoney(line.amount)}
                                </td>
                                <td className="p-3 text-right font-mono text-slate-400">
                                  {revenue > 0 ? `${share(line.amount).toFixed(1)}%` : '—'}
                                </td>
                                <td className="p-3 text-right font-mono text-slate-400">
                                  {formatMoney(line.anterior)}
                                </td>
                                <td className="p-3 text-right font-mono font-semibold">
                                  <Variation value={line.variacao} pct={line.variacao_pct} format={formatMoney} />
                                </td>
                              </tr>

                              {open && line.detalhe.length > 0 && (
                                <tr className="bg-slate-50/40">
                                  <td colSpan={5} className="px-6 py-2">
                                    <ul className="space-y-1">
                                      {line.detalhe.map((item) => (
                                        <li key={item.categoria} className="flex justify-between text-[11px] text-slate-600">
                                          <span>{item.categoria}</span>
                                          <span className="font-mono">{formatMoney(item.amount)}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}

                        {(SUBTOTAL_AFTER[section.id] || []).map((key) => {
                          const row = subtotal(key);
                          if (!row) return null;
                          const negative = row.amount < 0;
                          return (
                            <tr key={key} className={row.emphasis ? 'bg-slate-900 text-white' : 'bg-slate-100'}>
                              <td className="p-3">
                                <span className={`font-bold ${row.emphasis ? 'text-white' : 'text-slate-800'}`}>
                                  {row.label}
                                </span>
                                {row.hint && (
                                  <span className={`block text-[10px] mt-0.5 max-w-md ${
                                    row.emphasis ? 'text-slate-300' : 'text-slate-500'
                                  }`}>
                                    {row.hint}
                                  </span>
                                )}
                              </td>
                              <td className={`p-3 text-right font-mono font-black ${
                                row.emphasis ? (negative ? 'text-rose-300' : 'text-emerald-300') : 'text-slate-900'
                              }`}>
                                {formatMoney(row.amount)}
                              </td>
                              <td className={`p-3 text-right font-mono ${row.emphasis ? 'text-slate-400' : 'text-slate-500'}`}>
                                {revenue > 0 ? `${share(row.amount).toFixed(1)}%` : '—'}
                              </td>
                              <td className={`p-3 text-right font-mono ${row.emphasis ? 'text-slate-400' : 'text-slate-500'}`}>
                                {formatMoney(row.anterior)}
                              </td>
                              <td className="p-3 text-right font-mono font-semibold">
                                <Variation value={row.variacao} pct={row.variacao_pct} format={formatMoney} />
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* --------------------------------------------------- cash bridge */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Landmark className="w-4 h-4 text-indigo-600" />
              <h3 className="font-bold text-sm text-slate-900">Resultado não é dinheiro em conta</h3>
            </div>
            <p className="text-[11px] text-slate-600">{data.ponte_caixa.explicacao}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl border border-slate-200">
                <p className="text-[9px] uppercase font-bold text-slate-400">Resultado do período</p>
                <p className="font-bold text-slate-900 text-sm mt-0.5">{formatMoney(data.ponte_caixa.resultado)}</p>
              </div>
              <div className="p-3 rounded-xl border border-emerald-100 bg-emerald-50/40">
                <p className="text-[9px] uppercase font-bold text-emerald-600">Ainda por receber</p>
                <p className="font-bold text-emerald-700 text-sm mt-0.5">{formatMoney(data.ponte_caixa.a_receber)}</p>
              </div>
              <div className="p-3 rounded-xl border border-rose-100 bg-rose-50/40">
                <p className="text-[9px] uppercase font-bold text-rose-600">Ainda por pagar</p>
                <p className="font-bold text-rose-700 text-sm mt-0.5">{formatMoney(data.ponte_caixa.a_pagar)}</p>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                <p className="text-[9px] uppercase font-bold text-slate-500">Saldo em conta</p>
                <p className="font-bold text-slate-900 text-sm mt-0.5">{formatMoney(data.ponte_caixa.saldo_em_conta)}</p>
              </div>
            </div>
            <p className="text-[10px] text-slate-400">{data.base.nota_irc}</p>
          </div>
        </>
      )}
    </div>
  );
};
