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
  Check, X, Sparkles, Calendar, Tag, AlertTriangle, ArrowLeft, Receipt,
} from 'lucide-react';
import { toast } from 'sonner';
import { Category } from '@/types';
import { fetchCategories } from '@/services/data';
import { ApprovalDetail } from './types';
import { decide } from './api';
import { DocumentViewer } from './DocumentViewer';
import { ValidationChecklist } from './ValidationChecklist';
import { Badge, Button, Card, Field, Input, Select } from '@/components/ui';
import { formatDate } from '@/lib/format';

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
  // Sem taxa lida, o campo fica vazio. Pôr 23% por omissão marcava o item
  // como "corrigido" sem ninguém mexer e lançava IVA num documento que o
  // pode não ter.
  const [vatRate, setVatRate] = useState(item.vat_rate == null ? '' : String(item.vat_rate));
  const [categoryId, setCategoryId] = useState(item.suggested_category_id || '');
  const [categoryName, setCategoryName] = useState(item.suggested_category || '');
  const [dueDate, setDueDate] = useState(item.due_date || item.date || '');
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
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
    const res = await decide(item.id, changed ? 'edited' : 'approved', {
      amount: preview.gross,
      vat_rate: vatRate.trim() === '' ? undefined : preview.rate,
      category_id: categoryId || undefined,
      category_name: categoryName || undefined,
      due_date: dueDate || undefined,
    });
    setBusy(false);
    if (res.error) { toast.error(res.error); return; }
    onDone();
  };

  const reject = async () => {
    setBusy(true);
    const res = await decide(item.id, 'rejected', { rejection_reason: reason.trim() || undefined });
    setBusy(false);
    if (res.error) { toast.error(res.error); return; }
    onDone();
  };

  return (
    <div className="space-y-4 text-xs">
      <Button variant="ghost" size="sm" icon={<ArrowLeft />} onClick={onClose}>
        Voltar à fila
      </Button>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* ------------------------------------------------ original document */}
        <div className="min-h-[460px]">
          <DocumentViewer fileUrl={item.file_url} fileName={item.file_name} fileType={item.file_type} />
        </div>

        {/* ------------------------------------------------------- the numbers */}
        <div className="space-y-3">
          <Card className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold text-sm text-neutral-900 truncate">{item.supplier_name}</p>
                <p className="text-2xs text-neutral-500 mt-0.5">
                  <span className="font-mono">{item.document_number || item.document_name}</span> · {formatDate(item.date)}
                </p>
              </div>
              <Badge tone={item.needs_attention ? 'danger' : 'success'} className="shrink-0" title="Confiança da IA">
                <Sparkles className="w-3 h-3" aria-hidden="true" /> IA {item.ai_confidence}%
              </Badge>
            </div>

            {item.needs_attention && (
              <p role="alert" className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-2xs">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                Confiança baixa — confirme os valores contra o documento antes de aprovar.
              </p>
            )}

            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Total do documento (com IVA)">
                {(p) => (
                  <Input {...p} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="tabular-nums" />
                )}
              </Field>
              <Field label="Taxa de IVA (%)">
                {(p) => (
                  <Input {...p} value={vatRate} onChange={(e) => setVatRate(e.target.value)} inputMode="decimal" className="tabular-nums" />
                )}
              </Field>
              <Field
                className="sm:col-span-2"
                label={<span className="flex items-center gap-1.5"><Tag className="w-3 h-3" aria-hidden="true" /> Categoria</span>}
                hint={item.suggested_category ? `Sugestão da IA: ${item.suggested_category}` : undefined}
              >
                {(p) => (
                  <Select
                    {...p}
                    value={categoryId}
                    onChange={(e) => {
                      setCategoryId(e.target.value);
                      setCategoryName(categories.find((c) => c.id === e.target.value)?.name || '');
                    }}
                  >
                    <option value="">— Por classificar —</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                )}
              </Field>
              <Field
                className="sm:col-span-2"
                label={<span className="flex items-center gap-1.5"><Calendar className="w-3 h-3" aria-hidden="true" /> Vencimento</span>}
              >
                {(p) => (
                  <Input {...p} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                )}
              </Field>
            </div>

            {/* The identity the reviewer is checking against the paper. */}
            <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-3 space-y-1 tabular-nums text-xs">
              <div className="flex justify-between"><span className="text-neutral-500">Base tributável</span><span className="font-bold text-neutral-800">{formatMoney(preview.net)}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">IVA ({preview.rate}%)</span><span className="font-bold text-neutral-800">{formatMoney(preview.vat)}</span></div>
              <div className="flex justify-between pt-1 border-t border-neutral-200"><span className="text-neutral-700 font-bold">Total</span><span className="font-bold text-neutral-900">{formatMoney(preview.gross)}</span></div>
            </div>

            <p className="flex items-start gap-2 px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-700 text-2xs">
              <Receipt className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-600" aria-hidden="true" />
              <span>
                Aprovar cria uma <b>obrigação a pagar</b> de {formatMoney(preview.gross)} — não marca nada como pago.
                O pagamento regista-se depois, no lançamento.
              </span>
            </p>

            {rejecting ? (
              <div className="space-y-2">
                <Input
                  aria-label="Motivo da rejeição"
                  value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="Motivo da rejeição (opcional)"
                />
                <div className="flex gap-2">
                  <Button variant="danger" className="flex-1" onClick={reject} loading={busy} icon={<X />}>
                    Confirmar rejeição
                  </Button>
                  <Button variant="secondary" onClick={() => setRejecting(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button variant="accent" className="flex-1" onClick={approve} loading={busy} icon={<Check />}>
                  {changed ? 'Aprovar com correções' : 'Aprovar'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setRejecting(true)}
                  icon={<X />}
                  className="hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200"
                >
                  Rejeitar
                </Button>
              </div>
            )}
          </Card>

          <ValidationChecklist checks={detail.validation} confidence={detail.extraction?.confidence} />

          {detail.extraction && (
            <Card className="p-3 space-y-1 text-2xs">
              <p className="font-bold text-neutral-700 flex items-center gap-1.5 mb-1 text-xs">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" /> O que a IA leu
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-neutral-600">
                <span>Fornecedor</span><span className="font-mono text-neutral-800">{detail.extraction.supplier || '—'}</span>
                <span>NIF</span><span className="font-mono text-neutral-800">{detail.extraction.nif || '—'}</span>
                <span>Nº documento</span><span className="font-mono text-neutral-800">{detail.extraction.document_number || '—'}</span>
                <span>Data</span><span className="font-mono text-neutral-800">{detail.extraction.document_date ? formatDate(detail.extraction.document_date) : '—'}</span>
                <span>Base / IVA / Total</span>
                <span className="font-mono text-neutral-800">
                  {detail.extraction.net_amount ?? '—'} / {detail.extraction.vat_amount ?? '—'} / {detail.extraction.gross_amount ?? '—'}
                </span>
                <span>Motor</span><span className="font-mono text-neutral-800">{detail.extraction.ai_model || '—'}</span>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
