'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useApp } from '@/context/AppContext';
import {
  fetchCategoryGroups, createCategoryGroup, deleteCategoryGroup,
} from '@/services/data';
import { CategoryGroup } from '@/types';
import { SideDrawer } from '@/components/shared/SideDrawer';
import {
  ArrowLeft, Plus, Lock, Trash2, TrendingUp, TrendingDown, Layers,
} from 'lucide-react';
import {
  Button, IconButton, Card, Field, Input, Textarea, Badge, LoadingState, EmptyState, useConfirm,
} from '@/components/ui';

const FORM_ID = 'create-group-form';

const ICON_CHOICES = ['📈', '📉', '🏦', '🔄', '🏗️', '🎯', '💼', '🧾', '⚙️', '🌍'];

// As chaves são os valores gravados na base de dados ("indigo", "slate"…);
// só a aparência e o nome mostrado mudam aqui.
const ACCENTS: Record<string, { ring: string; chip: string; label: string }> = {
  emerald: { ring: 'border-emerald-200', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Verde' },
  rose: { ring: 'border-rose-200', chip: 'bg-rose-50 text-rose-700 border-rose-200', label: 'Rosa' },
  indigo: { ring: 'border-sky-200', chip: 'bg-sky-50 text-sky-700 border-sky-200', label: 'Azul' },
  amber: { ring: 'border-amber-200', chip: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Âmbar' },
  slate: { ring: 'border-neutral-200', chip: 'bg-neutral-100 text-neutral-700 border-neutral-200', label: 'Cinza' },
};

const accentOf = (g: CategoryGroup) => ACCENTS[g.color || ''] || ACCENTS.slate;

export default function CategoryGroupsPage() {
  const { setPageHeader } = useApp();
  const confirm = useConfirm();
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [loading, setLoading] = useState(true);
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

  const segment = (active: boolean, tone: 'emerald' | 'rose') =>
    `h-9 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
      active
        ? tone === 'emerald'
          ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
          : 'bg-rose-50 border-rose-300 text-rose-700'
        : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
    }`;

  return (
    <div className="space-y-5 animate-in fade-in duration-300 pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-200/80 pb-4">
        <Link href="/settings" className="flex items-center gap-2 text-xs font-semibold text-neutral-500 hover:text-neutral-900">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Voltar às Configurações
        </Link>
        <Button onClick={() => setDrawerOpen(true)} icon={<Plus />}>
          Novo Grupo
        </Button>
      </div>

      {/* Explainer */}
      <div className="flex items-start gap-2.5 p-4 bg-neutral-50 rounded-2xl border border-neutral-200 text-xs text-neutral-700">
        <Layers className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" aria-hidden="true" />
        <span>
          Cada grupo declara a sua <b>natureza financeira</b> — receita ou despesa. É isso que permite criar grupos
          próprios (Investimento, Frota…) sem afetar o fluxo de caixa, o painel ou o relatório de IVA, que continuam
          a somar por natureza. A hierarquia é <b>Grupo → Categoria → Subcategoria</b>.
        </span>
      </div>

      {loading ? (
        <LoadingState label="A carregar grupos…" />
      ) : (
        <>
          {/* System groups */}
          <section className="space-y-2">
            <h3 className="text-2xs font-bold text-neutral-500 uppercase tracking-widest">Originais do sistema</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {systemGroups.map((g) => (
                <GroupCard key={g.id} group={g} />
              ))}
            </div>
          </section>

          {/* Custom groups */}
          <section className="space-y-2">
            <h3 className="text-2xs font-bold text-neutral-500 uppercase tracking-widest">
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

            <div role="group" aria-labelledby="group-kind-label" className="space-y-1.5">
              <span id="group-kind-label" className="block text-xs font-semibold text-neutral-700">
                Natureza Financeira<span className="text-rose-500 ml-0.5" aria-hidden="true">*</span>
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  aria-pressed={kind === 'income'}
                  onClick={() => setKind('income')}
                  className={segment(kind === 'income', 'emerald')}
                >
                  <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" /> Entra (receita)
                </button>
                <button
                  type="button"
                  aria-pressed={kind === 'expense'}
                  onClick={() => setKind('expense')}
                  className={segment(kind === 'expense', 'rose')}
                >
                  <TrendingDown className="w-3.5 h-3.5" aria-hidden="true" /> Sai (despesa)
                </button>
              </div>
              <p className="text-xs text-neutral-500">
                Define como o grupo é somado no fluxo de caixa e no IVA. Não muda depois de haver categorias.
              </p>
            </div>

            <div role="group" aria-labelledby="group-icon-label" className="space-y-1.5">
              <span id="group-icon-label" className="block text-xs font-semibold text-neutral-700">Ícone</span>
              <div className="flex flex-wrap gap-1.5">
                {ICON_CHOICES.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    aria-pressed={icon === ic}
                    aria-label={`Ícone ${ic}`}
                    onClick={() => setIcon(ic)}
                    className={`w-9 h-9 rounded-lg border text-base transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                      icon === ic ? 'bg-emerald-50 border-emerald-400' : 'bg-white border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </div>

            <div role="group" aria-labelledby="group-color-label" className="space-y-1.5">
              <span id="group-color-label" className="block text-xs font-semibold text-neutral-700">Cor de destaque</span>
              <div className="flex flex-wrap gap-1.5">
                {(['indigo', 'emerald', 'rose', 'amber', 'slate'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={color === c}
                    onClick={() => setColor(c)}
                    className={`h-8 px-3 rounded-lg border text-xs font-bold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
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
    <Card className={`${accent.ring} p-4 flex items-start gap-3`}>
      <div className="w-10 h-10 rounded-xl bg-neutral-50 border border-neutral-200 flex items-center justify-center text-lg shrink-0" aria-hidden="true">
        {group.icon || '📁'}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="font-bold text-sm text-neutral-900 truncate">{group.name}</h4>
          {group.is_system ? (
            <Badge className="uppercase tracking-wide">
              <Lock className="w-2.5 h-2.5" aria-hidden="true" /> Sistema
            </Badge>
          ) : null}
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-2xs font-semibold uppercase tracking-wide border ${accent.chip}`}>
            {group.kind === 'income' ? 'Entra' : 'Sai'}
          </span>
        </div>
        {group.description && (
          <p className="text-xs text-neutral-500 mt-1 line-clamp-2">{group.description}</p>
        )}
        <p className="text-2xs text-neutral-500 mt-1.5 tabular-nums">
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
