'use client';

import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Category, CategoryGroup } from '@/types';
import { fetchCategoryGroups } from '@/services/data';
import { apiPost } from '@/services/api';
import { SideDrawer } from './SideDrawer';
import { Button, Field, Input, Segmented, Select, Textarea } from '@/components/ui';

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
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [groupId, setGroupId] = useState('');

  useEffect(() => {
    let active = true;
    fetchCategoryGroups().then((g) => {
      if (!active) return;
      setGroups(g);
      // Default to the first group matching the selected nature.
      const match = g.find((x) => x.kind === type);
      if (match) setGroupId((cur) => cur || match.id);
    });
    return () => { active = false; };
  }, [type]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);

    const keywordList = keywords ? keywords.split(',').map(k => k.trim()).filter(Boolean) : [];

    const created = await apiPost<Category>('/categories/', {
      group_id: groupId || undefined,
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
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form={FORM_ID} loading={submitting}>
            Criar Categoria
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-3">
        {groups.length ? (
          <Field label="Grupo" hint="O grupo define a natureza (entra/sai) da categoria.">
            {(p) => (
              <Select
                {...p}
                value={groupId}
                onChange={(e) => {
                  const g = groups.find((x) => x.id === e.target.value);
                  setGroupId(e.target.value);
                  if (g) setType(g.kind);
                }}
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.icon ? `${g.icon} ` : ''}{g.name} ({g.kind === 'income' ? 'entra' : 'sai'})
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : (
          <div role="group" aria-labelledby="category-type-label" className="space-y-1.5">
            <span id="category-type-label" className="block text-xs font-medium text-neutral-700">Natureza</span>
            <Segmented<'expense' | 'income'>
              aria-label="Natureza"
              value={type}
              onChange={setType}
              options={[
                { value: 'expense', label: 'Despesa (- €)' },
                { value: 'income', label: 'Receita (+ €)' },
              ]}
            />
            <p className="text-xs text-neutral-500">O grupo define a natureza (entra/sai) da categoria.</p>
          </div>
        )}

        <Field label="Nome da Categoria" required>
          {(p) => (
            <Input
              {...p}
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Licenças de Software, Viagens..."
            />
          )}
        </Field>

        <Field label="Descrição">
          {(p) => (
            <Textarea
              {...p}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva o propósito desta categoria..."
              className="resize-none"
            />
          )}
        </Field>

        <Field
          label={
            <span className="inline-flex items-center gap-1">
              <Sparkles className="size-3.5 text-emerald-600" aria-hidden="true" />
              Palavras-Chave IA (separadas por vírgula)
            </span>
          }
          hint="A IA usará estas palavras para classificar faturas automaticamente."
        >
          {(p) => (
            <Input
              {...p}
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="ex: microsoft, slack, figma, adobe"
              className="font-mono text-xs"
            />
          )}
        </Field>
      </form>
    </SideDrawer>
  );
};
