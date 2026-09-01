'use client';

/**
 * The queue: everything the AI read and nobody has decided on yet.
 *
 * Selection drives the batch bar — approving twenty utility bills one by one is
 * the reason people stop using a tool like this. Items below the confidence
 * threshold are marked, and opening one leads to the inspector, where the
 * document and the numbers sit side by side.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Inbox, Sparkles, AlertTriangle, Loader2, Check, X, RefreshCw, ChevronRight, Mail, Upload,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { ApprovalDetail, ApprovalRow, ApprovalSummary } from './types';
import { QueueFilter, fetchApproval, fetchQueue, fetchSummary, decideMany } from './api';
import { ApprovalInspector } from './ApprovalInspector';

const FILTERS: { id: QueueFilter; label: string }[] = [
  { id: 'pending', label: 'Por aprovar' },
  { id: 'approved', label: 'Aprovados' },
  { id: 'rejected', label: 'Rejeitados' },
  { id: 'all', label: 'Tudo' },
];

const channelIcon = (channel?: string | null) =>
  channel === 'email' ? <Mail className="w-3 h-3" /> : <Upload className="w-3 h-3" />;

export const ApprovalQueue: React.FC = () => {
  const { formatMoney } = useApp();

  const [filter, setFilter] = useState<QueueFilter>('pending');
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [summary, setSummary] = useState<ApprovalSummary | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApprovalDetail | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const [q, s] = await Promise.all([fetchQueue(filter), fetchSummary()]);
    setRows(q);
    setSummary(s);
    setSelected(new Set());
    setLoading(false);
  }, [filter]);

  useEffect(() => { reload(); }, [reload]);

  const open = async (id: string) => {
    setError(null);
    const d = await fetchApproval(id);
    if (!d) { setError('Não foi possível abrir este item.'); return; }
    setDetail(d);
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  };

  const runBatch = async (action: 'approved' | 'rejected') => {
    if (selected.size === 0) return;
    if (action === 'rejected' && !window.confirm(`Rejeitar ${selected.size} documento(s)?`)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await decideMany([...selected], action);
    setBusy(false);
    if (res.error || !res.data) { setError(res.error || 'Falhou.'); return; }
    const { decididos, falhados, erros } = res.data;
    setNotice(
      falhados
        ? `${decididos} processado(s), ${falhados} falhado(s): ${erros.map((e) => e.detail).join('; ')}`
        : `${decididos} documento(s) ${action === 'approved' ? 'aprovados — obrigações criadas' : 'rejeitados'}.`,
    );
    await reload();
  };

  if (detail) {
    return (
      <ApprovalInspector
        detail={detail}
        formatMoney={formatMoney}
        onClose={() => setDetail(null)}
        onDone={async () => { setDetail(null); setNotice('Decisão registada.'); await reload(); }}
      />
    );
  }

  return (
    <div className="space-y-4 text-xs">
      {/* ----------------------------------------------------------- counters */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-white border border-slate-200">
            <p className="text-[9px] uppercase font-bold text-slate-400">Por aprovar</p>
            <p className="font-bold text-slate-900 text-base">{summary.pendentes}</p>
          </div>
          <div className="p-3 rounded-xl bg-white border border-slate-200">
            <p className="text-[9px] uppercase font-bold text-slate-400">Valor em espera</p>
            <p className="font-bold text-slate-900 text-base">{formatMoney(summary.valor_pendente)}</p>
          </div>
          <div className="p-3 rounded-xl bg-white border border-amber-200">
            <p className="text-[9px] uppercase font-bold text-amber-600">A precisar de revisão</p>
            <p className="font-bold text-amber-700 text-base">{summary.por_rever}</p>
          </div>
          <div className="p-3 rounded-xl bg-white border border-slate-200">
            <p className="text-[9px] uppercase font-bold text-slate-400">Já decididos</p>
            <p className="font-bold text-slate-900 text-base">{summary.aprovados + summary.rejeitados}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] transition-colors ${
                  filter === f.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button onClick={reload} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" title="Atualizar">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {notice && <p className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-[11px]">{notice}</p>}
        {error && <p className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-[11px]">{error}</p>}

        {/* -------------------------------------------------------- batch bar */}
        {filter === 'pending' && rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200">
            <label className="flex items-center gap-2 font-semibold text-slate-700">
              <input type="checkbox" checked={selected.size === rows.length && rows.length > 0} onChange={toggleAll} className="rounded" />
              {selected.size > 0 ? `${selected.size} selecionado(s)` : 'Selecionar tudo'}
            </label>
            {selected.size > 0 && (
              <div className="flex items-center gap-1.5 ml-auto">
                <button onClick={() => runBatch('approved')} disabled={busy}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1.5 disabled:opacity-50">
                  {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Aprovar selecionados
                </button>
                <button onClick={() => runBatch('rejected')} disabled={busy}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 font-bold text-[11px] flex items-center gap-1.5 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50">
                  <X className="w-3 h-3" /> Rejeitar
                </button>
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------ rows */}
        {loading ? (
          <p className="py-10 text-center text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> A carregar…
          </p>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <Inbox className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-slate-500 font-semibold">
              {filter === 'pending' ? 'Nada por aprovar.' : 'Sem registos neste filtro.'}
            </p>
            <p className="text-[11px] text-slate-400">
              Os documentos enviados para a caixa de entrada aparecem aqui depois de a IA os ler.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {rows.map((r) => (
              <div key={r.id} className="px-3 py-2.5 flex items-center gap-3 hover:bg-slate-50">
                {filter === 'pending' && (
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="rounded shrink-0" />
                )}

                <button onClick={() => open(r.id)} className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900 truncate">{r.supplier_name}</span>
                    <span className="text-[10px] text-slate-400 font-mono">{r.document_number || r.document_name}</span>
                    {r.needs_attention && r.status === 'pending' && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                        <AlertTriangle className="w-2.5 h-2.5" /> Rever
                      </span>
                    )}
                    {r.status !== 'pending' && (
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${
                        r.status === 'rejected'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}>
                        {r.status === 'rejected' ? 'Rejeitado' : r.status === 'edited' ? 'Aprovado c/ correções' : 'Aprovado'}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                    {channelIcon(r.channel)} {r.date}
                    {r.due_date && <> · vence {r.due_date}</>}
                    {' · '}{r.suggested_category}
                    {r.decided_by && <> · decidido por {r.decided_by}</>}
                  </p>
                </button>

                <div className="text-right shrink-0">
                  <p className="font-bold text-slate-900 font-mono">{formatMoney(r.amount)}</p>
                  <p className="text-[9px] text-slate-400 flex items-center justify-end gap-1">
                    <Sparkles className="w-2.5 h-2.5" /> {r.ai_confidence}%
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
