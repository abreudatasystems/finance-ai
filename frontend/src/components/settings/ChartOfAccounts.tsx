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
import { toast } from 'sonner';
import { Category, CategoryGroup } from '@/types';
import {
  fetchCategories, fetchCategoryGroups, updateCategory, deleteCategory, restoreChartDefaults,
} from '@/services/data';
import { CreateCategoryModal } from '@/components/shared/CreateCategoryModal';
import {
  Button, IconButton, Card, CardHeader, CardBody, Badge, EmptyState, inputClass, cn, useConfirm,
} from '@/components/ui';

/** Classes de um <Link> com o aspeto de <Button size="sm">. */
const linkButton = (primary: boolean) => cn(
  'inline-flex items-center justify-center h-8 px-3 gap-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 [&_svg]:size-4',
  primary
    ? 'bg-black text-white border border-black hover:bg-neutral-800'
    : 'bg-white text-neutral-800 border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300',
);

const SystemBadge = () => (
  <Badge
    title="Categoria do sistema — não pode ser alterada nem eliminada"
    className="uppercase shrink-0"
  >
    <Lock className="w-2.5 h-2.5" aria-hidden="true" /> Sistema
  </Badge>
);

interface RowProps {
  cat: Category;
  depth: 0 | 1;
  onChanged: () => void;
}

/** One category or subcategory line, with inline rename for the company's own. */
const CategoryRow: React.FC<RowProps> = ({ cat, depth, onChanged }) => {
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(cat.name);
  const [busy, setBusy] = useState(false);

  const locked = !!cat.is_system;

  const save = async () => {
    const name = draft.trim();
    if (!name || name === cat.name) { setEditing(false); return; }
    setBusy(true);
    const res = await updateCategory(cat.id, { name });
    setBusy(false);
    if (!res) { toast.error('Não foi possível guardar.'); return; }
    setEditing(false);
    onChanged();
  };

  const remove = async () => {
    if (!(await confirm({
      title: `Eliminar "${cat.name}"?`,
      description: 'Esta ação não pode ser desfeita.',
      danger: true,
      confirmLabel: 'Eliminar',
    }))) return;
    setBusy(true);
    const ok = await deleteCategory(cat.id);
    setBusy(false);
    if (!ok) { toast.error('Não foi possível eliminar.'); return; }
    onChanged();
  };

  return (
    <div className={depth === 1 ? 'pl-4 pt-1.5' : ''}>
      <div className="flex items-center gap-2 flex-wrap group">
        {depth === 1 && <CornerDownRight className="w-3 h-3 text-neutral-300 shrink-0" aria-hidden="true" />}

        {editing ? (
          <>
            <input
              autoFocus
              aria-label={`Novo nome para ${cat.name}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save();
                if (e.key === 'Escape') { setDraft(cat.name); setEditing(false); }
              }}
              className={cn(inputClass, 'h-8 w-auto text-xs')}
            />
            <IconButton label="Guardar" onClick={save} disabled={busy} className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50">
              {busy ? <Loader2 className="animate-spin" /> : <Check />}
            </IconButton>
            <IconButton label="Cancelar" onClick={() => { setDraft(cat.name); setEditing(false); }}>
              <X />
            </IconButton>
          </>
        ) : (
          <>
            <span className={depth === 0 ? 'font-semibold text-neutral-800' : 'text-neutral-600'}>{cat.name}</span>
            {cat.snc_code && (
              <span className="text-2xs font-mono text-neutral-500 border border-neutral-200 rounded px-1 py-0.5" title="Conta SNC">
                {cat.snc_code}
              </span>
            )}
            {locked ? <SystemBadge /> : (
              <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <IconButton label={`Editar ${cat.name}`} onClick={() => setEditing(true)} className="size-7">
                  <Pencil />
                </IconButton>
                <IconButton label={`Eliminar ${cat.name}`} variant="danger" onClick={remove} disabled={busy} className="size-7">
                  {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
                </IconButton>
              </span>
            )}
          </>
        )}

        {(cat.keywords || []).map((kw) => (
          <span key={kw} className="text-2xs bg-neutral-100 text-neutral-600 border border-neutral-200 px-1.5 py-0.5 rounded font-mono">
            {kw}
          </span>
        ))}
      </div>
    </div>
  );
};

export const ChartOfAccounts: React.FC = () => {
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const reload = useCallback(async () => {
    const [g, c] = await Promise.all([fetchCategoryGroups(), fetchCategories()]);
    setGroups(g);
    setCategories(c);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const restore = async () => {
    setRestoring(true);
    const res = await restoreChartDefaults();
    setRestoring(false);
    if (res) {
      toast.success(res.message);
      reload();
    } else {
      toast.error('Não foi possível repor o plano padrão.');
    }
  };

  const systemCount = categories.filter((c) => c.is_system).length;
  const ownCount = categories.length - systemCount;

  return (
    <div className="space-y-5">
      <Card className="text-xs">
        <CardHeader
          icon={<FolderTree />}
          title="Plano de Contas"
          subtitle={`${systemCount} do sistema · ${ownCount} próprias`}
        />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={restore}
              loading={restoring}
              icon={<RotateCcw />}
              title="Volta a criar as categorias padrão que estejam em falta. Não mexe nas suas."
            >
              Repor plano padrão
            </Button>
            <Link href="/settings/groups" className={linkButton(false)}>
              <Layers aria-hidden="true" /> Gerir Grupos
            </Link>
            <Button variant="secondary" size="sm" onClick={() => setModalOpen(true)} icon={<Plus />}>
              Nova Categoria
            </Button>
            <Link href="/settings/subcategories" className={linkButton(true)}>
              <Plus aria-hidden="true" /> Nova Subcategoria
            </Link>
          </div>

          <div className="flex items-start gap-2.5 p-3 bg-neutral-50 rounded-xl border border-neutral-200 text-xs text-neutral-700">
            <Lock className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" aria-hidden="true" />
            <span>
              A hierarquia é <b>Grupo → Categoria → Subcategoria</b>. As categorias marcadas como{' '}
              <b>Sistema</b> vêm do plano padrão português (SNC) e <b>não podem ser alteradas nem eliminadas</b> —
              garantem que os relatórios e o IVA continuam certos. Se faltar alguma, <b>crie a sua</b>: essas são
              totalmente editáveis.
            </span>
          </div>

          {groups.length === 0 ? (
            <EmptyState title="Nenhum grupo carregado." />
          ) : (
            <div className="space-y-4">
              {groups.map((g) => {
                const roots = categories.filter(
                  (c) => !c.parent_id && (c.group_id ? c.group_id === g.id : c.type === g.kind),
                );
                return (
                  <div key={g.id} className="border border-neutral-200 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-neutral-50 border-b border-neutral-200">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base" aria-hidden="true">{g.icon || '📁'}</span>
                        <span className="font-bold text-neutral-900 truncate">{g.name}</span>
                        {g.is_system && <SystemBadge />}
                        <Badge tone={g.kind === 'income' ? 'success' : 'danger'} className="uppercase">
                          {g.kind === 'income' ? 'Entra' : 'Sai'}
                        </Badge>
                      </div>
                      <span className="text-2xs text-neutral-500 tabular-nums shrink-0">{roots.length} categoria(s)</span>
                    </div>

                    {roots.length === 0 ? (
                      <p className="px-4 py-3 text-neutral-500 text-xs">Sem categorias neste grupo.</p>
                    ) : (
                      <div className="divide-y divide-neutral-100">
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
        </CardBody>
      </Card>

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
