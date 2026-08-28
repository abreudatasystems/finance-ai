'use client';

import React, { useState } from 'react';
import { X, Check, Upload, Sparkles } from 'lucide-react';
import { useApp } from '@/context/AppContext';

interface CreateTransactionModalProps {
  initialType: string;
  onClose: () => void;
}

export const CreateTransactionModal: React.FC<CreateTransactionModalProps> = ({ initialType, onClose }) => {
  const { formatMoney, currencySymbol } = useApp();

  const [type, setType] = useState<'expense' | 'income' | 'document'>(
    initialType === 'income' ? 'income' : initialType === 'document' ? 'document' : 'expense'
  );
  const [description, setDescription] = useState('');
  const [entityName, setEntityName] = useState('');
  const [categoryName, setCategoryName] = useState('Marketing > Google Ads');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('2026-08-30');
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSuccess(true);
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6 md:p-20 select-none flex items-center justify-center">
      {/* Backdrop */}
      <div 
        onClick={onClose} 
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-150" 
      />

      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <h3 className="font-semibold text-sm">
              {type === 'income' ? 'Nova Receita' : type === 'document' ? 'Upload Documento IA' : 'Nova Despesa / Lançamento'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        {isSuccess ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <Check className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-800">Lançamento Criado com Sucesso!</h4>
            <p className="text-xs text-slate-500">O valor foi sincronizado com o teu Fluxo de Caixa.</p>
          </div>
        ) : type === 'document' ? (
          <div className="p-6 space-y-4 text-center">
            <div className="border-2 border-dashed border-indigo-200 hover:border-indigo-500 bg-indigo-50/50 rounded-2xl p-8 transition-colors cursor-pointer group">
              <Upload className="w-10 h-10 text-indigo-500 group-hover:scale-110 transition-transform mx-auto mb-2" />
              <div className="text-xs font-semibold text-slate-800">Arraste a sua fatura ou recibo em PDF/PNG</div>
              <div className="text-[11px] text-slate-400 mt-1">A IA vai extrair automaticamente o Fornecedor, NIF, Valor e IVA</div>
            </div>
            <button
              onClick={handleSubmit}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors shadow-xs"
            >
              Simular Processamento IA
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {/* Type selector */}
            <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-600">
              <button
                type="button"
                onClick={() => setType('expense')}
                className={`py-1.5 rounded-lg transition-colors ${type === 'expense' ? 'bg-white text-rose-600 shadow-2xs font-bold' : ''}`}
              >
                Despesa (- €)
              </button>
              <button
                type="button"
                onClick={() => setType('income')}
                className={`py-1.5 rounded-lg transition-colors ${type === 'income' ? 'bg-white text-emerald-600 shadow-2xs font-bold' : ''}`}
              >
                Receita (+ €)
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-600">Descrição do Movimento *</label>
              <input
                type="text"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="ex: Campanha Google Ads Agosto 2026"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-600">Fornecedor / Cliente</label>
                <input
                  type="text"
                  value={entityName}
                  onChange={(e) => setEntityName(e.target.value)}
                  placeholder="ex: Google Ireland Ltd"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-600">Valor ({currencySymbol}) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="500.00"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-600">Categoria</label>
                <select
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="Marketing > Google Ads">Marketing &gt; Google Ads</option>
                  <option value="Marketing > Redes Sociais">Marketing &gt; Redes Sociais</option>
                  <option value="Software > Licenças & SaaS">Software &gt; Licenças &amp; SaaS</option>
                  <option value="Instalações > Energia & Água">Instalações &gt; Energia &amp; Água</option>
                  <option value="Vendas > Serviços de Consultoria">Vendas &gt; Consultoria</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-600">Data de Vencimento</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors shadow-xs"
              >
                Confirmar Lançamento
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
