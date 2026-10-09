'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useApp } from '@/context/AppContext';
import { useLoad } from '@/lib/use-load';
import {
  fetchCategoryGroups, createCategoryGroup, deleteCategoryGroup,
} from '@/services/data';
import { CategoryGroup } from '@/types';
import { SideDrawer } from '@/components/shared/SideDrawer';
import {
  ArrowLeft, Plus, Lock, Trash2, TrendingUp, TrendingDown, Layers,
} from 'lucide-react';
import {
  Button, IconButton, Card, Field, Input, Textarea, Badge, LoadingState, EmptyState, Segmented, useConfirm,
} from '@/components/ui';

const FORM_ID = 'create-group-form';

const ICON_CHOICES = ['📈', '📉', '🏦', '🔄', '🏗️', '🎯', '💼', '🧾', '⚙️', '🌍'];

// As chaves são os valores gravados na base de dados ("indigo", "slate"…);
// só a aparência e o nome mostrado mudam aqui.
const ACCENTS: Record<string, { chip: string; label: string }> = {
  emerald: { chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Verde' },
  rose: { chip: 'bg-rose-50 text-rose-700 border-rose-200', label: 'Rosa' },
  indigo: { chip: 'bg-sky-50 text-sky-700 border-sky-200', label: 'Azul' },
  amber: { chip: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Âmbar' },
  slate: { chip: 'bg-neutral-100 text-neutral-700 border-neutral-200', label: 'Cinza' },
};

const accentOf = (g: CategoryGroup) => ACCENTS[g.color || ''] || ACCENTS.slate;

export default function CategoryGroupsPage() {
  const { setPageHeader } = useApp();
  const confirm = useConfirm();
  const { data: groups, loading, reload: load } = useLoad(fetchCategoryGroups, [], { initialData: [] as CategoryGroup[] });
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  const resetForm = () => {
    setName(''); setKind('expense'); setIcon('📈'); setColor('indigo'); setDescription('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    const created = await createCategoryGroup({
      name: name.trim(), kind, icon, color, description: description.trim() || undefined,
    });
    setSubmitting(false);
    if (!created) {
      toast.error('Não foi possível criar o grupo. Verifique se já existe um com esse nome.');
      return;
    }
    setDrawerOpen(false);
    resetForm();
    load();
  };

  const handleDelete = async (g: CategoryGroup) => {
    if (!(await confirm({
      title: `Eliminar o grupo "${g.name}"?`,
      description: 'Esta ação não pode ser desfeita.',
      danger: true,
      confirmLabel: 'Eliminar',
    }))) return;
    const ok = await deleteCategoryGroup(g.id);
    if (!ok) {
      toast.error(
        `Não foi possível eliminar "${g.name}". Grupos do sistema são protegidos e grupos com categorias têm de ser esvaziados primeiro.`,
      );
      return;
    }
    load();
  };

  const systemGroups = groups.filter((g) => g.is_system);
  const customGroups = groups.filter((g) => !g.is_system);

  return (
    <div className="space-y-4 animate-in fade-in duration-300 pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Link href="/settings" className="flex items-center gap-1.5 text-13 font-medium text-neutral-500 hover:text-neutral-900">
          <ArrowLeft className="size-4" aria-hidden="true" /> Voltar às Configurações
        </Link>
        <Button onClick={() => setDrawerOpen(true)} icon={<Plus />}>
          Novo Grupo
        </Button>
      </div>

      {/* Explainer */}
      <div className="flex items-start gap-2 rounded-lg border px-3 py-2 text-xs bg-sky-50 border-sky-200 text-sky-900">
        <Layers className="size-3.5 shrink-0 mt-0.5 text-sky-600" aria-hidden="true" />
        <span>
          Cada grupo declara a sua <span className="font-semibold">natureza financeira</span> — receita ou despesa. É isso que permite criar grupos
          próprios (Investimento, Frota…) sem afetar o fluxo de caixa, o painel ou o relatório de IVA, que continuam
          a somar por natureza. A hierarquia é <span className="font-semibold">Grupo → Categoria → Subcategoria</span>.
        </span>
      </div>

      {loading ? (
        <LoadingState label="A carregar grupos…" />
      ) : (
        <>
          {/* System groups */}
          <section className="space-y-2">
            <h3 className="text-xs font-medium text-neutral-500">Originais do sistema</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {systemGroups.map((g) => (
                <GroupCard key={g.id} group={g} />
              ))}
            </div>
          </section>

          {/* Custom groups */}
          <section className="space-y-2">
            <h3 className="text-xs font-medium text-neutral-500">
              Os seus grupos ({customGroups.length})
            </h3>
            {customGroups.length === 0 ? (
              <Card className="border-dashed">
                <EmptyState
                  icon={<Layers />}
                  title="Ainda não criou grupos próprios"
                  description="Exemplos úteis: Investimento, Frota, Projetos de I&D."
                  action={
                    <Button size="sm" onClick={() => setDrawerOpen(true)} icon={<Plus />}>
                      Criar o primeiro grupo
                    </Button>
                  }
                />
              </Card>
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
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => { setDrawerOpen(false); resetForm(); }}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                form={FORM_ID}
                loading={submitting}
                className="flex-1"
              >
                Criar Grupo
              </Button>
            </>
          }
        >
          <form id={FORM_ID} onSubmit={handleCreate} className="space-y-4">
            <Field label="Nome do Grupo" required>
              {(p) => (
                <Input
                  {...p}
                  type="text"
                  required
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ex: Investimento, Frota, Projetos"
                />
              )}
            </Field>

            <div className="space-y-1">
              <span id="group-kind-label" className="block text-xs font-medium text-neutral-700">
                Natureza Financeira<span className="text-rose-500 ml-0.5" aria-hidden="true">*</span>
              </span>
              <Segmented
                aria-label="Natureza Financeira"
                value={kind}
                onChange={setKind}
                className="flex w-full [&>button]:flex-1"
                options={[
                  { value: 'income', label: <span className="inline-flex items-center gap-1.5"><TrendingUp className="size-3.5 text-emerald-600" aria-hidden="true" /> Entra (receita)</span> },
                  { value: 'expense', label: <span className="inline-flex items-center gap-1.5"><TrendingDown className="size-3.5 text-rose-600" aria-hidden="true" /> Sai (despesa)</span> },
                ]}
              />
              <p className="text-xs text-neutral-500">
                Define como o grupo é somado no fluxo de caixa e no IVA. Não muda depois de haver categorias.
              </p>
            </div>

            <div role="group" aria-labelledby="group-icon-label" className="space-y-1">
              <span id="group-icon-label" className="block text-xs font-medium text-neutral-700">Ícone</span>
              <div className="flex flex-wrap gap-1.5">
                {ICON_CHOICES.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    aria-pressed={icon === ic}
                    aria-label={`Ícone ${ic}`}
                    onClick={() => setIcon(ic)}
                    className={`size-8 rounded-md border text-base transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 ${
                      icon === ic ? 'bg-emerald-50 border-emerald-400' : 'bg-white border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </div>

            <div role="group" aria-labelledby="group-color-label" className="space-y-1">
              <span id="group-color-label" className="block text-xs font-medium text-neutral-700">Cor de destaque</span>
              <div className="flex flex-wrap gap-1.5">
                {(['indigo', 'emerald', 'rose', 'amber', 'slate'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={color === c}
                    onClick={() => setColor(c)}
                    className={`h-7 px-2.5 rounded-md border text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 ${
                      color === c ? ACCENTS[c].chip : 'bg-white border-neutral-200 text-neutral-500 hover:bg-neutral-50'
                    }`}
                  >
                    {ACCENTS[c].label}
                  </button>
                ))}
              </div>
            </div>

            <Field label="Descrição">
              {(p) => (
                <Textarea
                  {...p}
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Para que serve este grupo…"
                  className="resize-none"
                />
              )}
            </Field>
          </form>
        </SideDrawer>
      )}
    </div>
  );
}

function GroupCard({ group, onDelete }: { group: CategoryGroup; onDelete?: () => void }) {
  const accent = accentOf(group);
  return (
    <Card className="p-4 flex items-start gap-3">
      <div className="size-8 rounded-lg bg-neutral-50 border border-neutral-200 flex items-center justify-center text-base shrink-0" aria-hidden="true">
        {group.icon || '📁'}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="font-semibold text-13 text-neutral-900 truncate">{group.name}</h4>
          {group.is_system ? (
            <Badge>
              <Lock className="w-2.5 h-2.5" aria-hidden="true" /> Sistema
            </Badge>
          ) : null}
          <span className={`inline-flex items-center h-5 px-1.5 rounded text-2xs font-medium border ${accent.chip}`}>
            {group.kind === 'income' ? 'Entra' : 'Sai'}
          </span>
        </div>
        {group.description && (
          <p className="text-xs text-neutral-500 mt-1 line-clamp-2">{group.description}</p>
        )}
        <p className="text-2xs text-neutral-500 mt-1 tabular-nums">
          {group.category_count ?? 0} categoria(s)
        </p>
      </div>
      {onDelete && (
        <IconButton variant="danger" label={`Eliminar ${group.name}`} onClick={onDelete}>
          <Trash2 />
        </IconButton>
      )}
    </Card>
  );
}
