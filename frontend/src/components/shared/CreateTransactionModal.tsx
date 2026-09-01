'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Check, Upload, Sparkles, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { apiPost } from '@/services/api';
import { fetchCategories } from '@/services/data';
import { Category } from '@/types';
import { SideDrawer } from './SideDrawer';

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
  const [categoryName, setCategoryName] = useState('Marketing > Google Ads');
  const [amount, setAmount] = useState('');
  const [vatRate, setVatRate] = useState<number>(23);
  const [dueDate, setDueDate] = useState('2026-08-30');
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid'>('pending');
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [isSuccess, setIsSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [costCenter, setCostCenter] = useState('Sede');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    if (type !== 'document') {
      await apiPost('/transactions/', {
        type,
        description: description.trim(),
        entity_name: entityName.trim() || 'N/D',
        category_id: categoryId || 'CAT-MANUAL',
        category_name: categoryOptions.find((o) => o.id === categoryId)?.label || categoryName,
        amount: parseFloat(amount) || 0,
        vat_rate: vatRate,
        due_date: dueDate,
        is_paid: paymentStatus === 'paid',
        cost_center_name: costCenter.trim() || undefined,
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {[0, 6, 13, 23].map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => setVatRate(rate)}
                  className={`py-2 rounded-lg border text-[11px] font-bold transition-all ${
                    vatRate === rate
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {rate === 0 ? 'Isento' : `${rate}%`}
                </button>
              ))}
            </div>
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

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-600">
                {paymentStatus === 'pending' ? 'Data de Vencimento (Prevista)' : 'Data do Pagamento'}
              </label>
              <input
                type="date"
                value={dueDate}
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-600">Centro de Custo</label>
                    <input
                      type="text"
                      value={costCenter}
                      onChange={(e) => setCostCenter(e.target.value)}
                      placeholder="Sede, Filial Porto..."
                      className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
                    />
                  </div>
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
