'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { fetchTransaction, updateTransaction } from '@/services/data';
import { Transaction } from '@/types';
import {
  ArrowLeft, Pencil, Save, X, Loader2, FileText, Sparkles, RefreshCcw, ShieldCheck,
  Wallet, Calendar, Building2, Tag, Upload, ExternalLink, Check, AlertTriangle, Landmark, Bot, User
} from 'lucide-react';

/* ---------- helpers ---------- */

const CENTS = 100;
const round2 = (n: number) => Math.round(n * CENTS) / CENTS;

function deriveAmounts(gross: number, vatRate?: number) {
  if (!vatRate) return { net: round2(gross), vat: 0, gross: round2(gross) };
  const net = round2(gross / (1 + vatRate / 100));
  return { net, vat: round2(gross - net), gross: round2(gross) };
}

const STATUS_STYLES: Record<string, string> = {
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  approved: 'bg-blue-50 text-blue-700 border-blue-200',
  pending_approval: 'bg-amber-50 text-amber-700 border-amber-200',
  pending_ai: 'bg-amber-50 text-amber-700 border-amber-200',
  draft: 'bg-slate-100 text-slate-600 border-slate-200',
  cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
};

const PAY_STATUS: Record<string, { label: string; cls: string }> = {
  paid: { label: 'Pago', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  partially_paid: { label: 'Parcialmente pago', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  pending: { label: 'Pendente', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  overdue: { label: 'Vencido', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  cancelled: { label: 'Cancelado', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">{label}</span>
      <div className="text-xs font-semibold text-slate-800 break-words">{children || <span className="text-slate-300">—</span>}</div>
    </div>
  );
}

function EditInput({ value, onChange, type = 'text', placeholder }: {
  value: string | number | undefined; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <input
      type={type}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
    />
  );
}

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5">
      <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2 mb-4">
        <span className="text-indigo-600">{icon}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}

/* ---------- page ---------- */

export default function TransactionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id || '');
  const { formatMoney, setPageHeader } = useApp();

  const [trx, setTrx] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<Partial<Transaction>>({});
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const data = await fetchTransaction(id);
      if (active) {
        setTrx(data);
        setForm(data || {});
        setLoading(false);
        if (data) {
          setPageHeader(data.description, `Detalhes da transação · ${data.document_number || data.id}`);
        }
      }
    })();
    return () => { active = false; };
  }, [id, setPageHeader]);

  const set = (patch: Partial<Transaction>) => setForm((f) => ({ ...f, ...patch }));

  // Live IVA preview while editing.
  const preview = useMemo(() => {
    const gross = Number(form.amount ?? 0);
    return deriveAmounts(gross, form.vat_rate ? Number(form.vat_rate) : undefined);
  }, [form.amount, form.vat_rate]);

  const startEdit = () => { setForm(trx || {}); setEditMode(true); };
  const cancelEdit = () => { setForm(trx || {}); setEditMode(false); };

  const save = async () => {
    if (!trx) return;
    setSaving(true);
    const patch: Partial<Transaction> = {
      description: form.description,
      entity_name: form.entity_name,
      category_name: form.category_name,
      cost_center_name: form.cost_center_name,
      amount: Number(form.amount),
      vat_rate: form.vat_rate ? Number(form.vat_rate) : undefined,
      currency: form.currency,
      due_date: form.due_date,
      payment_date: form.payment_date,
      payment_method: form.payment_method,
      payment_status: form.payment_status,
      paid_amount: form.paid_amount != null ? Number(form.paid_amount) : undefined,
      document_number: form.document_number,
      document_type: form.document_type,
      document_date: form.document_date,
      notes: form.notes,
      tags: form.tags,
    };

    const updated = await updateTransaction(trx.id, patch);
    // Fall back to an optimistic local merge (with recomputed IVA) in demo/offline mode.
    const derived = deriveAmounts(Number(form.amount ?? 0), form.vat_rate ? Number(form.vat_rate) : undefined);
    const merged: Transaction = updated ?? {
      ...trx, ...patch,
      net_amount: derived.net, vat_amount: derived.vat, gross_amount: derived.gross,
      outstanding_amount: round2(derived.gross - Number(form.paid_amount ?? 0)),
    } as Transaction;

    setTrx(merged);
    setForm(merged);
    setSaving(false);
    setEditMode(false);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2200);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400 text-sm gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> A carregar lançamento…
      </div>
    );
  }

  if (!trx) {
    return (
      <div className="text-center py-24 space-y-3">
        <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
        <p className="text-sm font-semibold text-slate-700">Lançamento não encontrado</p>
        <button onClick={() => router.push('/financial/cash-flow')} className="text-xs text-indigo-600 font-bold hover:underline">
          ← Voltar ao fluxo de caixa
        </button>
      </div>
    );
  }

  const v = editMode ? form : trx;
  const isIncome = trx.type === 'income';
  const payStatus = PAY_STATUS[(v.payment_status as string) || 'pending'] || PAY_STATUS.pending;
  const docUrl = trx.document_url;
  const isImage = docUrl ? /\.(png|jpe?g|webp|gif)$/i.test(docUrl) : false;

  return (
    <div className="space-y-4 animate-in fade-in duration-300 pb-6">
      {/* Header Actions */}
      <div className="flex justify-between gap-3 pb-3">
        <button onClick={() => router.push('/financial/cash-flow')} className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 shadow-xs flex items-center gap-2 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-xs font-bold hidden sm:inline">Voltar</span>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          {savedToast && (
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> Guardado
            </span>
          )}
          {!editMode ? (
            <button onClick={startEdit} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs">
              <Pencil className="w-3.5 h-3.5" /> Editar
            </button>
          ) : (
            <>
              <button onClick={cancelEdit} className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold text-xs hover:bg-slate-50 flex items-center gap-1.5">
                <X className="w-3.5 h-3.5" /> Cancelar
              </button>
              <button onClick={save} disabled={saving} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs disabled:opacity-70">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Guardar
              </button>
            </>
          )}
        </div>
      </div>

      {/* Amount + status banner */}
      <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-[10px] uppercase tracking-widest text-white/50 font-bold">{isIncome ? 'Receita' : trx.type === 'transfer' ? 'Transferência' : 'Despesa'} · Total</span>
          <div className={`text-3xl font-black ${isIncome ? 'text-emerald-400' : 'text-white'}`}>
            {isIncome ? '+' : '-'}{formatMoney(Number(trx.gross_amount ?? trx.amount))}
          </div>
          <div className="text-[11px] text-white/60 mt-0.5">
            Líquido {formatMoney(Number(trx.net_amount ?? trx.amount))} · IVA {formatMoney(Number(trx.vat_amount ?? 0))}
            {trx.vat_rate ? ` (${trx.vat_rate}%)` : ''}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border ${STATUS_STYLES[trx.status] || STATUS_STYLES.draft}`}>
            {trx.status}
          </span>
          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border ${payStatus.cls}`}>
            {payStatus.label}
          </span>
          <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border bg-white/10 text-white/80 border-white/20">
            {trx.source === 'ai' ? (
              <span className="flex items-center gap-1"><Bot className="w-3 h-3" /> IA</span>
            ) : trx.source === 'bank' ? (
              <span className="flex items-center gap-1"><Landmark className="w-3 h-3" /> Banco</span>
            ) : (
              <span className="flex items-center gap-1"><User className="w-3 h-3" /> Manual</span>
            )}
          </span>
        </div>
      </div>

      {/* Two-column layout: info (left) + invoice/documents (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT — all information */}
        <div className="lg:col-span-2 space-y-4">
          {/* Valores & IVA */}
          <SectionCard title="Valores & IVA" icon={<Wallet className="w-4 h-4" />}>
            {editMode ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Total (c/ IVA)</span>
                    <EditInput type="number" value={form.amount} onChange={(x) => set({ amount: Number(x) })} />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Taxa IVA (%)</span>
                    <select
                      value={form.vat_rate ?? 0}
                      onChange={(e) => set({ vat_rate: Number(e.target.value) })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                    >
                      <option value={0}>0% (Isento)</option>
                      <option value={6}>6%</option>
                      <option value={13}>13%</option>
                      <option value={23}>23%</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-xl text-center">
                  <div><div className="text-[10px] text-slate-400 font-bold uppercase">Líquido</div><div className="text-xs font-bold text-slate-800">{formatMoney(preview.net)}</div></div>
                  <div><div className="text-[10px] text-slate-400 font-bold uppercase">IVA</div><div className="text-xs font-bold text-slate-800">{formatMoney(preview.vat)}</div></div>
                  <div><div className="text-[10px] text-slate-400 font-bold uppercase">Total</div><div className="text-xs font-black text-indigo-700">{formatMoney(preview.gross)}</div></div>
                </div>
                <p className="text-[10px] text-slate-400">O líquido e o IVA são recalculados automaticamente a partir do total e da taxa.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Field label="Valor líquido">{formatMoney(Number(v.net_amount ?? v.amount))}</Field>
                <Field label={`IVA${v.vat_rate ? ` (${v.vat_rate}%)` : ''}`}>{formatMoney(Number(v.vat_amount ?? 0))}</Field>
                <Field label="Total">{formatMoney(Number(v.gross_amount ?? v.amount))}</Field>
                <Field label="Moeda">{v.currency || 'EUR'}</Field>
              </div>
            )}
          </SectionCard>

          {/* Pagamento */}
          <SectionCard title="Pagamento & Liquidação" icon={<Landmark className="w-4 h-4" />}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {editMode ? (
                <>
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Estado financeiro</span>
                    <select value={form.payment_status ?? 'pending'} onChange={(e) => set({ payment_status: e.target.value as Transaction['payment_status'] })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                      <option value="pending">Pendente</option>
                      <option value="partially_paid">Parcialmente pago</option>
                      <option value="paid">Pago</option>
                      <option value="overdue">Vencido</option>
                      <option value="cancelled">Cancelado</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Valor pago</span>
                    <EditInput type="number" value={form.paid_amount} onChange={(x) => set({ paid_amount: Number(x) })} />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Data pagamento</span>
                    <EditInput type="date" value={form.payment_date} onChange={(x) => set({ payment_date: x })} />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Método</span>
                    <EditInput value={form.payment_method} onChange={(x) => set({ payment_method: x })} />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Vencimento</span>
                    <EditInput type="date" value={form.due_date} onChange={(x) => set({ due_date: x })} />
                  </div>
                </>
              ) : (
                <>
                  <Field label="Estado financeiro">{payStatus.label}</Field>
                  <Field label="Valor pago">{formatMoney(Number(v.paid_amount ?? 0))}</Field>
                  <Field label="Em aberto">{formatMoney(Number(v.outstanding_amount ?? 0))}</Field>
                  <Field label="Vencimento">{v.due_date}</Field>
                  <Field label="Data pagamento">{v.payment_date}</Field>
                  <Field label="Método">{v.payment_method}</Field>
                  <Field label="Referência">{v.payment_reference}</Field>
                </>
              )}
            </div>
          </SectionCard>

          {/* Classificação & Entidade */}
          <SectionCard title="Classificação & Entidade" icon={<Building2 className="w-4 h-4" />}>
            <div className="grid grid-cols-2 gap-4">
              {editMode ? (
                <>
                  <div className="space-y-1 col-span-2"><span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Descrição</span><EditInput value={form.description} onChange={(x) => set({ description: x })} /></div>
                  <div className="space-y-1"><span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Entidade</span><EditInput value={form.entity_name} onChange={(x) => set({ entity_name: x })} /></div>
                  <div className="space-y-1"><span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Categoria</span><EditInput value={form.category_name} onChange={(x) => set({ category_name: x })} /></div>
                  <div className="space-y-1"><span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Centro de custo</span><EditInput value={form.cost_center_name} onChange={(x) => set({ cost_center_name: x })} /></div>
                </>
              ) : (
                <>
                  <Field label="Entidade (Forn./Cliente)">{v.entity_name}</Field>
                  <Field label="ID da entidade">{v.entity_id}</Field>
                  <Field label="Categoria">{v.category_name}</Field>
                  <Field label="ID categoria">{v.category_id}</Field>
                  <Field label="Centro de custo">{v.cost_center_name}</Field>
                  <Field label="Data do movimento">{v.date}</Field>
                </>
              )}
            </div>
          </SectionCard>

          {/* Recorrência + Notas & Tags */}
          <SectionCard title="Recorrência, Notas & Etiquetas" icon={<RefreshCcw className="w-4 h-4" />}>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 text-xs">
                <span className="font-semibold text-indigo-950">Recorrência automática</span>
                <span className="font-bold text-indigo-700 bg-white px-2 py-0.5 rounded border border-indigo-200">
                  {v.is_recurring ? `Sim (${v.recurrence_period || 'mensal'})` : 'Não'}
                </span>
              </div>
              {editMode ? (
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Notas</span>
                  <textarea rows={2} value={form.notes ?? ''} onChange={(e) => set({ notes: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white resize-none" />
                </div>
              ) : (
                <Field label="Notas">{v.notes}</Field>
              )}
              <div className="flex items-center gap-1.5 flex-wrap">
                {(v.tags || []).length ? (v.tags || []).map((t) => (
                  <span key={t} className="text-[10px] bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded font-medium flex items-center gap-1">
                    <Tag className="w-2.5 h-2.5" /> {t}
                  </span>
                )) : <span className="text-slate-300 text-xs">Sem etiquetas</span>}
              </div>
            </div>
          </SectionCard>

          {/* Auditoria & IA */}
          <SectionCard title="Auditoria & Rastreabilidade IA" icon={<ShieldCheck className="w-4 h-4" />}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Field label="Criado por">{trx.created_by}</Field>
              <Field label="Aprovado por">{trx.approved_by}</Field>
              <Field label="Aprovado em">{trx.approved_at}</Field>
              <Field label="Origem">{trx.source}</Field>
              <Field label="Confiança IA">{trx.ai_confidence != null ? `${trx.ai_confidence}%` : '—'}</Field>
              <Field label="Última alteração">{trx.updated_at}</Field>
            </div>
          </SectionCard>
        </div>

        {/* RIGHT — original invoice + stored documents */}
        <div className="space-y-4">
          <SectionCard title="Fatura Original" icon={<FileText className="w-4 h-4" />}>
            <div className="space-y-3">
              {docUrl ? (
                <>
                  <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50 h-[420px]">
                    {isImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={docUrl} alt={trx.document_name || 'Fatura'} className="w-full h-full object-contain" />
                    ) : (
                      <iframe src={docUrl} title="Fatura original" className="w-full h-full" />
                    )}
                  </div>
                  <a href={docUrl} target="_blank" rel="noopener noreferrer"
                    className="w-full py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-50 flex items-center justify-center gap-1.5">
                    <ExternalLink className="w-3.5 h-3.5" /> Abrir em nova aba
                  </a>
                </>
              ) : (
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center space-y-2">
                  <Upload className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-xs font-semibold text-slate-600">Nenhuma fatura anexada</p>
                  <p className="text-[11px] text-slate-400">Arraste o PDF/imagem original aqui para guardar e validar.</p>
                  <button className="mt-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[11px] font-bold hover:bg-indigo-700">
                    Anexar documento
                  </button>
                </div>
              )}
            </div>
          </SectionCard>

          {/* Stored documents */}
          <SectionCard title="Documentos Guardados" icon={<FileText className="w-4 h-4" />}>
            {trx.document_id || trx.document_name ? (
              <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50">
                <div className="w-9 h-9 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-800 truncate">{trx.document_name || 'Documento'}</div>
                  <div className="text-[10px] text-slate-400 font-mono truncate">
                    {trx.document_type || 'documento'} · {trx.document_number || trx.document_id}
                  </div>
                </div>
                {docUrl && (
                  <a href={docUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800 shrink-0">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400 text-center py-3">Nenhum documento associado a este lançamento.</p>
            )}

            <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-3">
              <Field label="Nº documento">{trx.document_number}</Field>
              <Field label="Tipo">{trx.document_type}</Field>
              <Field label="Data documento">{trx.document_date}</Field>
              <Field label="ID documento">{trx.document_id}</Field>
            </div>
          </SectionCard>

          {/* AI confidence card */}
          <div className="p-4 bg-gradient-to-br from-indigo-900 to-slate-900 text-white rounded-2xl space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-300" /> Confiança da extração IA
              </span>
              <span className="font-mono text-emerald-400 font-bold text-sm">{trx.ai_confidence ?? '—'}{trx.ai_confidence != null ? '%' : ''}</span>
            </div>
            <p className="text-[11px] text-slate-300">
              Classificado com base no histórico do fornecedor e palavras-chave. Reveja os valores antes de confirmar o pagamento.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
