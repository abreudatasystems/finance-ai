'use client';

import React, { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { FileSpreadsheet, Download, Loader2, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { fetchDashboardSummary, fetchVatSummary } from '@/services/data';
import { apiFetch } from '@/services/api';
import { formatDate } from '@/services/format';
import Link from 'next/link';

interface VatBreakdownItem {
  vat_rate: number | null;
  label: string;
  base_tributavel: number;
  iva: number;
  total: number;
  num_documentos: number;
}

interface VatSide {
  total: number;
  base_tributavel: number;
  num_documentos: number;
  breakdown: VatBreakdownItem[];
}

/** GET /fiscal/vat-summary — the two sides of the return and what they leave. */
interface VatSummary {
  period: string;
  period_label?: string;
  iva_liquidado: VatSide;
  iva_dedutivel: VatSide;
  apuramento: { saldo: number; a_entregar: number; a_recuperar: number; situacao: string };
  prazos?: { declaracao_ate?: string; pagamento_ate?: string };
}

export default function ReportsPage() {
  const { formatMoney, setPageHeader } = useApp();
  const [reportData, setReportData] = useState<{ month: string; Receitas: number; Despesas: number }[]>([]);
  const [vatSummary, setVatSummary] = useState<VatSummary | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [year, setYear] = useState('2026');

  useEffect(() => {
    async function loadData() {
      const summary = await fetchDashboardSummary(year);
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
      if (vat && (vat as unknown as VatSummary).iva_liquidado) {
        setVatSummary(vat as unknown as VatSummary);
      }
    }
    loadData();
    // O ano é uma dependência: sem ele aqui, escolher 2025 mudava o rótulo e o
    // nome do ficheiro, e o gráfico continuava a mostrar o ano corrente.
  }, [year]);

  useEffect(() => {
    setPageHeader('Relatórios', 'Receitas e despesas do ano, resumo de IVA e exportação SAF-T');
  }, [setPageHeader]);

  const totalReceitas = reportData.reduce((sum, d) => sum + d.Receitas, 0);
  const totalDespesas = reportData.reduce((sum, d) => sum + d.Despesas, 0);

  const handleSaftExport = async () => {
    setIsExporting(true);
    try {
      const res = await apiFetch(`/fiscal/saft-export?period=${year}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `SAFT-PT-${year}.xml`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Ficheiro SAF-T exportado com sucesso.');
      } else {
        toast.error('Ocorreu um erro ao exportar o SAF-T.');
      }
    } catch {
      toast.error('Erro de comunicação ao exportar o SAF-T.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCsv = () => {
    try {
      let csv = 'Mês,Receitas,Despesas,Resultado\n';
      reportData.forEach(r => {
        csv += `${r.month},${r.Receitas},${r.Despesas},${r.Receitas - r.Despesas}\n`;
      });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-financeiro-${year}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Ficheiro CSV exportado com sucesso.');
    } catch {
      toast.error('Ocorreu um erro ao exportar o CSV.');
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      
      {/* Header Actions */}
      <div className="flex justify-end pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Exportar CSV / Excel</span>
          </button>

          <button
            onClick={handleSaftExport}
            disabled={isExporting}
            className="px-3.5 py-1.5 bg-neutral-950 hover:bg-neutral-800 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
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
          <select 
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="text-xs text-slate-600 font-medium bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-indigo-500 transition-colors cursor-pointer"
          >
            <option value="2025">Ano Fiscal 2025</option>
            <option value="2026">Ano Fiscal 2026</option>
          </select>
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

      {/* IVA: what was charged on sales, what can be deducted on purchases,
          and what that leaves to pay or to recover. */}
      {vatSummary && (vatSummary.iva_liquidado.breakdown.length > 0 || vatSummary.iva_dedutivel.breakdown.length > 0) && (
        <div className="p-6 bg-white rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Resumo de IVA</h3>
              <p className="text-xs text-slate-500">{vatSummary.period_label || vatSummary.period}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                <MapPin className="w-3 h-3" /> Portugal
              </span>
              <Link href="/fiscal/vat" className="text-xs font-semibold text-indigo-600 hover:underline whitespace-nowrap">
                Ver apuramento →
              </Link>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] tracking-wider font-bold">
                  <th className="p-3">Taxa IVA</th>
                  <th className="p-3 text-right">Base tributável</th>
                  <th className="p-3 text-right">IVA</th>
                  <th className="p-3 text-right">Total</th>
                  <th className="p-3 text-right">Nº documentos</th>
                </tr>
              </thead>
              {([
                ['Liquidado — vendas', vatSummary.iva_liquidado],
                ['Dedutível — compras', vatSummary.iva_dedutivel],
              ] as const).map(([title, side]) => (
                <tbody key={title} className="divide-y divide-slate-100">
                  <tr className="bg-slate-50/60">
                    <td colSpan={5} className="p-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">{title}</td>
                  </tr>
                  {side.breakdown.map((item) => (
                    <tr key={`${title}-${item.vat_rate}`} className="hover:bg-slate-50/80 transition-colors font-medium">
                      <td className="p-3 font-semibold text-slate-800">{item.label}</td>
                      <td className="p-3 text-right text-slate-700 tabular-nums">{formatMoney(item.base_tributavel)}</td>
                      <td className="p-3 text-right text-indigo-600 font-bold tabular-nums">{formatMoney(item.iva)}</td>
                      <td className="p-3 text-right text-slate-700 tabular-nums">{formatMoney(item.total)}</td>
                      <td className="p-3 text-right text-slate-500 tabular-nums">{item.num_documentos}</td>
                    </tr>
                  ))}
                  <tr className="font-bold text-slate-900">
                    <td className="p-3">Subtotal</td>
                    <td className="p-3 text-right tabular-nums">{formatMoney(side.base_tributavel)}</td>
                    <td className="p-3 text-right text-indigo-600 tabular-nums">{formatMoney(side.total)}</td>
                    <td className="p-3" />
                    <td className="p-3 text-right tabular-nums">{side.num_documentos}</td>
                  </tr>
                </tbody>
              ))}
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-300 font-bold text-slate-900">
                  <td className="p-3" colSpan={2}>
                    {vatSummary.apuramento.situacao === 'a_recuperar' ? 'IVA a recuperar' : 'IVA a entregar ao Estado'}
                  </td>
                  <td className="p-3 text-right text-indigo-600 tabular-nums">
                    {formatMoney(vatSummary.apuramento.situacao === 'a_recuperar'
                      ? vatSummary.apuramento.a_recuperar
                      : vatSummary.apuramento.a_entregar)}
                  </td>
                  <td className="p-3 text-right text-slate-500 font-medium" colSpan={2}>
                    {vatSummary.prazos?.pagamento_ate && `pagamento até ${formatDate(vatSummary.prazos.pagamento_ate)}`}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
