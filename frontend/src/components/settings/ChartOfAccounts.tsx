'use client';

/**
 * Plano de Contas — the Grupo → Categoria → Subcategoria tree.
 *
 * Two kinds of entry live here and behave differently:
 *
 *  • **do sistema** — provisioned from the standard chart (SNC/PME). Read-only:
 *    no rename, no delete. They keep reports, the fiscal view and the AI
 *    classifier on stable ground.
 *  • **próprias** — created by the company when the standard chart has no
 *    matching entry. Fully editable and deletable.
 *
 * Kept in its own module so the Settings page stays a thin shell.
 */

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  FolderTree, Plus, CornerDownRight, Lock, Layers, Pencil, Trash2, Check, X,
  RotateCcw, Loader2,
} from 'lucide-react';
import { Category, CategoryGroup } from '@/types';
import {
  fetchCategories, fetchCategoryGroups, updateCategory, deleteCategory, restoreChartDefaults,
} from '@/services/data';
import { CreateCategoryModal } from '@/components/shared/CreateCategoryModal';

const SystemBadge = () => (
  <span
    title="Categoria do sistema — não pode ser alterada nem eliminada"
    className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-200 text-slate-600 flex items-center gap-1 shrink-0"
  >
    <Lock className="w-2.5 h-2.5" /> Sistema
  </span>
);

interface RowProps {
  cat: Category;
  depth: 0 | 1;
  onChanged: () => void;
}

/** One category or subcategory line, with inline rename for the company's own. */
const CategoryRow: React.FC<RowProps> = ({ cat, depth, onChanged }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(cat.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locked = !!cat.is_system;

  const save = async () => {
    const name = draft.trim();
    if (!name || name === cat.name) { setEditing(false); return; }
    setBusy(true);
    setError(null);
    const res = await updateCategory(cat.id, { name });
    setBusy(false);
    if (!res) { setError('Não foi possível guardar.'); return; }
    setEditing(false);
    onChanged();
  };

  const remove = async () => {
    if (!window.confirm(`Eliminar "${cat.name}"? Esta ação não pode ser desfeita.`)) return;
    setBusy(true);
    const ok = await deleteCategory(cat.id);
    setBusy(false);
    if (!ok) { setError('Não foi possível eliminar.'); return; }
    onChanged();
  };

  return (
    <div className={depth === 1 ? 'pl-4 pt-1.5' : ''}>
      <div className="flex items-center gap-2 flex-wrap group">
        {depth === 1 && <CornerDownRight className="w-3 h-3 text-slate-300 shrink-0" />}

        {editing ? (
          <>
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save();
                if (e.key === 'Escape') { setDraft(cat.name); setEditing(false); }
              }}
              className="px-2 py-1 rounded-lg border border-indigo-300 text-[11px] focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
            />
            <button onClick={save} disabled={busy} className="p-1 rounded-lg text-emerald-600 hover:bg-emerald-50" title="Guardar">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => { setDraft(cat.name); setEditing(false); }} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100" title="Cancelar">
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <>
            <span className={depth === 0 ? 'font-semibold text-slate-800' : 'text-slate-600'}>{cat.name}</span>
            {cat.snc_code && (
              <span className="text-[9px] font-mono text-slate-400 border border-slate-200 rounded px-1 py-0.5" title="Conta SNC">
                {cat.snc_code}
              </span>
            )}
            {locked ? <SystemBadge /> : (
              <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => setEditing(true)} className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50" title="Editar">
                  <Pencil className="w-3 h-3" />
                </button>
                <button onClick={remove} disabled={busy} className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50" title="Eliminar">
                  {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                </button>
              </span>
            )}
          </>
        )}

        {(cat.keywords || []).map((kw) => (
          <span key={kw} className="text-[9px] bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded font-mono">
            {kw}
          </span>
        ))}
      </div>
      {error && <p className="text-[10px] text-rose-600 mt-1">{error}</p>}
    </div>
  );
};

export const ChartOfAccounts: React.FC = () => {
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [g, c] = await Promise.all([fetchCategoryGroups(), fetchCategories()]);
    setGroups(g);
    setCategories(c);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const restore = async () => {
    setRestoring(true);
    setNotice(null);
    const res = await restoreChartDefaults();
    setRestoring(false);
    setNotice(res ? res.message : 'Não foi possível repor o plano padrão.');
    if (res) reload();
  };

  const systemCount = categories.filter((c) => c.is_system).length;
  const ownCount = categories.length - systemCount;

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4 text-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-indigo-600" />
            <h3 className="font-bold text-sm text-slate-900">Plano de Contas</h3>
            <span className="text-[10px] text-slate-400 font-mono">
              {systemCount} do sistema · {ownCount} próprias
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={restore}
              disabled={restoring}
              title="Volta a criar as categorias padrão que estejam em falta. Não mexe nas suas."
              className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold text-[11px] hover:bg-slate-50 flex items-center gap-1.5 disabled:opacity-50"
            >
              {restoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
              Repor plano padrão
            </button>
            <Link
              href="/settings/groups"
              className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold text-[11px] hover:bg-slate-50 flex items-center gap-1.5"
            >
              <Layers className="w-3.5 h-3.5" /> Gerir Grupos
            </Link>
            <button
              onClick={() => setModalOpen(true)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold text-[11px] hover:bg-slate-50 flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Nova Categoria
            </button>
            <Link
              href="/settings/subcategories"
              className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" /> Nova Subcategoria
            </Link>
          </div>
        </div>

        <div className="flex items-start gap-2.5 p-3 bg-indigo-50/60 rounded-xl border border-indigo-100 text-[11px] text-indigo-900">
          <Lock className="w-4 h-4 shrink-0 mt-0.5 text-indigo-600" />
          <span>
            A hierarquia é <b>Grupo → Categoria → Subcategoria</b>. As categorias marcadas como{' '}
            <b>Sistema</b> vêm do plano padrão português (SNC) e <b>não podem ser alteradas nem eliminadas</b> —
            garantem que os relatórios e o IVA continuam certos. Se faltar alguma, <b>crie a sua</b>: essas são
            totalmente editáveis.
          </span>
        </div>

        {notice && (
          <p className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-[11px]">
            {notice}
          </p>
        )}

        {groups.length === 0 ? (
          <p className="text-slate-400 py-6 text-center">Nenhum grupo carregado.</p>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => {
              const roots = categories.filter(
                (c) => !c.parent_id && (c.group_id ? c.group_id === g.id : c.type === g.kind),
              );
              return (
                <div key={g.id} className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base">{g.icon || '📁'}</span>
                      <span className="font-bold text-slate-900 truncate">{g.name}</span>
                      {g.is_system && <SystemBadge />}
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${
                        g.kind === 'income'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>
                        {g.kind === 'income' ? 'Entra' : 'Sai'}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono shrink-0">{roots.length} categoria(s)</span>
                  </div>

                  {roots.length === 0 ? (
                    <p className="px-4 py-3 text-slate-400 text-[11px]">Sem categorias neste grupo.</p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {roots.map((c) => (
                        <div key={c.id} className="px-4 py-2.5">
                          <CategoryRow cat={c} depth={0} onChanged={reload} />
                          {(c.children || categories.filter((s) => s.parent_id === c.id)).map((sub) => (
                            <CategoryRow key={sub.id} cat={sub} depth={1} onChanged={reload} />
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modalOpen && (
        <CreateCategoryModal
          onClose={() => setModalOpen(false)}
          onCreated={async () => {
            setModalOpen(false);
            await reload();
          }}
        />
      )}
    </div>
  );
};
