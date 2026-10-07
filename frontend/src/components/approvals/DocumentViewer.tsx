'use client';

/**
 * The original document, next to the numbers.
 *
 * The point of the approvals screen is comparison: whoever approves has to be
 * able to check the total against the invoice itself, not trust a form. PDFs
 * render in an iframe, images inline, and anything else falls back to a link —
 * never a blank frame with no way out.
 */

import React, { useEffect, useState } from 'react';
import { FileText, ExternalLink, ZoomIn, ZoomOut, AlertCircle } from 'lucide-react';
import { API_BASE, apiFetch } from '@/services/api';

interface Props {
  fileUrl?: string | null;
  fileName?: string | null;
  fileType?: string | null;
}

/** O caminho do ficheiro relativo à API (`/documents/{id}/file`), ou null
 *  quando o URL aponta para fora dela e se pode abrir directamente. */
const apiPath = (url: string): string | null => {
  const prefix = new URL(API_BASE).pathname.replace(/\/$/, '');   // "/api/v1"
  let path = url;
  if (/^https?:\/\//i.test(url)) {
    if (!url.startsWith(API_BASE)) return null;
    path = url.slice(API_BASE.length);
    return path.startsWith('/') ? path : `/${path}`;
  }
  if (!path.startsWith('/')) path = `/${path}`;
  return path.startsWith(`${prefix}/`) ? path.slice(prefix.length) : path;
};

export const DocumentViewer: React.FC<Props> = ({ fileUrl, fileName, fileType }) => {
  const [zoom, setZoom] = useState(100);
  /* O ficheiro vem por fetch autenticado e mostra-se a partir de um blob,
     como no InvoiceDocumentViewer. Um <iframe>/<img src> não leva o token,
     e o endpoint dos ficheiros exige-o: o original nunca aparecia (401). */
  const [src, setSrc] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!fileUrl) return;
    const path = apiPath(fileUrl);
    if (path === null) {
      // URL externo (já público): abre-se como está.
      queueMicrotask(() => setSrc(fileUrl));
      return;
    }
    let alive = true;
    let created: string | null = null;
    (async () => {
      try {
        const res = await apiFetch(path);
        if (!res.ok) { if (alive) setLoadError(true); return; }
        const url = URL.createObjectURL(await res.blob());
        created = url;
        if (alive) { setLoadError(false); setSrc(url); } else URL.revokeObjectURL(url);
      } catch {
        if (alive) setLoadError(true);
      }
    })();
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [fileUrl]);
  const isPdf = (fileType || '').includes('pdf') || (fileName || '').toLowerCase().endsWith('.pdf');
  const isImage = (fileType || '').startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(fileName || '');

  return (
    <div className="flex flex-col h-full rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-white border-b border-slate-200">
        <div className="flex items-center gap-1.5 min-w-0">
          <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="text-[11px] font-semibold text-slate-700 truncate">{fileName || 'Documento'}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isImage && (
            <>
              <button onClick={() => setZoom((z) => Math.max(50, z - 25))} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500" title="Reduzir" aria-label="Reduzir">
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] font-mono text-slate-400 w-9 text-center">{zoom}%</span>
              <button onClick={() => setZoom((z) => Math.min(300, z + 25))} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500" title="Ampliar" aria-label="Ampliar">
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          {fileUrl && src && (
            <a href={src} target="_blank" rel="noreferrer" className="p-1 rounded-lg hover:bg-slate-100 text-slate-500" title="Abrir em separador novo">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto min-h-[320px]">
        {!fileUrl || !src ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 p-6 text-center text-slate-400">
            <AlertCircle className="w-5 h-5" />
            <p className="text-[11px]">
              {!fileUrl
                ? 'O ficheiro original não está guardado para este documento.'
                : loadError ? 'Não foi possível abrir o ficheiro original.' : 'A carregar o original…'}
              <br />Os valores abaixo continuam a poder ser revistos e corrigidos.
            </p>
          </div>
        ) : isPdf ? (
          <iframe src={src} title={fileName || 'documento'} className="w-full h-full min-h-[420px] bg-white" />
        ) : isImage ? (
          <div className="p-3 flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={fileName || 'documento'} style={{ width: `${zoom}%` }} className="rounded-lg shadow-xs" />
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-2 p-6 text-center">
            <FileText className="w-5 h-5 text-slate-400" />
            <a href={src} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-indigo-600 hover:underline">
              Abrir {fileName}
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
