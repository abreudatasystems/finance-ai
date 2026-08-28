'use client';

import React, { useState } from 'react';
import { X, FolderTree, Tag, Sparkles } from 'lucide-react';
import { Category } from '@/types';

interface CreateCategoryModalProps {
  onClose: () => void;
  onCreated: (newCat: Category) => void;
}

export const CreateCategoryModal: React.FC<CreateCategoryModalProps> = ({ onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [description, setDescription] = useState('');
  const [keywords, setKeywords] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newCat: Category = {
      id: `CAT-${Date.now()}`,
      company_id: 'COMP001',
      type,
      name: name.trim(),
      description: description.trim() || undefined,
      keywords: keywords ? keywords.split(',').map(k => k.trim()) : [],
      active: true
    };

    try {
      await fetch('http://127.0.0.1:8000/api/v1/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCat)
      });
    } catch (err) {
      // Local fallback
    }

    onCreated(newCat);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs select-none">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 bg-indigo-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderTree className="w-5 h-5 text-indigo-200" />
            <h2 className="font-bold text-sm">Criar Nova Categoria</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 text-white/80 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo de Categoria</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType('expense')}
                className={`py-2 rounded-xl border text-xs font-bold transition-all ${
                  type === 'expense' ? 'bg-rose-50 border-rose-300 text-rose-700 shadow-2xs' : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                Despesa (- €)
              </button>
              <button
                type="button"
                onClick={() => setType('income')}
                className={`py-2 rounded-xl border text-xs font-bold transition-all ${
                  type === 'income' ? 'bg-emerald-50 border-emerald-300 text-emerald-700 shadow-2xs' : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                Receita (+ €)
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nome da Categoria *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Licenças de Software, Viagens..."
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Descrição</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva o propósito desta categoria..."
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              Palavras-Chave IA (separadas por vírgula)
            </label>
            <input
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="ex: microsoft, slack, figma, adobe"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50 font-mono text-[11px]"
            />
            <p className="text-[10px] text-slate-400 mt-1">A IA usará estas palavras para classificar faturas automaticamente.</p>
          </div>

          <div className="flex gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold text-xs hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-colors"
            >
              Criar Categoria
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
