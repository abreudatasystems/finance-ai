'use client';

import React, { useState } from 'react';
import { FolderTree, Sparkles, Loader2 } from 'lucide-react';
import { Category } from '@/types';
import { apiPost } from '@/services/api';
import { SideDrawer } from './SideDrawer';

interface CreateCategoryModalProps {
  onClose: () => void;
  onCreated: (newCat: Category) => void;
}

const FORM_ID = 'create-category-form';

export const CreateCategoryModal: React.FC<CreateCategoryModalProps> = ({ onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [description, setDescription] = useState('');
  const [keywords, setKeywords] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);

    const keywordList = keywords ? keywords.split(',').map(k => k.trim()).filter(Boolean) : [];

    const created = await apiPost<Category>('/categories/', {
      type,
      name: name.trim(),
      description: description.trim() || undefined,
      keywords: keywordList,
    });

    const newCat: Category = created ?? {
      id: `CAT-${Date.now()}`,
      company_id: 'COMP001',
      type,
      name: name.trim(),
      description: description.trim() || undefined,
      keywords: keywordList,
      active: true,
    };

    setSubmitting(false);
    onCreated(newCat);
    onClose();
  };

  return (
    <SideDrawer
      title="Criar Nova Categoria"
      subtitle="Organize os seus movimentos financeiros"
      onClose={onClose}
      footer={
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
            Criar Categoria
          </button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Tipo de Categoria</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setType('expense')}
              className={`py-2.5 rounded-xl border text-xs font-bold transition-all ${
                type === 'expense' ? 'bg-rose-50 border-rose-300 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}
            >
              Despesa (- €)
            </button>
            <button
              type="button"
              onClick={() => setType('income')}
              className={`py-2.5 rounded-xl border text-xs font-bold transition-all ${
                type === 'income' ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}
            >
              Receita (+ €)
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Nome da Categoria *</label>
          <input
            type="text"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex: Licenças de Software, Viagens..."
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Descrição</label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descreva o propósito desta categoria..."
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50 resize-none"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            Palavras-Chave IA (separadas por vírgula)
          </label>
          <input
            type="text"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="ex: microsoft, slack, figma, adobe"
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50 font-mono text-[11px]"
          />
          <p className="text-[10px] text-slate-400 mt-1.5">A IA usará estas palavras para classificar faturas automaticamente.</p>
        </div>
      </form>
    </SideDrawer>
  );
};
