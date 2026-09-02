'use client';

/**
 * Exportar os dados da empresa.
 *
 * A product that holds a company's accounts and offers no way to take them
 * away fails on trust before it fails on features. So this says plainly what
 * comes out and what does not, shows how much there is before the download
 * starts, and puts no friction in the way: it is the company's own data.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Download, Loader2, ShieldCheck, Database } from 'lucide-react';
import { apiFetch } from '@/services/api';

interface ExportTable {
  tabela: string;
  registos: number;
}

interface ExportSummary {
  tabelas: ExportTable[];
  total_registos: number;
  total_tabelas: number;
}

export const DataExport: React.FC = () => {
  const [summary, setSummary] = useState<ExportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/companies/export/summary');
      if (res.status === 403) setForbidden(true);
      else if (res.ok) setSummary((await res.json()) as ExportSummary);
    } catch {
      setError('Não foi possível saber o que há para exportar.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const download = async () => {
    setDownloading(true);
    setError(null);
    try {
      const res = await apiFetch('/companies/export');
      if (!res.ok) {
        setError(res.status === 403
          ? 'Só o proprietário e os administradores podem exportar os dados.'
          : 'Não foi possível gerar a exportação.');
        setDownloading(false);
        return;
      }
      // The filename the server chose names the company and the day.
      const disposition = res.headers.get('content-disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = match ? match[1] : 'dados-empresa.zip';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('Não foi possível gerar a exportação.');
    }
    setDownloading(false);
  };

  if (forbidden) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4 text-xs">
      <div className="flex items-start gap-2.5">
        <Database className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
        <div>
          <h3 className="font-bold text-sm text-slate-900">Exportar os dados da empresa</h3>
          <p className="text-slate-500 mt-1 leading-relaxed max-w-2xl">
            Tudo o que é desta empresa, num ficheiro ZIP com um CSV por tabela e
            um manifesto com as contagens. Os CSV abrem diretamente no Excel. São
            os seus dados: leve-os quando quiser.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-400 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> A contar o que há…
        </p>
      ) : summary ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-[9px] uppercase font-bold text-slate-500">Registos</p>
              <p className="font-bold text-slate-900 text-sm mt-0.5">
                {summary.total_registos.toLocaleString('pt-PT')}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-[9px] uppercase font-bold text-slate-500">Tabelas</p>
              <p className="font-bold text-slate-900 text-sm mt-0.5">{summary.total_tabelas}</p>
            </div>
          </div>

          {/* The five biggest are enough to recognise the export as one's own. */}
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {summary.tabelas.filter((t) => t.registos > 0).slice(0, 5).map((t) => (
              <li key={t.tabela} className="text-[10px] text-slate-500">
                <span className="font-semibold text-slate-700">{t.tabela}</span>{' '}
                {t.registos.toLocaleString('pt-PT')}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <div className="flex items-start gap-2 text-[10px] text-slate-500 bg-slate-50 rounded-xl p-2.5 border border-slate-100">
        <ShieldCheck className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-px" />
        <p className="leading-relaxed">
          Palavras-passe, tokens de sessão e dados de outras empresas nunca são
          exportados. Só o proprietário e os administradores podem gerar o ficheiro.
        </p>
      </div>

      {error && (
        <p className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-semibold">
          {error}
        </p>
      )}

      <button
        onClick={download}
        disabled={downloading}
        className="px-3.5 py-2 rounded-xl text-[11px] font-bold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 flex items-center gap-2"
      >
        {downloading
          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> A preparar o ficheiro…</>
          : <><Download className="w-3.5 h-3.5" /> Descarregar tudo</>}
      </button>
    </div>
  );
};
