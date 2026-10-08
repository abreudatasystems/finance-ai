'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useApp } from '@/context/AppContext';
import { fetchCategories, fetchCategoryGroups, createCategory } from '@/services/data';
import { Category, CategoryGroup } from '@/types';
import { toast } from 'sonner';
import { useLoad } from '@/lib/use-load';
import {
  ArrowLeft, Check, Sparkles, CornerDownRight, FolderTree,
} from 'lucide-react';
import {
  Button, Card, CardHeader, CardBody, Field, Input, Select, Textarea, LoadingState,
} from '@/components/ui';

const NO_GROUPS: CategoryGroup[] = [];
const NO_CATEGORIES: Category[] = [];

export default function CreateSubcategoryPage() {
  const { setPageHeader } = useApp();

  const { data, loading, reload: load } = useLoad(
    () => Promise.all([fetchCategoryGroups(), fetchCategories()]),
    [],
  );
  const groups: CategoryGroup[] = data?.[0] ?? NO_GROUPS;
  const categories: Category[] = data?.[1] ?? NO_CATEGORIES;

  const [groupId, setGroupId] = useState('');
  const [parentId, setParentId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [keywords, setKeywords] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  useEffect(() => {
    setPageHeader(
      'Nova Subcategoria',
      'A subcategoria é o nível mais fino do plano de contas — é a ela que os lançamentos são imputados.',
    );
  }, [setPageHeader]);

  // Only top-level categories can take children — the tree stops at subcategory.
  const parentsForGroup = useMemo(() => {
    const roots = categories.filter((c) => !c.parent_id);
    if (!groupId) return roots;
    const group = groups.find((g) => g.id === groupId);
    return roots.filter((c) => (c.group_id ? c.group_id === groupId : c.type === group?.kind));
  }, [categories, groups, groupId]);

  // A categoria-mãe escolhida deixou de caber no grupo → limpa a escolha.
  // Ajustado durante o render, não num efeito.
  if (parentId && !parentsForGroup.some((c) => c.id === parentId)) setParentId('');

  const parent = categories.find((c) => c.id === parentId);
  const group = groups.find((g) => g.id === (parent?.group_id || groupId));
  const siblings = parent?.children || categories.filter((c) => c.parent_id === parentId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parentId || !name.trim()) return;
    setSubmitting(true);

    const result = await createCategory({
      name: name.trim(),
      parent_id: parentId,
      description: description.trim() || undefined,
      keywords: keywords ? keywords.split(',').map((k) => k.trim()).filter(Boolean) : undefined,
    });

    setSubmitting(false);
    if (!result) {
      toast.error('Não foi possível criar a subcategoria. Verifique a ligação ao servidor.');
      return;
    }
    setCreated(result.name);
    setName(''); setDescription(''); setKeywords('');
    load();
    setTimeout(() => setCreated(null), 3500);
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300 pb-6">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-200/80 pb-4">
        <Link href="/settings" className="flex items-center gap-2 text-xs font-semibold text-neutral-500 hover:text-neutral-900">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Voltar às Configurações
        </Link>
        <Link href="/settings/groups" className="text-xs font-semibold text-emerald-700 hover:text-emerald-900">
          Gerir grupos →
        </Link>
      </div>

      {created && (
        <div role="status" className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
          <Check className="w-4 h-4" aria-hidden="true" /> Subcategoria &ldquo;{created}&rdquo; criada com sucesso.
        </div>
      )}

      {loading ? (
        <LoadingState label="A carregar plano de contas…" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Form */}
          <Card className="lg:col-span-2">
            <CardHeader icon={<FolderTree />} title="Onde encaixa a subcategoria" />
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="1. Grupo">
                  {(p) => (
                    <Select {...p} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                      <option value="">Todos os grupos</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.icon ? `${g.icon} ` : ''}{g.name} ({g.kind === 'income' ? 'entra' : 'sai'})
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                <Field
                  label="2. Categoria-mãe"
                  required
                  hint={parentsForGroup.length === 0 ? (
                    <span className="text-amber-700">
                      Este grupo ainda não tem categorias de topo. Crie uma primeiro nas Configurações.
                    </span>
                  ) : undefined}
                >
                  {(p) => (
                    <Select {...p} required value={parentId} onChange={(e) => setParentId(e.target.value)}>
                      <option value="">Escolha a categoria…</option>
                      {parentsForGroup.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>

              <Field label="3. Nome da Subcategoria" required>
                {(p) => (
                  <Input
                    {...p}
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="ex: Google Ads, Eletricidade, Consultoria"
                  />
                )}
              </Field>

              <Field label="Descrição">
                {(p) => (
                  <Textarea
                    {...p}
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Para que serve esta subcategoria…"
                    className="resize-none"
                  />
                )}
              </Field>

              <Field
                label={
                  <span className="inline-flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                    Palavras-chave da IA (separadas por vírgula)
                  </span>
                }
                hint="A IA usa estas palavras para classificar faturas automaticamente nesta subcategoria."
              >
                {(p) => (
                  <Input
                    {...p}
                    type="text"
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    placeholder="ex: google, adwords, ads"
                    className="font-mono text-xs"
                  />
                )}
              </Field>

              <div className="pt-3 border-t border-neutral-100 flex justify-end">
                <Button
                  type="submit"
                  loading={submitting}
                  disabled={!parentId || !name.trim()}
                >
                  Criar Subcategoria
                </Button>
              </div>
            </form>
          </Card>

          {/* Live preview */}
          <Card className="h-fit">
            <CardHeader title="Pré-visualização" />
            <CardBody>
              {!parentId ? (
                <p className="text-xs text-neutral-500">Escolha a categoria-mãe para ver onde a subcategoria vai ficar.</p>
              ) : (
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-neutral-800">
                    <span aria-hidden="true">{group?.icon || '📁'}</span> {group?.name || 'Grupo'}
                  </div>
                  <div className="pl-4 flex items-center gap-1.5 font-semibold text-neutral-700">
                    <CornerDownRight className="w-3 h-3 text-neutral-300" aria-hidden="true" /> {parent?.name}
                  </div>
                  {siblings.map((s) => (
                    <div key={s.id} className="pl-9 flex items-center gap-1.5 text-neutral-500">
                      <CornerDownRight className="w-3 h-3 text-neutral-200" aria-hidden="true" /> {s.name}
                    </div>
                  ))}
                  <div className="pl-9 flex items-center gap-1.5 text-emerald-700 font-bold">
                    <CornerDownRight className="w-3 h-3 text-emerald-300" aria-hidden="true" />
                    {name.trim() || 'nova subcategoria'}
                  </div>
                  <p className="text-2xs text-neutral-500 pt-3 border-t border-neutral-100 mt-3">
                    Natureza herdada do grupo: <b>{group?.kind === 'income' ? 'receita (entra)' : 'despesa (sai)'}</b>.
                  </p>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
