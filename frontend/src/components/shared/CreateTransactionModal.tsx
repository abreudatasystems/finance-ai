'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Check, Upload, Sparkles, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { apiPost } from '@/services/api';
import { fetchCategories } from '@/services/data';
import { Category } from '@/types';
import { SideDrawer } from './SideDrawer';
import { RetentionType } from '@/components/retentions/types';
import { fetchTypes } from '@/components/retentions/api';

interface CreateTransactionModalProps {
  initialType: string;
  onClose: () => void;
}

const FORM_ID = 'create-transaction-form';

export const CreateTransactionModal: React.FC<CreateTransactionModalProps> = ({ initialType, onClose }) => {
  const { currencySymbol } = useApp();

  const [type, setType] = useState<'expense' | 'income' | 'document'>(
    initialType === 'income' ? 'income' : initialType === 'document' ? 'document' : 'expense'
  );
  const [description, setDescription] = useState('');
  const [entityName, setEntityName] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [amount, setAmount] = useState('');
  const [vatRate, setVatRate] = useState<number>(23);
  const [customVat, setCustomVat] = useState(false);
  const [retentionCode, setRetentionCode] = useState('');
  const [retentionTypes, setRetentionTypes] = useState<RetentionType[]>([]);
  const [installmentCount, setInstallmentCount] = useState<number>(1);
  // A data do documento, não a de hoje: uma fatura de agosto lançada em
  // setembro é um documento de agosto, e é isso que decide o período de IVA,
  // o mês da DRE e o orçamento a que pertence.
  const [docDate, setDocDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid'>('pending');
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [isSuccess, setIsSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  // A free-text cost centre could never be reported on: "Sede" and "sede" and
  // "Sede " were three different projects. Chosen from the real ones now.
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');

  useEffect(() => {
    let active = true;
    fetchCategories().then((cats) => { if (active) setCategories(cats); });
    return () => { active = false; };
  }, []);

  // Flatten the category tree: a leaf is what a movement is actually booked to.
  const categoryOptions = useMemo(() => {
    const opts: { id: string; label: string; type?: string }[] = [];
    for (const parent of categories) {
      const children = (parent as Category & { children?: Category[] }).children || [];
      if (children.length) {
        for (const child of children) {
          opts.push({ id: child.id, label: `${parent.name} > ${child.name}`, type: parent.type });
        }
      } else {
        opts.push({ id: parent.id, label: parent.name, type: parent.type });
      }
    }
    return opts.filter((o) => !o.type || o.type === (type === 'income' ? 'income' : 'expense'));
  }, [categories, type]);

  useEffect(() => {
    if (!categoryId && categoryOptions.length) setCategoryId(categoryOptions[0].id);
  }, [categoryOptions, categoryId]);

  // Live VAT breakdown from the gross amount and the selected rate.
  const breakdown = useMemo(() => {
    const gross = parseFloat(amount) || 0;
    if (!vatRate) return { net: gross, vat: 0, gross };
    const net = Math.round((gross / (1 + vatRate / 100)) * 100) / 100;
    return { net, vat: Math.round((gross - net) * 100) / 100, gross };
  }, [amount, vatRate]);

  // Mirrors the backend split: equal parts, last one absorbs the rounding.
  const schedulePreview = useMemo(() => {
    const gross = parseFloat(amount) || 0;
    if (installmentCount < 2 || gross <= 0) return [];
    const base = Math.round((gross / installmentCount) * 100) / 100;
    const start = dueDate ? new Date(dueDate) : new Date();
    const rows: { number: number; due_date: string; amount: number }[] = [];
    let running = 0;
    for (let n = 1; n <= Math.min(installmentCount, 6); n++) {
      const value = n < installmentCount ? base : Math.round((gross - running) * 100) / 100;
      running = Math.round((running + value) * 100) / 100;
      const d = new Date(start);
      d.setMonth(d.getMonth() + (n - 1));
      rows.push({ number: n, due_date: d.toISOString().split('T')[0], amount: value });
    }
    return rows;
  }, [amount, installmentCount, dueDate]);

  // The catalogue depends on the side: rents and capital only ever appear on
  // what the company pays.
  useEffect(() => {
    if (type === 'document') return;
    fetchTypes(type).then((data) => setRetentionTypes(data?.tipos || []));
  }, [type]);

  // Only open projects: a finished job should not collect new documents.

  const retention = retentionTypes.find((t) => t.codigo === retentionCode);
  // The withholding rides on the base, never on the total — the same rule the
  // backend applies, shown here so the number is not a surprise at settlement.
  const retained = retention ? (breakdown.net * retention.taxa) / 100 : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Uma categoria e uma contraparte são o que torna o documento legível na
    // DRE, no IVA e nas cobranças. Sem elas o lançamento entra e não se
    // consegue explicar depois, por isso pergunta-se agora.
    if (type !== 'document') {
      if (!categoryId && !categoryName.trim()) {
        setFormError('Escolha a categoria do lançamento.');
        return;
      }
      if (!entityName.trim()) {
        setFormError('Indique o fornecedor ou o cliente.');
        return;
      }
    }
    setFormError(null);
    setSubmitting(true);

    if (type !== 'document') {
      await apiPost('/transactions/', {
        type,
        date: docDate,
        description: description.trim(),
        entity_name: entityName.trim(),
        category_id: categoryId,
        category_name: categoryOptions.find((o) => o.id === categoryId)?.label || '',
        amount: parseFloat(amount) || 0,
        vat_rate: vatRate,
        retention_code: retentionCode || undefined,
        installment_count: installmentCount > 1 ? installmentCount : undefined,
        due_date: dueDate,
        is_paid: paymentStatus === 'paid',
        notes: notes.trim() || undefined,
        tags: tags ? tags.split(',').map((t) => t.trim()) : undefined,
      });
    }

    setSubmitting(false);
    setIsSuccess(true);
    setTimeout(() => onClose(), 1100);
  };

  const title = isSuccess
    ? 'Concluído'
    : type === 'income'
    ? 'Nova Receita / Cobrança'
    : type === 'document'
    ? 'Upload Documento IA'
    : 'Nova Despesa / Obrigação';

  const showFooter = !isSuccess && type !== 'document';

  return (
    <SideDrawer
      title={title}
      subtitle={isSuccess ? undefined : 'Registe um movimento no fluxo de caixa'}
      onClose={onClose}
      footer={
        showFooter ? (
          <>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-xs hover:bg-white transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form={FORM_ID}
              disabled={submitting}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Confirmar Lançamento
            </button>
          </>
        ) : undefined
      }
    >
      {isSuccess ? (
        <div className="py-10 text-center space-y-3">
          <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
            <Check className="w-7 h-7" />
          </div>
          <h4 className="text-sm font-bold text-slate-800">Lançamento Criado com Sucesso!</h4>
          <p className="text-xs text-slate-500">O valor foi sincronizado com o teu Fluxo de Caixa.</p>
        </div>
      ) : type === 'document' ? (
        <div className="space-y-4 text-center">
          <div className="border-2 border-dashed border-indigo-200 hover:border-indigo-500 bg-indigo-50/50 rounded-2xl p-8 transition-colors cursor-pointer group">
            <Upload className="w-10 h-10 text-indigo-500 group-hover:scale-110 transition-transform mx-auto mb-2" />
            <div className="text-xs font-semibold text-slate-800">Arraste a sua fatura ou recibo em PDF/PNG</div>
            <div className="text-[11px] text-slate-400 mt-1">A IA vai extrair automaticamente o Fornecedor, NIF, Valor e IVA</div>
          </div>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors shadow-xs disabled:opacity-70"
          >
            Simular Processamento IA
          </button>
        </div>
      ) : (
        <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-800 px-3 py-2 text-xs font-semibold">
              {formError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-600">
            <button
              type="button"
              onClick={() => setType('expense')}
              className={`py-1.5 rounded-lg transition-colors ${type === 'expense' ? 'bg-white text-rose-600 font-bold' : ''}`}
            >
              Despesa (- €)
            </button>
            <button
              type="button"
              onClick={() => setType('income')}
              className={`py-1.5 rounded-lg transition-colors ${type === 'income' ? 'bg-white text-emerald-600 font-bold' : ''}`}
            >
              Receita (+ €)
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-600">
            <button
              type="button"
              onClick={() => setPaymentStatus('paid')}
              className={`py-1.5 rounded-lg transition-colors ${paymentStatus === 'paid' ? 'bg-white text-indigo-600 font-bold' : ''}`}
            >
              Já Recebido / Pago
            </button>
            <button
              type="button"
              onClick={() => setPaymentStatus('pending')}
              className={`py-1.5 rounded-lg transition-colors ${paymentStatus === 'pending' ? 'bg-white text-orange-600 font-bold' : ''}`}
            >
              A Receber / A Pagar (Futuro)
            </button>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-600">Descrição do Movimento *</label>
            <input
              type="text"
              required
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="ex: Campanha Google Ads Agosto 2026"
              className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-600">Fornecedor / Cliente</label>
              <input
                type="text"
                value={entityName}
                onChange={(e) => setEntityName(e.target.value)}
                placeholder="ex: Google Ireland Ltd"
                className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-600">Valor ({currencySymbol}) *</label>
              <input
                type="number"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="500.00"
                className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-600">Taxa de IVA</label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {[0, 6, 13, 23].map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => { setCustomVat(false); setVatRate(rate); }}
                  className={`py-2 rounded-lg border text-[11px] font-bold transition-all ${
                    !customVat && vatRate === rate
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {rate === 0 ? 'Isento' : `${rate}%`}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCustomVat(true)}
                className={`py-2 rounded-lg border text-[11px] font-bold transition-all ${
                  customVat
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                Outra
              </button>
            </div>

            {customVat && (
              <div className="flex items-center gap-2 pt-0.5">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  autoFocus
                  value={vatRate}
                  onChange={(e) => setVatRate(Math.min(100, Math.max(0, Number(e.target.value))))}
                  placeholder="17.5"
                  className="w-24 px-3 py-2 text-xs rounded-xl border border-indigo-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white font-bold"
                />
                <span className="text-xs font-bold text-slate-500">%</span>
                <span className="text-[10px] text-slate-400">Qualquer percentagem entre 0 e 100 (aceita decimais).</span>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 p-2.5 bg-slate-50 rounded-xl text-center border border-slate-200/80">
              <div>
                <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wide">Líquido</div>
                <div className="text-xs font-bold text-slate-800">{currencySymbol}{breakdown.net.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wide">IVA</div>
                <div className="text-xs font-bold text-slate-800">{currencySymbol}{breakdown.vat.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wide">Total</div>
                <div className="text-xs font-black text-indigo-700">{currencySymbol}{breakdown.gross.toFixed(2)}</div>
              </div>
            </div>
            <p className="text-[10px] text-slate-400">O valor introduzido é o total com IVA; o líquido é calculado a partir da taxa.</p>
          </div>

          {/* Retenção na fonte — o que sai do banco não é o total do documento */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-600">
              Retenção na fonte
            </label>
            <select
              value={retentionCode}
              onChange={(e) => setRetentionCode(e.target.value)}
              className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50 font-semibold"
            >
              <option value="">Sem retenção</option>
              {retentionTypes
                .filter((t) => t.codigo !== 'isento')
                .map((t) => (
                  <option key={t.codigo} value={t.codigo}>{t.label}</option>
                ))}
            </select>

            {retention && retention.taxa > 0 && (
              <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200/80 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700">
                    Retido ({retention.taxa}% sobre {currencySymbol}{breakdown.net.toFixed(2)})
                  </span>
                  <span className="text-xs font-bold text-amber-900">
                    −{currencySymbol}{retained.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-600">
                    {type === 'income' ? 'O cliente transfere' : 'Sai do banco'}
                  </span>
                  <span className="text-xs font-black text-slate-900">
                    {currencySymbol}{(breakdown.gross - retained).toFixed(2)}
                  </span>
                </div>
                <p className="text-[10px] text-amber-800/80 leading-relaxed pt-0.5">
                  {type === 'income'
                    ? 'O cliente retém e entrega ao Estado; fica um crédito de imposto a favor da empresa.'
                    : `A empresa entrega ao Estado até ao dia 20 do mês seguinte. ${retention.base_legal}.`}
                </p>
              </div>
            )}
          </div>

          {/* Parcelas */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-600">Parcelas</label>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
              {[1, 2, 3, 4, 6, 12].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setInstallmentCount(n)}
                  className={`py-2 rounded-lg border text-[11px] font-bold transition-all ${
                    installmentCount === n
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {n === 1 ? 'À vista' : `${n}x`}
                </button>
              ))}
              <input
                type="number"
                min={1}
                max={120}
                value={installmentCount}
                onChange={(e) => setInstallmentCount(Math.min(120, Math.max(1, Number(e.target.value) || 1)))}
                aria-label="Número de parcelas"
                className="py-2 px-2 rounded-lg border border-slate-200 text-[11px] font-bold text-center focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
              />
            </div>

            {installmentCount > 1 && (
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  <span>Plano de {installmentCount} parcelas</span>
                  <span>Mensal, a partir do vencimento</span>
                </div>
                {schedulePreview.map((p) => (
                  <div key={p.number} className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 font-mono">
                      {p.number}/{installmentCount} · {p.due_date}
                    </span>
                    <span className="font-bold text-slate-800">{currencySymbol}{p.amount.toFixed(2)}</span>
                  </div>
                ))}
                {installmentCount > 6 && (
                  <p className="text-[10px] text-slate-400 pt-0.5">
                    …e mais {installmentCount - 6} parcela(s). A última absorve o arredondamento para somar exatamente o total.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-600">Categoria</label>
              {categoryOptions.length ? (
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
                >
                  {categoryOptions.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder="ex: Marketing > Google Ads"
                  className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
                />
              )}
            </div>

            {/* A data do documento decide o período de IVA, o mês da DRE e o
                orçamento; a de vencimento decide quando o dinheiro se move.
                São duas perguntas diferentes e precisam de dois campos. */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-600">Data do Documento *</label>
              <input
                type="date"
                required
                value={docDate}
                onChange={(e) => setDocDate(e.target.value)}
                className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
              />
              <p className="text-[10px] text-slate-400">
                A data da fatura, não a de hoje — é ela que decide o trimestre de IVA.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-600">
                {paymentStatus === 'pending' ? 'Data de Vencimento (Prevista)' : 'Data do Pagamento'}
              </label>
              <input
                type="date"
                value={dueDate}
                min={docDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
              />
            </div>
          </div>

          {/* Advanced Options Accordion */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 transition-colors cursor-pointer"
            >
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {showAdvanced ? 'Ocultar opções avançadas' : 'Mostrar opções avançadas (Centro de Custo, Etiquetas...)'}
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-4 animate-in slide-in-from-top-2 duration-200 fade-in">
                <div className="grid grid-cols-1 gap-3">

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-600">Etiquetas (separadas por vírgula)</label>
                    <input
                      type="text"
                      value={tags}
                      onChange={(e) => setTags(e.target.value)}
                      placeholder="Projeto X, Urgente..."
                      className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600">Observações Internas (Notas)</label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Detalhes adicionais do lançamento..."
                    className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50 resize-none"
                  />
                </div>
              </div>
            )}
          </div>
        </form>
      )}
    </SideDrawer>
  );
};
