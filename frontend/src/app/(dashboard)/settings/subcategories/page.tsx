'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useApp } from '@/context/AppContext';
import { fetchCategories, fetchCategoryGroups, createCategory } from '@/services/data';
import { Category, CategoryGroup } from '@/types';
import {
  ArrowLeft, Loader2, Check, Sparkles, CornerDownRight, AlertTriangle, FolderTree,
} from 'lucide-react';

export default function CreateSubcategoryPage() {
  const { setPageHeader } = useApp();

  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const [groupId, setGroupId] = useState('');
  const [parentId, setParentId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [keywords, setKeywords] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPageHeader(
      'Nova Subcategoria',
      'A subcategoria é o nível mais fino do plano de contas — é a ela que os lançamentos são imputados.',
    );
  }, [setPageHeader]);

  const load = async () => {
    setLoading(true);
    const [g, c] = await Promise.all([fetchCategoryGroups(), fetchCategories()]);
    setGroups(g);
    setCategories(c);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Only top-level categories can take children — the tree stops at subcategory.
  const parentsForGroup = useMemo(() => {
    const roots = categories.filter((c) => !c.parent_id);
    if (!groupId) return roots;
    const group = groups.find((g) => g.id === groupId);
    return roots.filter((c) => (c.group_id ? c.group_id === groupId : c.type === group?.kind));
  }, [categories, groups, groupId]);

  useEffect(() => {
    if (parentId && !parentsForGroup.some((c) => c.id === parentId)) setParentId('');
  }, [parentsForGroup, parentId]);

  const parent = categories.find((c) => c.id === parentId);
  const group = groups.find((g) => g.id === (parent?.group_id || groupId));
  const siblings = parent?.children || categories.filter((c) => c.parent_id === parentId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parentId || !name.trim()) return;
    setSubmitting(true);
    setError(null);

    const result = await createCategory({
      name: name.trim(),
      parent_id: parentId,
      description: description.trim() || undefined,
      keywords: keywords ? keywords.split(',').map((k) => k.trim()).filter(Boolean) : undefined,
    });

    setSubmitting(false);
    if (!result) {
      setError('Não foi possível criar a subcategoria. Verifique a ligação ao servidor.');
      return;
    }
    setCreated(result.name);
    setName(''); setDescription(''); setKeywords('');
    load();
    setTimeout(() => setCreated(null), 3500);
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300 pb-6">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
        <Link href="/settings" className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" /> Voltar às Configurações
        </Link>
        <Link href="/settings/groups" className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">
          Gerir grupos →
        </Link>
      </div>

      {created && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
          <Check className="w-4 h-4" /> Subcategoria &ldquo;{created}&rdquo; criada com sucesso.
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 text-sm gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> A carregar plano de contas…
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Form */}
          <form onSubmit={handleSubmit} className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <FolderTree className="w-4 h-4 text-indigo-600" /> Onde encaixa a subcategoria
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">1. Grupo</label>
                <select
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
                >
                  <option value="">Todos os grupos</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.icon ? `${g.icon} ` : ''}{g.name} ({g.kind === 'income' ? 'entra' : 'sai'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">2. Categoria-mãe *</label>
                <select
                  required
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
                >
                  <option value="">Escolha a categoria…</option>
                  {parentsForGroup.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {parentsForGroup.length === 0 && (
                  <p className="text-[10px] text-amber-700 mt-1.5">
                    Este grupo ainda não tem categorias de topo. Crie uma primeiro nas Configurações.
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">3. Nome da Subcategoria *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex: Google Ads, Eletricidade, Consultoria"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Descrição</label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Para que serve esta subcategoria…"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50 resize-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                Palavras-chave da IA (separadas por vírgula)
              </label>
              <input
                type="text"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="ex: google, adwords, ads"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50 font-mono text-[11px]"
              />
              <p className="text-[10px] text-slate-400 mt-1.5">
                A IA usa estas palavras para classificar faturas automaticamente nesta subcategoria.
              </p>
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="submit"
                disabled={submitting || !parentId || !name.trim()}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-2 shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Criar Subcategoria
              </button>
            </div>
          </form>

          {/* Live preview */}
          <aside className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 h-fit">
            <h3 className="font-bold text-sm text-slate-900 mb-3">Pré-visualização</h3>
            {!parentId ? (
              <p className="text-xs text-slate-400">Escolha a categoria-mãe para ver onde a subcategoria vai ficar.</p>
            ) : (
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                  <span>{group?.icon || '📁'}</span> {group?.name || 'Grupo'}
                </div>
                <div className="pl-4 flex items-center gap-1.5 font-semibold text-slate-700">
                  <CornerDownRight className="w-3 h-3 text-slate-300" /> {parent?.name}
                </div>
                {siblings.map((s) => (
                  <div key={s.id} className="pl-9 flex items-center gap-1.5 text-slate-400">
                    <CornerDownRight className="w-3 h-3 text-slate-200" /> {s.name}
                  </div>
                ))}
                <div className="pl-9 flex items-center gap-1.5 text-indigo-700 font-bold">
                  <CornerDownRight className="w-3 h-3 text-indigo-300" />
                  {name.trim() || 'nova subcategoria'}
                </div>
                <p className="text-[10px] text-slate-400 pt-3 border-t border-slate-100 mt-3">
                  Natureza herdada do grupo: <b>{group?.kind === 'income' ? 'receita (entra)' : 'despesa (sai)'}</b>.
                </p>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
