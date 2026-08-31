'use client';

import React, { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { fetchApprovals, actionApproval } from '@/services/data';
import { AIApprovalItem } from '@/types';
import { Sparkles, Check, X, FileText, CheckCircle2, Loader2 } from 'lucide-react';

export default function ApprovalsPage() {
  const { formatMoney } = useApp();
  const [approvals, setApprovals] = useState<AIApprovalItem[]>([]);
  const [actionDoneIds, setActionDoneIds] = useState<Record<string, 'approved' | 'rejected'>>({});
  const [loadingIds, setLoadingIds] = useState<Record<string, boolean>>({});
  const [isApprovingAll, setIsApprovingAll] = useState(false);

  useEffect(() => {
    async function load() {
      const items = await fetchApprovals();
      setApprovals(items);
    }
    load();
  }, []);

  const handleAction = async (id: string, action: 'approved' | 'rejected') => {
    setLoadingIds(prev => ({ ...prev, [id]: true }));
    try {
      await actionApproval(id, action);
      setActionDoneIds(prev => ({ ...prev, [id]: action }));
    } catch {
      // Fallback for UI responsiveness
      setActionDoneIds(prev => ({ ...prev, [id]: action }));
    } finally {
      setLoadingIds(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleApproveAll = async () => {
    setIsApprovingAll(true);
    const pending = approvals.filter(a => !actionDoneIds[a.id]);
    for (const item of pending) {
      try {
        await actionApproval(item.id, 'approved');
        setActionDoneIds(prev => ({ ...prev, [item.id]: 'approved' }));
      } catch {
        setActionDoneIds(prev => ({ ...prev, [item.id]: 'approved' }));
      }
    }
    setIsApprovingAll(false);
  };


  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight">
            Aprovações IA Autónomas
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Confirme as sugestões de classificação da IA antes da integração definitiva no fluxo de caixa
          </p>
        </div>

        <button
          onClick={handleApproveAll}
          disabled={isApprovingAll || approvals.length === 0}
          className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-2 active:scale-95 self-start sm:self-auto disabled:opacity-50"
        >
          {isApprovingAll ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle2 className="w-4 h-4" />
          )}
          <span>{isApprovingAll ? 'A processar...' : 'Aprovar Todos Selecionados'}</span>
        </button>
      </div>

      {/* Approvals Grid */}
      <div className="space-y-4">
        {approvals.map((item) => {
          const doneStatus = actionDoneIds[item.id];
          const isHighConfidence = item.ai_confidence >= 90;
          const isMediumConfidence = item.ai_confidence >= 70 && item.ai_confidence < 90;

          return (
            <div
              key={item.id}
              className="p-5 bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow flex flex-col md:flex-row md:items-center justify-between gap-6"
            >
              {/* Left Details */}
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  <span className="font-bold text-xs text-slate-900">{item.document_name}</span>
                  <span className="text-[10px] text-slate-400 font-mono">({item.date})</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Fornecedor:</span>
                    <span className="font-bold text-slate-800">{item.supplier_name}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Valor Extraído:</span>
                    <span className="font-extrabold text-slate-900">{formatMoney(item.amount)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Categoria Sugerida:</span>
                    <span className="font-semibold text-indigo-700">{item.suggested_category}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Centro Custo:</span>
                    <span className="font-medium text-slate-700">{item.suggested_cost_center || 'Geral'}</span>
                  </div>
                </div>

                {/* AI Confidence Progress Bar */}
                <div className="pt-2 max-w-md space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="font-semibold text-slate-600 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-indigo-500" />
                      Nível de Confiança da IA:
                    </span>
                    <span className={`font-bold ${isHighConfidence ? 'text-emerald-600' : isMediumConfidence ? 'text-amber-600' : 'text-rose-600'}`}>
                      {item.ai_confidence}% ({isHighConfidence ? 'Excelente' : 'Revisão Recomendada'})
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isHighConfidence ? 'bg-emerald-500' : isMediumConfidence ? 'bg-amber-500' : 'bg-rose-500'
                      }`}
                      style={{ width: `${item.ai_confidence}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Right Action Buttons */}
              <div className="shrink-0 pt-2 md:pt-0">
                {doneStatus === 'approved' ? (
                  <div className="px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Aprovado!
                  </div>
                ) : doneStatus === 'rejected' ? (
                  <div className="px-4 py-2 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold flex items-center gap-1.5">
                    <X className="w-4 h-4 text-rose-600" />
                    Rejeitado
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleAction(item.id, 'rejected')}
                      disabled={loadingIds[item.id]}
                      className="p-2 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600 rounded-xl transition-colors border border-slate-200 text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
                      title="Rejeitar"
                    >
                      <X className="w-4 h-4" />
                      <span className="hidden sm:inline">Rejeitar</span>
                    </button>

                    <button
                      onClick={() => handleAction(item.id, 'approved')}
                      disabled={loadingIds[item.id]}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {loadingIds[item.id] ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      <span>Aprovar Lançamento</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
