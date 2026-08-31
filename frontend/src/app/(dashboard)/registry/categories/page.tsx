'use client';

import React, { useEffect, useState } from 'react';
import { fetchCategories } from '@/services/data';
import { Category } from '@/types';
import { Plus, Sparkles, Tag, CheckCircle2, ChevronRight, ChevronDown, Trash2 } from 'lucide-react';
import { CreateCategoryModal } from '@/components/shared/CreateCategoryModal';
import { deleteCategory } from '@/services/data';

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeTab, setActiveTab] = useState<'expense' | 'income'>('expense');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({ CAT001: true, CAT002: true });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const cats = await fetchCategories();
      setCategories(cats);
    }
    load();
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCategoryCreated = (newCat: Category) => {
    setCategories(prev => [...prev, newCat]);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Tem a certeza que deseja eliminar esta categoria?')) return;
    setDeletingId(id);
    await deleteCategory(id);
    setCategories(prev => prev.filter(c => c.id !== id));
    setDeletingId(null);
  };

  const filteredCategories = categories.filter(c => c.type === activeTab);

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200/80 pb-3">
        <div>
          <h1 className="text-lg font-bold text-neutral-900 tracking-tight">
            Plano Financeiro &amp; Categorias
          </h1>
          <p className="text-xs text-neutral-500 font-medium">
            Estrutura de plano de contas com palavras-chave que alimentam o motor de classificação automática IA
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2 bg-black hover:bg-neutral-800 active:scale-95 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer border border-neutral-900"
        >
          <Plus className="w-4 h-4 text-emerald-400" />
          <span>Nova Categoria</span>
        </button>
      </div>

      {/* Type Tabs */}
      <div className="flex items-center bg-white p-1 rounded-xl border border-neutral-200/80 w-fit text-xs font-semibold">
        <button
          onClick={() => setActiveTab('expense')}
          className={`px-4 py-1.5 rounded-lg transition-all cursor-pointer ${
            activeTab === 'expense' ? 'bg-black text-white shadow-xs font-bold' : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          Despesas (- €)
        </button>
        <button
          onClick={() => setActiveTab('income')}
          className={`px-4 py-1.5 rounded-lg transition-all cursor-pointer ${
            activeTab === 'income' ? 'bg-emerald-600 text-white shadow-xs font-bold' : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          Receitas (+ €)
        </button>
      </div>

      {/* STANDARDIZED ENTERPRISE TABLE */}
      <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-neutral-50/80 border-b border-neutral-200/80 text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                <th className="py-3 px-4">Categoria Pai / Subcategoria</th>
                <th className="py-3 px-4">Tipo</th>
                <th className="py-3 px-4">Subcategorias</th>
                <th className="py-3 px-4">Palavras-Chave Motor IA</th>
                <th className="py-3 px-4 text-right">Estado</th>
                <th className="py-3 px-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-xs font-medium text-neutral-800">
              {filteredCategories.map((cat) => (
                <React.Fragment key={cat.id}>
                  {/* Main Category Row */}
                  <tr
                    onClick={() => toggleExpand(cat.id)}
                    className="bg-neutral-50/40 hover:bg-neutral-100/60 transition-colors cursor-pointer select-none"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {cat.children && cat.children.length > 0 ? (
                          expandedIds[cat.id] ? <ChevronDown className="w-4 h-4 text-neutral-400" /> : <ChevronRight className="w-4 h-4 text-neutral-400" />
                        ) : (
                          <Tag className="w-4 h-4 text-neutral-400" />
                        )}
                        <span className="font-bold text-neutral-900">{cat.name}</span>
                        {cat.description && (
                          <span className="text-[11px] text-neutral-400 hidden lg:inline">— {cat.description}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        cat.type === 'expense'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}>
                        {cat.type === 'expense' ? 'Despesa' : 'Receita'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[11px] font-mono text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded">
                        {cat.children?.length || 0} subcategorias
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[11px] text-neutral-400">Expandir para ver subcategorias</span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Ativo
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={(e) => handleDelete(e, cat.id)}
                        disabled={deletingId === cat.id}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Eliminar Categoria"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>

                  {/* Subcategories Rows */}
                  {expandedIds[cat.id] && cat.children && cat.children.map((sub) => (
                    <tr key={sub.id} className="bg-white hover:bg-neutral-50/80 transition-colors">
                      <td className="py-2.5 px-4 pl-10">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-neutral-900" />
                          <span className="font-semibold text-neutral-800">{sub.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="text-[10px] text-neutral-400">Subcategoria</span>
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="text-[11px] text-neutral-400 font-mono">-</span>
                      </td>
                      <td className="py-2.5 px-4">
                        {sub.keywords && sub.keywords.length > 0 ? (
                          <div className="flex items-center gap-1 flex-wrap">
                            <Sparkles className="w-3 h-3 text-emerald-600 shrink-0" />
                            {sub.keywords.map((kw, idx) => (
                              <span key={idx} className="text-[10px] bg-neutral-100 text-neutral-800 border border-neutral-200 px-1.5 py-0.5 rounded font-mono">
                                {kw}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-neutral-400 text-[11px]">Nenhuma palavra-chave</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <span className="text-[10px] text-neutral-400 font-mono">ID: {sub.id}</span>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Creation Modal */}
      {isModalOpen && (
        <CreateCategoryModal
          onClose={() => setIsModalOpen(false)}
          onCreated={handleCategoryCreated}
        />
      )}

    </div>
  );
}
