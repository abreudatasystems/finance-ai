'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { BellRing, Clock, Copy, FileText, Mail, Users, X } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useLoad } from '@/lib/use-load';
import { apiError, apiFetch, apiPostOrError } from '@/services/api';
import { formatDate } from '@/lib/format';
import {
  Badge, Button, IconButton, Card, CardHeader, CardBody, Field, Input, Textarea,
  Table, THead, TBody, Th, Tr, Td, TableMessage, Stat, Segmented,
  LoadingState, EmptyState, ErrorState, ExportMenu, cn,
} from '@/components/ui';
import type { StatTone } from '@/components/ui';

/* ------------------------------------------------------------------ tipos */
/* Os nomes dos campos são os da API (app/services/collections.py).         */

type Kind = 'income' | 'expense';

interface BucketTotal {
  label: string;
  total: number;
  documentos: number;
}

interface AgingBucket extends BucketTotal {
  chave: string;
}

interface AgingEntity {
  chave: string;
  entity_id: string | null;
  entidade: string;
  total: number;
  vencido: number;
  documentos: number;
  mais_antigo: number;
  atraso_medio: number;
  pontualidade: number | null;
  historico: number;
  buckets: Record<string, BucketTotal>;
}

interface AgingDocument {
  id: string;
  descricao: string | null;
  documento: string | null;
  entity_id: string | null;
  entidade: string | null;
  data: string | null;
  vencimento: string | null;
  em_falta: number;
  dias_vencido: number;
  escalao: string;
  previsao: string;
}

interface Aging {
  hoje: string;
  tipo: Kind;
  total: number;
  vencido: number;
  peso_vencido: number;
  escaloes: AgingBucket[];
  entidades: AgingEntity[];
  documentos: AgingDocument[];
}

interface Overview {
  hoje: string;
  a_receber: Aging;
  a_pagar: Aging;
  sem_dados: boolean;
  mensagem: string;
}

interface BehaviourRow {
  chave: string;
  entity_id: string | null;
  entity_name: string | null;
  documentos: number;
  pior_atraso: number;
  a_horas: number;
  atraso_medio: number;
  pontualidade: number;
  fiavel: boolean;
}

interface Behaviour {
  tipo: Kind;
  entidades: BehaviourRow[];
}

interface ReminderDraft {
  assunto: string;
  corpo: string;
  destinatario: string;
  total: number;
  documentos: number;
  contacto: { email?: string | null; telefone?: string | null; nif?: string | null };
}

/* ------------------------------------------------------------------ helpers */

/** GET que falha a sério: um erro não pode passar por "nada em dívida". */
async function getOrThrow<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error((await apiError(res)) || 'Ocorreu um erro.');
  return (await res.json()) as T;
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** A mesma chave com que o servidor agrupa por entidade (collections.key_for). */
function docKey(d: AgingDocument): string {
  return d.entity_id || (d.entidade || '').trim().toLowerCase() || 'sem-entidade';
}

const BUCKET_TONE: Record<string, StatTone> = {
  a_vencer: 'neutral',
  d1_30: 'warning',
  d31_60: 'warning',
  d61_90: 'negative',
  d90_mais: 'negative',
};

function lateBadge(days: number) {
  if (days <= 0) return <Badge tone="neutral">A vencer</Badge>;
  if (days <= 30) return <Badge tone="warning">{days} dias</Badge>;
  return <Badge tone="danger">{days} dias</Badge>;
}

/* ------------------------------------------------------------------ página */

export default function CollectionsPage() {
  const { formatMoney, setPageHeader } = useApp();
  const [kind, setKind] = useState<Kind>('income');
  const [entityKey, setEntityKey] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [preparing, setPreparing] = useState(false);
  const [draft, setDraft] = useState<ReminderDraft | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    setPageHeader('Cobranças', 'Quem deve, há quanto tempo, e quanto costuma demorar a pagar');
  }, [setPageHeader]);

  const overview = useLoad(() => getOrThrow<Overview>('/collections/'), []);
  const behaviour = useLoad(() => getOrThrow<Behaviour>(`/collections/behaviour?kind=${kind}`), [kind]);

  const aging: Aging | undefined = overview.data
    ? (kind === 'income' ? overview.data.a_receber : overview.data.a_pagar)
    : undefined;

  const changeKind = (next: Kind) => {
    setKind(next);
    setEntityKey(null);
    setPicked(new Set());
    setDraft(null);
  };

  const selectedEntity = useMemo(
    () => aging?.entidades.find((e) => e.chave === entityKey) ?? null,
    [aging, entityKey],
  );
  const entityDocs = useMemo(
    () => (aging && entityKey ? aging.documentos.filter((d) => docKey(d) === entityKey) : []),
    [aging, entityKey],
  );

  const openEntity = (key: string) => {
    setEntityKey(key);
    setPicked(new Set());
    setDraft(null);
  };

  const togglePick = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allPicked = entityDocs.length > 0 && entityDocs.every((d) => picked.has(d.id));
  const toggleAll = () => {
    setPicked(allPicked ? new Set() : new Set(entityDocs.map((d) => d.id)));
  };

  const prepareReminder = async () => {
    if (!selectedEntity || picked.size === 0) return;
    setPreparing(true);
    const { data, error } = await apiPostOrError<ReminderDraft>('/collections/reminder', {
      entity_id: selectedEntity.entity_id,
      entity_name: selectedEntity.entidade,
      transaction_ids: Array.from(picked),
    });
    setPreparing(false);
    if (!data) {
      toast.error(error || 'Não foi possível preparar o lembrete.');
      return;
    }
    setDraft(data);
    setSubject(data.assunto);
    setBody(data.corpo);
  };

  const copyDraft = async () => {
    try {
      await navigator.clipboard.writeText(`Assunto: ${subject}\n\n${body}`);
      toast.success('Texto copiado. Cole-o no seu programa de email.');
    } catch {
      toast.error('Não foi possível copiar. Seleccione o texto e copie à mão.');
    }
  };

  const email = draft?.contacto?.email || null;
  const mailto = email
    ? `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    : null;

  const sideLabel = kind === 'income' ? 'a receber' : 'a pagar';
  const who = kind === 'income' ? 'Cliente' : 'Fornecedor';

  /* -------------------------------------------------------------- render */

  if (overview.loading && !overview.data) {
    return <Card><LoadingState /></Card>;
  }
  if (overview.error || !overview.data || !aging) {
    return (
      <Card>
        <ErrorState
          message={errorText(overview.error, 'Não foi possível carregar as cobranças.')}
          action={<Button variant="secondary" size="sm" onClick={() => overview.reload()}>Tentar novamente</Button>}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-300">

      <Card className="p-3 flex flex-wrap items-center gap-3">
        <Segmented<Kind>
          aria-label="Sentido"
          value={kind}
          onChange={changeKind}
          options={[
            { value: 'income', label: 'A receber' },
            { value: 'expense', label: 'A pagar' },
          ]}
        />
        <p className="text-xs text-neutral-600 flex-1 min-w-[220px]">{overview.data.mensagem}</p>
      </Card>

      {/* Totais e antiguidade */}
      <div className="grid grid-cols-2 gap-3">
        <Stat label={`Total ${sideLabel}`} value={formatMoney(aging.total)} hint={`${aging.documentos.length} documento(s) em aberto`} />
        <Stat
          label="Já vencido"
          value={formatMoney(aging.vencido)}
          tone={aging.vencido > 0 ? 'negative' : 'neutral'}
          hint={`${aging.peso_vencido}% do total em aberto`}
        />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {aging.escaloes.map((b) => (
          <Stat
            key={b.chave}
            label={b.label}
            value={formatMoney(b.total)}
            tone={b.total > 0 ? BUCKET_TONE[b.chave] ?? 'neutral' : 'neutral'}
            hint={`${b.documentos} documento(s)`}
          />
        ))}
      </div>

      {/* Por entidade */}
      <Card className="overflow-hidden">
        <CardHeader
          icon={<Users />}
          title={kind === 'income' ? 'Quem nos deve' : 'A quem devemos'}
          subtitle="Clique numa linha para ver os documentos"
          actions={
            <ExportMenu
              size="sm"
              disabled={aging.entidades.length === 0}
              build={() => ({
                title: kind === 'income' ? 'Cobranças — a receber por cliente' : 'Pagamentos — a pagar por fornecedor',
                subtitle: `Situação em ${formatDate(aging.hoje)}`,
                columns: [
                  { key: 'entidade', label: who },
                  { key: 'total', label: 'Em aberto', type: 'money' },
                  { key: 'vencido', label: 'Vencido', type: 'money' },
                  { key: 'documentos', label: 'Documentos', type: 'number' },
                  { key: 'mais_antigo', label: 'Mais antigo (dias)', type: 'number' },
                  { key: 'atraso_medio', label: 'Atraso médio (dias)', type: 'number' },
                ],
                rows: aging.entidades.map((e) => ({
                  entidade: e.entidade, total: e.total, vencido: e.vencido, documentos: e.documentos,
                  mais_antigo: e.mais_antigo, atraso_medio: e.atraso_medio,
                })),
                totals: { entidade: 'Total', total: aging.total, vencido: aging.vencido },
              })}
            />
          }
        />
        <Table>
          <THead>
            <tr>
              <Th>{who}</Th>
              <Th numeric>Em aberto</Th>
              <Th numeric>Vencido</Th>
              <Th numeric>Docs.</Th>
              <Th numeric>Mais antigo</Th>
              <Th numeric>Atraso médio</Th>
            </tr>
          </THead>
          <TBody>
            {aging.entidades.length === 0 ? (
              <TableMessage colSpan={6}>
                <EmptyState
                  icon={<BellRing />}
                  title={overview.data.sem_dados ? 'Ainda não há documentos registados' : `Nada ${sideLabel} em aberto`}
                  description={overview.data.sem_dados ? 'Registe a primeira fatura para começar.' : undefined}
                />
              </TableMessage>
            ) : aging.entidades.map((e) => (
              <Tr
                key={e.chave}
                onClick={() => openEntity(e.chave)}
                onKeyDown={(ev) => { if (ev.key === 'Enter' && ev.target === ev.currentTarget) openEntity(e.chave); }}
                tabIndex={0}
                aria-label={`Ver documentos de ${e.entidade}`}
                className={cn('focus-visible:outline-none focus-visible:bg-neutral-50', entityKey === e.chave && 'bg-emerald-50/60')}
              >
                <Td className="font-semibold text-neutral-900">{e.entidade}</Td>
                <Td numeric>{formatMoney(e.total)}</Td>
                <Td numeric className={e.vencido > 0 ? 'text-rose-600 font-semibold' : 'text-neutral-400'}>
                  {formatMoney(e.vencido)}
                </Td>
                <Td numeric>{e.documentos}</Td>
                <Td numeric>{e.mais_antigo > 0 ? `${e.mais_antigo} dias` : '—'}</Td>
                <Td numeric className="text-neutral-600">
                  {e.historico > 0 ? `${e.atraso_medio} dias` : 'Sem histórico'}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>

      {/* Documentos da entidade escolhida + lembrete */}
      {selectedEntity && (
        <Card className="overflow-hidden">
          <CardHeader
            icon={<FileText />}
            title={`Documentos em aberto — ${selectedEntity.entidade}`}
            subtitle={kind === 'income' ? 'Escolha os documentos a incluir no lembrete' : `${entityDocs.length} documento(s)`}
            actions={
              <>
                {kind === 'income' && (
                  <Button
                    size="sm"
                    icon={<Mail />}
                    disabled={picked.size === 0}
                    loading={preparing}
                    onClick={prepareReminder}
                  >
                    Preparar lembrete
                  </Button>
                )}
                <IconButton label="Fechar" onClick={() => { setEntityKey(null); setDraft(null); }}>
                  <X />
                </IconButton>
              </>
            }
          />
          <Table>
            <THead>
              <tr>
                {kind === 'income' && (
                  <Th className="w-8">
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todos"
                      checked={allPicked}
                      onChange={toggleAll}
                      className="size-4 rounded border-neutral-300 accent-emerald-600 cursor-pointer"
                    />
                  </Th>
                )}
                <Th>Documento</Th>
                <Th>Data</Th>
                <Th>Vencimento</Th>
                <Th>Atraso</Th>
                <Th>Previsão</Th>
                <Th numeric>Em falta</Th>
              </tr>
            </THead>
            <TBody>
              {entityDocs.length === 0 ? (
                <TableMessage colSpan={kind === 'income' ? 7 : 6}>
                  <EmptyState title="Sem documentos em aberto" />
                </TableMessage>
              ) : entityDocs.map((d) => (
                <Tr key={d.id}>
                  {kind === 'income' && (
                    <Td>
                      <input
                        type="checkbox"
                        aria-label={`Incluir ${d.documento || d.descricao || 'documento'}`}
                        checked={picked.has(d.id)}
                        onChange={() => togglePick(d.id)}
                        className="size-4 rounded border-neutral-300 accent-emerald-600 cursor-pointer"
                      />
                    </Td>
                  )}
                  <Td>
                    <div className="font-medium text-neutral-900">{d.documento || '—'}</div>
                    {d.descricao && <div className="text-2xs text-neutral-500 truncate max-w-[260px]">{d.descricao}</div>}
                  </Td>
                  <Td className="whitespace-nowrap text-neutral-600">{formatDate(d.data)}</Td>
                  <Td className="whitespace-nowrap text-neutral-600">{formatDate(d.vencimento)}</Td>
                  <Td>{lateBadge(d.dias_vencido)}</Td>
                  <Td className="whitespace-nowrap text-neutral-600" title="Vencimento mais o atraso habitual desta entidade">
                    {formatDate(d.previsao)}
                  </Td>
                  <Td numeric className="font-semibold text-neutral-900">{formatMoney(d.em_falta)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      {draft && (
        <Card>
          <CardHeader
            icon={<Mail />}
            title={`Rascunho de lembrete para ${draft.destinatario}`}
            subtitle={`${draft.documentos} documento(s) · ${formatMoney(draft.total)} em falta`}
            actions={
              <IconButton label="Fechar rascunho" onClick={() => setDraft(null)}>
                <X />
              </IconButton>
            }
          />
          <CardBody className="space-y-3">
            <p className="text-xs text-neutral-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Isto é só um rascunho: nada é enviado por esta aplicação. Reveja o texto, copie-o ou abra-o no seu
              programa de email, e envie-o você quando estiver de acordo.
            </p>
            <Field label="Assunto">
              {(p) => <Input {...p} value={subject} onChange={(e) => setSubject(e.target.value)} />}
            </Field>
            <Field label="Mensagem">
              {(p) => (
                <Textarea
                  {...p}
                  rows={12}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="font-mono text-xs"
                />
              )}
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" icon={<Copy />} onClick={copyDraft}>
                Copiar texto
              </Button>
              {mailto ? (
                <a
                  href={mailto}
                  className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md text-13 font-medium bg-neutral-900 text-white border border-neutral-900 shadow-xs hover:bg-neutral-800 [&_svg]:size-4"
                >
                  <Mail aria-hidden="true" />
                  Abrir no programa de email
                </a>
              ) : (
                <span className="text-xs text-neutral-500">
                  Esta entidade não tem email registado — copie o texto e envie-o pelo meio habitual.
                </span>
              )}
              {email && <span className="text-xs text-neutral-500">Para: {email}</span>}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Comportamento de pagamento */}
      <Card className="overflow-hidden">
        <CardHeader
          icon={<Clock />}
          title="Comportamento de pagamento"
          subtitle="Atraso médio ponderado pelo valor, a partir dos documentos já liquidados"
          actions={
            <ExportMenu
              size="sm"
              disabled={!behaviour.data || behaviour.data.entidades.length === 0}
              build={() => ({
                title: kind === 'income' ? 'Comportamento de pagamento dos clientes' : 'Os nossos prazos de pagamento a fornecedores',
                columns: [
                  { key: 'entidade', label: who },
                  { key: 'documentos', label: 'Documentos liquidados', type: 'number' },
                  { key: 'atraso_medio', label: 'Atraso médio (dias)', type: 'number' },
                  { key: 'pior_atraso', label: 'Pior atraso (dias)', type: 'number' },
                  { key: 'pontualidade', label: 'Pontualidade (%)', type: 'number' },
                ],
                rows: (behaviour.data?.entidades ?? []).map((r) => ({
                  entidade: r.entity_name || 'Sem entidade',
                  documentos: r.documentos,
                  atraso_medio: r.atraso_medio,
                  pior_atraso: r.pior_atraso,
                  pontualidade: r.pontualidade,
                })),
              })}
            />
          }
        />
        <Table>
          <THead>
            <tr>
              <Th>{who}</Th>
              <Th numeric>Liquidados</Th>
              <Th numeric>Atraso médio</Th>
              <Th numeric>Pior atraso</Th>
              <Th numeric>Pontualidade</Th>
              <Th>Fiável</Th>
            </tr>
          </THead>
          <TBody>
            {behaviour.loading ? (
              <TableMessage colSpan={6}><LoadingState /></TableMessage>
            ) : behaviour.error || !behaviour.data ? (
              <TableMessage colSpan={6}>
                <ErrorState
                  message={errorText(behaviour.error, 'Não foi possível carregar o histórico de pagamentos.')}
                  action={<Button variant="secondary" size="sm" onClick={() => behaviour.reload()}>Tentar novamente</Button>}
                />
              </TableMessage>
            ) : behaviour.data.entidades.length === 0 ? (
              <TableMessage colSpan={6}>
                <EmptyState
                  icon={<Clock />}
                  title="Ainda não há histórico de pagamentos"
                  description="O atraso médio aparece quando houver documentos totalmente liquidados."
                />
              </TableMessage>
            ) : behaviour.data.entidades.map((r) => (
              <Tr key={r.chave}>
                <Td className="font-semibold text-neutral-900">{r.entity_name || 'Sem entidade'}</Td>
                <Td numeric>{r.documentos}</Td>
                <Td numeric className={r.atraso_medio > 30 ? 'text-rose-600 font-semibold' : r.atraso_medio > 0 ? 'text-amber-600' : 'text-emerald-700'}>
                  {r.atraso_medio} dias
                </Td>
                <Td numeric>{r.pior_atraso} dias</Td>
                <Td numeric>{r.pontualidade}%</Td>
                <Td>
                  {r.fiavel
                    ? <Badge tone="success">Sim</Badge>
                    : <Badge tone="neutral" title="Menos de 2 documentos liquidados">Pouco histórico</Badge>}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>

    </div>
  );
}
