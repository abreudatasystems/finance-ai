'use client';

/**
 * The decision screen: the invoice on one side, the numbers on the other.
 *
 * Everything the reviewer can change is a field here — total, VAT rate,
 * category, due date. Editing anything makes the decision an `edited` one, so
 * the audit trail records that a human changed what the AI proposed.
 *
 * The live preview spells out base + IVA = total, because that is the identity
 * the reviewer is actually checking against the paper.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Check, X, Loader2, Sparkles, Calendar, Tag, AlertTriangle, ArrowLeft, Receipt,
} from 'lucide-react';
import { Category } from '@/types';
import { fetchCategories } from '@/services/data';
import { ApprovalDetail } from './types';
import { decide } from './api';
import { DocumentViewer } from './DocumentViewer';
import { ValidationChecklist } from './ValidationChecklist';

interface Props {
  detail: ApprovalDetail;
  onDone: () => void;
  onClose: () => void;
  formatMoney: (n: number) => string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const ApprovalInspector: React.FC<Props> = ({ detail, onDone, onClose, formatMoney }) => {
  const item = detail.approval;

  const [amount, setAmount] = useState(String(item.amount ?? ''));
  const [vatRate, setVatRate] = useState(String(item.vat_rate ?? 23));
  const [categoryId, setCategoryId] = useState(item.suggested_category_id || '');
  const [categoryName, setCategoryName] = useState(item.suggested_category || '');
  const [dueDate, setDueDate] = useState(item.due_date || item.date || '');
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    fetchCategories().then((tree) => {
      // Flatten so subcategories are selectable too — that is where the useful
      // classification usually lives (FSE → Eletricidade e Água).
      const flat: Category[] = [];
      const walk = (nodes: Category[], prefix = '') => {
        nodes.forEach((n) => {
          flat.push({ ...n, name: prefix ? `${prefix} › ${n.name}` : n.name });
          if (n.children?.length) walk(n.children, prefix ? `${prefix} › ${n.name}` : n.name);
        });
      };
      walk(tree);
      setCategories(flat.filter((c) => c.type === 'expense'));
    });
  }, []);

  /** base + IVA = total, recomputed from what is on screen. */
  const preview = useMemo(() => {
    const gross = parseFloat(amount.replace(',', '.')) || 0;
    const rate = parseFloat(vatRate.replace(',', '.')) || 0;
    const net = rate > 0 ? round2(gross / (1 + rate / 100)) : gross;
    return { gross: round2(gross), net, vat: round2(gross - net), rate };
  }, [amount, vatRate]);

  const changed =
    round2(parseFloat(amount.replace(',', '.')) || 0) !== round2(Number(item.amount) || 0) ||
    (parseFloat(vatRate.replace(',', '.')) || 0) !== (item.vat_rate || 0) ||
    categoryId !== (item.suggested_category_id || '') ||
    dueDate !== (item.due_date || item.date || '');

  const approve = async () => {
    setBusy(true);
    setError(null);
    const res = await decide(item.id, changed ? 'edited' : 'approved', {
      amount: preview.gross,
      vat_rate: preview.rate,
      category_id: categoryId || undefined,
      category_name: categoryName || undefined,
      due_date: dueDate || undefined,
    });
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    onDone();
  };

  const reject = async () => {
    setBusy(true);
    setError(null);
    const res = await decide(item.id, 'rejected', { rejection_reason: reason.trim() || undefined });
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    onDone();
  };

  return (
    <div className="space-y-4 text-xs">
      <button onClick={onClose} className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-800 font-semibold">
        <ArrowLeft className="w-3.5 h-3.5" /> Voltar à fila
      </button>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* ------------------------------------------------ original document */}
        <div className="min-h-[460px]">
          <DocumentViewer fileUrl={item.file_url} fileName={item.file_name} fileType={item.file_type} />
        </div>

        {/* ------------------------------------------------------- the numbers */}
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold text-sm text-slate-900 truncate">{item.supplier_name}</p>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                  {item.document_number || item.document_name} · {item.date}
                </p>
              </div>
              <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border shrink-0 flex items-center gap-1 ${
                item.needs_attention
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}>
                <Sparkles className="w-2.5 h-2.5" /> IA {item.ai_confidence}%
              </span>
            </div>

            {item.needs_attention && (
              <p className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px]">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                Confiança baixa — confirme os valores contra o documento antes de aprovar.
              </p>
            )}

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="space-y-1.5">
                <span className="font-bold text-slate-700">Total do documento (com IVA)</span>
                <input
                  value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
                />
              </label>
              <label className="space-y-1.5">
                <span className="font-bold text-slate-700">Taxa de IVA (%)</span>
                <input
                  value={vatRate} onChange={(e) => setVatRate(e.target.value)} inputMode="decimal"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
                />
              </label>
              <label className="space-y-1.5 sm:col-span-2">
                <span className="font-bold text-slate-700 flex items-center gap-1.5"><Tag className="w-3 h-3" /> Categoria</span>
                <select
                  value={categoryId}
                  onChange={(e) => {
                    setCategoryId(e.target.value);
                    setCategoryName(categories.find((c) => c.id === e.target.value)?.name || '');
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">— Por classificar —</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {item.suggested_category && (
                  <span className="text-[10px] text-slate-400">Sugestão da IA: {item.suggested_category}</span>
                )}
              </label>
              <label className="space-y-1.5 sm:col-span-2">
                <span className="font-bold text-slate-700 flex items-center gap-1.5"><Calendar className="w-3 h-3" /> Vencimento</span>
                <input
                  type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
                />
              </label>
            </div>

            {/* The identity the reviewer is checking against the paper. */}
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-1 font-mono text-[11px]">
              <div className="flex justify-between"><span className="text-slate-500">Base tributável</span><span className="font-bold text-slate-800">{formatMoney(preview.net)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">IVA ({preview.rate}%)</span><span className="font-bold text-slate-800">{formatMoney(preview.vat)}</span></div>
              <div className="flex justify-between pt-1 border-t border-slate-200"><span className="text-slate-700 font-bold">Total</span><span className="font-bold text-slate-900">{formatMoney(preview.gross)}</span></div>
            </div>

            <p className="flex items-start gap-2 px-3 py-2 rounded-xl bg-indigo-50/60 border border-indigo-100 text-indigo-900 text-[11px]">
              <Receipt className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              Aprovar cria uma <b>obrigação a pagar</b> de {formatMoney(preview.gross)} — não marca nada como pago.
              O pagamento regista-se depois, no lançamento.
            </p>

            {error && <p className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-[11px]">{error}</p>}

            {rejecting ? (
              <div className="space-y-2">
                <input
                  value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="Motivo da rejeição (opcional)"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-rose-100"
                />
                <div className="flex gap-2">
                  <button onClick={reject} disabled={busy} className="flex-1 px-3 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold flex items-center justify-center gap-1.5 disabled:opacity-50">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />} Confirmar rejeição
                  </button>
                  <button onClick={() => setRejecting(false)} className="px-3 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-700 hover:bg-slate-50">
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button onClick={approve} disabled={busy} className="flex-1 px-3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center gap-1.5 disabled:opacity-50">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {changed ? 'Aprovar com correções' : 'Aprovar'}
                </button>
                <button onClick={() => setRejecting(true)} className="px-3 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 flex items-center gap-1.5">
                  <X className="w-4 h-4" /> Rejeitar
                </button>
              </div>
            )}
          </div>

          <ValidationChecklist checks={detail.validation} confidence={detail.extraction?.confidence} />

          {detail.extraction && (
            <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1 text-[11px]">
              <p className="font-bold text-slate-700 flex items-center gap-1.5 mb-1">
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" /> O que a IA leu
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-slate-600">
                <span>Fornecedor</span><span className="font-mono text-slate-800">{detail.extraction.supplier || '—'}</span>
                <span>NIF</span><span className="font-mono text-slate-800">{detail.extraction.nif || '—'}</span>
                <span>Nº documento</span><span className="font-mono text-slate-800">{detail.extraction.document_number || '—'}</span>
                <span>Data</span><span className="font-mono text-slate-800">{detail.extraction.document_date || '—'}</span>
                <span>Base / IVA / Total</span>
                <span className="font-mono text-slate-800">
                  {detail.extraction.net_amount ?? '—'} / {detail.extraction.vat_amount ?? '—'} / {detail.extraction.gross_amount ?? '—'}
                </span>
                <span>Motor</span><span className="font-mono text-slate-800">{detail.extraction.ai_model || '—'}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
