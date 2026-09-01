'use client';

/**
 * Exportação para a contabilidade.
 *
 * What an accountant asks for at the end of a period is the movements with the
 * SNC account and the VAT split — not a dashboard. This shows the control
 * figures first (so the file can be tied to a total before it is sent) and
 * then hands over two CSVs written for Portuguese Excel.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  FileSpreadsheet, Download, Loader2, CalendarRange, AlertCircle, Check, Landmark,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { AccountingPackage, fetchAccountingPackage, downloadCsv } from './api';

/** The last few periods, in the shapes the backend accepts. */
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
    if (!out.some((o) => o.value === value)) {
      out.push({ value, label: `${q}.º trimestre de ${d.getFullYear()}` });
    }
  }
  out.push({ value: String(now.getFullYear()), label: `Ano ${now.getFullYear()}` });
  return out;
};

export const AccountingExport: React.FC = () => {
  const { formatMoney } = useApp();
  const options = periodOptions();

  const [period, setPeriod] = useState(options[0].value);
  const [data, setData] = useState<AccountingPackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const pkg = await fetchAccountingPackage(period);
    if (!pkg) setError('Não foi possível carregar o período.');
    setData(pkg);
    setLoading(false);
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const download = async (kind: 'ledger' | 'vat') => {
    setBusy(kind);
    setError(null);
    setDone(null);
    const res = await downloadCsv(kind, period);
    setBusy(null);
    if (!res.ok) { setError(res.error || 'Falhou.'); return; }
    setDone(kind === 'ledger' ? 'Razão exportado.' : 'Mapa de IVA exportado.');
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
          <h3 className="font-bold text-sm text-slate-900">Exportar para a contabilidade</h3>
        </div>
        <label className="flex items-center gap-2">
          <CalendarRange className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={period} onChange={(e) => setPeriod(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
          >
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      </div>

      {error && (
        <p className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-[11px] flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{error}
        </p>
      )}
      {done && (
        <p className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-[11px] flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5" />{done}
        </p>
      )}

      {loading ? (
        <p className="py-8 text-center text-slate-400 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> A preparar o período…
        </p>
      ) : data && (
        <>
          {/* Control figures: tie the file to a total before sending it. */}
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl border border-emerald-100 bg-emerald-50/40">
              <p className="text-[9px] uppercase font-bold text-emerald-600">Receita</p>
              <p className="font-bold text-slate-900 text-sm mt-0.5">{formatMoney(data.totais.receita_total)}</p>
              <p className="text-[10px] text-slate-600 mt-1">
                base {formatMoney(data.totais.receita_base)} · IVA {formatMoney(data.totais.receita_iva)}
              </p>
            </div>
            <div className="p-3 rounded-xl border border-rose-100 bg-rose-50/40">
              <p className="text-[9px] uppercase font-bold text-rose-600">Despesa</p>
              <p className="font-bold text-slate-900 text-sm mt-0.5">{formatMoney(data.totais.despesa_total)}</p>
              <p className="text-[10px] text-slate-600 mt-1">
                base {formatMoney(data.totais.despesa_base)} · IVA {formatMoney(data.totais.despesa_iva)}
              </p>
            </div>
            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
              <p className="text-[9px] uppercase font-bold text-slate-500 flex items-center gap-1">
                <Landmark className="w-3 h-3" /> IVA do período
              </p>
              <p className={`font-bold text-sm mt-0.5 ${data.apuramento.a_entregar > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                {formatMoney(data.apuramento.a_entregar || data.apuramento.a_recuperar)}
              </p>
              <p className="text-[10px] text-slate-600 mt-1">
                {data.apuramento.a_entregar > 0 ? 'a entregar' : data.apuramento.a_recuperar > 0 ? 'a recuperar' : 'neutro'}
                {' · '}pagar até {data.prazos.pagamento_ate}
              </p>
            </div>
          </div>

          <p className="text-[11px] text-slate-500">
            {data.periodo.label} · {data.totais.linhas} linha(s) de razão · {data.empresa.nome} ({data.empresa.nif}).
            Uma fatura detalhada por linhas é exportada linha a linha, cada uma com a sua taxa e conta SNC.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => download('ledger')} disabled={busy !== null || data.totais.linhas === 0}
              className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] flex items-center gap-1.5 disabled:opacity-50"
            >
              {busy === 'ledger' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Razão do período (CSV)
            </button>
            <button
              onClick={() => download('vat')} disabled={busy !== null}
              className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold text-[11px] hover:bg-slate-50 flex items-center gap-1.5 disabled:opacity-50"
            >
              {busy === 'vat' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Mapa de IVA (CSV)
            </button>
          </div>

          {data.totais.linhas === 0 && (
            <p className="text-[11px] text-slate-400">Não há movimentos neste período.</p>
          )}
        </>
      )}
    </div>
  );
};
