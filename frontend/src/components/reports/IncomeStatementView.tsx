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

import React, { useState } from 'react';
import { useLoad } from '@/lib/use-load';
import {
  FileText, CalendarRange, TrendingUp, TrendingDown, Minus, Info,
  ChevronDown, Landmark,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { IncomeStatement, StatementLine, StatementSubtotal } from './types';
import { fetchIncomeStatement } from './api';
import {
  Card, CardHeader, CardBody, ErrorState, LoadingState, Select,
  Table, THead, TBody, Th, Td,
} from '@/components/ui';

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
    <Card className="p-4">
      <p className="text-2xs uppercase font-bold text-neutral-500 tracking-wider">{label}</p>
      <p className={`text-2xl font-black mt-1 tabular-nums ${tone}`}>{value.toFixed(1)}%</p>
      <p className="text-2xs text-neutral-500 mt-1">
        <span className={tone}>{state}</span>
        {delta != null && delta !== 0 && (
          <> · {delta > 0 ? '+' : ''}{delta.toFixed(1)} p.p. vs período anterior</>
        )}
      </p>
      <p className="text-2xs text-neutral-500 mt-1.5 leading-snug">{hint}</p>
    </Card>
  );
};

const Variation: React.FC<{ value: number; pct: number | null; format: (n: number) => string }> = ({
  value, pct, format,
}) => {
  if (value === 0) {
    return <span className="text-neutral-300 flex items-center gap-1 justify-end"><Minus className="w-3 h-3" aria-label="sem variação" /></span>;
  }
  const up = value > 0;
  return (
    <span className={`flex items-center gap-1 justify-end ${up ? 'text-emerald-700' : 'text-rose-700'}`}>
      {up ? <TrendingUp className="w-3 h-3" aria-label="subiu" /> : <TrendingDown className="w-3 h-3" aria-label="desceu" />}
      {format(Math.abs(value))}
      {pct != null && <span className="text-neutral-400 font-normal">({up ? '+' : '−'}{Math.abs(pct).toFixed(0)}%)</span>}
    </span>
  );
};

export const IncomeStatementView: React.FC = () => {
  const { formatMoney } = useApp();
  const options = periodOptions();

  const [period, setPeriod] = useState(options.find((o) => o.value.includes('T')) ?.value || options[0].value);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Só a resposta mais recente escreve (o useLoad ignora as antigas): trocar
  // depressa de período deixava a demonstração do período anterior por baixo
  // do rótulo novo.
  const { data, loading } = useLoad<IncomeStatement | null>(() => fetchIncomeStatement(period), [period]);

  const subtotal = (key: string): StatementSubtotal | undefined =>
    data?.subtotais.find((s) => s.key === key);

  const revenue = subtotal('total_rendimentos')?.amount || 0;
  const share = (amount: number) => (revenue > 0 ? (amount / revenue) * 100 : 0);

  return (
    <div className="space-y-4 text-xs">
      {/* ---------------------------------------------------------- header */}
      <Card>
        <CardHeader
          icon={<FileText />}
          title="Demonstração de Resultados"
          subtitle={data ? `${data.empresa.nome} · ${data.periodo.label}` : undefined}
          actions={
            <div className="flex items-center gap-2">
              <CalendarRange className="w-3.5 h-3.5 text-neutral-400" aria-hidden="true" />
              <Select
                aria-label="Período"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="w-auto font-semibold"
              >
                {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </div>
          }
        />

        {data && (
          <CardBody className="py-3">
            <p className="flex items-start gap-2 px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-700 text-2xs">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-600" aria-hidden="true" />
              <span>
                Valores <b>sem IVA</b> — o IVA não é rendimento nem gasto. Regime de{' '}
                <b>acréscimo</b>: contam os documentos com data no período, pagos ou não.
              </span>
            </p>
          </CardBody>
        )}
      </Card>

      {loading ? (
        <Card>
          <LoadingState label="A apurar o período…" />
        </Card>
      ) : !data ? (
        <Card>
          <ErrorState message="Não foi possível carregar a demonstração." />
        </Card>
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
          <Card className="overflow-hidden">
            <Table className="min-w-[640px]">
              <THead>
                <tr>
                  <Th>Rubrica</Th>
                  <Th numeric className="w-28">Período</Th>
                  <Th numeric className="w-20">% receita</Th>
                  <Th numeric className="w-28">Anterior</Th>
                  <Th numeric className="w-36">Variação</Th>
                </tr>
              </THead>
              <TBody className="divide-y-0">
                {SECTIONS.map((section) => {
                  const lines = data.linhas.filter((l) => l.section === section.id);
                  if (lines.length === 0 && !(SUBTOTAL_AFTER[section.id] || []).length) return null;
                  return (
                    <React.Fragment key={section.id}>
                      <tr className="bg-neutral-50/60">
                        <td colSpan={5} className="px-4 py-1.5 text-2xs uppercase font-bold text-neutral-500 tracking-wider">
                          {section.title}
                        </td>
                      </tr>

                      {lines.map((line) => {
                        const open = expanded === line.key;
                        return (
                          <React.Fragment key={line.key}>
                            <tr className="border-b border-neutral-100 hover:bg-neutral-50/60">
                              <Td>
                                <button
                                  type="button"
                                  onClick={() => setExpanded(open ? null : line.key)}
                                  className="text-left group rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 enabled:cursor-pointer"
                                  disabled={line.detalhe.length === 0}
                                  aria-expanded={line.detalhe.length > 0 ? open : undefined}
                                >
                                  <span className="font-semibold text-neutral-800 flex items-center gap-1.5">
                                    {line.label}
                                    {line.detalhe.length > 0 && (
                                      <ChevronDown className={`w-3 h-3 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                                    )}
                                  </span>
                                  {line.contas.length > 0 && (
                                    <span className="text-2xs font-mono text-neutral-400">
                                      conta{line.contas.length > 1 ? 's' : ''} {line.contas.join(', ')}
                                    </span>
                                  )}
                                  {line.hint && (
                                    <span className="block text-2xs text-neutral-500 mt-0.5 max-w-md">{line.hint}</span>
                                  )}
                                </button>
                              </Td>
                              <Td numeric className={`font-bold ${
                                line.nature === 'income' ? 'text-neutral-900' : 'text-neutral-700'
                              }`}>
                                {line.nature === 'expense' && line.amount > 0 ? '−' : ''}{formatMoney(line.amount)}
                              </Td>
                              <Td numeric className="text-neutral-500">
                                {revenue > 0 ? `${share(line.amount).toFixed(1)}%` : '—'}
                              </Td>
                              <Td numeric className="text-neutral-500">
                                {formatMoney(line.anterior)}
                              </Td>
                              <Td numeric className="font-semibold">
                                <Variation value={line.variacao} pct={line.variacao_pct} format={formatMoney} />
                              </Td>
                            </tr>

                            {open && line.detalhe.length > 0 && (
                              <tr className="bg-neutral-50/40">
                                <td colSpan={5} className="px-8 py-2">
                                  <ul className="space-y-1">
                                    {line.detalhe.map((item) => (
                                      <li key={item.categoria} className="flex justify-between text-2xs text-neutral-600">
                                        <span>{item.categoria}</span>
                                        <span className="tabular-nums">{formatMoney(item.amount)}</span>
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
                          <tr key={key} className={row.emphasis ? 'bg-neutral-950 text-white' : 'bg-neutral-100'}>
                            <Td>
                              <span className={`font-bold ${row.emphasis ? 'text-white' : 'text-neutral-800'}`}>
                                {row.label}
                              </span>
                              {row.hint && (
                                <span className={`block text-2xs mt-0.5 max-w-md ${
                                  row.emphasis ? 'text-neutral-300' : 'text-neutral-500'
                                }`}>
                                  {row.hint}
                                </span>
                              )}
                            </Td>
                            <Td numeric className={`font-black ${
                              row.emphasis ? (negative ? 'text-rose-300' : 'text-emerald-300') : 'text-neutral-900'
                            }`}>
                              {formatMoney(row.amount)}
                            </Td>
                            <Td numeric className={row.emphasis ? 'text-neutral-400' : 'text-neutral-500'}>
                              {revenue > 0 ? `${share(row.amount).toFixed(1)}%` : '—'}
                            </Td>
                            <Td numeric className={row.emphasis ? 'text-neutral-400' : 'text-neutral-500'}>
                              {formatMoney(row.anterior)}
                            </Td>
                            <Td numeric className="font-semibold">
                              <Variation value={row.variacao} pct={row.variacao_pct} format={formatMoney} />
                            </Td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </TBody>
            </Table>
          </Card>

          {/* --------------------------------------------------- cash bridge */}
          <Card>
            <CardHeader icon={<Landmark />} title="Resultado não é dinheiro em conta" />
            <CardBody className="space-y-3">
              <p className="text-2xs text-neutral-600">{data.ponte_caixa.explicacao}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl border border-neutral-200">
                  <p className="text-2xs uppercase font-bold text-neutral-500">Resultado do período</p>
                  <p className="font-bold text-neutral-900 text-sm mt-0.5 tabular-nums">{formatMoney(data.ponte_caixa.resultado)}</p>
                </div>
                <div className="p-3 rounded-xl border border-emerald-100 bg-emerald-50/40">
                  <p className="text-2xs uppercase font-bold text-emerald-600">Ainda por receber</p>
                  <p className="font-bold text-emerald-700 text-sm mt-0.5 tabular-nums">{formatMoney(data.ponte_caixa.a_receber)}</p>
                </div>
                <div className="p-3 rounded-xl border border-rose-100 bg-rose-50/40">
                  <p className="text-2xs uppercase font-bold text-rose-600">Ainda por pagar</p>
                  <p className="font-bold text-rose-700 text-sm mt-0.5 tabular-nums">{formatMoney(data.ponte_caixa.a_pagar)}</p>
                </div>
                <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50">
                  <p className="text-2xs uppercase font-bold text-neutral-500">Saldo em conta</p>
                  <p className="font-bold text-neutral-900 text-sm mt-0.5 tabular-nums">{formatMoney(data.ponte_caixa.saldo_em_conta)}</p>
                </div>
              </div>
              <p className="text-2xs text-neutral-500">{data.base.nota_irc}</p>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
};
