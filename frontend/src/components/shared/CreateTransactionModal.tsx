'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {Check, Loader2, ChevronDown, ChevronUp} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { apiPostOrError } from '@/services/api';
import { fetchCategories } from '@/services/data';
import { Category } from '@/types';
import { SideDrawer } from './SideDrawer';


interface CreateTransactionModalProps {
  initialType: string;
  onClose: () => void;
}

const FORM_ID = 'create-transaction-form';

export const CreateTransactionModal: React.FC<CreateTransactionModalProps> = ({ initialType, onClose }) => {
  const { currencySymbol, formatMoney } = useApp();

  // O modo "documento" (que simulava um processamento de IA sem fazer nada)
  // saiu: as faturas entram pela Automação (OCR), em /documents/inbox.
  const [type, setType] = useState<'expense' | 'income'>(
    initialType === 'income' ? 'income' : 'expense'
  );
  const [description, setDescription] = useState('');
  const [entityName, setEntityName] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [amount, setAmount] = useState('');
  const [vatRate, setVatRate] = useState<number>(23);
  const [customVat, setCustomVat] = useState(false);

  const [installmentCount, setInstallmentCount] = useState<number>(1);
  const [customInstallment, setCustomInstallment] = useState(false);
  const [isRecurring, setIsRecurring] = useState<boolean>(false);
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

  /* A categoria escolhida, ou a primeira da lista enquanto ninguém escolhe.
     Isto era um efeito que escrevia estado a seguir a renderizar: o formulário
     aparecia um instante sem categoria e voltava a renderizar com ela. É um
     valor derivado, e derivados calculam-se — não se guardam. */
  const selectedCategory = categoryId || categoryOptions[0]?.id || '';

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



  // Only open projects: a finished job should not collect new documents.



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Uma categoria e uma contraparte são o que torna o documento legível na
    // DRE, no IVA e nas cobranças. Sem elas o lançamento entra e não se
    // consegue explicar depois, por isso pergunta-se agora.
    if (!selectedCategory && !categoryName.trim()) {
      setFormError('Escolha a categoria do lançamento.');
      return;
    }
    if (!entityName.trim()) {
      setFormError('Indique o fornecedor ou o cliente.');
      return;
    }
    if (!(parseFloat(amount) > 0)) {
      setFormError('Indique um valor maior que zero.');
      return;
    }
    setFormError(null);
    setSubmitting(true);

    const { error } = await apiPostOrError('/transactions/', {
      type,
      date: docDate,
      description: description.trim(),
      entity_name: entityName.trim(),
      category_id: selectedCategory,
      category_name: categoryOptions.find((o) => o.id === selectedCategory)?.label || '',
      amount: parseFloat(amount) || 0,
      vat_rate: vatRate,

      installment_count: installmentCount > 1 ? installmentCount : undefined,
      is_recurring: isRecurring,
      due_date: dueDate,
      is_paid: paymentStatus === 'paid',
      notes: notes.trim() || undefined,
      tags: tags ? tags.split(',').map((t) => t.trim()) : undefined,
    });

    setSubmitting(false);
    // "Criado com sucesso" só depois de a API o confirmar; antes aparecia
    // mesmo com o pedido recusado (sem permissão, dados inválidos, sem rede).
    if (error) {
      setFormError(error);
      return;
    }
    setIsSuccess(true);
    setTimeout(() => onClose(), 1100);
  };

  const title = isSuccess
    ? 'Concluído'
    : type === 'income'
    ? 'Nova Receita / Cobrança'
    : 'Nova Despesa / Obrigação';

  const showFooter = !isSuccess;

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

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-600">Estado do Movimento</label>
            <select
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value as 'paid' | 'pending')}
              className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50 font-semibold"
            >
              {type === 'income' ? (
                <>
                  <option value="paid">Já Recebido (Concluído)</option>
                  <option value="pending">A Receber (Futuro)</option>
                </>
              ) : (
                <>
                  <option value="paid">Já Pago (Concluído)</option>
                  <option value="pending">A Pagar (Futuro)</option>
                </>
              )}
            </select>
          </div>

          <label className="flex items-center gap-2 px-1 text-xs font-semibold text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={isRecurring}
              onChange={(e) => setIsRecurring(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
            />
            Tornar este movimento Recorrente (mensalidade, subscrição, etc)
          </label>

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
            <div className="flex gap-2">
              <select
                value={customVat ? 'custom' : vatRate}
                onChange={(e) => {
                  if (e.target.value === 'custom') {
                    setCustomVat(true);
                  } else {
                    setCustomVat(false);
                    setVatRate(Number(e.target.value));
                  }
                }}
                className="flex-1 px-3 py-2.5 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50 font-semibold"
              >
                <option value="0">Isento (0%)</option>
                <option value="6">6%</option>
                <option value="13">13%</option>
                <option value="23">23%</option>
                <option value="custom">Outra taxa...</option>
              </select>

              {customVat && (
                <div className="flex items-center gap-1 shrink-0">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    autoFocus
                    value={vatRate}
                    onChange={(e) => setVatRate(Math.min(100, Math.max(0, Number(e.target.value))))}
                    placeholder="17.5"
                    className="w-20 px-3 py-2.5 text-xs rounded-xl border border-indigo-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white font-bold text-center"
                  />
                  <span className="text-xs font-bold text-slate-500">%</span>
                </div>
              )}
            </div>
            {customVat && (
              <div className="text-[10px] text-slate-400">Qualquer percentagem entre 0 e 100 (aceita decimais).</div>
            )}
            <div className="grid grid-cols-3 gap-2 p-2.5 bg-slate-50 rounded-xl text-center border border-slate-200/80">
              <div>
                <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wide">Líquido</div>
                <div className="text-xs font-bold text-slate-800">{formatMoney(breakdown.net)}</div>
              </div>
              <div>
                <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wide">IVA</div>
                <div className="text-xs font-bold text-slate-800">{formatMoney(breakdown.vat)}</div>
              </div>
              <div>
                <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wide">Total</div>
                <div className="text-xs font-black text-indigo-700">{formatMoney(breakdown.gross)}</div>
              </div>
            </div>
            <p className="text-[10px] text-slate-400">O valor introduzido é o total com IVA; o líquido é calculado a partir da taxa.</p>
          </div>



          {/* Parcelas */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-600">Prestações</label>
            <div className="flex gap-2">
              <select
                value={customInstallment ? 'custom' : installmentCount}
                onChange={(e) => {
                  if (e.target.value === 'custom') {
                    setCustomInstallment(true);
                  } else {
                    setCustomInstallment(false);
                    setInstallmentCount(Number(e.target.value));
                  }
                }}
                className="flex-1 px-3 py-2.5 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50 font-semibold"
              >
                <option value="1">À vista (1x)</option>
                <option value="2">2 prestações (2x)</option>
                <option value="3">3 prestações (3x)</option>
                <option value="4">4 prestações (4x)</option>
                <option value="6">6 prestações (6x)</option>
                <option value="12">12 prestações (12x)</option>
                <option value="custom">Personalizado...</option>
              </select>
              {customInstallment && (
                <input
                  type="number"
                  min={1}
                  max={120}
                  autoFocus
                  value={installmentCount}
                  onChange={(e) => setInstallmentCount(Math.min(120, Math.max(1, Number(e.target.value) || 1)))}
                  className="w-20 px-3 py-2.5 rounded-xl border border-indigo-200 text-xs font-bold text-center focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                />
              )}
            </div>

            {installmentCount > 1 && (
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  <span>Plano de {installmentCount} prestações</span>
                  <span>Mensal, a partir do vencimento</span>
                </div>
                {schedulePreview.map((p) => (
                  <div key={p.number} className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 font-mono">
                      {p.number}/{installmentCount} · {p.due_date}
                    </span>
                    <span className="font-bold text-slate-800">{formatMoney(p.amount)}</span>
                  </div>
                ))}
                {installmentCount > 6 && (
                  <p className="text-[10px] text-slate-400 pt-0.5">
                    …e mais {installmentCount - 6} prestação(ões). A última absorve o arredondamento para somar exatamente o total.
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
                  value={selectedCategory}
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
