'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '@/context/AppContext';
import { AlertsPanel } from '@/components/alerts/AlertsPanel';
import { fetchHealthScore, fetchTransactions, fetchFinancialEvents, fetchDashboardSummary, fetchExpensesByCategory } from '@/services/data';
import { FinancialHealthScore, Transaction } from '@/types';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  ShieldCheck,
  Sparkles,
  ChevronRight,
  Activity,
  DollarSign,
  PieChart as PieIcon,
  Bot,
  User
} from 'lucide-react';
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

export default function DashboardPage() {
  const { formatMoney, openAiDrawer, setPageHeader } = useApp();
  const [healthScore, setHealthScore] = useState<FinancialHealthScore | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [chartData, setChartData] = useState<ChartDataItem[]>([]);
  const [pieData, setPieData] = useState<PieDataItem[]>([]);

  useEffect(() => {
    setPageHeader('Financial Command Center', 'Painel de Controlo Executivo (CEO View)');
  }, [setPageHeader]);

  useEffect(() => {
    async function loadData() {
      const hs = await fetchHealthScore();
      setHealthScore(hs);
      const trxs = await fetchTransactions();
      setTransactions(trxs);
      await fetchFinancialEvents();

      // Real chart data from API
      const summary = await fetchDashboardSummary<ChartDataItem>();
      if (summary && summary.length > 0) {
        setChartData(summary);
      } else {
        setChartData([
          { month: 'Mar', Entradas: 22000, Saídas: 14000, Resultado: 8000 },
          { month: 'Abr', Entradas: 25000, Saídas: 15500, Resultado: 9500 },
          { month: 'Mai', Entradas: 24000, Saídas: 14800, Resultado: 9200 },
          { month: 'Jun', Entradas: 27500, Saídas: 16000, Resultado: 11500 },
          { month: 'Jul', Entradas: 26000, Saídas: 14200, Resultado: 11800 },
          { month: 'Ago', Entradas: 28500, Saídas: 15320, Resultado: 13180 }
        ]);
      }

      const categories = await fetchExpensesByCategory<PieDataItem>();
      if (categories && categories.length > 0) {
        setPieData(categories);
      } else {
        setPieData([
          { name: 'Marketing', value: 35, color: '#6366F1' },
          { name: 'Software & Cloud', value: 25, color: '#3B82F6' },
          { name: 'Pessoal & Salários', value: 20, color: '#10B981' },
          { name: 'Instalações', value: 12, color: '#F59E0B' },
          { name: 'Outros', value: 8, color: '#94A3B8' }
        ]);
      }
    }
    loadData();
  }, []);

  // Derived trend from healthScore
  const balanceTrend = (healthScore as FinancialHealthScore & { trend?: number })?.trend ?? 0;
  const burnRate = (healthScore as FinancialHealthScore & { burn_rate?: number })?.burn_rate;

  return (
    <div className="flex flex-col h-[calc(100vh-104px)] space-y-3 overflow-hidden animate-in fade-in duration-300">
      
      {/* O que precisa de atenção, antes de qualquer número */}
      <div className="shrink-0">
        <AlertsPanel limit={2} />
      </div>

      {/* CEO TOP KPI CARDS ROW */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {/* Card 1: Saldo Disponível */}
        <div className="p-4 bg-white rounded-xl border border-slate-200/80 shadow-xs hover:shadow-sm transition-shadow relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase tracking-wider">
            <span>Saldo Disponível</span>
            <div className="w-6 h-6 rounded-md bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <DollarSign className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2 text-lg font-bold text-slate-900 tracking-tight">
            {formatMoney(healthScore?.current_balance || 0)}
          </div>
          <div className={`mt-1 flex items-center gap-1 text-[10px] font-semibold ${balanceTrend >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {balanceTrend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            <span>{balanceTrend >= 0 ? '+' : ''}{balanceTrend}% ms/ms</span>
          </div>
        </div>

        {/* Card 2: Runway */}
        <div className="p-4 bg-white rounded-xl border border-slate-200/80 shadow-xs hover:shadow-sm transition-shadow relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase tracking-wider">
            <span>Runway (Caixa)</span>
            <div className="w-6 h-6 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2 text-lg font-bold text-slate-900 tracking-tight">
            {healthScore?.runway_months || 0} Meses
          </div>
          <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-500 font-medium truncate">
            {burnRate ? <span>Burn: {formatMoney(burnRate)}/m</span> : <span>Cobertura Segura</span>}
          </div>
        </div>

        {/* Card 3: Margem Operacional */}
        <div className="p-4 bg-white rounded-xl border border-slate-200/80 shadow-xs hover:shadow-sm transition-shadow relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase tracking-wider">
            <span>Margem</span>
            <div className="w-6 h-6 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center">
              <Activity className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2 text-lg font-bold text-slate-900 tracking-tight">
            {healthScore?.operating_margin || 0}%
          </div>
          <div className={`mt-1 flex items-center gap-1 text-[10px] font-semibold ${(healthScore?.operating_margin || 0) > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {(healthScore?.operating_margin || 0) > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            <span>Tempo real</span>
          </div>
        </div>

        {/* Card 4: Resultado Mês */}
        <div className="p-4 bg-white rounded-xl border border-slate-200/80 shadow-xs hover:shadow-sm transition-shadow relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase tracking-wider">
            <span>Resultado Mês</span>
            <div className="w-6 h-6 rounded-md bg-violet-50 text-violet-600 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className={`mt-2 text-lg font-bold tracking-tight ${(healthScore?.monthly_result || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {(healthScore?.monthly_result || 0) >= 0 ? '+' : ''}{formatMoney(healthScore?.monthly_result || 0)}
          </div>
          <div className={`mt-1 flex items-center gap-1 text-[10px] font-semibold ${(healthScore?.monthly_result || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            <span>{(healthScore?.monthly_result || 0) >= 0 ? 'Lucro' : 'Prejuízo'}</span>
          </div>
        </div>

        {/* Card 5: Contas a Receber (30d) */}
        <div className="p-4 bg-white rounded-xl border border-slate-200/80 shadow-xs hover:shadow-sm transition-shadow relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase tracking-wider">
            <span>A Receber (30d)</span>
            <div className="w-6 h-6 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2 text-lg font-bold text-slate-900 tracking-tight">
            {formatMoney((healthScore as any)?.upcoming_receivables || 0)}
          </div>
          <div className="mt-1 flex items-center gap-1 text-[10px] text-emerald-600 font-semibold">
            <span>Entrada pendente</span>
          </div>
        </div>

        {/* Card 6: Contas a Pagar (30d) */}
        <div className="p-4 bg-white rounded-xl border border-slate-200/80 shadow-xs hover:shadow-sm transition-shadow relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase tracking-wider">
            <span>A Pagar (30d)</span>
            <div className="w-6 h-6 rounded-md bg-rose-50 text-rose-600 flex items-center justify-center">
              <TrendingDown className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2 text-lg font-bold text-slate-900 tracking-tight">
            {formatMoney((healthScore as any)?.upcoming_payables || 0)}
          </div>
          <div className="mt-1 flex items-center gap-1 text-[10px] text-rose-600 font-semibold">
            <span>Saída pendente</span>
          </div>
        </div>
      </div>



      {/* CHARTS SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 flex-1 min-h-0">
        
        {/* Fluxo Financeiro Area Chart (2 cols) */}
        <div className="lg:col-span-2 p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Fluxo Financeiro (Últimos 6 Meses)</h3>
              <p className="text-xs text-slate-500">Comparativo de Entradas, Saídas e Resultado Acumulado</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-semibold">
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
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                <Tooltip formatter={(value) => formatMoney(Number(value))} />
                <Area type="monotone" dataKey="Entradas" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorEntradas)" />
                <Area type="monotone" dataKey="Saídas" stroke="#EF4444" strokeWidth={2} fillOpacity={1} fill="url(#colorSaidas)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Despesas por Categoria Donut (1 col) */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900">Despesas por Categoria</h3>
            <PieIcon className="w-4 h-4 text-slate-400" />
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
              <div key={idx} className="flex items-center justify-between text-xs text-slate-600 font-medium">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span>{item.name}</span>
                </div>
                <span className="font-bold text-slate-800">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* RECENT TRANSACTIONS TABLE */}
      <div className="shrink-0 p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-slate-900">Últimos Lançamentos Financeiros</h3>
            <p className="text-xs text-slate-500">Sincronizado automaticamente pela IA e lançamentos manuais</p>
          </div>
          <Link href="/financial/cash-flow" className="text-xs text-indigo-600 font-bold hover:underline">
            Ver Fluxo Completo &rarr;
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 z-10 shadow-sm">
              <tr className="border-b border-slate-200 text-slate-500 uppercase text-[10px] tracking-wider font-bold">
                <th className="p-3">Data</th>
                <th className="p-3">Descrição Movimento</th>
                <th className="p-3 hidden sm:table-cell">Entidade</th>
                <th className="p-3 hidden md:table-cell">Categoria</th>
                <th className="p-3">Valor</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right hidden lg:table-cell">Origem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.slice(0, 3).map((trx) => (
                <tr key={trx.id} className="hover:bg-slate-50/80 transition-colors font-medium">
                  <td className="p-3 text-slate-500">{trx.date}</td>
                  <td className="p-3 font-semibold text-slate-800">{trx.description}</td>
                  <td className="p-3 text-slate-600 hidden sm:table-cell">{trx.entity_name}</td>
                  <td className="p-3 text-slate-600 hidden md:table-cell">{trx.category_name}</td>
                  <td className={`p-3 font-bold ${trx.type === 'income' ? 'text-emerald-600' : 'text-slate-900'}`}>
                    {trx.type === 'income' ? '+' : '-'}{formatMoney(trx.amount)}
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase whitespace-nowrap ${
                      trx.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                      trx.status === 'approved' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                      'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {trx.status}
                    </span>
                  </td>
                  <td className="p-3 text-right font-mono text-[11px] text-slate-500 hidden lg:table-cell">
                    {trx.source === 'ai' ? (
                      <span className="flex items-center justify-end gap-1"><Bot className="w-3.5 h-3.5" /> IA</span>
                    ) : (
                      <span className="flex items-center justify-end gap-1"><User className="w-3.5 h-3.5" /> Manual</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
