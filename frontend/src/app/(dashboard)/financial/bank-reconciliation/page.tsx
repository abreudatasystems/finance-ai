'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
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
  statement_id?: string;
}

export default function BankReconciliationPage() {
  const { formatMoney, setPageHeader } = useApp();
  const [statements, setStatements] = useState<Statement[]>([]);
  const [selectedStatement, setSelectedStatement] = useState<Statement | null>(null);
  const [entries, setEntries] = useState<StatementEntry[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    // Simulate sync
    await new Promise(r => setTimeout(r, 1500));
    setIsSyncing(false);
  };

  const loadStatements = async () => {
    const data = await fetchBankStatements<Statement>();
    setStatements(data);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadStatements(); }, []);

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
      } else {
        const error = await res.json().catch(() => ({}));
        setUploadResult({ error: error.detail || 'Erro ao processar ficheiro.' });
      }
    } catch {
      setUploadResult({ error: 'Erro de rede. Verifique se o backend está online.' });
    } finally {
      setIsUploading(false);
    }
  }, []);

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
      case 'matched': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'suggested': return <Zap className="w-4 h-4 text-amber-500" />;
      default: return <XCircle className="w-4 h-4 text-slate-400" />;
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
      
      {/* Header Actions (Header moved to TopBar) */}
      <div className="flex justify-end gap-4 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-900/20 flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCcw className={`w-4 h-4 text-white ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Sincronizar Banco</span>
          </button>
        </div>
      </div>

      {/* The working surface: match a bank line and the obligation behind it
          gets settled. See src/components/reconciliation. */}
      <ReconciliationPanel />

      {/* Upload Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-2xl p-10 text-center transition-all ${
          isDragOver
            ? 'border-indigo-400 bg-indigo-50/60 scale-[1.01]'
            : 'border-slate-300 bg-white hover:border-indigo-300 hover:bg-indigo-50/30'
        }`}
      >
        {isUploading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
            <p className="text-sm font-semibold text-indigo-700">A processar extrato bancário...</p>
            <p className="text-xs text-slate-500">A IA está a analisar e conciliar os movimentos.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-indigo-100 flex items-center justify-center">
              <Upload className="w-7 h-7 text-indigo-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">
                Arraste o seu extrato bancário aqui
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Formatos aceites: CSV, OFX, QFX • Millennium BCP, CGD, Santander, Novo Banco, BPI, etc.
              </p>
            </div>
            <label className="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl cursor-pointer transition-colors shadow-sm">
              Selecionar Ficheiro
              <input type="file" accept=".csv,.ofx,.qfx,.txt,.tsv" onChange={handleFileSelect} className="hidden" />
            </label>
          </div>
        )}
      </div>

      {/* Upload Result */}
      {uploadResult && (
        <div className={`p-4 rounded-2xl border text-sm font-medium ${
          uploadResult.error
            ? 'bg-rose-50 border-rose-200 text-rose-700'
            : 'bg-emerald-50 border-emerald-200 text-emerald-700'
        }`}>
          {uploadResult.error ? (
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              <span>{uploadResult.error}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>
                <strong>{uploadResult.bank_name}</strong> — {uploadResult.total_entries} movimentos processados, {uploadResult.matched_entries} conciliados automaticamente.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Statements List */}
      {statements.length > 0 && (
        <div className="p-6 bg-white rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <h3 className="font-bold text-sm text-slate-900">Extratos Importados</h3>
          <div className="divide-y divide-slate-100">
            {statements.map(stmt => (
              <div
                key={stmt.id}
                onClick={() => loadEntries(stmt)}
                className={`flex items-center justify-between p-3 hover:bg-slate-50 cursor-pointer rounded-xl transition-colors ${
                  selectedStatement?.id === stmt.id ? 'bg-indigo-50 border border-indigo-200' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-slate-600" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">{stmt.bank_name}</p>
                    <p className="text-[11px] text-slate-500">{stmt.file_name} • {stmt.period_start} a {stmt.period_end}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div className="text-right">
                    <span className="font-bold text-slate-700">{stmt.matched_entries}/{stmt.total_entries}</span>
                    <span className="text-slate-400 ml-1">conciliados</span>
                  </div>
                  <div className={`w-2 h-2 rounded-full ${
                    stmt.matched_entries === stmt.total_entries ? 'bg-emerald-500' :
                    stmt.matched_entries > 0 ? 'bg-amber-500' : 'bg-slate-300'
                  }`} />
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Entries Detail */}
      {selectedStatement && entries.length > 0 && (
        <div className="p-6 bg-white rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-900">
                Movimentos — {selectedStatement.bank_name}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {selectedStatement.file_name}
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-semibold">
              <span className="flex items-center gap-1 text-emerald-600">
                <CheckCircle2 className="w-3.5 h-3.5" /> {matchedCount}
              </span>
              <span className="flex items-center gap-1 text-amber-600">
                <Zap className="w-3.5 h-3.5" /> {suggestedCount}
              </span>
              <span className="flex items-center gap-1 text-slate-400">
                <XCircle className="w-3.5 h-3.5" /> {unmatchedCount}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] tracking-wider font-bold">
                  <th className="p-3">Status</th>
                  <th className="p-3">Data</th>
                  <th className="p-3">Descrição Bancária</th>
                  <th className="p-3">Valor</th>
                  <th className="p-3">Correspondência</th>
                  <th className="p-3">Confiança</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map(entry => (
                  <tr key={entry.id} className="hover:bg-slate-50/80 transition-colors font-medium">
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        {statusIcon(entry.status)}
                        <span className={`text-[10px] font-bold uppercase ${
                          entry.status === 'matched' ? 'text-emerald-600' :
                          entry.status === 'suggested' ? 'text-amber-600' :
                          'text-slate-400'
                        }`}>
                          {statusLabel(entry.status)}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-slate-500">{entry.date}</td>
                    <td className="p-3 font-semibold text-slate-800 max-w-[250px] truncate">{entry.description}</td>
                    <td className={`p-3 font-bold ${entry.type === 'credit' ? 'text-emerald-600' : 'text-slate-900'}`}>
                      {entry.type === 'credit' ? '+' : '-'}{formatMoney(entry.amount)}
                    </td>
                    <td className="p-3">
                      {entry.matched_transaction ? (
                        <div className="text-[11px]">
                          <p className="font-semibold text-slate-700">{entry.matched_transaction.entity_name}</p>
                          <p className="text-slate-500">{entry.matched_transaction.category_name}</p>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px]">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      {entry.match_confidence ? (
                        <div className="flex items-center gap-1.5">
                          <div className="w-12 bg-slate-200 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full ${
                                entry.match_confidence >= 80 ? 'bg-emerald-500' :
                                entry.match_confidence >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                              }`}
                              style={{ width: `${entry.match_confidence}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-bold text-slate-600">{entry.match_confidence}%</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {statements.length === 0 && !uploadResult && (
        <div className="p-10 bg-white rounded-2xl border border-slate-200/80 shadow-xs text-center space-y-3">
          <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto" />
          <p className="text-sm font-bold text-slate-700">Nenhum extrato importado</p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Faça o upload do extrato do seu banco para começar a conciliação automática.
            A IA vai comparar os movimentos com as suas transações registadas.
          </p>
        </div>
      )}
    </div>
  );
}
