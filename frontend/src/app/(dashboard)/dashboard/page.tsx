'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '@/context/AppContext';
import { AlertsPanel } from '@/components/alerts/AlertsPanel';
import { FirstSteps } from '@/components/onboarding/FirstSteps';
import { fetchHealthScore, fetchTransactions, fetchFinancialEvents, fetchDashboardSummary, fetchExpensesByCategory } from '@/services/data';
import { FinancialHealthScore, Transaction } from '@/types';
import { formatDate, documentStatusLabel } from '@/lib/format';
import { TrendingUp, TrendingDown, Clock, Activity, Wallet, PieChart as PieIcon, Bot, User, ArrowRight } from 'lucide-react';
import { Badge, Card, CardHeader, EmptyState, Table, THead, TBody, Th, Tr, Td } from '@/components/ui';
import type { BadgeTone } from '@/components/ui';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

interface ChartDataItem {
  month: string;
  Entradas: number;
  Saídas: number;
  Resultado: number;
}

interface PieDataItem {
  name: string;
  value: number;
  amount?: number;
  color: string;
}

/** Um indicador do topo do painel. */
function KpiCard({
  label,
  icon,
  iconClass,
  value,
  valueClass = 'text-neutral-900',
  footer,
}: {
  label: string;
  icon: React.ReactNode;
  iconClass: string;
  value: React.ReactNode;
  valueClass?: string;
  footer: React.ReactNode;
}) {
  return (
    <Card className="p-4 hover:shadow-sm transition-shadow overflow-hidden">
      <div className="flex items-center justify-between gap-2 text-neutral-500 text-2xs font-bold uppercase tracking-wider">
        <span className="truncate">{label}</span>
        <span className={`size-6 rounded-md flex items-center justify-center shrink-0 [&_svg]:size-3.5 ${iconClass}`}>{icon}</span>
      </div>
      <div className={`mt-2 text-lg font-bold tracking-tight tabular-nums ${valueClass}`}>{value}</div>
      <div className="mt-1 flex items-center gap-1 text-2xs font-semibold truncate">{footer}</div>
    </Card>
  );
}

const STATUS_TONE: Record<string, BadgeTone> = { paid: 'success', received: 'success', approved: 'neutral' };

export default function DashboardPage() {
  const { formatMoney, setPageHeader } = useApp();
  const [healthScore, setHealthScore] = useState<FinancialHealthScore | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [chartData, setChartData] = useState<ChartDataItem[]>([]);
  const [pieData, setPieData] = useState<PieDataItem[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setPageHeader('Painel', 'Visão geral da tesouraria e dos resultados');
  }, [setPageHeader]);

  useEffect(() => {
    async function loadData() {
      const hs = await fetchHealthScore();
      // fetchHealthScore devolve {} quando o pedido falha. Sem este aviso, o
      // painel mostrava 0 € em tudo — o que parece uma empresa sem dinheiro,
      // não um servidor em baixo.
      if (!hs || hs.current_balance === undefined) {
        setLoadFailed(true);
        return;
      }
      setLoadFailed(false);
      setHealthScore(hs);
      const trxs = await fetchTransactions();
      setTransactions(trxs);
      await fetchFinancialEvents();

      // Real chart data from API
      const summary = await fetchDashboardSummary<ChartDataItem>();
      if (summary && summary.length > 0) {
        setChartData(summary);
      } else {
        setChartData([]);
      }

      const categories = await fetchExpensesByCategory<PieDataItem>();
      if (categories && categories.length > 0) {
        setPieData(categories);
      } else {
        setPieData([]);
      }
    }
    loadData();
  }, []);

  // Derived trend from healthScore
  const balanceTrend = healthScore?.trend ?? 0;
  const burnRate = healthScore?.burn_rate;
  const margin = healthScore?.operating_margin || 0;
  const monthlyResult = healthScore?.monthly_result || 0;
  const recent = transactions.slice(0, 3);

  return (
    <div className="flex flex-col h-[calc(100vh-104px)] space-y-3 overflow-hidden animate-in fade-in duration-300">

      {/* O que ainda falta configurar, antes de acreditar em qualquer número */}
      <div className="shrink-0">
        <FirstSteps />
      </div>

      {/* O que precisa de atenção, antes de qualquer número */}
      <div className="shrink-0">
        <AlertsPanel limit={2} />
      </div>

      {loadFailed && (
        <div role="alert" className="shrink-0 p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-semibold">
          Não foi possível carregar os indicadores. Os valores abaixo não estão actualizados — verifique a ligação e recarregue a página.
        </div>
      )}

      {/* Indicadores principais */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard
          label="Saldo disponível"
          icon={<Wallet />}
          iconClass="bg-neutral-100 text-neutral-700"
          value={formatMoney(healthScore?.current_balance || 0)}
          footer={
            <span className={`flex items-center gap-1 ${balanceTrend >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {balanceTrend >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
              {balanceTrend >= 0 ? '+' : ''}{balanceTrend}% vs. mês anterior
            </span>
          }
        />

        {/* 99 é o valor-sentinela do servidor para "sem gastos": não há fim de
            caixa para calcular, e "99 meses" seria uma previsão falsa. */}
        <KpiCard
          label="Autonomia de caixa"
          icon={<Clock />}
          iconClass="bg-emerald-50 text-emerald-600"
          value={
            healthScore == null ? '—'
              : (healthScore.runway_months ?? 0) >= 99 ? 'Sem gastos'
              : `${healthScore.runway_months} meses`
          }
          footer={
            <span className="text-neutral-500 font-medium truncate">
              {burnRate ? `Gasto médio: ${formatMoney(burnRate)}/mês` : 'Cobertura segura'}
            </span>
          }
        />

        <KpiCard
          label="Margem"
          icon={<Activity />}
          iconClass="bg-neutral-100 text-neutral-700"
          value={`${margin}%`}
          footer={
            <span className={`flex items-center gap-1 ${margin > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {margin > 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
              Tempo real
            </span>
          }
        />

        <KpiCard
          label="Resultado do mês"
          icon={<TrendingUp />}
          iconClass="bg-neutral-100 text-neutral-700"
          value={`${monthlyResult >= 0 ? '+' : ''}${formatMoney(monthlyResult)}`}
          valueClass={monthlyResult >= 0 ? 'text-emerald-600' : 'text-rose-600'}
          footer={
            <span className={monthlyResult >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
              {monthlyResult >= 0 ? 'Lucro' : 'Prejuízo'}
            </span>
          }
        />

        <KpiCard
          label="A receber (30d)"
          icon={<TrendingUp />}
          iconClass="bg-emerald-50 text-emerald-600"
          value={formatMoney(healthScore?.upcoming_receivables || 0)}
          footer={<span className="text-emerald-600">Entrada pendente</span>}
        />

        <KpiCard
          label="A pagar (30d)"
          icon={<TrendingDown />}
          iconClass="bg-rose-50 text-rose-600"
          value={formatMoney(healthScore?.upcoming_payables || 0)}
          footer={<span className="text-rose-600">Saída pendente</span>}
        />
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 flex-1 min-h-0">

        {/* Fluxo financeiro (2 colunas) */}
        <Card className="lg:col-span-2 p-4 flex flex-col space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-bold text-sm text-neutral-900">Fluxo financeiro (últimos 6 meses)</h2>
              <p className="text-xs text-neutral-500">Comparativo de entradas, saídas e resultado acumulado</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-semibold shrink-0">
              <span className="flex items-center gap-1 text-emerald-600">● Entradas</span>
              <span className="flex items-center gap-1 text-rose-500">● Saídas</span>
            </div>
          </div>

          <div className="flex-1 min-h-0 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorEntradas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorSaidas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F5" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#737373' }} />
                <YAxis tick={{ fontSize: 11, fill: '#737373' }} />
                <Tooltip formatter={(value) => formatMoney(Number(value))} />
                <Area type="monotone" dataKey="Entradas" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorEntradas)" />
                <Area type="monotone" dataKey="Saídas" stroke="#EF4444" strokeWidth={2} fillOpacity={1} fill="url(#colorSaidas)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Despesas por categoria (1 coluna) */}
        <Card className="p-4 flex flex-col space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm text-neutral-900">Despesas por categoria</h2>
            <PieIcon className="size-4 text-neutral-400" aria-hidden="true" />
          </div>

          <div className="flex-1 min-h-0 w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(val) => `${val}%`} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-1 shrink-0">
            {pieData.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs text-neutral-600 font-medium">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span>{item.name}</span>
                </div>
                <span className="font-bold text-neutral-800 tabular-nums">{item.value}%</span>
              </div>
            ))}
          </div>
        </Card>

      </div>

      {/* Últimos lançamentos */}
      <Card className="shrink-0 overflow-hidden">
        <CardHeader
          title="Últimos lançamentos"
          subtitle="Lidos pela IA e lançados à mão"
          actions={
            <Link
              href="/financial/cash-flow"
              className="inline-flex items-center gap-1 text-xs text-emerald-700 font-bold hover:underline"
            >
              Ver fluxo completo <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          }
        />

        {recent.length === 0 ? (
          <EmptyState
            title="Ainda não há lançamentos"
            description="Os documentos aprovados e os lançamentos manuais aparecem aqui."
            className="py-6"
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Data</Th>
                <Th>Descrição</Th>
                <Th className="hidden sm:table-cell">Entidade</Th>
                <Th className="hidden md:table-cell">Categoria</Th>
                <Th numeric>Valor</Th>
                <Th>Estado</Th>
                <Th align="right" className="hidden lg:table-cell">Origem</Th>
              </tr>
            </THead>
            <TBody>
              {recent.map((trx) => (
                <Tr key={trx.id}>
                  <Td className="text-neutral-500 whitespace-nowrap">{formatDate(trx.date)}</Td>
                  <Td className="font-semibold">{trx.description}</Td>
                  <Td className="text-neutral-600 hidden sm:table-cell">{trx.entity_name}</Td>
                  <Td className="text-neutral-600 hidden md:table-cell">{trx.category_name}</Td>
                  <Td numeric className={`font-bold ${trx.type === 'income' ? 'text-emerald-600' : 'text-neutral-900'}`}>
                    {trx.type === 'income' ? '+' : '-'}{formatMoney(trx.amount)}
                  </Td>
                  <Td>
                    <Badge tone={STATUS_TONE[trx.status] ?? 'warning'}>{documentStatusLabel(trx.status)}</Badge>
                  </Td>
                  <Td align="right" className="text-neutral-500 hidden lg:table-cell">
                    {trx.source === 'ai' ? (
                      <span className="flex items-center justify-end gap-1"><Bot className="size-3.5" aria-hidden="true" /> IA</span>
                    ) : (
                      <span className="flex items-center justify-end gap-1"><User className="size-3.5" aria-hidden="true" /> Manual</span>
                    )}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

    </div>
  );
}
