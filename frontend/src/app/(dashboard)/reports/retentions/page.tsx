'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CalendarClock, FileText, Landmark, Percent, Settings2, Users } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useLoad } from '@/lib/use-load';
import { apiError, apiFetch } from '@/services/api';
import { formatDate } from '@/lib/format';
import { SideDrawer } from '@/components/shared/SideDrawer';
import {
  Badge, Button, IconButton, Card, CardHeader, CardBody, Field, Input, Select,
  Table, THead, TBody, Th, Tr, Td, TableMessage, Stat, Segmented,
  LoadingState, EmptyState, ErrorState, ExportMenu,
} from '@/components/ui';

/* ------------------------------------------------------------------ tipos */
/* Os nomes dos campos são os da API (app/services/retentions.py).          */

type Side = 'expense' | 'income';
type SideFilter = 'all' | Side;

interface RetentionType {
  codigo: string;
  label: string;
  taxa: number;
  imposto: string;
  categoria: string;
  base_legal: string;
  aplica_a: Side[];
  nota: string | null;
}

interface RetentionRow {
  id: string;
  data: string;
  documento: string | null;
  descricao: string | null;
  entity_id: string | null;
  entidade: string | null;
  tipo: Side;
  base: number;
  total: number;
  codigo: string | null;
  retencao_label: string | null;
  base_legal: string | null;
  taxa: number | null;
  retido: number;
  a_pagar: number;
}

interface ByRate {
  codigo: string | null;
  label: string | null;
  base_legal: string | null;
  taxa: number | null;
  base: number;
  retido: number;
  documentos: number;
}

interface SideBlock {
  total: number;
  documentos: number;
  por_taxa: ByRate[];
  linhas: RetentionRow[];
}

interface Position {
  periodo: { key: string; inicio: string; fim: string };
  retido_a_terceiros: SideBlock;
  retido_por_terceiros: SideBlock;
  entrega: { valor: number; ate: string; em_atraso: boolean; dias: number };
  base: { incidencia: string; prazo: string; nota_credito: string };
  mensagem: string;
}

interface PendingDelivery {
  periodo: string;
  valor: number;
  ate: string;
  em_atraso: boolean;
  documentos: number;
}

interface Pending {
  hoje: string;
  entregas: PendingDelivery[];
  total: number;
  em_atraso: number;
}

interface DocumentsResponse {
  periodo: string | null;
  tipo: Side | null;
  documentos: RetentionRow[];
  total_retido: number;
}

interface EntityYearRow {
  entity_id: string | null;
  entidade: string;
  nif: string | null;
  base: number;
  retido: number;
  documentos: number;
  codigos: string[];
}

interface ByEntity {
  ano: number;
  tipo: Side;
  total: number;
  entidades: EntityYearRow[];
  nota: string;
}

interface EntityOption {
  id: string;
  name: string;
  nif: string | null;
  papel: string;
  default_retention_code?: string | null;
}

interface DefaultSaved {
  entity_id: string;
  entidade: string;
  retention_code: string | null;
  label: string | null;
  taxa: number | null;
}

/* ------------------------------------------------------------------ helpers */

async function getOrThrow<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error((await apiError(res)) || 'Ocorreu um erro.');
  return (await res.json()) as T;
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return period;
  return new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
}

function rateText(taxa: number | null | undefined): string {
  return taxa === null || taxa === undefined ? '—' : `${String(taxa).replace('.', ',')}%`;
}

const SIDE_LABEL: Record<Side, string> = {
  expense: 'Retida por nós',
  income: 'Retida pelo cliente',
};

/* ------------------------------------------------------------------ página */

export default function RetentionsPage() {
  const { formatMoney, setPageHeader } = useApp();
  const thisYear = new Date().getFullYear();

  const [period, setPeriod] = useState<string>(currentMonth);
  const [docSide, setDocSide] = useState<SideFilter>('all');
  const [year, setYear] = useState<number>(thisYear);
  const [entitySide, setEntitySide] = useState<Side>('expense');
  const [drawer, setDrawer] = useState<{ entityId: string } | null>(null);

  useEffect(() => {
    setPageHeader('Retenções na Fonte', 'O que retivemos e temos de entregar ao Estado, e o que os clientes nos retiveram');
  }, [setPageHeader]);

  const validPeriod = /^\d{4}-\d{2}$/.test(period);

  const position = useLoad(
    () => getOrThrow<Position>(`/retentions/position?period=${encodeURIComponent(period)}`),
    [period],
    { enabled: validPeriod },
  );
  const pending = useLoad(() => getOrThrow<Pending>('/retentions/pending'), []);
  const documents = useLoad(
    () => {
      const qs = new URLSearchParams({ period });
      if (docSide !== 'all') qs.set('side', docSide);
      return getOrThrow<DocumentsResponse>(`/retentions/documents?${qs.toString()}`);
    },
    [period, docSide],
    { enabled: validPeriod },
  );
  const byEntity = useLoad(
    () => getOrThrow<ByEntity>(`/retentions/by-entity?year=${year}&side=${entitySide}`),
    [year, entitySide],
  );

  const years = useMemo(() => Array.from({ length: 6 }, (_, i) => thisYear - i), [thisYear]);

  const pos = position.data;
  const docs = documents.data?.documentos ?? [];

  return (
    <div className="space-y-4 animate-in fade-in duration-300">

      <Card className="p-3 flex flex-wrap items-end gap-3">
        <Field label="Mês" className="w-44">
          {(p) => (
            <Input
              {...p}
              type="month"
              value={period}
              max="2200-12"
              onChange={(e) => { if (e.target.value) setPeriod(e.target.value); }}
            />
          )}
        </Field>
        {pos && <p className="text-xs text-neutral-600 flex-1 min-w-[220px] pb-1.5">{pos.mensagem}</p>}
      </Card>

      {/* Posição do mês */}
      {!validPeriod ? (
        <Card><ErrorState message="Escolha um mês válido." /></Card>
      ) : position.loading && !pos ? (
        <Card><LoadingState /></Card>
      ) : position.error || !pos ? (
        <Card>
          <ErrorState
            message={errorText(position.error, 'Não foi possível carregar a posição do mês.')}
            action={<Button variant="secondary" size="sm" onClick={() => position.reload()}>Tentar novamente</Button>}
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Stat
              icon={<Landmark />}
              label="A entregar ao Estado"
              value={formatMoney(pos.entrega.valor)}
              tone={pos.entrega.em_atraso ? 'negative' : pos.entrega.valor > 0 ? 'warning' : 'neutral'}
              hint={
                pos.entrega.valor <= 0
                  ? 'Nada retido neste mês'
                  : pos.entrega.em_atraso
                    ? `Prazo terminou a ${formatDate(pos.entrega.ate)}`
                    : `Até ${formatDate(pos.entrega.ate)} (faltam ${pos.entrega.dias} dias)`
              }
            />
            <Stat
              icon={<CalendarClock />}
              label="Data-limite de entrega"
              value={formatDate(pos.entrega.ate)}
              hint={pos.base.prazo}
            />
            <Stat
              icon={<Percent />}
              label="Retido pelos clientes"
              value={formatMoney(pos.retido_por_terceiros.total)}
              tone={pos.retido_por_terceiros.total > 0 ? 'positive' : 'neutral'}
              hint="Crédito de imposto da empresa — não abate à entrega"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RateCard
              title="O que retivemos (a entregar)"
              subtitle={`${pos.retido_a_terceiros.documentos} documento(s) · ${monthLabel(pos.periodo.key)}`}
              rows={pos.retido_a_terceiros.por_taxa}
              total={pos.retido_a_terceiros.total}
              empty="Não retivemos nada a fornecedores neste mês."
              formatMoney={formatMoney}
            />
            <RateCard
              title="O que os clientes nos retiveram"
              subtitle={pos.base.nota_credito}
              rows={pos.retido_por_terceiros.por_taxa}
              total={pos.retido_por_terceiros.total}
              empty="Nenhum cliente reteve nada neste mês."
              formatMoney={formatMoney}
            />
          </div>
        </>
      )}

      {/* Meses com retenções por entregar */}
      <Card className="overflow-hidden">
        <CardHeader
          icon={<CalendarClock />}
          title="Entregas ao Estado (últimos 12 meses)"
          subtitle={pending.data ? `Total ${formatMoney(pending.data.total)} · fora de prazo ${formatMoney(pending.data.em_atraso)}` : 'Meses em que retivemos imposto'}
        />
        <Table>
          <THead>
            <tr>
              <Th>Mês</Th>
              <Th>Entregar até</Th>
              <Th numeric>Documentos</Th>
              <Th numeric>Valor</Th>
              <Th>Prazo</Th>
            </tr>
          </THead>
          <TBody>
            {pending.loading ? (
              <TableMessage colSpan={5}><LoadingState /></TableMessage>
            ) : pending.error || !pending.data ? (
              <TableMessage colSpan={5}>
                <ErrorState
                  message={errorText(pending.error, 'Não foi possível carregar as entregas.')}
                  action={<Button variant="secondary" size="sm" onClick={() => pending.reload()}>Tentar novamente</Button>}
                />
              </TableMessage>
            ) : pending.data.entregas.length === 0 ? (
              <TableMessage colSpan={5}>
                <EmptyState icon={<Landmark />} title="Sem retenções a entregar nos últimos 12 meses" />
              </TableMessage>
            ) : pending.data.entregas.map((row) => (
              <Tr key={row.periodo}>
                <Td className="font-semibold text-neutral-900 capitalize">{monthLabel(row.periodo)}</Td>
                <Td className="whitespace-nowrap">{formatDate(row.ate)}</Td>
                <Td numeric>{row.documentos}</Td>
                <Td numeric className="font-semibold">{formatMoney(row.valor)}</Td>
                <Td>{row.em_atraso ? <Badge tone="danger">Prazo passado</Badge> : <Badge tone="warning">A decorrer</Badge>}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>

      {/* Documentos com retenção */}
      <Card className="overflow-hidden">
        <CardHeader
          icon={<FileText />}
          title="Documentos com retenção"
          subtitle={documents.data ? `${docs.length} documento(s) · retido ${formatMoney(documents.data.total_retido)}` : monthLabel(period)}
          actions={
            <ExportMenu
              size="sm"
              disabled={docs.length === 0}
              build={() => ({
                title: 'Documentos com retenção na fonte',
                subtitle: `${monthLabel(period)}${docSide !== 'all' ? ` · ${SIDE_LABEL[docSide]}` : ''}`,
                columns: [
                  { key: 'data', label: 'Data', type: 'date' },
                  { key: 'documento', label: 'Documento' },
                  { key: 'entidade', label: 'Entidade' },
                  { key: 'lado', label: 'Tipo' },
                  { key: 'retencao', label: 'Retenção' },
                  { key: 'base', label: 'Base', type: 'money' },
                  { key: 'taxa', label: 'Taxa (%)', type: 'number' },
                  { key: 'retido', label: 'Retido', type: 'money' },
                  { key: 'a_pagar', label: 'Valor líquido', type: 'money' },
                ],
                rows: docs.map((d) => ({
                  data: d.data, documento: d.documento || d.descricao, entidade: d.entidade,
                  lado: SIDE_LABEL[d.tipo], retencao: d.retencao_label, base: d.base, taxa: d.taxa,
                  retido: d.retido, a_pagar: d.a_pagar,
                })),
                totals: { data: 'Total', retido: documents.data?.total_retido ?? 0 },
              })}
            />
          }
        />
        <div className="px-4 pt-3">
          <Segmented<SideFilter>
            aria-label="Filtrar documentos"
            value={docSide}
            onChange={setDocSide}
            options={[
              { value: 'all', label: 'Todos' },
              { value: 'expense', label: 'Retidas por nós' },
              { value: 'income', label: 'Retidas pelos clientes' },
            ]}
          />
        </div>
        <div className="pt-3">
          <Table>
            <THead>
              <tr>
                <Th>Data</Th>
                <Th>Documento</Th>
                <Th>Entidade</Th>
                <Th>Retenção</Th>
                <Th numeric>Base</Th>
                <Th numeric>Taxa</Th>
                <Th numeric>Retido</Th>
                <Th numeric>Líquido</Th>
              </tr>
            </THead>
            <TBody>
              {!validPeriod ? (
                <TableMessage colSpan={8}><EmptyState title="Escolha um mês" /></TableMessage>
              ) : documents.loading ? (
                <TableMessage colSpan={8}><LoadingState /></TableMessage>
              ) : documents.error || !documents.data ? (
                <TableMessage colSpan={8}>
                  <ErrorState
                    message={errorText(documents.error, 'Não foi possível carregar os documentos.')}
                    action={<Button variant="secondary" size="sm" onClick={() => documents.reload()}>Tentar novamente</Button>}
                  />
                </TableMessage>
              ) : docs.length === 0 ? (
                <TableMessage colSpan={8}>
                  <EmptyState icon={<FileText />} title="Nenhum documento com retenção neste mês" />
                </TableMessage>
              ) : docs.map((d) => (
                <Tr key={d.id}>
                  <Td className="whitespace-nowrap text-neutral-600">{formatDate(d.data)}</Td>
                  <Td>
                    <div className="font-medium text-neutral-900">{d.documento || '—'}</div>
                    {d.descricao && <div className="text-2xs text-neutral-500 truncate max-w-[220px]">{d.descricao}</div>}
                  </Td>
                  <Td>
                    <div>{d.entidade || '—'}</div>
                    <div className="text-2xs text-neutral-500">{SIDE_LABEL[d.tipo]}</div>
                  </Td>
                  <Td>
                    <div>{d.retencao_label || '—'}</div>
                    {d.base_legal && <div className="text-2xs text-neutral-500">{d.base_legal}</div>}
                  </Td>
                  <Td numeric>{formatMoney(d.base)}</Td>
                  <Td numeric>{rateText(d.taxa)}</Td>
                  <Td numeric className="font-semibold text-neutral-900">{formatMoney(d.retido)}</Td>
                  <Td numeric>{formatMoney(d.a_pagar)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
      </Card>

      {/* Por entidade, por ano */}
      <Card className="overflow-hidden">
        <CardHeader
          icon={<Users />}
          title="Por entidade (ano)"
          subtitle={byEntity.data?.nota ?? 'Base para a declaração anual de retenções'}
          actions={
            <ExportMenu
              size="sm"
              disabled={!byEntity.data || byEntity.data.entidades.length === 0}
              build={() => ({
                title: `Retenções por entidade — ${year}`,
                subtitle: entitySide === 'expense' ? 'Retidas por nós a fornecedores' : 'Retidas pelos clientes',
                columns: [
                  { key: 'entidade', label: 'Entidade' },
                  { key: 'nif', label: 'NIF' },
                  { key: 'documentos', label: 'Documentos', type: 'number' },
                  { key: 'codigos', label: 'Tipos' },
                  { key: 'base', label: 'Base', type: 'money' },
                  { key: 'retido', label: 'Retido', type: 'money' },
                ],
                rows: (byEntity.data?.entidades ?? []).map((e) => ({
                  entidade: e.entidade, nif: e.nif, documentos: e.documentos,
                  codigos: e.codigos.join(', '), base: e.base, retido: e.retido,
                })),
                totals: { entidade: 'Total', retido: byEntity.data?.total ?? 0 },
              })}
            />
          }
        />
        <div className="px-4 pt-3 flex flex-wrap items-center gap-2">
          <Select
            aria-label="Ano"
            value={String(year)}
            onChange={(e) => setYear(Number(e.target.value))}
            className="w-28"
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
          <Segmented<Side>
            aria-label="Sentido"
            value={entitySide}
            onChange={setEntitySide}
            options={[
              { value: 'expense', label: 'Fornecedores' },
              { value: 'income', label: 'Clientes' },
            ]}
          />
          <Button
            variant="secondary"
            size="sm"
            icon={<Settings2 />}
            className="sm:ml-auto"
            onClick={() => setDrawer({ entityId: '' })}
          >
            Retenção por omissão
          </Button>
        </div>
        <div className="pt-3">
          <Table>
            <THead>
              <tr>
                <Th>Entidade</Th>
                <Th>NIF</Th>
                <Th numeric>Docs.</Th>
                <Th numeric>Base</Th>
                <Th numeric>Retido</Th>
                <Th align="right"><span className="sr-only">Acções</span></Th>
              </tr>
            </THead>
            <TBody>
              {byEntity.loading ? (
                <TableMessage colSpan={6}><LoadingState /></TableMessage>
              ) : byEntity.error || !byEntity.data ? (
                <TableMessage colSpan={6}>
                  <ErrorState
                    message={errorText(byEntity.error, 'Não foi possível carregar as retenções por entidade.')}
                    action={<Button variant="secondary" size="sm" onClick={() => byEntity.reload()}>Tentar novamente</Button>}
                  />
                </TableMessage>
              ) : byEntity.data.entidades.length === 0 ? (
                <TableMessage colSpan={6}>
                  <EmptyState icon={<Users />} title={`Sem retenções em ${year}`} />
                </TableMessage>
              ) : byEntity.data.entidades.map((e) => (
                <Tr key={e.entity_id || e.entidade}>
                  <Td className="font-semibold text-neutral-900">{e.entidade}</Td>
                  <Td className="font-mono text-neutral-600">{e.nif || '—'}</Td>
                  <Td numeric>{e.documentos}</Td>
                  <Td numeric>{formatMoney(e.base)}</Td>
                  <Td numeric className="font-semibold text-neutral-900">{formatMoney(e.retido)}</Td>
                  <Td align="right">
                    {e.entity_id && (
                      <IconButton
                        label={`Definir retenção por omissão de ${e.entidade}`}
                        onClick={() => setDrawer({ entityId: e.entity_id ?? '' })}
                      >
                        <Settings2 />
                      </IconButton>
                    )}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
      </Card>

      {drawer && (
        <DefaultRetentionDrawer
          initialEntityId={drawer.entityId}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ por taxa */

function RateCard({ title, subtitle, rows, total, empty, formatMoney }: {
  title: string;
  subtitle: string;
  rows: ByRate[];
  total: number;
  empty: string;
  formatMoney: (amount: number) => string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<Percent />} title={title} subtitle={subtitle} />
      <Table>
        <THead>
          <tr>
            <Th>Retenção</Th>
            <Th numeric>Taxa</Th>
            <Th numeric>Base</Th>
            <Th numeric>Retido</Th>
          </tr>
        </THead>
        <TBody>
          {rows.length === 0 ? (
            <TableMessage colSpan={4}><EmptyState title={empty} /></TableMessage>
          ) : (
            <>
              {rows.map((r) => (
                <Tr key={`${r.codigo ?? 'sem'}-${r.taxa ?? ''}`}>
                  <Td>
                    <div className="font-medium text-neutral-900">{r.label || r.codigo || '—'}</div>
                    {r.base_legal && <div className="text-2xs text-neutral-500">{r.base_legal}</div>}
                  </Td>
                  <Td numeric>{rateText(r.taxa)}</Td>
                  <Td numeric>{formatMoney(r.base)}</Td>
                  <Td numeric className="font-semibold">{formatMoney(r.retido)}</Td>
                </Tr>
              ))}
              <Tr>
                <Td className="font-semibold">Total</Td>
                <Td numeric />
                <Td numeric />
                <Td numeric className="font-semibold text-neutral-900">{formatMoney(total)}</Td>
              </Tr>
            </>
          )}
        </TBody>
      </Table>
    </Card>
  );
}

/* ------------------------------------------------------------------ retenção por omissão */

const DEFAULT_FORM_ID = 'retention-default-form';

function DefaultRetentionDrawer({ initialEntityId, onClose }: { initialEntityId: string; onClose: () => void }) {
  const [entityId, setEntityId] = useState(initialEntityId);
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);

  const entities = useLoad(() => getOrThrow<EntityOption[]>('/entities/'), []);
  const types = useLoad(
    () => getOrThrow<{ tipos: RetentionType[]; nota: string }>('/retentions/types'),
    [],
  );

  // Ao abrir já com uma entidade escolhida, parte do tipo que ela tem.
  const [seeded, setSeeded] = useState(false);
  if (!seeded && entities.data) {
    setSeeded(true);
    setCode(entities.data.find((en) => en.id === initialEntityId)?.default_retention_code ?? '');
  }

  const chosenType = types.data?.tipos.find((t) => t.codigo === code) ?? null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entityId) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/retentions/entities/${encodeURIComponent(entityId)}/default`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retention_code: code || null }),
      });
      if (!res.ok) {
        toast.error((await apiError(res)) || 'Não foi possível guardar.');
        return;
      }
      const saved = (await res.json()) as DefaultSaved;
      toast.success(
        saved.retention_code
          ? `${saved.entidade}: passa a ser proposta "${saved.label ?? saved.retention_code}".`
          : `${saved.entidade}: deixa de ter retenção por omissão.`,
      );
      onClose();
    } catch {
      toast.error('Não foi possível contactar o servidor.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SideDrawer
      title="Retenção por omissão"
      subtitle="Proposta automaticamente nos próximos documentos desta entidade"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form={DEFAULT_FORM_ID} loading={saving} disabled={!entityId}>Guardar</Button>
        </>
      }
    >
      {entities.loading || types.loading ? (
        <LoadingState />
      ) : entities.error || types.error || !entities.data || !types.data ? (
        <ErrorState
          message={errorText(entities.error || types.error, 'Não foi possível carregar as entidades ou os tipos de retenção.')}
          action={
            <Button variant="secondary" size="sm" onClick={() => { entities.reload(); types.reload(); }}>
              Tentar novamente
            </Button>
          }
        />
      ) : (
        <form id={DEFAULT_FORM_ID} onSubmit={handleSubmit} className="space-y-3">
          <Field label="Entidade" required>
            {(p) => (
              <Select
                {...p}
                required
                value={entityId}
                onChange={(e) => {
                  // Mostra o tipo que a entidade já tem, em vez de partir de "Nenhuma".
                  setEntityId(e.target.value);
                  setCode(entities.data?.find((en) => en.id === e.target.value)?.default_retention_code ?? '');
                }}
              >
                <option value="">Escolha uma entidade…</option>
                {entities.data?.map((en) => (
                  <option key={en.id} value={en.id}>
                    {en.name}{en.nif ? ` (${en.nif})` : ''}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label="Tipo de retenção"
            hint={chosenType?.base_legal ?? 'Deixe "Nenhuma" para retirar a retenção por omissão.'}
          >
            {(p) => (
              <Select {...p} value={code} onChange={(e) => setCode(e.target.value)}>
                <option value="">Nenhuma</option>
                {types.data?.tipos.map((t) => (
                  <option key={t.codigo} value={t.codigo}>{t.label}</option>
                ))}
              </Select>
            )}
          </Field>
          {chosenType?.nota && <p className="text-xs text-neutral-500">{chosenType.nota}</p>}
          <CardBody className="p-3 bg-neutral-50 rounded-md text-xs text-neutral-600">
            {types.data.nota}
          </CardBody>
        </form>
      )}
    </SideDrawer>
  );
}
