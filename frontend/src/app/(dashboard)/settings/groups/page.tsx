'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '@/context/AppContext';
import {
  fetchCategoryGroups, createCategoryGroup, deleteCategoryGroup,
} from '@/services/data';
import { CategoryGroup } from '@/types';
import { SideDrawer } from '@/components/shared/SideDrawer';
import {
  ArrowLeft, Plus, Lock, Trash2, Loader2, TrendingUp, TrendingDown, AlertTriangle, Layers,
} from 'lucide-react';

const FORM_ID = 'create-group-form';

const ICON_CHOICES = ['📈', '📉', '🏦', '🔄', '🏗️', '🎯', '💼', '🧾', '⚙️', '🌍'];

const ACCENTS: Record<string, { ring: string; chip: string; text: string }> = {
  emerald: { ring: 'border-emerald-200', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', text: 'text-emerald-700' },
  rose: { ring: 'border-rose-200', chip: 'bg-rose-50 text-rose-700 border-rose-200', text: 'text-rose-700' },
  indigo: { ring: 'border-indigo-200', chip: 'bg-indigo-50 text-indigo-700 border-indigo-200', text: 'text-indigo-700' },
  amber: { ring: 'border-amber-200', chip: 'bg-amber-50 text-amber-700 border-amber-200', text: 'text-amber-700' },
  slate: { ring: 'border-slate-200', chip: 'bg-slate-100 text-slate-700 border-slate-200', text: 'text-slate-700' },
};

const accentOf = (g: CategoryGroup) => ACCENTS[g.color || ''] || ACCENTS.slate;

export default function CategoryGroupsPage() {
  const { setPageHeader } = useApp();
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // create form
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'income' | 'expense'>('expense');
  const [icon, setIcon] = useState('📈');
  const [color, setColor] = useState('indigo');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setPageHeader(
      'Grupos de Movimento',
      'Receita e Despesa são os grupos originais do sistema. Pode acrescentar os seus para organizar melhor o plano de contas.',
    );
  }, [setPageHeader]);

  const load = async () => {
    setLoading(true);
    setGroups(await fetchCategoryGroups());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setName(''); setKind('expense'); setIcon('📈'); setColor('indigo'); setDescription('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    const created = await createCategoryGroup({
      name: name.trim(), kind, icon, color, description: description.trim() || undefined,
    });
    setSubmitting(false);
    if (!created) {
      setError('Não foi possível criar o grupo. Verifique se já existe um com esse nome.');
      return;
    }
    setDrawerOpen(false);
    resetForm();
    load();
  };

  const handleDelete = async (g: CategoryGroup) => {
    setError(null);
    const ok = await deleteCategoryGroup(g.id);
    if (!ok) {
      setError(
        `Não foi possível eliminar "${g.name}". Grupos do sistema são protegidos e grupos com categorias têm de ser esvaziados primeiro.`,
      );
      return;
    }
    load();
  };

  const systemGroups = groups.filter((g) => g.is_system);
  const customGroups = groups.filter((g) => !g.is_system);

  return (
    <div className="space-y-5 animate-in fade-in duration-300 pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
        <Link href="/settings" className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" /> Voltar às Configurações
        </Link>
        <button
          onClick={() => setDrawerOpen(true)}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" /> Novo Grupo
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Explainer */}
      <div className="flex items-start gap-2.5 p-4 bg-indigo-50/60 rounded-2xl border border-indigo-100 text-[11px] text-indigo-900">
        <Layers className="w-4 h-4 shrink-0 mt-0.5 text-indigo-600" />
        <span>
          Cada grupo declara a sua <b>natureza financeira</b> — receita ou despesa. É isso que permite criar grupos
          próprios (Investimento, Frota…) sem afetar o fluxo de caixa, o dashboard ou o relatório de IVA, que continuam
          a somar por natureza. A hierarquia é <b>Grupo → Categoria → Subcategoria</b>.
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 text-sm gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> A carregar grupos…
        </div>
      ) : (
        <>
          {/* System groups */}
          <section className="space-y-2">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Originais do sistema</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {systemGroups.map((g) => (
                <GroupCard key={g.id} group={g} />
              ))}
            </div>
          </section>

          {/* Custom groups */}
          <section className="space-y-2">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Os seus grupos ({customGroups.length})
            </h3>
            {customGroups.length === 0 ? (
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center">
                <Layers className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-600">Ainda não criou grupos próprios</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Exemplos úteis: Investimento, Frota, Projetos de I&amp;D.
                </p>
                <button
                  onClick={() => setDrawerOpen(true)}
                  className="mt-3 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[11px] font-bold hover:bg-indigo-700"
                >
                  Criar o primeiro grupo
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {customGroups.map((g) => (
                  <GroupCard key={g.id} group={g} onDelete={() => handleDelete(g)} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* Create drawer */}
      {drawerOpen && (
        <SideDrawer
          title="Novo Grupo de Movimento"
          subtitle="Organize o plano de contas à sua medida"
          onClose={() => { setDrawerOpen(false); resetForm(); }}
          footer={
            <>
              <button
                type="button"
                onClick={() => { setDrawerOpen(false); resetForm(); }}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-xs hover:bg-white transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form={FORM_ID}
                disabled={submitting}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Criar Grupo
              </button>
            </>
          }
        >
          <form id={FORM_ID} onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Nome do Grupo *</label>
              <input
                type="text"
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex: Investimento, Frota, Projetos"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Natureza Financeira *</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setKind('income')}
                  className={`py-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    kind === 'income' ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5" /> Entra (receita)
                </button>
                <button
                  type="button"
                  onClick={() => setKind('expense')}
                  className={`py-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    kind === 'expense' ? 'bg-rose-50 border-rose-300 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  <TrendingDown className="w-3.5 h-3.5" /> Sai (despesa)
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5">
                Define como o grupo é somado no fluxo de caixa e no IVA. Não muda depois de haver categorias.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Ícone</label>
              <div className="flex flex-wrap gap-1.5">
                {ICON_CHOICES.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setIcon(ic)}
                    className={`w-9 h-9 rounded-lg border text-base transition-all ${
                      icon === ic ? 'bg-indigo-50 border-indigo-300' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Cor de destaque</label>
              <div className="flex gap-1.5">
                {(['indigo', 'emerald', 'rose', 'amber', 'slate'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold capitalize transition-all ${
                      color === c ? ACCENTS[c].chip : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Descrição</label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Para que serve este grupo…"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50 resize-none"
              />
            </div>
          </form>
        </SideDrawer>
      )}
    </div>
  );
}

function GroupCard({ group, onDelete }: { group: CategoryGroup; onDelete?: () => void }) {
  const accent = accentOf(group);
  return (
    <div className={`bg-white rounded-2xl border ${accent.ring} shadow-xs p-4 flex items-start gap-3`}>
      <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-lg shrink-0">
        {group.icon || '📁'}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="font-bold text-sm text-slate-900 truncate">{group.name}</h4>
          {group.is_system ? (
            <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1">
              <Lock className="w-2.5 h-2.5" /> Sistema
            </span>
          ) : null}
          <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide border ${accent.chip}`}>
            {group.kind === 'income' ? 'Entra' : 'Sai'}
          </span>
        </div>
        {group.description && (
          <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{group.description}</p>
        )}
        <p className="text-[10px] text-slate-400 mt-1.5 font-mono">
          {group.category_count ?? 0} categoria(s)
        </p>
      </div>
      {onDelete && (
        <button
          onClick={onDelete}
          aria-label={`Eliminar ${group.name}`}
          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 shrink-0 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
