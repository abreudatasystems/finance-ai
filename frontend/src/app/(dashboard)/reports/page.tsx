'use client';

import React, { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { FileSpreadsheet, Download, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { fetchDashboardSummary, fetchVatSummary } from '@/services/data';
import { apiFetch } from '@/services/api';
import {
  Badge, Button, Card, CardHeader, CardBody, Select,
  Table, THead, TBody, Th, Tr, Td,
} from '@/components/ui';

/* A forma que /fiscal/vat-summary devolve. Lia-se `iva_total` e
   `total_bruto` por linha, que a API não manda: a tabela mostrava "NaN €". */
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

interface VatSummary {
  period: string;
  period_label?: string;
  iva_liquidado: VatSide;
  iva_dedutivel: VatSide;
  apuramento: { saldo: number; a_entregar: number; a_recuperar: number; situacao: string };
}

/* Os anos oferecidos acompanham o calendário em vez de ficarem presos em
   2025/2026. */
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map(String);

export default function ReportsPage() {
  const { formatMoney, setPageHeader } = useApp();
  const [reportData, setReportData] = useState<{ month: string; Receitas: number; Despesas: number }[]>([]);
  const [vatSummary, setVatSummary] = useState<VatSummary | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [year, setYear] = useState(String(CURRENT_YEAR));

  useEffect(() => {
    // Trocar de ano depressa podia deixar no ecrã a resposta do ano anterior
    // com o rótulo do novo; só a resposta do pedido mais recente conta.
    let alive = true;
    async function loadData() {
      const [summary, vat] = await Promise.all([
        fetchDashboardSummary(year),
        fetchVatSummary(year),
      ]);
      if (!alive) return;
      if (summary && summary.length > 0) {
        setReportData((summary as unknown as Array<{ month: string; Entradas: number; Saídas: number }>).map((s) => ({
          month: s.month,
          Receitas: s.Entradas,
          Despesas: s.Saídas,
        })));
      } else {
        setReportData([]);
      }

      const v = vat as unknown as VatSummary;
      setVatSummary(v && v.iva_liquidado ? v : null);
    }
    loadData();
    return () => { alive = false; };
    // O ano é uma dependência: sem ele aqui, escolher 2025 mudava o rótulo e o
    // nome do ficheiro, e o gráfico continuava a mostrar o ano corrente.
  }, [year]);

  useEffect(() => {
    setPageHeader('Relatórios', 'Análise consolidada do desempenho financeiro, IVA e exportação SAF-T (PT)');
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
          <Button variant="secondary" icon={<FileSpreadsheet />} onClick={handleExportCsv}>
            Exportar CSV / Excel
          </Button>
          <Button icon={<Download />} onClick={handleSaftExport} loading={isExporting}>
            SAF-T (PT) XML
          </Button>
        </div>
      </div>

      {/* Chart Card */}
      <Card>
        <CardHeader
          title="Demonstrativo Mensal (Receitas vs Despesas)"
          actions={
            <Select
              aria-label="Ano fiscal"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="w-auto h-8 text-xs"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>Ano Fiscal {y}</option>
              ))}
            </Select>
          }
        />
        <CardBody>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={reportData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F5" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#737373' }} />
                <YAxis tick={{ fontSize: 11, fill: '#737373' }} />
                <Tooltip formatter={(val) => formatMoney(Number(val))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Receitas" fill="#10B981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Despesas" fill="#F43F5E" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardBody>
      </Card>

      {/* Summary KPI grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <Card className="p-5 space-y-1">
          <span className="text-neutral-500 font-medium">Total Receitas Acumuladas</span>
          <div className="text-xl font-black text-emerald-600 tabular-nums">{formatMoney(totalReceitas)}</div>
        </Card>

        <Card className="p-5 space-y-1">
          <span className="text-neutral-500 font-medium">Total Despesas Acumuladas</span>
          <div className="text-xl font-black text-rose-600 tabular-nums">{formatMoney(totalDespesas)}</div>
        </Card>

        <Card className="p-5 space-y-1">
          <span className="text-neutral-500 font-medium">Resultado Acumulado</span>
          <div className={`text-xl font-black tabular-nums ${totalReceitas - totalDespesas >= 0 ? 'text-neutral-900' : 'text-rose-600'}`}>
            {totalReceitas - totalDespesas >= 0 ? '+' : ''}{formatMoney(totalReceitas - totalDespesas)}
          </div>
        </Card>
      </div>

      {/* IVA Summary Section — vendas e compras separadas: somar IVA
          liquidado com IVA dedutível dava um número que não quer dizer nada. */}
      {vatSummary && (vatSummary.iva_liquidado.breakdown.length > 0 || vatSummary.iva_dedutivel.breakdown.length > 0) && (
        <Card className="overflow-hidden">
          <CardHeader
            title="Resumo de IVA"
            subtitle={`Período: ${vatSummary.period_label || vatSummary.period}`}
            actions={
              <Badge>
                <MapPin className="w-3 h-3" aria-hidden="true" /> Portugal
              </Badge>
            }
          />

          <Table>
            <THead>
              <tr>
                <Th>Sentido</Th>
                <Th>Taxa IVA</Th>
                <Th numeric>Base Tributável</Th>
                <Th numeric>IVA</Th>
                <Th numeric>Total</Th>
                <Th numeric>Nº Documentos</Th>
              </tr>
            </THead>
            <TBody>
              {([
                ['Liquidado (vendas)', vatSummary.iva_liquidado],
                ['Dedutível (compras)', vatSummary.iva_dedutivel],
              ] as const).flatMap(([side, data]) => data.breakdown.map((item, idx) => (
                <Tr key={`${side}-${idx}`} className="font-medium">
                  <Td className="text-neutral-500">{side}</Td>
                  <Td className="font-semibold text-neutral-800">{item.label}</Td>
                  <Td numeric className="text-neutral-700">{formatMoney(item.base_tributavel)}</Td>
                  <Td numeric className="text-neutral-900 font-bold">{formatMoney(item.iva)}</Td>
                  <Td numeric className="text-neutral-700">{formatMoney(item.total)}</Td>
                  <Td numeric className="text-neutral-500">{item.num_documentos}</Td>
                </Tr>
              )))}
            </TBody>
            <tfoot>
              <tr className="bg-neutral-50 border-t-2 border-neutral-300 font-bold text-neutral-900">
                <Td colSpan={3}>
                  {vatSummary.apuramento.a_recuperar > 0 ? 'IVA a recuperar' : 'IVA a entregar ao Estado'}
                </Td>
                <Td numeric className={vatSummary.apuramento.a_recuperar > 0 ? 'text-emerald-700' : 'text-neutral-900'}>
                  {formatMoney(vatSummary.apuramento.a_recuperar > 0 ? vatSummary.apuramento.a_recuperar : vatSummary.apuramento.a_entregar)}
                </Td>
                <Td colSpan={2} />
              </tr>
            </tfoot>
          </Table>
        </Card>
      )}

    </div>
  );
}
