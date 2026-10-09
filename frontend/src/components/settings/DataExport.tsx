'use client';

/**
 * Exportar os dados da empresa.
 *
 * A product that holds a company's accounts and offers no way to take them
 * away fails on trust before it fails on features. So this says plainly what
 * comes out and what does not, shows how much there is before the download
 * starts, and puts no friction in the way: it is the company's own data.
 */

import React, { useState } from 'react';
import { useLoad } from '@/lib/use-load';
import { Download, ShieldCheck, Database } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/services/api';
import { Button, Card, CardHeader, CardBody, LoadingState, ErrorState, Stat } from '@/components/ui';

interface ExportTable {
  tabela: string;
  registos: number;
}

interface ExportSummary {
  tabelas: ExportTable[];
  total_registos: number;
  total_tabelas: number;
}

/** O resumo do que há para exportar; `forbidden` quando o papel não o permite. */
async function fetchSummary(): Promise<{ forbidden: boolean; summary: ExportSummary | null }> {
  const res = await apiFetch('/companies/export/summary');
  if (res.status === 403) return { forbidden: true, summary: null };
  if (res.ok) return { forbidden: false, summary: (await res.json()) as ExportSummary };
  return { forbidden: false, summary: null };
}

export const DataExport: React.FC = () => {
  // Uma falha de rede chega como `loadError` (a promessa rejeita).
  const { data: result, loading, error: loadError } = useLoad(fetchSummary, []);
  const [downloading, setDownloading] = useState(false);
  const forbidden = result?.forbidden ?? false;
  const summary = result?.summary ?? null;
  const error = loadError ? 'Não foi possível saber o que há para exportar.' : null;

  const download = async () => {
    setDownloading(true);
    try {
      const res = await apiFetch('/companies/export');
      if (!res.ok) {
        toast.error(res.status === 403
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
      toast.error('Não foi possível gerar a exportação.');
    }
    setDownloading(false);
  };

  if (forbidden) return null;

  return (
    <Card className="text-xs">
      <CardHeader
        icon={<Database />}
        title="Exportar os dados da empresa"
      />
      <CardBody className="space-y-3">
        <p className="text-neutral-500 leading-relaxed max-w-2xl">
          Tudo o que é desta empresa, num ficheiro ZIP com um CSV por tabela e
          um manifesto com as contagens. Os CSV abrem diretamente no Excel. São
          os seus dados: leve-os quando quiser.
        </p>

        {loading ? (
          <LoadingState label="A contar o que há…" className="py-4 justify-start" />
        ) : error ? (
          <ErrorState message={error} className="py-4" />
        ) : summary ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Registos" value={summary.total_registos.toLocaleString('pt-PT')} />
              <Stat label="Tabelas" value={summary.total_tabelas} />
            </div>

            {/* The five biggest are enough to recognise the export as one's own. */}
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {summary.tabelas.filter((t) => t.registos > 0).slice(0, 5).map((t) => (
                <li key={t.tabela} className="text-2xs text-neutral-500">
                  <span className="font-medium text-neutral-700">{t.tabela}</span>{' '}
                  <span className="tabular-nums">{t.registos.toLocaleString('pt-PT')}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <div className="flex items-start gap-2 rounded-lg border px-3 py-2 text-xs bg-neutral-50 border-neutral-200 text-neutral-600">
          <ShieldCheck className="size-3.5 text-emerald-600 shrink-0 mt-px" aria-hidden="true" />
          <p className="leading-relaxed">
            Palavras-passe, tokens de sessão e dados de outras empresas nunca são
            exportados. Só o proprietário e os administradores podem gerar o ficheiro.
          </p>
        </div>

        <Button onClick={download} loading={downloading} icon={<Download />}>
          {downloading ? 'A preparar o ficheiro…' : 'Descarregar tudo'}
        </Button>
      </CardBody>
    </Card>
  );
};
