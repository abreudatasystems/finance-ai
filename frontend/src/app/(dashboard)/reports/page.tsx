'use client';

import React, { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { FileSpreadsheet, Download, Loader2, MapPin } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { fetchDashboardSummary, fetchVatSummary } from '@/services/data';
import { apiFetch } from '@/services/api';

interface VatBreakdownItem {
  vat_rate: number | null;
  label: string;
  base_tributavel: number;
  iva_total: number;
  total_bruto: number;
  num_documentos: number;
}

interface VatSummary {
  period: string;
  breakdown: VatBreakdownItem[];
  totals: {
    base_tributavel: number;
    iva_total: number;
    total_bruto: number;
    num_documentos: number;
  };
}

export default function ReportsPage() {
  const { formatMoney, setPageHeader } = useApp();
  const [reportData, setReportData] = useState<{ month: string; Receitas: number; Despesas: number }[]>([]);
  const [vatSummary, setVatSummary] = useState<VatSummary | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    async function loadData() {
      const summary = await fetchDashboardSummary();
      if (summary && summary.length > 0) {
        setReportData((summary as unknown as Array<{ month: string; Entradas: number; Saídas: number }>).map((s) => ({
          month: s.month,
          Receitas: s.Entradas,
          Despesas: s.Saídas,
        })));
      } else {
        setReportData([]);
      }

      const vat = await fetchVatSummary();
      if (vat && vat.breakdown) {
        setVatSummary(vat as unknown as VatSummary);
      }
    }
    loadData();
  }, []);

  useEffect(() => {
    setPageHeader('Relatórios Financeiros & Exportação', 'Análise consolidada do desempenho financeiro, IVA e exportação SAF-T (PT)');
  }, [setPageHeader]);

  const totalReceitas = reportData.reduce((sum, d) => sum + d.Receitas, 0);
  const totalDespesas = reportData.reduce((sum, d) => sum + d.Despesas, 0);

  const handleSaftExport = async () => {
    setIsExporting(true);
    try {
      const res = await apiFetch('/fiscal/saft-export');
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'SAFT-PT.xml';
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // fallback
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCsv = () => {
    let csv = 'Mês,Receitas,Despesas,Resultado\n';
    reportData.forEach(r => {
      csv += `${r.month},${r.Receitas},${r.Despesas},${r.Receitas - r.Despesas}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-financeiro-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      
      {/* Header Actions */}
      <div className="flex justify-end pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Exportar CSV / Excel</span>
          </button>

          <button
            onClick={handleSaftExport}
            disabled={isExporting}
            className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span>SAF-T (PT) XML</span>
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
              <Tooltip formatter={(val) => formatMoney(Number(val))} />
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
          <div className="text-xl font-black text-emerald-600">{formatMoney(totalReceitas)}</div>
        </div>

        <div className="p-5 bg-white rounded-2xl border border-slate-200/80 shadow-xs space-y-1">
          <span className="text-slate-400 font-medium">Total Despesas Acumuladas</span>
          <div className="text-xl font-black text-rose-600">{formatMoney(totalDespesas)}</div>
        </div>

        <div className="p-5 bg-white rounded-2xl border border-slate-200/80 shadow-xs space-y-1">
          <span className="text-slate-400 font-medium">Resultado Acumulado</span>
          <div className={`text-xl font-black ${totalReceitas - totalDespesas >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
            {totalReceitas - totalDespesas >= 0 ? '+' : ''}{formatMoney(totalReceitas - totalDespesas)}
          </div>
        </div>
      </div>

      {/* IVA Summary Section */}
      {vatSummary && vatSummary.breakdown.length > 0 && (
        <div className="p-6 bg-white rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Resumo de IVA</h3>
              <p className="text-xs text-slate-500">Período: {vatSummary.period}</p>
            </div>
            <span className="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Portugal
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] tracking-wider font-bold">
                  <th className="p-3">Taxa IVA</th>
                  <th className="p-3 text-right">Base Tributável</th>
                  <th className="p-3 text-right">IVA Liquidado</th>
                  <th className="p-3 text-right">Total Bruto</th>
                  <th className="p-3 text-right">Nº Documentos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vatSummary.breakdown.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition-colors font-medium">
                    <td className="p-3 font-semibold text-slate-800">{item.label}</td>
                    <td className="p-3 text-right text-slate-700">{formatMoney(item.base_tributavel)}</td>
                    <td className="p-3 text-right text-indigo-600 font-bold">{formatMoney(item.iva_total)}</td>
                    <td className="p-3 text-right text-slate-700">{formatMoney(item.total_bruto)}</td>
                    <td className="p-3 text-right text-slate-500">{item.num_documentos}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-300 font-bold text-slate-900">
                  <td className="p-3">TOTAIS</td>
                  <td className="p-3 text-right">{formatMoney(vatSummary.totals.base_tributavel)}</td>
                  <td className="p-3 text-right text-indigo-600">{formatMoney(vatSummary.totals.iva_total)}</td>
                  <td className="p-3 text-right">{formatMoney(vatSummary.totals.total_bruto)}</td>
                  <td className="p-3 text-right">{vatSummary.totals.num_documentos}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
