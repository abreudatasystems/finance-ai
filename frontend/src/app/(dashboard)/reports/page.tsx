'use client';

import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { BarChart3, Download, FileSpreadsheet, FileText, Filter, Printer } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

export default function ReportsPage() {
  const { formatMoney } = useApp();

  const reportData = [
    { month: 'Jan', Receitas: 24000, Despesas: 15000 },
    { month: 'Fev', Receitas: 26000, Despesas: 14500 },
    { month: 'Mar', Receitas: 22000, Despesas: 14000 },
    { month: 'Abr', Receitas: 25000, Despesas: 15500 },
    { month: 'Mai', Receitas: 24000, Despesas: 14800 },
    { month: 'Jun', Receitas: 27500, Despesas: 16000 },
    { month: 'Jul', Receitas: 26000, Despesas: 14200 },
    { month: 'Ago', Receitas: 28500, Despesas: 15320 }
  ];

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight">
            Relatórios Financeiros &amp; Exportação
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Análise consolidada do desempenho financeiro, comparativo de receitas e despesas
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => alert('Exportando relatório em PDF...')}
            className="px-3.5 py-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-bold text-slate-700 shadow-2xs flex items-center gap-1.5 transition-colors"
          >
            <FileText className="w-4 h-4 text-rose-500" />
            <span>Exportar PDF</span>
          </button>

          <button
            onClick={() => alert('Exportando relatório em Excel...')}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Exportar Excel</span>
          </button>
        </div>
      </div>

      {/* Chart Card */}
      <div className="p-6 bg-white rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-900">Demonstrativo Mensal (Receitas vs Despesas)</h3>
          <span className="text-xs text-slate-400 font-medium">Ano Fiscal 2026</span>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={reportData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748B' }} />
              <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
              <Tooltip formatter={(val: any) => formatMoney(Number(val))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Receitas" fill="#10B981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Despesas" fill="#EF4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Summary KPI grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="p-5 bg-white rounded-2xl border border-slate-200/80 shadow-xs space-y-1">
          <span className="text-slate-400 font-medium">Total Receitas Acumuladas</span>
          <div className="text-xl font-black text-emerald-600">{formatMoney(205000)}</div>
        </div>

        <div className="p-5 bg-white rounded-2xl border border-slate-200/80 shadow-xs space-y-1">
          <span className="text-slate-400 font-medium">Total Despesas Acumuladas</span>
          <div className="text-xl font-black text-rose-600">{formatMoney(119320)}</div>
        </div>

        <div className="p-5 bg-white rounded-2xl border border-slate-200/80 shadow-xs space-y-1">
          <span className="text-slate-400 font-medium">Resultado Acumulado</span>
          <div className="text-xl font-black text-indigo-600">+{formatMoney(85680)}</div>
        </div>
      </div>

    </div>
  );
}
