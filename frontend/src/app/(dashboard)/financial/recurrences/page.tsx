'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CalendarClock, Pause, Pencil, Play, Plus, Repeat, SkipForward, Trash2, Zap } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useLoad } from '@/lib/use-load';
import { apiDeleteOrError, apiError, apiFetch, apiPatchOrError, apiPostOrError } from '@/services/api';
import { fetchCategories } from '@/services/data';
import { formatDate } from '@/lib/format';
import { SideDrawer } from '@/components/shared/SideDrawer';
import type { Category } from '@/types';
import {
  Badge, Button, IconButton, Card, CardHeader, Field, Input, Select, Textarea,
  Table, THead, TBody, Th, Tr, Td, TableMessage, Segmented,
  LoadingState, EmptyState, ErrorState, useConfirm, ExportMenu,
} from '@/components/ui';

/* ------------------------------------------------------------------ tipos */
/* Os nomes dos campos são os da API (app/services/recurrences.py).         */

type Kind = 'expense' | 'income';
type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

interface Recurrence {
  id: string;
  company_id: string;
  name: string;
  type: Kind;
  description: string;
  entity_id: string | null;
  entity_name: string | null;
  category_id: string | null;
  category_name: string | null;
  amount: number;
  vat_rate: number | null;
  payment_method: string | null;
  notes: string | null;
  frequency: Frequency;
  frequency_label: string;
  interval: number;
  day_of_month: number | null;
  start_date: string;
  end_date: string | null;
  lead_days: number;
  active: boolean;
  last_generated_period: string | null;
  occurrences_created: number;
  proximo_vencimento: string | null;
  gerados: number;
}

interface Upcoming {
  recurrence_id: string;
  name: string;
  type: Kind;
  period: string;
  due_date: string;
  amount: number;
  entity_name: string | null;
  category_name: string | null;
}

interface RunResult {
  status: string;
  gerados: number;
  detalhe: { recurrence_id: string; name: string; lancamentos: unknown[] }[];
  message: string;
}

interface RemoveResult {
  status: 'paused' | 'deleted';
  recurrence_id: string;
  message?: string;
}

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'yearly', label: 'Anual' },
];

const NO_RULES: Recurrence[] = [];
const NO_UPCOMING: Upcoming[] = [];

/* ------------------------------------------------------------------ helpers */

async function getOrThrow<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error((await apiError(res)) || 'Ocorreu um erro.');
  return (await res.json()) as T;
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function localDay(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function frequencyText(r: Recurrence): string {
  if ((r.interval || 1) <= 1) return r.frequency_label;
  const unit: Record<Frequency, string> = { weekly: 'semanas', monthly: 'meses', quarterly: 'trimestres', yearly: 'anos' };
  return `A cada ${r.interval} ${unit[r.frequency] ?? ''}`.trim();
}

function kindBadge(kind: Kind) {
  return kind === 'income'
    ? <Badge tone="success">Receita</Badge>
    : <Badge tone="neutral">Despesa</Badge>;
}

/* ------------------------------------------------------------------ página */

export default function RecurrencesPage() {
  const { formatMoney, setPageHeader } = useApp();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Recurrence | 'new' | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setPageHeader('Recorrências', 'Rendas, avenças, salários e subscrições que se repetem — lançados sem os escrever de novo');
  }, [setPageHeader]);

  const rules = useLoad(() => getOrThrow<Recurrence[]>('/recurrences/'), []);
  const upcoming = useLoad(() => getOrThrow<Upcoming[]>('/recurrences/upcoming?days=60'), []);

  const list = rules.data ?? NO_RULES;
  const next = upcoming.data ?? NO_UPCOMING;

  const refreshAll = () => {
    rules.refresh();
    upcoming.refresh();
  };

  const replaceRule = (rec: Recurrence) => {
    rules.setData((prev) => (prev ?? []).map((r) => (r.id === rec.id ? rec : r)));
  };

  const handleSaved = (rec: Recurrence, created: boolean) => {
    if (created) rules.setData((prev) => [...(prev ?? []), rec]);
    else replaceRule(rec);
    upcoming.refresh();
  };

  const toggleActive = async (r: Recurrence) => {
    setBusyId(r.id);
    const { data, error } = await apiPatchOrError<Recurrence>(`/recurrences/${encodeURIComponent(r.id)}`, { active: !r.active });
    setBusyId(null);
    if (!data) {
      toast.error(error || 'Não foi possível alterar o estado.');
      return;
    }
    replaceRule(data);
    upcoming.refresh();
    toast.success(data.active ? `"${data.name}" retomada.` : `"${data.name}" pausada.`);
  };

  const handleDelete = async (r: Recurrence) => {
    const ok = await confirm({
      title: 'Apagar esta recorrência?',
      description: r.occurrences_created > 0
        ? `"${r.name}" já gerou lançamentos: será pausada em vez de apagada, e os lançamentos ficam como estão.`
        : `"${r.name}" deixa de existir. Os lançamentos já feitos não são tocados.`,
      confirmLabel: 'Apagar',
      danger: true,
    });
    if (!ok) return;
    setBusyId(r.id);
    const { data, error } = await apiDeleteOrError<RemoveResult>(`/recurrences/${encodeURIComponent(r.id)}`);
    setBusyId(null);
    if (!data) {
      toast.error(error || 'Não foi possível apagar.');
      return;
    }
    if (data.status === 'deleted') {
      rules.setData((prev) => (prev ?? []).filter((x) => x.id !== r.id));
      toast.success(`"${r.name}" apagada.`);
    } else {
      rules.setData((prev) => (prev ?? []).map((x) => (x.id === r.id ? { ...x, active: false } : x)));
      toast.success(data.message || `"${r.name}" foi pausada.`);
    }
    upcoming.refresh();
  };

  const handleSkip = async (u: Upcoming) => {
    const ok = await confirm({
      title: 'Saltar esta ocorrência?',
      description: `"${u.name}" de ${formatDate(u.due_date)} (${formatMoney(u.amount)}) não será lançada. As seguintes continuam normalmente.`,
      confirmLabel: 'Saltar',
    });
    if (!ok) return;
    const key = `${u.recurrence_id}:${u.period}`;
    setBusyId(key);
    const { data, error } = await apiPostOrError<{ status: string; period: string }>(
      `/recurrences/${encodeURIComponent(u.recurrence_id)}/skip`,
      { period: u.period },
    );
    setBusyId(null);
    if (!data) {
      toast.error(error || 'Não foi possível saltar esta ocorrência.');
      return;
    }
    toast.success(`Ocorrência de ${formatDate(u.due_date)} saltada.`);
    refreshAll();
  };

  const runDue = async () => {
    const ok = await confirm({
      title: 'Lançar o que está em atraso?',
      description: 'Cria os lançamentos de todas as recorrências activas cuja data já chegou e que ainda não foram lançados. Ficam por pagar/receber; nada é dado como pago.',
      confirmLabel: 'Lançar',
    });
    if (!ok) return;
    setRunning(true);
    const { data, error } = await apiPostOrError<RunResult>('/recurrences/run', {});
    setRunning(false);
    if (!data) {
      toast.error(error || 'Não foi possível lançar as recorrências.');
      return;
    }
    if (data.gerados > 0) toast.success(data.message);
    else toast.info(data.message);
    refreshAll();
  };

  const activeCount = useMemo(() => list.filter((r) => r.active).length, [list]);

  return (
    <div className="space-y-4 animate-in fade-in duration-300">

      <Card className="p-3 flex flex-wrap items-center gap-2">
        <p className="text-xs text-neutral-600 flex-1 min-w-[200px]">
          {rules.data ? `${activeCount} activa(s) de ${list.length} regra(s).` : 'Regras que geram lançamentos periódicos.'}
        </p>
        <ExportMenu
          disabled={list.length === 0}
          build={() => ({
            title: 'Recorrências',
            columns: [
              { key: 'name', label: 'Nome' },
              { key: 'type', label: 'Tipo' },
              { key: 'entity', label: 'Entidade' },
              { key: 'category', label: 'Categoria' },
              { key: 'frequency', label: 'Frequência' },
              { key: 'amount', label: 'Valor', type: 'money' },
              { key: 'next', label: 'Próximo vencimento', type: 'date' },
              { key: 'state', label: 'Estado' },
            ],
            rows: list.map((r) => ({
              name: r.name,
              type: r.type === 'income' ? 'Receita' : 'Despesa',
              entity: r.entity_name,
              category: r.category_name,
              frequency: frequencyText(r),
              amount: r.amount,
              next: r.active ? r.proximo_vencimento : null,
              state: r.active ? 'Activa' : 'Pausada',
            })),
          })}
        />
        <Button variant="secondary" icon={<Zap />} loading={running} onClick={runDue} disabled={activeCount === 0}>
          Lançar o que está em atraso
        </Button>
        <Button icon={<Plus className="text-emerald-400" />} onClick={() => setEditing('new')}>
          Nova recorrência
        </Button>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <THead>
            <tr>
              <Th>Nome</Th>
              <Th>Tipo</Th>
              <Th>Frequência</Th>
              <Th numeric>Valor</Th>
              <Th>Próximo vencimento</Th>
              <Th>Estado</Th>
              <Th align="right"><span className="sr-only">Acções</span></Th>
            </tr>
          </THead>
          <TBody>
            {rules.loading && !rules.data ? (
              <TableMessage colSpan={7}><LoadingState /></TableMessage>
            ) : rules.error || !rules.data ? (
              <TableMessage colSpan={7}>
                <ErrorState
                  message={errorText(rules.error, 'Não foi possível carregar as recorrências.')}
                  action={<Button variant="secondary" size="sm" onClick={() => rules.reload()}>Tentar novamente</Button>}
                />
              </TableMessage>
            ) : list.length === 0 ? (
              <TableMessage colSpan={7}>
                <EmptyState
                  icon={<Repeat />}
                  title="Ainda não há recorrências"
                  description="Crie uma regra para a renda, uma avença ou uma subscrição e deixe de as lançar à mão todos os meses."
                  action={<Button size="sm" icon={<Plus />} onClick={() => setEditing('new')}>Nova recorrência</Button>}
                />
              </TableMessage>
            ) : list.map((r) => (
              <Tr key={r.id} className={r.active ? undefined : 'opacity-60'}>
                <Td>
                  <div className="font-semibold text-neutral-900">{r.name}</div>
                  <div className="text-2xs text-neutral-500 truncate max-w-[240px]">
                    {[r.entity_name, r.category_name].filter(Boolean).join(' · ') || r.description}
                  </div>
                </Td>
                <Td>{kindBadge(r.type)}</Td>
                <Td className="whitespace-nowrap">
                  {frequencyText(r)}
                  {r.day_of_month && r.frequency !== 'weekly' ? <span className="text-neutral-500"> · dia {r.day_of_month}</span> : null}
                </Td>
                <Td numeric className="font-semibold text-neutral-900">{formatMoney(r.amount)}</Td>
                <Td className="whitespace-nowrap text-neutral-600">
                  {r.active ? formatDate(r.proximo_vencimento) : '—'}
                </Td>
                <Td>{r.active ? <Badge tone="success">Activa</Badge> : <Badge tone="neutral">Pausada</Badge>}</Td>
                <Td align="right">
                  <div className="inline-flex items-center gap-0.5">
                    <IconButton label={`Editar ${r.name}`} onClick={() => setEditing(r)} disabled={busyId === r.id}>
                      <Pencil />
                    </IconButton>
                    <IconButton
                      label={r.active ? `Pausar ${r.name}` : `Retomar ${r.name}`}
                      onClick={() => toggleActive(r)}
                      disabled={busyId === r.id}
                    >
                      {r.active ? <Pause /> : <Play />}
                    </IconButton>
                    <IconButton
                      label={`Apagar ${r.name}`}
                      variant="danger"
                      onClick={() => handleDelete(r)}
                      disabled={busyId === r.id}
                    >
                      <Trash2 />
                    </IconButton>
                  </div>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          icon={<CalendarClock />}
          title="Próximos 60 dias"
          subtitle="O que vai vencer e ainda não foi lançado"
          actions={
            <ExportMenu
              size="sm"
              disabled={next.length === 0}
              build={() => ({
                title: 'Recorrências — próximos 60 dias',
                columns: [
                  { key: 'due', label: 'Vencimento', type: 'date' },
                  { key: 'name', label: 'Nome' },
                  { key: 'type', label: 'Tipo' },
                  { key: 'entity', label: 'Entidade' },
                  { key: 'amount', label: 'Valor', type: 'money' },
                ],
                rows: next.map((u) => ({
                  due: u.due_date, name: u.name, type: u.type === 'income' ? 'Receita' : 'Despesa',
                  entity: u.entity_name, amount: u.amount,
                })),
              })}
            />
          }
        />
        <Table>
          <THead>
            <tr>
              <Th>Vencimento</Th>
              <Th>Nome</Th>
              <Th>Tipo</Th>
              <Th numeric>Valor</Th>
              <Th align="right"><span className="sr-only">Acções</span></Th>
            </tr>
          </THead>
          <TBody>
            {upcoming.loading && !upcoming.data ? (
              <TableMessage colSpan={5}><LoadingState /></TableMessage>
            ) : upcoming.error || !upcoming.data ? (
              <TableMessage colSpan={5}>
                <ErrorState
                  message={errorText(upcoming.error, 'Não foi possível carregar o que aí vem.')}
                  action={<Button variant="secondary" size="sm" onClick={() => upcoming.reload()}>Tentar novamente</Button>}
                />
              </TableMessage>
            ) : next.length === 0 ? (
              <TableMessage colSpan={5}>
                <EmptyState icon={<CalendarClock />} title="Nada a vencer nos próximos 60 dias" />
              </TableMessage>
            ) : next.map((u) => {
              const key = `${u.recurrence_id}:${u.period}`;
              return (
                <Tr key={key}>
                  <Td className="whitespace-nowrap text-neutral-700">{formatDate(u.due_date)}</Td>
                  <Td>
                    <div className="font-medium text-neutral-900">{u.name}</div>
                    {(u.entity_name || u.category_name) && (
                      <div className="text-2xs text-neutral-500">{[u.entity_name, u.category_name].filter(Boolean).join(' · ')}</div>
                    )}
                  </Td>
                  <Td>{kindBadge(u.type)}</Td>
                  <Td numeric className="font-semibold text-neutral-900">{formatMoney(u.amount)}</Td>
                  <Td align="right">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<SkipForward />}
                      loading={busyId === key}
                      onClick={() => handleSkip(u)}
                    >
                      Saltar
                    </Button>
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </Card>

      {editing && (
        <RecurrenceDrawer
          rule={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ formulário */

const FORM_ID = 'recurrence-form';

function RecurrenceDrawer({ rule, onClose, onSaved }: {
  rule: Recurrence | null;
  onClose: () => void;
  onSaved: (rec: Recurrence, created: boolean) => void;
}) {
  const isNew = rule === null;
  const [name, setName] = useState(rule?.name ?? '');
  const [kind, setKind] = useState<Kind>(rule?.type ?? 'expense');
  const [description, setDescription] = useState(rule?.description ?? '');
  const [entityName, setEntityName] = useState(rule?.entity_name ?? '');
  const [categoryId, setCategoryId] = useState(rule?.category_id ?? '');
  const [amount, setAmount] = useState(rule ? String(rule.amount).replace('.', ',') : '');
  const [vatRate, setVatRate] = useState(rule?.vat_rate !== null && rule?.vat_rate !== undefined ? String(rule.vat_rate) : '');
  const [frequency, setFrequency] = useState<Frequency>(rule?.frequency ?? 'monthly');
  const [repeatEvery, setRepeatEvery] = useState(String(rule?.interval ?? 1));
  const [dayOfMonth, setDayOfMonth] = useState(rule?.day_of_month ? String(rule.day_of_month) : '');
  const [startDate, setStartDate] = useState(rule?.start_date?.slice(0, 10) ?? localDay());
  const [endDate, setEndDate] = useState(rule?.end_date?.slice(0, 10) ?? '');
  const [leadDays, setLeadDays] = useState(String(rule?.lead_days ?? 0));
  const [notes, setNotes] = useState(rule?.notes ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const categories = useLoad(fetchCategories, [], { initialData: [] as Category[] });
  const options = useMemo(
    () => categories.data
      .filter((c) => c.type === kind && (c.active || c.id === categoryId))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt')),
    [categories.data, kind, categoryId],
  );

  const changeKind = (next: Kind) => {
    setKind(next);
    // A categoria de despesa não serve para uma receita.
    if (categoryId && !categories.data.some((c) => c.id === categoryId && c.type === next)) setCategoryId('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const value = Number(amount.replace(/\s/g, '').replace(',', '.'));
    if (!name.trim()) { setFormError('Indique um nome.'); return; }
    if (!description.trim()) { setFormError('Indique a descrição dos lançamentos.'); return; }
    if (!Number.isFinite(value) || value <= 0) { setFormError('O valor tem de ser um número positivo.'); return; }
    if (!startDate) { setFormError('Indique a data de início.'); return; }
    if (endDate && endDate < startDate) { setFormError('A data de fim não pode ser anterior à de início.'); return; }

    const category = categories.data.find((c) => c.id === categoryId);
    const payload = {
      name: name.trim(),
      description: description.trim(),
      entity_name: entityName.trim() || null,
      category_id: category ? category.id : null,
      category_name: category ? category.name : null,
      amount: value,
      vat_rate: vatRate === '' ? null : Number(vatRate),
      notes: notes.trim() || null,
      frequency,
      interval: Math.max(1, Number(repeatEvery) || 1),
      day_of_month: frequency === 'weekly' || dayOfMonth === '' ? null : Number(dayOfMonth),
      start_date: startDate,
      end_date: endDate || null,
      lead_days: Math.max(0, Number(leadDays) || 0),
    };

    setSaving(true);
    const result = rule
      ? await apiPatchOrError<Recurrence>(`/recurrences/${encodeURIComponent(rule.id)}`, payload)
      : await apiPostOrError<Recurrence>('/recurrences/', { ...payload, type: kind });
    setSaving(false);

    if (!result.data) {
      setFormError(result.error || 'Não foi possível guardar.');
      return;
    }
    toast.success(isNew ? `"${result.data.name}" criada.` : `"${result.data.name}" guardada.`);
    onSaved(result.data, isNew);
    onClose();
  };

  return (
    <SideDrawer
      title={rule ? `Editar "${rule.name}"` : 'Nova recorrência'}
      subtitle="Um lançamento que se repete — renda, avença, salário, subscrição"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form={FORM_ID} loading={saving}>{isNew ? 'Criar' : 'Guardar'}</Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-3">
        <Field label="Tipo" hint={isNew ? undefined : 'O tipo não se altera depois de criada.'}>
          {() => (
            <div>
              {isNew ? (
                <Segmented<Kind>
                  aria-label="Tipo"
                  value={kind}
                  onChange={changeKind}
                  options={[
                    { value: 'expense', label: 'Despesa' },
                    { value: 'income', label: 'Receita' },
                  ]}
                />
              ) : kindBadge(kind)}
            </div>
          )}
        </Field>

        <Field label="Nome" required>
          {(p) => <Input {...p} required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Renda do escritório" />}
        </Field>

        <Field label="Descrição dos lançamentos" required>
          {(p) => <Input {...p} required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Renda mensal — Rua X" />}
        </Field>

        <Field label={kind === 'income' ? 'Cliente' : 'Fornecedor'}>
          {(p) => <Input {...p} value={entityName} onChange={(e) => setEntityName(e.target.value)} placeholder="Opcional" />}
        </Field>

        <Field
          label="Categoria"
          hint={categories.loading ? 'A carregar categorias…' : options.length === 0 ? 'Sem categorias deste tipo.' : undefined}
        >
          {(p) => (
            <Select {...p} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={categories.loading}>
              <option value="">Por classificar</option>
              {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor (com IVA)" required>
            {(p) => (
              <Input
                {...p}
                required
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
              />
            )}
          </Field>
          <Field label="Taxa de IVA">
            {(p) => (
              <Select {...p} value={vatRate} onChange={(e) => setVatRate(e.target.value)}>
                <option value="">Sem IVA</option>
                <option value="0">0%</option>
                <option value="6">6%</option>
                <option value="13">13%</option>
                <option value="23">23%</option>
              </Select>
            )}
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Frequência">
            {(p) => (
              <Select {...p} value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
                {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Repetir a cada" hint="1 = todos os períodos">
            {(p) => <Input {...p} type="number" min={1} max={120} value={repeatEvery} onChange={(e) => setRepeatEvery(e.target.value)} />}
          </Field>
        </div>

        {frequency !== 'weekly' && (
          <Field label="Dia do mês" hint="Vazio = o dia da data de início. Dia 31 em meses curtos passa para o último dia.">
            {(p) => <Input {...p} type="number" min={1} max={31} value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} placeholder="Ex.: 8" />}
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Data de início" required>
            {(p) => <Input {...p} type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />}
          </Field>
          <Field label="Data de fim" hint="Opcional">
            {(p) => <Input {...p} type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} />}
          </Field>
        </div>

        <Field label="Lançar com antecedência (dias)" hint="Cria o lançamento uns dias antes do vencimento, para aparecer a tempo na previsão.">
          {(p) => <Input {...p} type="number" min={0} max={365} value={leadDays} onChange={(e) => setLeadDays(e.target.value)} />}
        </Field>

        <Field label="Notas">
          {(p) => <Textarea {...p} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="resize-none" />}
        </Field>

        {formError && (
          <p role="alert" className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">{formError}</p>
        )}
      </form>
    </SideDrawer>
  );
}
