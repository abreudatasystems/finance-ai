'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { useLoad } from '@/lib/use-load';
import { fetchBankStatements, fetchBankStatementEntries } from '@/services/data';
import { apiFetch } from '@/services/api';
import { ReconciliationPanel } from '@/components/reconciliation/ReconciliationPanel';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Zap,
  ArrowRight,
  Loader2,
  Building2,
  RefreshCcw
} from 'lucide-react';
import {
  Button, Card, CardHeader, EmptyState,
  Table, THead, TBody, Th, Tr, Td,
} from '@/components/ui';
import { formatDate } from '@/lib/format';

interface Statement {
  id: string;
  bank_name: string;
  file_name: string;
  upload_date: string;
  period_start?: string;
  period_end?: string;
  total_entries: number;
  matched_entries: number;
  status: string;
}

interface StatementEntry {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: string;
  balance?: number;
  status: string;
  match_confidence?: number;
  matched_transaction?: {
    id: string;
    description: string;
    entity_name: string;
    category_name: string;
    amount: number;
    date: string;
  };
}

interface UploadResult {
  error?: string;
  bank_name?: string;
  total_entries?: number;
  matched_entries?: number;
  suggested_entries?: number;
  statement_id?: string;
}

export default function BankReconciliationPage() {
  const { formatMoney, setPageHeader } = useApp();
  const { data: statements, reload: loadStatements } = useLoad(
    () => fetchBankStatements<Statement>(), [], { initialData: [] as Statement[] },
  );
  const [selectedStatement, setSelectedStatement] = useState<Statement | null>(null);
  const [entries, setEntries] = useState<StatementEntry[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  // Muda a cada importação ou actualização: o painel de conciliação monta-se
  // de novo e lê os movimentos novos, em vez de só aparecerem com F5.
  const [panelVersion, setPanelVersion] = useState(0);

  useEffect(() => {
    setPageHeader('Conciliação Bancária', 'Importe extratos e associe cada movimento do banco ao documento que liquida.');
  }, [setPageHeader]);

  // "Sincronizar Banco" esperava 1,5 s e não fazia nada — não há ligação
  // directa ao banco. Agora volta a ler o que está importado.
  const handleSync = async () => {
    setIsSyncing(true);
    await loadStatements();
    setPanelVersion(v => v + 1);
    setIsSyncing(false);
  };

  const loadEntries = async (stmt: Statement) => {
    setSelectedStatement(stmt);
    const data = await fetchBankStatementEntries<StatementEntry>(stmt.id);
    setEntries(data);
  };

  const handleUpload = useCallback(async (file: File) => {
    setIsUploading(true);
    setUploadResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await apiFetch('/bank/upload', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const result = await res.json();
        setUploadResult(result);
        await loadStatements();
        setPanelVersion(v => v + 1);
      } else {
        const error = await res.json().catch(() => ({}));
        setUploadResult({ error: error.detail || 'Erro ao processar ficheiro.' });
      }
    } catch {
      setUploadResult({ error: 'Erro de rede. Verifique se o backend está online.' });
    } finally {
      setIsUploading(false);
    }
  }, [loadStatements]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  const statusIcon = (status: string) => {
    switch (status) {
      case 'matched': return <CheckCircle2 className="w-4 h-4 text-emerald-500" aria-hidden="true" />;
      case 'suggested': return <Zap className="w-4 h-4 text-amber-500" aria-hidden="true" />;
      default: return <XCircle className="w-4 h-4 text-neutral-400" aria-hidden="true" />;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'matched': return 'Conciliado';
      case 'suggested': return 'Sugerido';
      default: return 'Sem correspondência';
    }
  };

  const matchedCount = entries.filter(e => e.status === 'matched').length;
  const suggestedCount = entries.filter(e => e.status === 'suggested').length;
  const unmatchedCount = entries.filter(e => e.status === 'unmatched').length;

  return (
    <div className="space-y-4 animate-in fade-in duration-300">

      <div className="flex justify-end gap-4 pb-3">
        <Button
          variant="secondary"
          onClick={handleSync}
          disabled={isSyncing}
          icon={<RefreshCcw className={isSyncing ? 'animate-spin' : ''} />}
        >
          Atualizar
        </Button>
      </div>

      {/* The working surface: match a bank line and the obligation behind it
          gets settled. See src/components/reconciliation. */}
      <ReconciliationPanel key={panelVersion} />

      {/* Upload Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-2xl p-10 text-center transition-all ${
          isDragOver
            ? 'border-emerald-400 bg-emerald-50/60 scale-[1.01]'
            : 'border-neutral-300 bg-white hover:border-neutral-400 hover:bg-neutral-50'
        }`}
      >
        {isUploading ? (
          <div role="status" className="flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" aria-hidden="true" />
            <p className="text-sm font-semibold text-neutral-800">A processar extrato bancário...</p>
            <p className="text-xs text-neutral-500">A IA está a analisar e conciliar os movimentos.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-neutral-100 flex items-center justify-center">
              <Upload className="w-7 h-7 text-neutral-700" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-bold text-neutral-800">
                Arraste o seu extrato bancário aqui
              </p>
              <p className="text-xs text-neutral-500 mt-1">
                Formatos aceites: CSV, OFX, QFX • Millennium BCP, CGD, Santander, Novo Banco, BPI, etc.
              </p>
            </div>
            <label className="mt-2 inline-flex items-center justify-center h-9 px-4 rounded-lg bg-black hover:bg-neutral-800 text-white text-sm font-semibold cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-emerald-500 focus-within:ring-offset-1">
              Selecionar Ficheiro
              <input type="file" accept=".csv,.ofx,.qfx,.txt,.tsv" onChange={handleFileSelect} className="sr-only" />
            </label>
          </div>
        )}
      </div>

      {/* Upload Result */}
      {uploadResult && (
        <div
          role={uploadResult.error ? 'alert' : 'status'}
          className={`p-4 rounded-2xl border text-sm font-medium ${
            uploadResult.error
              ? 'bg-rose-50 border-rose-200 text-rose-700'
              : 'bg-emerald-50 border-emerald-200 text-emerald-700'
          }`}
        >
          {uploadResult.error ? (
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" aria-hidden="true" />
              <span>{uploadResult.error}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              <span>
                <strong>{uploadResult.bank_name}</strong> — {uploadResult.total_entries} movimentos importados, {uploadResult.suggested_entries ?? 0} com correspondência sugerida para rever.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Statements List */}
      {statements.length > 0 && (
        <Card>
          <CardHeader title="Extratos Importados" icon={<FileSpreadsheet />} />
          <div className="divide-y divide-neutral-100 p-2">
            {statements.map(stmt => (
              <div
                key={stmt.id}
                onClick={() => loadEntries(stmt)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); loadEntries(stmt); } }}
                className={`flex items-center justify-between p-3 hover:bg-neutral-50 cursor-pointer rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  selectedStatement?.id === stmt.id ? 'bg-emerald-50 border border-emerald-200' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-neutral-100 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-neutral-600" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-neutral-800">{stmt.bank_name}</p>
                    <p className="text-2xs text-neutral-500">{stmt.file_name} • {formatDate(stmt.period_start)} a {formatDate(stmt.period_end)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div className="text-right">
                    <span className="font-bold text-neutral-700 tabular-nums">{stmt.matched_entries}/{stmt.total_entries}</span>
                    <span className="text-neutral-400 ml-1">conciliados</span>
                  </div>
                  <div className={`w-2 h-2 rounded-full ${
                    stmt.matched_entries === stmt.total_entries ? 'bg-emerald-500' :
                    stmt.matched_entries > 0 ? 'bg-amber-500' : 'bg-neutral-300'
                  }`} aria-hidden="true" />
                  <ArrowRight className="w-4 h-4 text-neutral-400" aria-hidden="true" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Entries Detail */}
      {selectedStatement && entries.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader
            title={`Movimentos — ${selectedStatement.bank_name}`}
            subtitle={selectedStatement.file_name}
            actions={
              <div className="flex items-center gap-3 text-xs font-semibold">
                <span className="flex items-center gap-1 text-emerald-600" title="Conciliados">
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> {matchedCount}
                </span>
                <span className="flex items-center gap-1 text-amber-600" title="Sugeridos">
                  <Zap className="w-3.5 h-3.5" aria-hidden="true" /> {suggestedCount}
                </span>
                <span className="flex items-center gap-1 text-neutral-400" title="Sem correspondência">
                  <XCircle className="w-3.5 h-3.5" aria-hidden="true" /> {unmatchedCount}
                </span>
              </div>
            }
          />

          <Table>
            <THead>
              <tr>
                <Th>Estado</Th>
                <Th>Data</Th>
                <Th>Descrição Bancária</Th>
                <Th numeric>Valor</Th>
                <Th>Correspondência</Th>
                <Th>Confiança</Th>
              </tr>
            </THead>
            <TBody>
              {entries.map(entry => (
                <Tr key={entry.id} className="font-medium">
                  <Td>
                    <div className="flex items-center gap-1.5">
                      {statusIcon(entry.status)}
                      <span className={`text-2xs font-bold uppercase ${
                        entry.status === 'matched' ? 'text-emerald-600' :
                        entry.status === 'suggested' ? 'text-amber-600' :
                        'text-neutral-500'
                      }`}>
                        {statusLabel(entry.status)}
                      </span>
                    </div>
                  </Td>
                  <Td className="text-neutral-500 whitespace-nowrap tabular-nums">{formatDate(entry.date)}</Td>
                  <Td className="font-semibold text-neutral-800 max-w-[250px] truncate">{entry.description}</Td>
                  <Td numeric className={`font-bold ${entry.type === 'credit' ? 'text-emerald-600' : 'text-neutral-900'}`}>
                    {entry.type === 'credit' ? '+' : '-'}{formatMoney(entry.amount)}
                  </Td>
                  <Td>
                    {entry.matched_transaction ? (
                      <div className="text-2xs">
                        <p className="font-semibold text-neutral-700">{entry.matched_transaction.entity_name}</p>
                        <p className="text-neutral-500">{entry.matched_transaction.category_name}</p>
                      </div>
                    ) : (
                      <span className="text-neutral-400 text-2xs">—</span>
                    )}
                  </Td>
                  <Td>
                    {entry.match_confidence ? (
                      <div className="flex items-center gap-1.5">
                        <div className="w-12 bg-neutral-200 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${
                              entry.match_confidence >= 80 ? 'bg-emerald-500' :
                              entry.match_confidence >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                            }`}
                            style={{ width: `${entry.match_confidence}%` }}
                          />
                        </div>
                        <span className="text-2xs font-bold text-neutral-600 tabular-nums">{entry.match_confidence}%</span>
                      </div>
                    ) : (
                      <span className="text-neutral-400 text-2xs">—</span>
                    )}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      {/* Empty State */}
      {statements.length === 0 && !uploadResult && (
        <Card>
          <EmptyState
            icon={<FileSpreadsheet />}
            title="Nenhum extrato importado"
            description="Carregue o extrato do seu banco para começar a conciliação automática. A IA vai comparar os movimentos com as suas transações registadas."
          />
        </Card>
      )}
    </div>
  );
}
