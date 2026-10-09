'use client';

import { toast } from 'sonner';

import React, { useEffect, useState, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import { decide } from '@/components/approvals/api';
import { ApprovalDecision } from '@/components/approvals/types';
import {
  fetchDocuments, uploadInvoiceDocument, fetchApprovals,
  fetchReadingCapabilities, ReadingCapabilities,
} from '@/services/data';
import { AIDocument, AIApprovalItem } from '@/types';
import { InvoiceDocumentViewer } from '@/components/documents/InvoiceDocumentViewer';
import {UploadCloud, CheckCircle2, FileText, Building2, Calendar, Layers, Check, Zap, Download, AlertTriangle} from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input } from '@/components/ui';
import { formatDate } from '@/lib/format';

export default function DocumentInspectorPage() {
  const { formatMoney, setPageHeader } = useApp();
  const [documents, setDocuments] = useState<AIDocument[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<AIDocument | null>(null);
  const [approvals, setApprovals] = useState<AIApprovalItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [capabilities, setCapabilities] = useState<ReadingCapabilities | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [approvedDocs, setApprovedDocs] = useState<string[]>([]);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      const [docs, apps] = await Promise.all([
        fetchDocuments(),
        fetchApprovals()
      ]);
      setDocuments(docs);
      setApprovals(apps);
      if (docs.length > 0) {
        setSelectedDoc(docs[0]);
      }
    }
    load();
  }, []);

  useEffect(() => {
    setPageHeader('Automação (OCR)', 'Carregue faturas e confirme o que foi lido antes de lançar');
  }, [setPageHeader]);

  useEffect(() => {
    let alive = true;
    fetchReadingCapabilities().then((c) => { if (alive) setCapabilities(c); });
    return () => { alive = false; };
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      // A API devolve { document, approval_id, … } — o documento vem dentro.
      // Tratado como se fosse o próprio documento, a lista ganhava uma linha
      // sem nome nem valores e o visualizador pedia /documents/undefined/file.
      const result = (await uploadInvoiceDocument(file, 'upload')) as { document?: AIDocument };
      const uploadedDoc = result.document;
      if (!uploadedDoc) throw new Error('A resposta do servidor não trouxe o documento.');
      setDocuments(prev => [uploadedDoc, ...prev]);
      setSelectedDoc(uploadedDoc);
      // O upload cria uma aprovação; sem recarregar, "Aprovar" não a encontrava.
      setApprovals(await fetchApprovals());
      setSuccessToast(`Documento ${file.name} processado e extraído com sucesso!`);
      setTimeout(() => setSuccessToast(null), 4000);
    } catch (err) {
      // Antes, uma falha mostrava um documento inventado ("Fornecedor
      // Extraído OCR", 580 €, 97% de confiança) como se tivesse sido lido.
      // Num sistema financeiro, um valor inventado é pior do que um erro.
      toast.error(err instanceof Error ? err.message : 'Não foi possível processar o documento.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleApprove = async () => {
    if (!selectedDoc) return;
    setIsApproving(true);

    try {
      const matchingApp = approvals.find(a => a.document_id === selectedDoc.id || a.document_name === selectedDoc.file_name);
      if (!matchingApp) {
        toast.error('Este documento não tem uma aprovação pendente. Veja a fila em Aprovações.');
        return;
      }
      // As correcções feitas nos campos seguem com a decisão; antes eram
      // ignoradas e lançava-se o que o OCR tinha lido.
      const original = documents.find(d => d.id === selectedDoc.id);
      const corrections: ApprovalDecision = {};
      if (selectedDoc.extracted_amount !== original?.extracted_amount) corrections.amount = selectedDoc.extracted_amount;
      if (selectedDoc.extracted_net !== original?.extracted_net) corrections.net_amount = selectedDoc.extracted_net;
      if (selectedDoc.extracted_vat_rate !== original?.extracted_vat_rate) corrections.vat_rate = selectedDoc.extracted_vat_rate;
      if (selectedDoc.extracted_vat !== original?.extracted_vat) corrections.vat_amount = selectedDoc.extracted_vat;
      if (selectedDoc.suggested_category !== original?.suggested_category) corrections.category_name = selectedDoc.suggested_category;
      if (selectedDoc.extracted_due_date !== original?.extracted_due_date) corrections.due_date = selectedDoc.extracted_due_date;
      const edited = Object.keys(corrections).length > 0;

      // Só se diz "aprovada" depois de a API o confirmar.
      const { error } = await decide(matchingApp.id, edited ? 'edited' : 'approved', corrections);
      if (error) {
        toast.error(error);
        return;
      }
      setDocuments(prev => prev.map(d => (d.id === selectedDoc.id ? selectedDoc : d)));
      setApprovedDocs(prev => [...prev, selectedDoc.id]);
      setApprovals(prev => prev.filter(a => a.id !== matchingApp.id));
      setSuccessToast(`Fatura ${selectedDoc.file_name} aprovada e lançada no fluxo financeiro!`);
      setTimeout(() => setSuccessToast(null), 4000);
    } finally {
      setIsApproving(false);
    }
  };

  const handleExportJson = () => {
    if (!selectedDoc) return;
    const jsonStr = JSON.stringify(selectedDoc, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `extracao-ocr-${selectedDoc.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isCurrentApproved = selectedDoc ? approvedDocs.includes(selectedDoc.id) : false;

  /* Um servidor sem o motor de OCR instalado lê PDFs com camada de texto e
     mais nada. Vale a pena dizê-lo antes de alguém fotografar um recibo e
     receber 0% de confiança sem explicação. */
  const cannotReadImages = capabilities !== null && !capabilities.imagens;

  return (
    <div className="flex flex-col h-[calc(100vh-104px)] overflow-hidden animate-in fade-in duration-300">

      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept={cannotReadImages ? '.pdf,.txt' : '.pdf,.png,.jpg,.jpeg,.webp,.txt'}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* Dizer o que não se consegue ler vale mais do que aceitar e falhar. */}
      {cannotReadImages && (
        <div role="alert" className="px-3 py-2 mt-3 shrink-0 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2">
          <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            Este servidor lê <b className="font-semibold">PDFs com texto</b>, mas não fotografias nem PDFs
            digitalizados — falta o motor de reconhecimento.
            {capabilities?.em_falta?.length ? (
              <> Em falta: {capabilities.em_falta.join('; ')}.</>
            ) : null}
          </span>
        </div>
      )}


      {/* Toast Notification */}
      {successToast && (
        <div role="status" className="px-3 py-2 mt-3 shrink-0 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-medium text-emerald-900 flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="size-4 text-emerald-600 shrink-0" aria-hidden="true" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Documentos à espera de decisão: aprovam-se aqui mesmo, ao abri-los. */}
      {approvals.length > 0 && (
        <div
          role="status"
          className="mt-3 shrink-0 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
          {approvals.length} documento(s) à espera de aprovação — abra-os na lista para os aprovar.
        </div>
      )}

      {/* Main split-screen workspace (100% height remaining) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start flex-1 min-h-0 mt-3 pb-4">

        {/* Left column: document list (3 cols) */}
        <Card className="lg:col-span-3 h-full flex flex-col overflow-hidden">
          <div className="px-3 py-2.5 border-b border-neutral-100 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-13 font-semibold text-neutral-900">Faturas inspecionadas</span>
              <Badge className="tabular-nums">{documents.length}</Badge>
            </div>
            <Button
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              loading={isUploading}
              icon={<UploadCloud />}
              className="shrink-0"
            >
              Adicionar
            </Button>
          </div>

          <div className="divide-y divide-neutral-100 overflow-y-auto flex-1 p-1">
            {documents.length === 0 && (
              <EmptyState
                icon={<FileText />}
                title="Ainda não há faturas"
                description="Carregue um PDF ou uma fotografia para a IA ler."
              />
            )}
            {documents.map((doc) => {
              const isSelected = selectedDoc?.id === doc.id;
              const isApp = approvedDocs.includes(doc.id);
              return (
                <div
                  key={doc.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedDoc(doc)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedDoc(doc); } }}
                  className={`px-3 py-2 rounded-lg cursor-pointer transition-colors mb-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    isSelected ? 'bg-emerald-50 border border-emerald-200' : 'hover:bg-neutral-50/80 border border-transparent'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className={`size-4 shrink-0 ${isSelected ? 'text-emerald-600' : 'text-neutral-400'}`} aria-hidden="true" />
                      <span className="text-xs font-medium text-neutral-800 truncate">{doc.file_name}</span>
                    </div>
                  </div>

                  <div className="mt-1 flex items-center justify-between text-2xs">
                    <span className="text-neutral-500 truncate">{doc.extracted_supplier || 'A processar...'}</span>
                    <span className="font-semibold text-neutral-900 tabular-nums">
                      {doc.extracted_amount ? formatMoney(doc.extracted_amount) : '---'}
                    </span>
                  </div>

                  <div className="mt-1.5 flex items-center justify-between text-2xs">
                    <Badge>
                      {doc.ai_confidence != null ? `${doc.ai_confidence}% OCR` : 'Por ler'}
                    </Badge>
                    {isApp ? (
                      <span className="text-emerald-700 font-medium flex items-center gap-0.5">
                        <Check className="size-3" aria-hidden="true" /> Aprovado
                      </span>
                    ) : (
                      <span className="text-neutral-500 font-medium tabular-nums">{formatDate(doc.extracted_date)}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Center column: document viewer (5 cols) */}
        <div className="lg:col-span-5 h-full flex flex-col min-h-0">
          <div className="flex-1 min-h-0 rounded-xl overflow-hidden">
            <InvoiceDocumentViewer
              document={selectedDoc}
              rawOcrText={selectedDoc ? [
                `Documento: ${selectedDoc.file_name}`,
                `Fornecedor: ${selectedDoc.extracted_supplier || '—'}`,
                `NIF: ${selectedDoc.extracted_nif || '—'}`,
                `Data: ${selectedDoc.extracted_date || '—'}`,
                `Vencimento: ${selectedDoc.extracted_due_date || '—'}`,
                `Total: ${selectedDoc.extracted_amount != null ? formatMoney(selectedDoc.extracted_amount) : '—'}`,
                `IVA${selectedDoc.extracted_vat_rate != null ? ` (${selectedDoc.extracted_vat_rate}%)` : ''}: ${selectedDoc.extracted_vat != null ? formatMoney(selectedDoc.extracted_vat) : '—'}`,
                `Base: ${selectedDoc.extracted_net != null ? formatMoney(selectedDoc.extracted_net) : '—'}`,
                `Categoria sugerida: ${selectedDoc.suggested_category || '—'}`,
              ].join('\n') : ''}
              extractedFields={{
                supplier: selectedDoc?.extracted_supplier,
                nif: selectedDoc?.extracted_nif,
                invoiceNumber: selectedDoc?.document_number,
                date: selectedDoc?.extracted_date,
                dueDate: selectedDoc?.extracted_due_date,
                vatRate: selectedDoc?.extracted_vat_rate,
                vatAmount: selectedDoc?.extracted_vat,
                grossAmount: selectedDoc?.extracted_amount,
                category: selectedDoc?.suggested_category
              }}
            />
          </div>
        </div>

        {/* Right column: extracted metadata inspector (4 cols) */}
        <Card className="lg:col-span-4 h-full flex flex-col overflow-hidden">
          {/* Confidence & Engine Banner */}
          <CardHeader
            className="shrink-0"
            icon={<Zap />}
            title="Metadados Estruturados"
            subtitle="Validação Algorítmica Fiscal PT"
            actions={
              <Badge tone={selectedDoc?.ai_confidence != null ? 'success' : 'neutral'}>
                {selectedDoc?.ai_confidence != null ? `${selectedDoc.ai_confidence}% Precisão` : 'Sem leitura'}
              </Badge>
            }
          />

          {/* Scrollable Metadata Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {selectedDoc ? (
              <div className="space-y-3 text-xs">

                {/* Supplier & NIF */}
                <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200/80 space-y-3">
                  <Field label={<span className="flex items-center gap-1"><Building2 className="size-3" aria-hidden="true" /> Fornecedor</span>}>
                    {(p) => (
                      <Input
                        {...p}
                        type="text"
                        value={selectedDoc.extracted_supplier || ''}
                        onChange={(e) => setSelectedDoc({...selectedDoc, extracted_supplier: e.target.value})}
                        placeholder="Emissor Desconhecido"
                        className="font-medium"
                      />
                    )}
                  </Field>
                  <Field label="NIF">
                    {(p) => (
                      <Input
                        {...p}
                        type="text"
                        value={selectedDoc.extracted_nif || ''}
                        onChange={(e) => setSelectedDoc({...selectedDoc, extracted_nif: e.target.value})}
                        placeholder="PT509876543"
                        className="font-mono"
                      />
                    )}
                  </Field>
                </div>

                {/* Dates & Reference */}
                <div className="grid grid-cols-2 gap-2">
                  <Field label={<span className="flex items-center gap-1"><Calendar className="size-3" aria-hidden="true" /> Emissão</span>}>
                    {(p) => (
                      <Input
                        {...p}
                        type="date"
                        value={selectedDoc.extracted_date || ''}
                        onChange={(e) => setSelectedDoc({...selectedDoc, extracted_date: e.target.value})}
                      />
                    )}
                  </Field>
                  <Field label={<span className="flex items-center gap-1"><Calendar className="size-3" aria-hidden="true" /> Vencimento</span>}>
                    {(p) => (
                      <Input
                        {...p}
                        type="date"
                        value={selectedDoc.extracted_due_date || ''}
                        onChange={(e) => setSelectedDoc({...selectedDoc, extracted_due_date: e.target.value})}
                      />
                    )}
                  </Field>
                </div>

                {/* Financial Amounts Breakdown */}
                <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200/80 space-y-2">
                  <span className="text-xs font-medium text-neutral-700">Decomposição Financeira &amp; IVA</span>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Base líquida (€)">
                      {(p) => (
                        <Input
                          {...p}
                          type="number"
                          step="0.01"
                          value={selectedDoc.extracted_net || ''}
                          onChange={(e) => setSelectedDoc({...selectedDoc, extracted_net: parseFloat(e.target.value) || 0})}
                          className="text-right tabular-nums"
                        />
                      )}
                    </Field>
                    <Field label="Taxa de IVA (%)">
                      {(p) => (
                        <Input
                          {...p}
                          type="number"
                          value={selectedDoc.extracted_vat_rate ?? ''}
                          onChange={(e) => setSelectedDoc({...selectedDoc, extracted_vat_rate: parseInt(e.target.value) || 0})}
                          className="text-right tabular-nums"
                        />
                      )}
                    </Field>
                    <Field label="IVA (€)">
                      {(p) => (
                        <Input
                          {...p}
                          type="number"
                          step="0.01"
                          value={selectedDoc.extracted_vat || ''}
                          onChange={(e) => setSelectedDoc({...selectedDoc, extracted_vat: parseFloat(e.target.value) || 0})}
                          className="text-right tabular-nums"
                        />
                      )}
                    </Field>
                    <Field label="Total bruto (€)">
                      {(p) => (
                        <Input
                          {...p}
                          type="number"
                          step="0.01"
                          value={selectedDoc.extracted_amount || ''}
                          onChange={(e) => setSelectedDoc({...selectedDoc, extracted_amount: parseFloat(e.target.value) || 0})}
                          className="text-right tabular-nums font-semibold text-neutral-900"
                        />
                      )}
                    </Field>
                  </div>
                </div>

                {/* Accounting Category */}
                <Field label={<span className="flex items-center gap-1"><Layers className="size-3" aria-hidden="true" /> Categoria Contabilística Sugerida</span>}>
                  {(p) => (
                    <Input
                      {...p}
                      type="text"
                      value={selectedDoc.suggested_category || ''}
                      onChange={(e) => setSelectedDoc({...selectedDoc, suggested_category: e.target.value})}
                      placeholder="Ex: Serviços Especializados"
                      className="font-medium"
                    />
                  )}
                </Field>

                {/* Action Buttons */}
                <div className="pt-2 space-y-2">
                  {isCurrentApproved ? (
                    <div role="status" className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-center font-medium text-emerald-800 text-xs flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="size-4" aria-hidden="true" /> Lançamento Aprovado e Registado no Livro Caixa
                    </div>
                  ) : (
                    <Button
                      variant="accent"
                      className="w-full"
                      onClick={handleApprove}
                      loading={isApproving}
                      icon={<Check />}
                    >
                      Aprovar &amp; Lançar no Fluxo de Caixa
                    </Button>
                  )}

                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={handleExportJson}
                    icon={<Download />}
                  >
                    Exportar Dados Estruturados (JSON)
                  </Button>
                </div>

              </div>
            ) : (
              <EmptyState icon={<FileText />} title="Nenhum documento selecionado" className="h-full" />
            )}
          </div>
        </Card>

      </div>

    </div>
  );
}
