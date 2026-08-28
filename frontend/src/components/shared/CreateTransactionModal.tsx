'use client';

import React, { useState } from 'react';
import { Check, Upload, Sparkles, Loader2 } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { apiPost } from '@/services/api';
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
  const [dueDate, setDueDate] = useState('2026-08-30');
  const [isSuccess, setIsSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    if (type !== 'document') {
      await apiPost('/transactions/', {
        type,
        description: description.trim(),
        entity_name: entityName.trim() || 'N/D',
        category_id: 'CAT-MANUAL',
        category_name: categoryName,
        amount: parseFloat(amount) || 0,
        due_date: dueDate,
      });
    }

    setSubmitting(false);
    setIsSuccess(true);
    setTimeout(() => onClose(), 1100);
  };

  const title = isSuccess
    ? 'Concluído'
    : type === 'income'
    ? 'Nova Receita'
    : type === 'document'
    ? 'Upload Documento IA'
    : 'Nova Despesa / Lançamento';

  const showFooter = !isSuccess && type !== 'document';

  return (
    <SideDrawer
      title={title}
      subtitle={isSuccess ? undefined : 'Registe um movimento no fluxo de caixa'}
      icon={<Sparkles className="w-5 h-5" />}
      accent="slate"
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
          <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-600">
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

          <div className="grid grid-cols-2 gap-3">
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-600">Categoria</label>
              <select
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
              >
                <option value="Marketing > Google Ads">Marketing &gt; Google Ads</option>
                <option value="Marketing > Redes Sociais">Marketing &gt; Redes Sociais</option>
                <option value="Software > Licenças & SaaS">Software &gt; Licenças &amp; SaaS</option>
                <option value="Instalações > Energia & Água">Instalações &gt; Energia &amp; Água</option>
                <option value="Vendas > Serviços de Consultoria">Vendas &gt; Consultoria</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-600">Data de Vencimento</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
              />
            </div>
          </div>
        </form>
      )}
    </SideDrawer>
  );
};
