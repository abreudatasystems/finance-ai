'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/services/api';
import {ZoomIn, ZoomOut, RotateCw, Maximize2, Minimize2, FileText, ExternalLink} from 'lucide-react';
import { AIDocument } from '@/types';
import { Button, EmptyState, IconButton } from '@/components/ui';

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
      <div className="h-full min-h-[460px] bg-white rounded-xl border border-dashed border-neutral-300 flex items-center justify-center">
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
      className={`bg-white rounded-xl border border-neutral-200 shadow-[0_1px_2px_rgba(24,24,27,0.04)] overflow-hidden flex flex-col ${
        isFullscreen ? 'fixed inset-4 z-50 shadow-xl' : 'h-full min-h-[500px]'
      }`}
    >
      {/* Viewer header toolbar */}
      <div className="px-3 py-2 border-b border-neutral-100 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="size-7 flex items-center justify-center bg-neutral-100 text-neutral-600 rounded-md" aria-hidden="true">
            <FileText className="size-3.5" />
          </span>
          <div className="min-w-0">
            <h4 className="text-13 font-semibold text-neutral-900 truncate max-w-[220px] sm:max-w-xs">
              {document.file_name}
            </h4>
          </div>
        </div>


        {/* Zoom & Rotation Controls */}
        <div className="flex items-center gap-1">
          <IconButton label="Diminuir zoom" onClick={handleZoomOut}>
            <ZoomOut />
          </IconButton>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetZoom}
            className="px-1.5 tabular-nums text-2xs"
            title="Repor zoom (100%)"
            aria-label={`Zoom ${zoomLevel}% — repor para 100%`}
          >
            {zoomLevel}%
          </Button>
          <IconButton label="Aumentar zoom" onClick={handleZoomIn}>
            <ZoomIn />
          </IconButton>
          <IconButton label="Rodar 90°" onClick={handleRotate} className="ml-1">
            <RotateCw />
          </IconButton>
          <a
            href={resolvedFileUrl || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="size-7 inline-flex items-center justify-center rounded-md text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
            title="Abrir em separador novo"
            aria-label="Abrir em separador novo"
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
          <IconButton
            label={isFullscreen ? 'Sair do ecrã inteiro' : 'Ecrã inteiro'}
            onClick={() => setIsFullscreen(!isFullscreen)}
          >
            {isFullscreen ? <Minimize2 /> : <Maximize2 />}
          </IconButton>
        </div>
      </div>

      {/* Main viewer body */}
      <div className="flex-1 bg-neutral-100 relative overflow-hidden flex items-center justify-center p-2 select-text">
        <div className="w-full h-full flex items-center justify-center overflow-auto">
          {!resolvedFileUrl ? (
            <div role={loadError ? 'alert' : 'status'} className="text-center text-neutral-500 text-xs px-6">
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
                className="max-h-full max-w-full object-contain rounded-lg shadow-md transition-transform duration-200"
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
