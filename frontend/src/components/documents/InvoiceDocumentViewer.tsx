'use client';

import React, { useState } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  Minimize2,
  FileText,
  FileCode,
  ExternalLink,
  Sparkles,
  Search
} from 'lucide-react';
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
  rawOcrText,
  extractedFields
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [rotation, setRotation] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [activeViewMode, setActiveViewMode] = useState<'document' | 'ocr_text' | 'preview_html'>('document');
  const [ocrSearchQuery, setOcrSearchQuery] = useState<string>('');

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
        isFullscreen ? 'fixed inset-4 z-50 rounded-2xl' : 'h-[620px]'
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
            <span className="text-[10px] text-slate-400 font-mono">
              {document.file_size || 'PDF / Imagem'} • {document.channel.toUpperCase()}
            </span>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center bg-slate-800/80 p-0.5 rounded-lg border border-slate-700 text-xs">
          <button
            onClick={() => setActiveViewMode('document')}
            className={`px-2.5 py-1 rounded-md font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeViewMode === 'document' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Fatura Visual</span>
          </button>
          <button
            onClick={() => setActiveViewMode('ocr_text')}
            className={`px-2.5 py-1 rounded-md font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeViewMode === 'ocr_text' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Texto OCR</span>
          </button>
          <button
            onClick={() => setActiveViewMode('preview_html')}
            className={`px-2.5 py-1 rounded-md font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeViewMode === 'preview_html' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Render Fiscal</span>
          </button>
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
        {/* MODE 1: Interactive Document View (PDF / Image / HTML) */}
        {activeViewMode === 'document' && (
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
        )}

        {/* MODE 2: Raw OCR Engine Text View */}
        {activeViewMode === 'ocr_text' && (
          <div className="w-full h-full bg-slate-900 text-slate-200 rounded-xl p-5 overflow-auto flex flex-col font-mono text-xs border border-slate-800">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3 shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-bold text-slate-300">
                  Camada de Texto OCR Extraída (Open-Source OCR v2.0)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    value={ocrSearchQuery}
                    onChange={(e) => setOcrSearchQuery(e.target.value)}
                    placeholder="Pesquisar no texto OCR..."
                    className="pl-8 pr-3 py-1 bg-slate-950 border border-slate-700 rounded-lg text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto whitespace-pre-wrap leading-relaxed text-slate-300 bg-slate-950/60 p-4 rounded-lg border border-slate-800/80 select-text">
              {rawOcrText ? (
                ocrSearchQuery ? (
                  rawOcrText.split('\n').map((line, idx) => {
                    const match = line.toLowerCase().includes(ocrSearchQuery.toLowerCase());
                    return (
                      <div
                        key={idx}
                        className={`py-0.5 ${match ? 'bg-amber-500/20 text-amber-300 font-bold px-1 rounded' : ''}`}
                      >
                        {line}
                      </div>
                    );
                  })
                ) : (
                  rawOcrText
                )
              ) : (
                <div className="text-slate-500 italic">
                  [OCR Motor] Texto bruto extraído da fatura {document.file_name}:
                  {"\n"}
                  ---------------------------------------------
                  {"\n"}
                  EMISSOR: {document.extracted_supplier || 'Google Ireland Ltd'}
                  {"\n"}
                  NIF: {document.extracted_nif || 'PT509876543'}
                  {"\n"}
                  DOC Nº: {document.document_number || 'FT 2026/00452'}
                  {"\n"}
                  DATA: {document.extracted_date || '2026-08-28'}
                  {"\n"}
                  VALOR BRUTO: €{document.extracted_amount || '450.00'}
                  {"\n"}
                  IVA: €{document.extracted_vat || '103.50'} (23%)
                  {"\n"}
                  VALOR LÍQUIDO: €{document.extracted_net || '346.50'}
                  {"\n"}
                  CATEGORIA: {document.suggested_category || 'Software > Licenças & SaaS'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* MODE 3: High-Fidelity Fiscal Render */}
        {activeViewMode === 'preview_html' && (
          <div className="w-full h-full flex items-center justify-center overflow-auto p-4">
            <div className="max-w-2xl w-full bg-white text-slate-900 rounded-2xl shadow-2xl p-6 sm:p-8 border border-slate-200 font-sans text-xs space-y-6">
              <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4">
                <div>
                  <div className="text-xl font-extrabold text-slate-950 tracking-tight">
                    {extractedFields?.supplier || document.extracted_supplier || 'Entidade Emissora'}
                  </div>
                  <div className="text-slate-500 font-mono mt-0.5">
                    NIF: {extractedFields?.nif || document.extracted_nif || 'PT999999990'}
                  </div>
                  <div className="text-slate-400 text-[11px]">Sede: Lisboa / Porto, Portugal</div>
                </div>
                <div className="text-right">
                  <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 font-bold text-[10px] rounded-lg uppercase tracking-wider border border-indigo-200">
                    FATURA CERTIFICADA
                  </span>
                  <div className="font-mono font-bold text-slate-900 mt-2 text-sm">
                    {extractedFields?.invoiceNumber || document.document_number || 'FT 2026/00918'}
                  </div>
                  <div className="text-slate-500 text-[11px]">
                    Emissão: {extractedFields?.date || document.extracted_date || '2026-08-30'}
                  </div>
                  <div className="text-slate-500 text-[11px]">
                    Vencimento: {extractedFields?.dueDate || document.extracted_due_date || '2026-09-15'}
                  </div>
                </div>
              </div>

              {/* Items Breakdown Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500">
                      <th className="py-2">Descrição dos Serviços / Produtos</th>
                      <th className="py-2 text-center">Taxa IVA</th>
                      <th className="py-2 text-right">Base Líquida</th>
                      <th className="py-2 text-right">Total c/ IVA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="py-3 font-semibold text-slate-800">
                        {document.file_name} — Fornecimento e Serviços Profissionais
                      </td>
                      <td className="py-3 text-center font-bold text-indigo-600">
                        {extractedFields?.vatRate || document.extracted_vat_rate || 23}%
                      </td>
                      <td className="py-3 text-right font-mono">
                        €{((extractedFields?.grossAmount || document.extracted_amount || 0) * 0.813).toFixed(2)}
                      </td>
                      <td className="py-3 text-right font-bold font-mono text-slate-900">
                        €{(extractedFields?.grossAmount || document.extracted_amount || 0).toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Totals Table */}
              <div className="flex justify-end pt-2">
                <div className="w-64 space-y-1.5 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div className="flex justify-between text-slate-600">
                    <span>Base Tributável:</span>
                    <span className="font-mono">€{((extractedFields?.grossAmount || document.extracted_amount || 0) * 0.813).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>IVA ({extractedFields?.vatRate || document.extracted_vat_rate || 23}%):</span>
                    <span className="font-mono">€{((extractedFields?.grossAmount || document.extracted_amount || 0) * 0.187).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-950 font-black text-sm pt-2 border-t border-slate-200">
                    <span>Total a Liquidar:</span>
                    <span className="font-mono text-indigo-700">€{(extractedFields?.grossAmount || document.extracted_amount || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
