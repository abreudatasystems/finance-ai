'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/services/api';
import {ZoomIn, ZoomOut, RotateCw, Maximize2, Minimize2, FileText, ExternalLink} from 'lucide-react';
import { AIDocument } from '@/types';
import { EmptyState, IconButton } from '@/components/ui';

interface InvoiceDocumentViewerProps {
  document: AIDocument | null;
  rawOcrText?: string;
  extractedFields?: {
    supplier?: string;
    nif?: string;
    invoiceNumber?: string;
    date?: string;
    dueDate?: string;
    netAmount?: number;
    vatRate?: number;
    vatAmount?: number;
    grossAmount?: number;
    category?: string;
  };
  highlightField?: string | null;
  onSelectField?: (field: string) => void;
}

/** Os botões da barra escura do visualizador. */
const darkIcon = 'text-neutral-400 hover:text-white hover:bg-neutral-800';

export const InvoiceDocumentViewer: React.FC<InvoiceDocumentViewerProps> = ({
  document,
}) => {
  /* O ficheiro vem por fetch autenticado e mostra-se a partir de um blob.
     Um `<img src>` não leva o cabeçalho de autorização, e o endpoint dos
     ficheiros passou a exigi-lo — servia qualquer fatura a quem soubesse o
     nome. Além disso o `file_url` é relativo (`/api/v1/...`) e o browser
     resolvia-o contra o frontend, onde não existe: a pré-visualização estava
     partida mesmo antes de haver autenticação. */
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [rotation, setRotation] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  useEffect(() => {
    if (!document?.id) return;
    let revoked: string | null = null;
    let alive = true;

    (async () => {
      setLoadError(null);
      try {
        const res = await apiFetch(`/documents/${encodeURIComponent(document.id)}/file`);
        if (!res.ok) {
          if (alive) setLoadError('Não foi possível abrir o ficheiro original.');
          return;
        }
        const url = URL.createObjectURL(await res.blob());
        revoked = url;
        if (alive) setObjectUrl(url); else URL.revokeObjectURL(url);
      } catch {
        if (alive) setLoadError('Não foi possível contactar o servidor.');
      }
    })();

    return () => {
      alive = false;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [document?.id]);


  if (!document) {
    return (
      <div className="h-full min-h-[460px] bg-neutral-50 rounded-2xl border border-dashed border-neutral-300 flex items-center justify-center">
        <EmptyState
          icon={<FileText />}
          title="Nenhum documento selecionado"
          description="Selecione uma fatura da lista ao lado ou carregue um novo ficheiro para inspecionar a extração OCR e o documento visual em tempo real."
        />
      </div>
    );
  }

  const resolvedFileUrl = objectUrl;

  const isPdf = document.file_name.toLowerCase().endsWith('.pdf') || document.file_type?.includes('pdf');
  const isImage = /\.(png|jpg|jpeg|webp|bmp|tiff)$/i.test(document.file_name) || document.file_type?.includes('image');

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 20, 200));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 20, 60));
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);
  const handleResetZoom = () => {
    setZoomLevel(100);
    setRotation(0);
  };

  return (
    <div
      className={`bg-neutral-950 rounded-2xl border border-neutral-800 shadow-xl overflow-hidden flex flex-col transition-all duration-300 ${
        isFullscreen ? 'fixed inset-4 z-50 rounded-2xl' : 'h-full min-h-[500px]'
      }`}
    >
      {/* Viewer Header Toolbar */}
      <div className="px-4 py-2.5 bg-black/90 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-3 text-white">
        <div className="flex items-center gap-2 min-w-0">
          <span className="p-1.5 bg-emerald-500/15 text-emerald-400 rounded-lg" aria-hidden="true">
            <FileText className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <h4 className="text-xs font-bold text-neutral-100 truncate max-w-[220px] sm:max-w-xs">
              {document.file_name}
            </h4>
          </div>
        </div>


        {/* Zoom & Rotation Controls */}
        <div className="flex items-center gap-1">
          <IconButton label="Diminuir zoom" onClick={handleZoomOut} className={darkIcon}>
            <ZoomOut />
          </IconButton>
          <button
            type="button"
            onClick={handleResetZoom}
            className="text-2xs tabular-nums text-neutral-300 px-1 cursor-pointer hover:text-emerald-400 select-none rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            title="Repor zoom (100%)"
            aria-label={`Zoom ${zoomLevel}% — repor para 100%`}
          >
            {zoomLevel}%
          </button>
          <IconButton label="Aumentar zoom" onClick={handleZoomIn} className={darkIcon}>
            <ZoomIn />
          </IconButton>
          <IconButton label="Rodar 90°" onClick={handleRotate} className={`${darkIcon} ml-1`}>
            <RotateCw />
          </IconButton>
          <a
            href={resolvedFileUrl || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className={`size-8 inline-flex items-center justify-center rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${darkIcon}`}
            title="Abrir em separador novo"
            aria-label="Abrir em separador novo"
          >
            <ExternalLink className="w-4 h-4" aria-hidden="true" />
          </a>
          <IconButton
            label={isFullscreen ? 'Sair do ecrã inteiro' : 'Ecrã inteiro'}
            onClick={() => setIsFullscreen(!isFullscreen)}
            className={darkIcon}
          >
            {isFullscreen ? <Minimize2 className="text-amber-400" /> : <Maximize2 />}
          </IconButton>
        </div>
      </div>

      {/* Main Viewer Body */}
      <div className="flex-1 bg-neutral-950 relative overflow-hidden flex items-center justify-center p-2 select-text">
        <div className="w-full h-full flex items-center justify-center overflow-auto">
          {!resolvedFileUrl ? (
            <div role={loadError ? 'alert' : 'status'} className="text-center text-neutral-400 text-xs px-6">
              {loadError || 'A carregar o documento original…'}
            </div>
          ) : isPdf ? (
            <div
              className="w-full h-full transition-transform duration-200"
              style={{
                transform: `scale(${zoomLevel / 100}) rotate(${rotation}deg)`,
                transformOrigin: 'center center'
              }}
            >
              <iframe
                src={resolvedFileUrl}
                title={document.file_name}
                className="w-full h-full rounded-lg border-0 bg-white"
              />
            </div>
          ) : isImage ? (
            <div className="w-full h-full flex items-center justify-center overflow-auto p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolvedFileUrl}
                alt={document.file_name}
                className="max-h-full max-w-full object-contain rounded-lg shadow-2xl transition-transform duration-200"
                style={{
                  transform: `scale(${zoomLevel / 100}) rotate(${rotation}deg)`,
                  transformOrigin: 'center center'
                }}
              />
            </div>
          ) : (
            <div
              className="w-full h-full transition-transform duration-200"
              style={{
                transform: `scale(${zoomLevel / 100}) rotate(${rotation}deg)`,
                transformOrigin: 'center center'
              }}
            >
              <iframe
                src={resolvedFileUrl}
                title={document.file_name}
                className="w-full h-full rounded-lg border-0 bg-white"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
