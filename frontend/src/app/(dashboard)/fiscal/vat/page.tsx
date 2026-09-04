'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { AccountingExport } from '@/components/exports/AccountingExport';
import { fetchVatPosition, fetchRealCash } from '@/services/data';
import { VatPosition, RealCash, VatSide } from '@/types';
import {Loader2, TrendingUp, TrendingDown, CalendarClock, ShieldCheck, Wallet, AlertTriangle, Info} from 'lucide-react';

const SITUACAO: Record<string, { title: string; hint: string; cls: string; bar: string }> = {
  a_entregar: {
    title: 'IVA a entregar ao Estado',
    hint: 'Liquidou mais IVA nas vendas do que deduziu nas compras. Esta diferença tem de ser paga.',
    cls: 'from-rose-600 to-rose-800', bar: 'text-rose-100',
  },
  a_recuperar: {
    title: 'IVA a recuperar',
    hint: 'Deduziu mais IVA nas compras do que liquidou nas vendas. O crédito transita para o período seguinte.',
    cls: 'from-emerald-600 to-emerald-800', bar: 'text-emerald-100',
  },
  neutro: {
    title: 'Apuramento neutro',
    hint: 'O IVA liquidado e o dedutível anulam-se neste período.',
    cls: 'from-slate-700 to-slate-900', bar: 'text-slate-200',
  },
  isento: {
    title: 'Isento de IVA',
    hint: 'Ao abrigo do art.º 53.º do CIVA a empresa não liquida nem deduz IVA.',
    cls: 'from-slate-700 to-slate-900', bar: 'text-slate-200',
  },
};

function SideCard({ title, side, icon, tone, formatMoney }: {
  title: string; side: VatSide; icon: React.ReactNode; tone: string;
  formatMoney: (n: number) => string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5">
      <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2 mb-1">
        <span className={tone}>{icon}</span> {title}
      </h3>
      <p className="text-[11px] text-slate-400 mb-3">
        Base tributável {formatMoney(side.base_tributavel)} · {side.num_documentos} documento(s)
      </p>
      <div className={`text-2xl font-black mb-3 ${tone}`}>{formatMoney(side.total)}</div>

      {side.breakdown.length === 0 ? (
        <p className="text-xs text-slate-400">Sem movimentos neste período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[320px]">
            <thead>
              <tr className="text-[9px] uppercase tracking-wider text-slate-400 font-bold border-b border-slate-200">
                <th className="py-2">Taxa</th>
                <th className="py-2 text-right">Base</th>
                <th className="py-2 text-right">IVA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {side.breakdown.map((r, i) => (
                <tr key={`${r.vat_rate ?? 'null'}-${i}`}>
                  <td className="py-2 font-semibold text-slate-700">{r.label}</td>
                  <td className="py-2 text-right text-slate-600 tabular-nums">{formatMoney(r.base_tributavel)}</td>
                  <td className="py-2 text-right font-bold text-slate-900 tabular-nums">{formatMoney(r.iva)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function VatPage() {
  const { formatMoney, setPageHeader } = useApp();
  const [position, setPosition] = useState<VatPosition | null>(null);
  const [cash, setCash] = useState<RealCash | null>(null);
  const [period, setPeriod] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPageHeader('Apuramento do IVA', 'IVA liquidado nas vendas menos IVA dedutível nas compras, segundo o CIVA');
  }, [setPageHeader]);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, c] = await Promise.all([fetchVatPosition(period || undefined), fetchRealCash()]);
    setPosition(p);
    setCash(c);
    setLoading(false);
  }, [period]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400 text-sm gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> A apurar o IVA…
      </div>
    );
  }

  if (!position) {
    return (
      <div className="text-center py-24 space-y-2">
        <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
        <p className="text-sm font-semibold text-slate-700">Não foi possível calcular o apuramento.</p>
        <p className="text-xs text-slate-400">Verifique a ligação ao servidor.</p>
      </div>
    );
  }

  const s = SITUACAO[position.apuramento.situacao] || SITUACAO.neutro;
  const valor = position.apuramento.situacao === 'a_recuperar'
    ? position.apuramento.a_recuperar
    : position.apuramento.a_entregar;

  return (
    <div className="space-y-4 animate-in fade-in duration-300 pb-6">
      {/* O ficheiro que o contabilista aceita, para o período escolhido */}
      <AccountingExport />

      {/* Regime + period */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 font-bold text-slate-700 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" /> {position.regime.label}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 font-bold text-slate-700">
            {position.period.periodicity_label}
          </span>
          {position.regime.legal_form && (
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 font-bold text-slate-700">
              {position.regime.legal_form}
            </span>
          )}
          {position.regime.nif && (
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 font-mono text-slate-500">
              NIF {position.regime.nif}
            </span>
          )}
        </div>

        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        >
          <option value="">Período em curso ({position.period.label})</option>
          <option value="2026-T1">1.º Trimestre de 2026</option>
          <option value="2026-T2">2.º Trimestre de 2026</option>
          <option value="2026-T3">3.º Trimestre de 2026</option>
          <option value="2026-T4">4.º Trimestre de 2026</option>
          <option value="2026">Ano 2026</option>
        </select>
      </div>

      {/* The settlement */}
      <div className={`bg-gradient-to-br ${s.cls} text-white rounded-2xl p-6`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="text-[10px] uppercase tracking-widest text-white/60 font-bold">
              {position.period.label}
            </span>
            <h2 className="text-sm font-bold mt-0.5">{s.title}</h2>
            <div className="text-4xl font-black mt-1">{formatMoney(valor)}</div>
            <p className={`text-[11px] mt-2 max-w-md ${s.bar}`}>{s.hint}</p>
          </div>

          <div className="text-right space-y-1.5 text-[11px]">
            <div className="flex items-center justify-end gap-1.5 text-white/60 font-bold uppercase tracking-wide text-[9px]">
              <CalendarClock className="w-3 h-3" /> Prazos legais
            </div>
            <div className="font-mono">Declaração até <b>{position.prazos.declaracao_ate}</b></div>
            <div className="font-mono">Pagamento até <b>{position.prazos.pagamento_ate}</b></div>
          </div>
        </div>

        {/* The arithmetic, spelled out */}
        {!position.regime.exempt && (
          <div className="mt-5 pt-4 border-t border-white/15 grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-[9px] uppercase tracking-wider text-white/50 font-bold">Liquidado</div>
              <div className="text-base font-bold tabular-nums">{formatMoney(position.iva_liquidado.total)}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider text-white/50 font-bold">− Dedutível</div>
              <div className="text-base font-bold tabular-nums">{formatMoney(position.iva_dedutivel.total)}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider text-white/50 font-bold">= Saldo</div>
              <div className="text-base font-black tabular-nums">{formatMoney(position.apuramento.saldo)}</div>
            </div>
          </div>
        )}
      </div>

      {/* Real cash */}
      {cash && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5">
          <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2 mb-1">
            <Wallet className="w-4 h-4 text-indigo-600" /> O que é mesmo seu
          </h3>
          <p className="text-[11px] text-slate-500 mb-4">
            O saldo de caixa inclui IVA cobrado que pertence ao Estado. Este é o valor que pode realmente usar.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Saldo de caixa</div>
              <div className="text-xl font-bold text-slate-800 tabular-nums">{formatMoney(cash.saldo_caixa)}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                recebido {formatMoney(cash.recebido)} · pago {formatMoney(cash.pago)}
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200">
              <div className="text-[10px] uppercase tracking-wider text-rose-500 font-bold">− IVA do Estado</div>
              <div className="text-xl font-bold text-rose-700 tabular-nums">{formatMoney(cash.iva_a_entregar)}</div>
              <div className="text-[10px] text-rose-500 mt-0.5">a pagar até {cash.prazo_pagamento_iva}</div>
            </div>
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
              <div className="text-[10px] uppercase tracking-wider text-emerald-600 font-bold">= Dinheiro real</div>
              <div className="text-xl font-black text-emerald-700 tabular-nums">{formatMoney(cash.dinheiro_real)}</div>
              <div className="text-[10px] text-emerald-600 mt-0.5">disponível de facto</div>
            </div>
          </div>
          {cash.alerta && (
            <div className="mt-3 flex items-start gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-medium">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {cash.alerta}
            </div>
          )}
        </div>
      )}

      {/* Both sides by rate */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SideCard
          title="IVA Liquidado (vendas)"
          side={position.iva_liquidado}
          icon={<TrendingUp className="w-4 h-4" />}
          tone="text-emerald-700"
          formatMoney={formatMoney}
        />
        <SideCard
          title="IVA Dedutível (compras)"
          side={position.iva_dedutivel}
          icon={<TrendingDown className="w-4 h-4" />}
          tone="text-indigo-700"
          formatMoney={formatMoney}
        />
      </div>

      <div className="flex items-start gap-2.5 p-4 bg-slate-50 rounded-2xl border border-slate-200 text-[11px] text-slate-600">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
        <div className="space-y-1">
          <p>{position.nota}</p>
          <p className="text-slate-400">
            O regime e a periodicidade definem-se em Configurações → Empresa. Este apuramento é informativo e não
            substitui a declaração periódica entregue no Portal das Finanças.
          </p>
        </div>
      </div>
    </div>
  );
}
