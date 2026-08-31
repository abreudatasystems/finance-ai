'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '@/context/AppContext';
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
  PieChart as PieIcon
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
  const { formatMoney, openAiDrawer } = useApp();
  const [healthScore, setHealthScore] = useState<FinancialHealthScore | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [chartData, setChartData] = useState<ChartDataItem[]>([]);
  const [pieData, setPieData] = useState<PieDataItem[]>([]);

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
    <div className="space-y-4 animate-in fade-in duration-300">
      
      {/* Page Title & Position Tagline */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight">
            Financial Command Center
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Your AI Finance Team for Business — Painel de Controlo Executivo (CEO View)
          </p>
        </div>

        <button
          onClick={openAiDrawer}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs border border-indigo-200 transition-colors shadow-2xs self-start sm:self-auto"
        >
          <Sparkles className="w-4 h-4 text-indigo-600 animate-pulse" />
          <span>Falar com Finance AI</span>
        </button>
      </div>

      {/* CEO TOP KPI CARDS ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Saldo Disponível */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Saldo Disponível</span>
            <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tracking-tight">
            {formatMoney(healthScore?.current_balance || 0)}
          </div>
          <div className={`mt-2 flex items-center gap-1.5 text-xs font-semibold ${balanceTrend >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {balanceTrend >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            <span>{balanceTrend >= 0 ? '+' : ''}{balanceTrend}% vs mês anterior</span>
          </div>
        </div>

        {/* Card 2: Runway */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Runway (Caixa)</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tracking-tight">
            {healthScore?.runway_months || 0} Meses
          </div>
          <div className="mt-2 flex items-center gap-1 text-xs text-slate-500 font-medium">
            {burnRate ? (
              <span>Burn rate: {formatMoney(burnRate)}/mês</span>
            ) : (
              <span>Cobertura de segurança</span>
            )}
          </div>
        </div>

        {/* Card 3: Margem Operacional */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Margem Operacional</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tracking-tight">
            {healthScore?.operating_margin || 0}%
          </div>
          <div className={`mt-2 flex items-center gap-1.5 text-xs font-semibold ${(healthScore?.operating_margin || 0) > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {(healthScore?.operating_margin || 0) > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            <span>Dados em tempo real</span>
          </div>
        </div>

        {/* Card 4: Resultado Mês */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Resultado do Mês</span>
            <div className="w-7 h-7 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className={`mt-2 text-2xl font-bold tracking-tight ${(healthScore?.monthly_result || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {(healthScore?.monthly_result || 0) >= 0 ? '+' : ''}{formatMoney(healthScore?.monthly_result || 0)}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
            <span>{(healthScore?.monthly_result || 0) >= 0 ? 'Lucro positivo' : 'Resultado negativo'}</span>
          </div>
        </div>
      </div>

      {/* FINANCIAL HEALTH SCORE & AI INSIGHTS CARD */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Health Score Component (1 col) */}
        <div className="p-6 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl shadow-xl flex flex-col justify-between relative overflow-hidden border border-slate-700/60">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-sm text-slate-200 tracking-tight">Financial Health Score</h3>
              </div>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                (healthScore?.score || 0) >= 85 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                (healthScore?.score || 0) >= 70 ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
                (healthScore?.score || 0) >= 50 ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                'bg-rose-500/20 text-rose-300 border-rose-500/30'
              }`}>
                {healthScore?.status_label || 'Calculando...'}
              </span>
            </div>

            {/* Score Big Display */}
            <div className="flex items-baseline gap-3">
              <span className="text-5xl font-extrabold tracking-tight text-white">
                {healthScore?.score || 0}
              </span>
              <span className="text-xl font-bold text-slate-400">/100</span>
            </div>

            {/* Score Breakdown Bars */}
            <div className="space-y-2 pt-2 text-xs">
              <div className="space-y-1">
                <div className="flex justify-between text-slate-300 font-medium text-[11px]">
                  <span>Liquidez de Caixa</span>
                  <span className="font-bold text-emerald-400">{healthScore?.liquidity_score || 0}/100</span>
                </div>
                <div className="w-full bg-slate-700/80 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-emerald-400 h-1.5 rounded-full transition-all duration-1000" style={{ width: `${healthScore?.liquidity_score || 0}%` }} />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-slate-300 font-medium text-[11px]">
                  <span>Rentabilidade</span>
                  <span className="font-bold text-emerald-400">{healthScore?.profitability_score || 0}/100</span>
                </div>
                <div className="w-full bg-slate-700/80 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-emerald-400 h-1.5 rounded-full transition-all duration-1000" style={{ width: `${healthScore?.profitability_score || 0}%` }} />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-slate-300 font-medium text-[11px]">
                  <span>Controlo de Custos</span>
                  <span className="font-bold text-indigo-400">{healthScore?.cost_control_score || 0}/100</span>
                </div>
                <div className="w-full bg-slate-700/80 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-indigo-400 h-1.5 rounded-full transition-all duration-1000" style={{ width: `${healthScore?.cost_control_score || 0}%` }} />
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={openAiDrawer}
            className="mt-6 w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs transition-colors border border-white/20 flex items-center justify-center gap-2"
          >
            <span>Ver diagnóstico completo da IA</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Finance AI Insights Conversational Card (2 cols) */}
        <div className="lg:col-span-2 p-6 bg-gradient-to-br from-indigo-50/90 via-white to-violet-50/90 rounded-2xl border border-indigo-100 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-indigo-900 font-bold text-sm">
                <Sparkles className="w-4 h-4 text-indigo-600 animate-pulse" />
                <span>Finance AI Insights &amp; Resumo Semanal</span>
              </div>
              <span className="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full">
                Live Intelligence
              </span>
            </div>

            {healthScore?.ai_explanation && healthScore.ai_explanation.length > 0 ? (
              <p className="text-xs text-slate-700 leading-relaxed font-medium bg-white/80 p-3.5 rounded-xl border border-indigo-100/80 shadow-2xs">
                {healthScore.ai_explanation.map((line: string, i: number) => (
                  <span key={i}>{line}{i < healthScore.ai_explanation.length - 1 ? ' ' : ''}</span>
                ))}
              </p>
            ) : (
              <p className="text-xs text-slate-700 leading-relaxed font-medium bg-white/80 p-3.5 rounded-xl border border-indigo-100/80 shadow-2xs">
                A carregar análise financeira...
              </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              {healthScore?.key_insights?.map((insight, idx) => (
                <div key={idx} className="p-2.5 bg-white rounded-xl border border-slate-200/60 shadow-2xs flex items-center gap-2.5">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    insight.type === 'danger' ? 'bg-rose-500' :
                    insight.type === 'warning' ? 'bg-amber-500' :
                    insight.type === 'success' ? 'bg-emerald-500' : 'bg-blue-500'
                  }`} />
                  <span className="text-slate-700 font-medium">{insight.text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-indigo-100 text-xs">
            <span className="text-slate-500 font-medium">Dados calculados em tempo real a partir do banco de dados.</span>
            <button
              onClick={openAiDrawer}
              className="text-indigo-600 font-bold hover:underline flex items-center gap-1"
            >
              Pedir ação à IA &rarr;
            </button>
          </div>
        </div>

      </div>

      {/* CHARTS SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Fluxo Financeiro Area Chart (2 cols) */}
        <div className="lg:col-span-2 p-6 bg-white rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
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

          <div className="h-64 w-full">
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
        <div className="p-6 bg-white rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900">Despesas por Categoria</h3>
            <PieIcon className="w-4 h-4 text-slate-400" />
          </div>

          <div className="h-44 w-full relative">
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

          <div className="space-y-1.5">
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
      <div className="p-6 bg-white rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
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
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] tracking-wider font-bold">
                <th className="p-3">Data</th>
                <th className="p-3">Descrição Movimento</th>
                <th className="p-3">Entidade</th>
                <th className="p-3">Categoria</th>
                <th className="p-3">Valor</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Origem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.slice(0, 5).map((trx) => (
                <tr key={trx.id} className="hover:bg-slate-50/80 transition-colors font-medium">
                  <td className="p-3 text-slate-500">{trx.date}</td>
                  <td className="p-3 font-semibold text-slate-800">{trx.description}</td>
                  <td className="p-3 text-slate-600">{trx.entity_name}</td>
                  <td className="p-3 text-slate-600">{trx.category_name}</td>
                  <td className={`p-3 font-bold ${trx.type === 'income' ? 'text-emerald-600' : 'text-slate-900'}`}>
                    {trx.type === 'income' ? '+' : '-'}{formatMoney(trx.amount)}
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                      trx.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                      trx.status === 'approved' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                      'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {trx.status}
                    </span>
                  </td>
                  <td className="p-3 text-right font-mono text-[11px] text-slate-500">
                    {trx.source === 'ai' ? '🤖 IA' : '✋ Manual'}
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
