'use client';

import React, { useState } from 'react';
import {ZoomIn, ZoomOut, RotateCw, Maximize2, Minimize2, FileText, ExternalLink} from 'lucide-react';
import { AIDocument } from '@/types';

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
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [rotation, setRotation] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  if (!document) {
    return (
      <div className="h-full min-h-[460px] bg-slate-50 rounded-2xl border border-dashed border-slate-300 flex flex-col items-center justify-center p-8 text-center text-slate-400">
        <FileText className="w-12 h-12 text-slate-300 mb-3" />
        <h4 className="text-sm font-bold text-slate-600">Nenhum documento selecionado</h4>
        <p className="text-xs text-slate-400 max-w-sm mt-1">
          Selecione uma fatura da lista ao lado ou envie um novo arquivo para inspecionar a extração OCR e o documento visual em tempo real.
        </p>
      </div>
    );
  }

  // Determine file URL
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8001/api/v1';
  let resolvedFileUrl = document.file_url || `/sample-invoice.html`;

  if (resolvedFileUrl.startsWith('/api/v1/')) {
    resolvedFileUrl = `${apiBase.replace('/api/v1', '')}${resolvedFileUrl}`;
  } else if (!resolvedFileUrl.startsWith('http') && !resolvedFileUrl.startsWith('/')) {
    resolvedFileUrl = `${apiBase}/documents/files/${resolvedFileUrl}`;
  }

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
      className={`bg-slate-900 rounded-2xl border border-slate-800 shadow-xl overflow-hidden flex flex-col transition-all duration-300 ${
        isFullscreen ? 'fixed inset-4 z-50 rounded-2xl' : 'h-full min-h-[500px]'
      }`}
    >
      {/* Viewer Header Toolbar */}
      <div className="px-4 py-2.5 bg-slate-950/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-white">
        <div className="flex items-center gap-2 min-w-0">
          <span className="p-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg">
            <FileText className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <h4 className="text-xs font-bold text-slate-100 truncate max-w-[220px] sm:max-w-xs">
              {document.file_name}
            </h4>
          </div>
        </div>


        {/* Zoom & Rotation Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomOut}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Diminuir Zoom"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span
            onClick={handleResetZoom}
            className="text-[11px] font-mono text-slate-300 px-1 cursor-pointer hover:text-indigo-400 select-none"
            title="Resetar Zoom (100%)"
          >
            {zoomLevel}%
          </span>
          <button
            onClick={handleZoomIn}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Aumentar Zoom"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleRotate}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer ml-1"
            title="Girar 90°"
          >
            <RotateCw className="w-4 h-4" />
          </button>
          <a
            href={resolvedFileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Abrir em Nova Aba"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title={isFullscreen ? 'Sair do Ecrã Inteiro' : 'Ecrã Inteiro'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4 text-amber-400" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Viewer Body */}
      <div className="flex-1 bg-slate-950 relative overflow-hidden flex items-center justify-center p-2 select-text">
        {/* Main Viewer Body */}
        <div className="w-full h-full flex items-center justify-center overflow-auto">
          {isPdf ? (
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
                title="Fatura Demonstrativa"
                className="w-full h-full rounded-lg border-0 bg-white"
              />
            </div>
          )}
        </div>



      </div>
    </div>
  );
};
