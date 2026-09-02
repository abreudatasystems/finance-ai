'use client';

/**
 * Retenções na fonte.
 *
 * The screen has to keep two things apart that a single total would confuse:
 * what the company withheld from its suppliers is a **debt** with a deadline,
 * and what clients withheld from the company is a **credit** against its own
 * income tax. Netting them would give a number that is true of nothing, so
 * they sit in separate cards and the delivery amount only ever counts the
 * first.
 *
 * Every figure names the article it comes from. A tax number nobody can check
 * is a tax number nobody should act on.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, Landmark, AlertTriangle, Check, Calendar, ArrowDownLeft,
  ArrowUpRight, RefreshCw, Users,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { EntityYearRow, PendingDelivery, RetentionPosition, RetentionSide } from './types';
import { fetchByEntity, fetchPending, fetchPosition } from './api';

const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const periodLabel = (period: string) => {
  const [year, month] = period.split('-');
  return `${MONTHS[Number(month) - 1]} de ${year}`;
};

const periodOptions = (): string[] => {
  const now = new Date();
  const options: string[] = [];
  for (let offset = 0; offset < 15; offset += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    options.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return options;
};

/** One side of the position: the rates, then the documents behind them. */
const SidePanel: React.FC<{
  title: string;
  hint: string;
  side: RetentionSide;
  icon: React.ReactNode;
  formatMoney: (n: number) => string;
}> = ({ title, hint, side, icon, formatMoney }) => (
  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-3">
    <div className="flex items-start gap-2">
      {icon}
      <div>
        <h3 className="font-bold text-sm text-slate-900">{title}</h3>
        <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{hint}</p>
      </div>
    </div>

    <p className="font-bold text-slate-900 text-lg">{formatMoney(side.total)}</p>

    {side.por_taxa.length ? (
      <table className="w-full text-left">
        <thead className="text-[9px] uppercase text-slate-500 font-bold">
          <tr>
            <th className="py-1.5">Tipo</th>
            <th className="py-1.5 text-right">Base</th>
            <th className="py-1.5 text-right">Retido</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {side.por_taxa.map((group) => (
            <tr key={`${group.codigo}-${group.taxa}`}>
              <td className="py-1.5">
                <span className="font-semibold text-slate-800">{group.label}</span>
                {/* The article, so the figure can be checked rather than trusted. */}
                {group.base_legal && (
                  <span className="block text-[9px] text-slate-400">{group.base_legal}</span>
                )}
              </td>
              <td className="py-1.5 text-right text-slate-600">{formatMoney(group.base)}</td>
              <td className="py-1.5 text-right font-bold text-slate-900">
                {formatMoney(group.retido)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    ) : (
      <p className="text-[11px] text-slate-400">Nenhum documento deste lado neste mês.</p>
    )}
  </div>
);

export const RetentionsView: React.FC = () => {
  const { formatMoney } = useApp();
  const now = new Date();
  const [period, setPeriod] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
  );
  const [data, setData] = useState<RetentionPosition | null>(null);
  const [pending, setPending] = useState<PendingDelivery[]>([]);
  const [entities, setEntities] = useState<EntityYearRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [position, deliveries, byEntity] = await Promise.all([
      fetchPosition(period),
      fetchPending(),
      fetchByEntity(Number(period.split('-')[0])),
    ]);
    setData(position);
    setPending(deliveries?.entregas || []);
    setEntities(byEntity?.entidades || []);
    setLoading(false);
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const options = useMemo(() => periodOptions(), []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> A apurar as retenções…
      </div>
    );
  }
  if (!data) return null;

  const late = pending.filter((row) => row.em_atraso);

  return (
    <div className="space-y-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-2">
          <Landmark className="w-4 h-4 text-indigo-600" />
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 bg-white font-bold focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
          >
            {options.map((p) => <option key={p} value={p}>{periodLabel(p)}</option>)}
          </select>
        </div>
        <button onClick={load} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* The sentence first: what is owed, and by when. */}
      <div className={`rounded-2xl border p-4 flex items-start gap-3 ${
        data.entrega.em_atraso ? 'bg-rose-50 border-rose-200 text-rose-900'
          : data.entrega.valor > 0 ? 'bg-amber-50 border-amber-200 text-amber-900'
          : 'bg-slate-50 border-slate-200 text-slate-700'
      }`}>
        {data.entrega.em_atraso ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          : data.entrega.valor > 0 ? <Calendar className="w-4 h-4 shrink-0 mt-0.5" />
          : <Check className="w-4 h-4 shrink-0 mt-0.5" />}
        <p className="font-semibold leading-relaxed">{data.mensagem}</p>
      </div>

      {/* Older months that were never delivered. A missed March still owes March. */}
      {late.length > 0 && (
        <div className="bg-white rounded-2xl border border-rose-200 shadow-xs p-4 space-y-2">
          <h3 className="font-bold text-sm text-rose-900">
            {late.length} mês/meses por entregar fora de prazo
          </h3>
          <ul className="divide-y divide-slate-100">
            {late.map((row) => (
              <li key={row.periodo} className="flex items-center justify-between py-1.5">
                <span className="font-semibold text-slate-700">{periodLabel(row.periodo)}</span>
                <span className="text-[10px] text-slate-400">prazo {row.ate}</span>
                <span className="font-bold text-rose-700">{formatMoney(row.valor)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SidePanel
          title="Retido a terceiros — a entregar ao Estado"
          hint="O que a empresa reteve aos fornecedores. É uma dívida com prazo."
          side={data.retido_a_terceiros}
          icon={<ArrowDownLeft className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />}
          formatMoney={formatMoney}
        />
        <SidePanel
          title="Retido pelos clientes — crédito de imposto"
          hint={data.base.nota_credito}
          side={data.retido_por_terceiros}
          icon={<ArrowUpRight className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />}
          formatMoney={formatMoney}
        />
      </div>

      {/* The documents themselves, separated from everything else. */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-100">
          <h3 className="font-bold text-sm text-slate-900">Documentos com retenção</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">{data.base.incidencia}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-[9px] uppercase text-slate-500 font-bold">
              <tr>
                <th className="px-4 py-2.5">Data</th>
                <th className="px-4 py-2.5">Entidade</th>
                <th className="px-4 py-2.5 text-right">Base</th>
                <th className="px-4 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5 text-right">Taxa</th>
                <th className="px-4 py-2.5 text-right">Retido</th>
                <th className="px-4 py-2.5 text-right">Move no banco</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...data.retido_a_terceiros.linhas, ...data.retido_por_terceiros.linhas]
                .sort((a, b) => (a.data < b.data ? 1 : -1))
                .map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 text-slate-500 font-mono text-[10px]">{row.data}</td>
                    <td className="px-4 py-2.5">
                      <span className="font-semibold text-slate-800">{row.entidade}</span>
                      <span className="block text-[10px] text-slate-400">
                        {row.documento || row.descricao}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{formatMoney(row.base)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{formatMoney(row.total)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500">
                      {row.taxa !== null ? `${row.taxa}%` : '—'}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-bold ${
                      row.tipo === 'expense' ? 'text-rose-700' : 'text-emerald-700'
                    }`}>
                      {formatMoney(row.retido)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-slate-900">
                      {formatMoney(row.a_pagar)}
                    </td>
                  </tr>
                ))}

              {!data.retido_a_terceiros.documentos && !data.retido_por_terceiros.documentos && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    Nenhum documento deste mês tem retenção na fonte.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* The year per counterparty — what the annual declaration is built from. */}
      {entities.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            <h3 className="font-bold text-sm text-slate-900">
              {period.split('-')[0]} por entidade
            </h3>
            <span className="text-[10px] text-slate-400">
              base para a declaração anual
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-[9px] uppercase text-slate-500 font-bold">
                <tr>
                  <th className="px-4 py-2.5">Entidade</th>
                  <th className="px-4 py-2.5">NIF</th>
                  <th className="px-4 py-2.5 text-right">Base do ano</th>
                  <th className="px-4 py-2.5 text-right">Retido no ano</th>
                  <th className="px-4 py-2.5 text-right">Documentos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entities.map((row) => (
                  <tr key={row.entity_id || row.entidade} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 font-semibold text-slate-800">{row.entidade}</td>
                    <td className="px-4 py-2.5 text-slate-500 font-mono text-[10px]">
                      {row.nif || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{formatMoney(row.base)}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-slate-900">
                      {formatMoney(row.retido)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-500">{row.documentos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-[10px] text-slate-400 px-1">
        {data.base.prazo}. As taxas são as previstas por omissão e podem ser
        alteradas em cada documento — confirme o apuramento com o contabilista
        antes de entregar.
      </p>
    </div>
  );
};
