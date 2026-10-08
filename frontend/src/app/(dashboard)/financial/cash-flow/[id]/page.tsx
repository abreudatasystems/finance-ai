'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { fetchTransaction, updateTransaction } from '@/services/data';
import { Transaction } from '@/types';
import { SettlementPanel } from '@/components/financial/SettlementPanel';
import { InvoiceLinesEditor } from '@/components/lines/InvoiceLinesEditor';
import { DocumentViewer, openDocument } from '@/components/approvals/DocumentViewer';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft, Pencil, Save, X, FileText, Sparkles, RefreshCcw, ShieldCheck, Wallet, Building2, Tag, Upload,
  ExternalLink, Landmark, Bot, User,
} from 'lucide-react';
import {
  Badge, Button, IconButton, Card, CardHeader, CardBody, Field, Input, Textarea,
  LoadingState, EmptyState, ErrorState, cn,
} from '@/components/ui';
import type { BadgeTone } from '@/components/ui';
import { formatDate, documentStatusLabel } from '@/lib/format';

/* ---------- helpers ---------- */

const CENTS = 100;
const round2 = (n: number) => Math.round(n * CENTS) / CENTS;

function deriveAmounts(gross: number, vatRate?: number) {
  if (!vatRate) return { net: round2(gross), vat: 0, gross: round2(gross) };
  const net = round2(gross / (1 + vatRate / 100));
  return { net, vat: round2(gross - net), gross: round2(gross) };
}

const STATUS_TONES: Record<string, BadgeTone> = {
  paid: 'success',
  approved: 'neutral',
  pending_approval: 'warning',
  pending_ai: 'warning',
  draft: 'neutral',
  cancelled: 'danger',
};

const PAY_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  paid: { label: 'Pago', tone: 'success' },
  partially_paid: { label: 'Parcialmente pago', tone: 'warning' },
  pending: { label: 'Pendente', tone: 'neutral' },
  overdue: { label: 'Vencido', tone: 'danger' },
  cancelled: { label: 'Cancelado', tone: 'danger' },
};

/** Um valor só de leitura, com a sua etiqueta por cima. */
function ReadField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <span className="text-2xs uppercase tracking-wider text-neutral-500 font-bold block">{label}</span>
      <div className="text-xs font-semibold text-neutral-800 break-words">{children || <span className="text-neutral-300">—</span>}</div>
    </div>
  );
}

/** Campo editável com etiqueta ligada (htmlFor/id). */
function EditField({ label, value, onChange, type = 'text', placeholder, className }: {
  label: string; value: string | number | undefined; onChange: (v: string) => void;
  type?: string; placeholder?: string; className?: string;
}) {
  return (
    <Field label={label} className={className}>
      {(p) => (
        <Input
          {...p}
          type={type}
          value={value ?? ''}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={type === 'number' ? 'tabular-nums' : undefined}
        />
      )}
    </Field>
  );
}

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} icon={icon} />
      <CardBody>{children}</CardBody>
    </Card>
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

  const reload = useCallback(async () => {
    const data = await fetchTransaction(id);
    setTrx(data);
    setForm(data || {});
    if (data) {
      setPageHeader(data.description, `Detalhes da transação · ${data.document_number || data.id}`);
    }
  }, [id, setPageHeader]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      await reload();
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [reload]);

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
      // `!= null` e não truthy: a taxa 0 (isento) também é uma escolha, e
      // ficava por enviar — o IVA mantinha-se o da taxa antiga.
      vat_rate: form.vat_rate != null && String(form.vat_rate) !== '' ? Number(form.vat_rate) : undefined,
      currency: form.currency,
      due_date: form.due_date,
      payment_date: form.payment_date,
      payment_method: form.payment_method,
      document_number: form.document_number,
      document_type: form.document_type,
      document_date: form.document_date,
      notes: form.notes,
      tags: form.tags,
    };

    const { data: updated, error } = await updateTransaction(trx.id, patch);
    if (!updated) {
      // Fica em edição, com o que foi escrito, para se poder corrigir.
      setSaving(false);
      toast.error(error || 'Não foi possível guardar o lançamento.');
      return;
    }

    setTrx(updated);
    setForm(updated);
    setSaving(false);
    setEditMode(false);
    toast.success('Lançamento guardado.');
  };

  if (loading) {
    return <LoadingState label="A carregar lançamento…" className="py-24" />;
  }

  if (!trx) {
    return (
      <Card>
        <ErrorState
          message="Lançamento não encontrado"
          className="py-20"
          action={
            <Button variant="secondary" size="sm" icon={<ArrowLeft />} onClick={() => router.push('/financial/cash-flow')}>
              Voltar ao fluxo de caixa
            </Button>
          }
        />
      </Card>
    );
  }

  const v = editMode ? form : trx;
  const isIncome = trx.type === 'income';
  const payStatus = PAY_STATUS[(v.payment_status as string) || 'pending'] || PAY_STATUS.pending;
  const docUrl = trx.document_url;

  return (
    <div className="space-y-4 animate-in fade-in duration-300 pb-6">
      {/* Header Actions */}
      <div className="flex justify-between gap-3 pb-3">
        <Button variant="secondary" icon={<ArrowLeft />} onClick={() => router.push('/financial/cash-flow')} aria-label="Voltar">
          <span className="hidden sm:inline">Voltar</span>
        </Button>

        <div className="flex items-center gap-2 shrink-0">
          {!editMode ? (
            <Button icon={<Pencil />} onClick={startEdit}>
              Editar
            </Button>
          ) : (
            <>
              <Button variant="secondary" icon={<X />} onClick={cancelEdit}>
                Cancelar
              </Button>
              <Button icon={<Save />} onClick={save} loading={saving}>
                Guardar
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Amount + status banner */}
      <div className="bg-neutral-950 text-white rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-2xs uppercase tracking-widest text-white/60 font-bold">{isIncome ? 'Receita' : trx.type === 'transfer' ? 'Transferência' : 'Despesa'} · Total</span>
          <div className={cn('text-3xl font-black tabular-nums', isIncome ? 'text-emerald-400' : 'text-white')}>
            {isIncome ? '+' : '-'}{formatMoney(Number(trx.gross_amount ?? trx.amount))}
          </div>
          <div className="text-xs text-white/60 mt-0.5 tabular-nums">
            Líquido {formatMoney(Number(trx.net_amount ?? trx.amount))} · IVA {formatMoney(Number(trx.vat_amount ?? 0))}
            {trx.vat_rate ? ` (${trx.vat_rate}%)` : ''}
          </div>
          {/* O total do documento não é o que se move: a retenção vai para o
              Estado, por isso o valor do banco aparece ao lado dele. */}
          {Number(trx.retention_amount ?? 0) > 0 && (
            <div className="text-xs mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
              <span className="px-1.5 py-0.5 rounded-md bg-amber-400/20 text-amber-200 text-2xs font-bold uppercase">
                Retenção {trx.retention_rate ? `${trx.retention_rate}%` : ''}
              </span>
              <span className="text-amber-200">−{formatMoney(Number(trx.retention_amount))}</span>
              <span className="text-white/40" aria-hidden="true">·</span>
              <span className="text-white/80 font-bold">
                {isIncome ? 'o cliente transfere' : 'sai do banco'}{' '}
                {formatMoney(Number(trx.payable_amount ?? trx.gross_amount ?? trx.amount))}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge tone={STATUS_TONES[trx.status] || 'neutral'} className="uppercase">
            {documentStatusLabel(trx.status)}
          </Badge>
          <Badge tone={payStatus.tone} className="uppercase">
            {payStatus.label}
          </Badge>
          <Badge className="uppercase bg-white/10 text-white/80 border-white/20">
            {trx.source === 'ai' ? (
              <><Bot className="w-3 h-3" aria-hidden="true" /> IA</>
            ) : trx.source === 'bank' ? (
              <><Landmark className="w-3 h-3" aria-hidden="true" /> Banco</>
            ) : (
              <><User className="w-3 h-3" aria-hidden="true" /> Manual</>
            )}
          </Badge>
        </div>
      </div>

      {/* Two-column layout: info (left) + invoice/documents (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT — all information */}
        <div className="lg:col-span-2 space-y-4">
          {/* Valores & IVA */}
          <SectionCard title="Valores & IVA" icon={<Wallet />}>
            {editMode ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <EditField label="Total (c/ IVA)" type="number" value={form.amount} onChange={(x) => set({ amount: Number(x) })} />
                  <Field label="Taxa IVA (%)">
                    {(p) => (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Input
                          {...p}
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={form.vat_rate ?? 0}
                          onChange={(e) => set({ vat_rate: Math.min(100, Math.max(0, Number(e.target.value))) })}
                          placeholder="ex: 17.5"
                          className="w-20 font-bold tabular-nums"
                        />
                        <span className="text-xs font-bold text-neutral-500" aria-hidden="true">%</span>
                        <div className="flex gap-1" role="group" aria-label="Taxas comuns">
                          {[0, 6, 13, 23].map((r) => (
                            <button
                              key={r}
                              type="button"
                              aria-pressed={Number(form.vat_rate ?? 0) === r}
                              onClick={() => set({ vat_rate: r })}
                              className={cn(
                                'h-7 px-2 rounded-md border text-2xs font-bold transition-colors cursor-pointer',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
                                Number(form.vat_rate ?? 0) === r
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                  : 'bg-neutral-50 border-neutral-200 text-neutral-600 hover:border-neutral-300',
                              )}
                            >
                              {r === 0 ? 'Isento' : `${r}%`}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </Field>
                </div>
                <div className="grid grid-cols-3 gap-2 p-3 bg-neutral-50 rounded-xl text-center tabular-nums">
                  <div><div className="text-2xs text-neutral-500 font-bold uppercase">Líquido</div><div className="text-xs font-bold text-neutral-800">{formatMoney(preview.net)}</div></div>
                  <div><div className="text-2xs text-neutral-500 font-bold uppercase">IVA</div><div className="text-xs font-bold text-neutral-800">{formatMoney(preview.vat)}</div></div>
                  <div><div className="text-2xs text-neutral-500 font-bold uppercase">Total</div><div className="text-xs font-black text-neutral-950">{formatMoney(preview.gross)}</div></div>
                </div>
                <p className="text-2xs text-neutral-500">O líquido e o IVA são recalculados automaticamente a partir do total e da taxa.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 tabular-nums">
                <ReadField label="Valor líquido">{formatMoney(Number(v.net_amount ?? v.amount))}</ReadField>
                <ReadField label={`IVA${v.vat_rate ? ` (${v.vat_rate}%)` : ''}`}>{formatMoney(Number(v.vat_amount ?? 0))}</ReadField>
                <ReadField label="Total">{formatMoney(Number(v.gross_amount ?? v.amount))}</ReadField>
                {Number(v.retention_amount ?? 0) > 0 ? (
                  <>
                    <ReadField label={`Retenção${v.retention_rate ? ` (${v.retention_rate}%)` : ''}`}>
                      −{formatMoney(Number(v.retention_amount))}
                    </ReadField>
                    <ReadField label="Move no banco">
                      {formatMoney(Number(v.payable_amount ?? v.gross_amount ?? v.amount))}
                    </ReadField>
                  </>
                ) : null}
                <ReadField label="Moeda">{v.currency || 'EUR'}</ReadField>
              </div>
            )}
          </SectionCard>

          {/* Detalhe por linhas: uma fatura com várias taxas de IVA */}
          <InvoiceLinesEditor
            transactionId={trx.id}
            formatMoney={formatMoney}
            onChanged={reload}
          />

          {/* Liquidação: parcelas e movimentos reais */}
          <SettlementPanel
            transaction={trx}
            formatMoney={formatMoney}
            onChanged={reload}
          />

          {/* Classificação & Entidade */}
          <SectionCard title="Classificação & Entidade" icon={<Building2 />}>
            <div className="grid grid-cols-2 gap-4">
              {editMode ? (
                <>
                  <EditField label="Descrição" className="col-span-2" value={form.description} onChange={(x) => set({ description: x })} />
                  <EditField label="Entidade" value={form.entity_name} onChange={(x) => set({ entity_name: x })} />
                  <EditField label="Categoria" value={form.category_name} onChange={(x) => set({ category_name: x })} />
                  <EditField label="Centro de custo" value={form.cost_center_name} onChange={(x) => set({ cost_center_name: x })} />
                </>
              ) : (
                <>
                  <ReadField label="Entidade (Forn./Cliente)">{v.entity_name}</ReadField>
                  <ReadField label="ID da entidade">{v.entity_id}</ReadField>
                  <ReadField label="Categoria">{v.category_name}</ReadField>
                  <ReadField label="ID categoria">{v.category_id}</ReadField>
                  <ReadField label="Centro de custo">{v.cost_center_name}</ReadField>
                  <ReadField label="Data do movimento">{v.date ? formatDate(v.date) : null}</ReadField>
                </>
              )}
            </div>
          </SectionCard>

          {/* Recorrência + Notas & Tags */}
          <SectionCard title="Recorrência, Notas & Etiquetas" icon={<RefreshCcw />}>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-neutral-50 rounded-xl border border-neutral-200 text-xs">
                <span className="font-semibold text-neutral-900">Recorrência automática</span>
                <Badge tone={v.is_recurring ? 'success' : 'neutral'}>
                  {v.is_recurring ? `Sim (${v.recurrence_period || 'mensal'})` : 'Não'}
                </Badge>
              </div>
              {editMode ? (
                <Field label="Notas">
                  {(p) => (
                    <Textarea
                      {...p}
                      rows={2}
                      value={form.notes ?? ''}
                      onChange={(e) => set({ notes: e.target.value })}
                      className="resize-none"
                    />
                  )}
                </Field>
              ) : (
                <ReadField label="Notas">{v.notes}</ReadField>
              )}
              <div className="flex items-center gap-1.5 flex-wrap">
                {(v.tags || []).length ? (v.tags || []).map((t) => (
                  <Badge key={t} className="font-medium">
                    <Tag className="w-3 h-3" aria-hidden="true" /> {t}
                  </Badge>
                )) : <span className="text-neutral-400 text-xs">Sem etiquetas</span>}
              </div>
            </div>
          </SectionCard>

          {/* Auditoria & IA */}
          <SectionCard title="Auditoria & Rastreabilidade IA" icon={<ShieldCheck />}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <ReadField label="Criado por">{trx.created_by}</ReadField>
              <ReadField label="Aprovado por">{trx.approved_by}</ReadField>
              <ReadField label="Aprovado em">{trx.approved_at ? formatDate(trx.approved_at) : null}</ReadField>
              <ReadField label="Origem">{trx.source}</ReadField>
              <ReadField label="Confiança IA">{trx.ai_confidence != null ? `${trx.ai_confidence}%` : '—'}</ReadField>
              <ReadField label="Última alteração">{trx.updated_at ? formatDate(trx.updated_at) : null}</ReadField>
            </div>
          </SectionCard>
        </div>

        {/* RIGHT — original invoice + stored documents */}
        <div className="space-y-4">
          <SectionCard title="Fatura Original" icon={<FileText />}>
            <div className="space-y-3">
              {docUrl ? (
                // Pedido autenticado: um <iframe src> relativo ia ao servidor do
                // Next (404) e, mesmo no endereço certo, sem token (401).
                <div className="h-[420px]">
                  <DocumentViewer fileUrl={docUrl} fileName={trx.document_name} />
                </div>
              ) : (
                <EmptyState
                  icon={<Upload />}
                  title="Nenhuma fatura anexada"
                  description={
                    <>
                      As faturas entram pela{' '}
                      <Link href="/documents/inbox" className="text-emerald-700 font-semibold hover:underline">Automação (OCR)</Link>.
                    </>
                  }
                  className="border-2 border-dashed border-neutral-200 rounded-xl py-6"
                />
              )}
            </div>
          </SectionCard>

          {/* Stored documents */}
          <SectionCard title="Documentos Guardados" icon={<FileText />}>
            {trx.document_id || trx.document_name ? (
              <div className="flex items-center gap-3 p-3 rounded-xl border border-neutral-200 bg-neutral-50">
                <div className="w-9 h-9 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-neutral-800 truncate">{trx.document_name || 'Documento'}</div>
                  <div className="text-2xs text-neutral-500 font-mono truncate">
                    {trx.document_type || 'documento'} · {trx.document_number || trx.document_id}
                  </div>
                </div>
                {docUrl && (
                  <IconButton
                    label="Abrir documento"
                    onClick={async () => {
                      if (!(await openDocument(docUrl))) toast.error('Não foi possível abrir o documento.');
                    }}
                  >
                    <ExternalLink />
                  </IconButton>
                )}
              </div>
            ) : (
              <p className="text-xs text-neutral-500 text-center py-3">Nenhum documento associado a este lançamento.</p>
            )}

            <div className="mt-3 pt-3 border-t border-neutral-100 grid grid-cols-2 gap-3">
              <ReadField label="Nº documento">{trx.document_number}</ReadField>
              <ReadField label="Tipo">{trx.document_type}</ReadField>
              <ReadField label="Data documento">{trx.document_date ? formatDate(trx.document_date) : null}</ReadField>
              <ReadField label="ID documento">{trx.document_id}</ReadField>
            </div>
          </SectionCard>

          {/* AI confidence card */}
          <div className="p-4 bg-neutral-950 text-white rounded-2xl space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-300" aria-hidden="true" /> Confiança da extração IA
              </span>
              <span className="font-mono tabular-nums text-emerald-400 font-bold text-sm">{trx.ai_confidence ?? '—'}{trx.ai_confidence != null ? '%' : ''}</span>
            </div>
            <p className="text-xs text-neutral-300">
              Classificado com base no histórico do fornecedor e palavras-chave. Reveja os valores antes de confirmar o pagamento.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
