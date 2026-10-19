'use client';

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Archive, ArchiveRestore, FolderKanban, Pencil, Plus, Receipt, Search, Trash2,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useLoad } from '@/lib/use-load';
import { formatDate } from '@/lib/format';
import { apiDeleteOrError, apiGet, apiPatchOrError, apiPostOrError } from '@/services/api';
import { SideDrawer } from '@/components/shared/SideDrawer';
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorState, ExportMenu, Field, IconButton, Input,
  LoadingState, Segmented, Select, Stat, Table, TBody, Td, Textarea, Th, THead, TableMessage, Tr, cn, useConfirm,
} from '@/components/ui';

/* ------------------------------------------------------------------ tipos */
/* Espelham backend/app/services/cost_centers.py (serialize, profitability, */
/* statement, remove).                                                      */

interface Projeto {
  id: string;
  codigo: string | null;
  nome: string;
  descricao: string | null;
  orcamento: number | null;
  valor_contratado: number | null;
  entity_id: string | null;
  cliente: string | null;
  inicio: string | null;
  fim: string | null;
  estado: string; // 'open' | 'closed'
  ativo: boolean;
}

interface LinhaRentabilidade {
  id: string | null;
  codigo: string | null;
  projeto: string;
  cliente: string | null;
  orcamento: number | null;
  valor_contratado: number | null;
  estado: string | null;
  por_criar: boolean;
  sem_projeto: boolean;
  documentos: number;
  rendimentos: number;
  gastos: number;
  margem: number;
  margem_pct: number | null;
  orcamento_usado_pct: number | null;
  acima_do_orcamento: boolean;
}

interface Rentabilidade {
  inicio: string;
  fim: string;
  projetos: LinhaRentabilidade[];
  totais: {
    rendimentos: number;
    gastos: number;
    margem: number;
    margem_pct: number | null;
    documentos: number;
  };
  nao_atribuido: {
    rendimentos: number;
    gastos: number;
    documentos: number;
    peso_pct: number | null;
  };
  base: string;
  mensagem: string;
}

interface Movimento {
  id: string;
  data: string | null;
  tipo: string;
  descricao: string | null;
  entidade: string | null;
  categoria: string | null;
  documento: string | null;
  valor: number;
  estado: string | null;
}

interface Extrato {
  projeto: Projeto;
  movimentos: Movimento[];
  rendimentos: number;
  gastos: number;
  margem: number;
  margem_pct: number | null;
  orcamento_usado_pct: number | null;
  acima_do_orcamento: boolean;
  base: string;
}

interface ResultadoApagar {
  status: string; // 'success' | 'closed'
  id?: string;
  deleted_id?: string;
  documentos?: number;
  detalhe?: string;
}

/** Uma linha da tabela: o projeto (se existir) e os números do período. */
interface Linha {
  chave: string;
  projeto: Projeto | null;
  nome: string;
  codigo: string | null;
  cliente: string | null;
  orcamento: number | null;
  estado: string | null;
  ativo: boolean;
  porCriar: boolean;
  rendimentos: number;
  gastos: number;
  margem: number;
  margem_pct: number | null;
  orcamento_usado_pct: number | null;
  acima: boolean;
  documentos: number;
}

type Filtro = 'abertos' | 'todos';
type Janela = 'ano' | 'sempre';

/* --------------------------------------------------------------- utilitários */

function formatPct(pct: number | null): string {
  if (pct === null) return '—';
  return `${pct.toFixed(1).replace('.', ',')}%`;
}

function estadoPagamento(estado: string | null): string {
  if (!estado) return '—';
  const mapa: Record<string, string> = {
    pending: 'Pendente',
    paid: 'Pago',
    received: 'Recebido',
    partial: 'Parcial',
    overdue: 'Vencido',
  };
  return Object.prototype.hasOwnProperty.call(mapa, estado) ? mapa[estado] : estado;
}

function lerValorOpcional(texto: string): number | null | 'invalido' {
  let s = texto.replace(/[\s€]/g, '');
  if (s === '') return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return 'invalido';
  return Math.round(n * 100) / 100;
}

function valorParaCampo(valor: number | null): string {
  return valor === null || valor === undefined ? '' : String(valor).replace('.', ',');
}

function mensagemErro(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/* ------------------------------------------------------------------ página */

export default function ProjectsPage() {
  const { formatMoney, setPageHeader } = useApp();
  const confirm = useConfirm();
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState<number>(anoAtual);
  const [filtro, setFiltro] = useState<Filtro>('abertos');
  const [query, setQuery] = useState('');
  const [formulario, setFormulario] = useState<{ projeto: Projeto | null } | null>(null);
  const [extratoDe, setExtratoDe] = useState<Projeto | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  useEffect(() => {
    setPageHeader('Projetos', 'Centros de custo: quanto cada trabalho gastou, faturou e deixou de margem (valores sem IVA)');
  }, [setPageHeader]);

  const lista = useLoad(async () => {
    const data = await apiGet<Projeto[]>('/projects/');
    if (!data) throw new Error('Não foi possível carregar os projetos.');
    return data;
  }, []);

  const inicio = `${ano}-01-01`;
  const fim = `${ano + 1}-01-01`;
  const rentab = useLoad(async () => {
    const data = await apiGet<Rentabilidade>(`/projects/profitability?start=${inicio}&end=${fim}`);
    if (!data) throw new Error('Não foi possível calcular a rentabilidade.');
    return data;
  }, [inicio, fim]);

  const recarregar = async () => {
    await Promise.all([lista.refresh(), rentab.refresh()]);
  };

  /* ------------------------------------------------------- juntar os dados */

  const projetos = lista.data ?? [];
  const porId = new Map<string, LinhaRentabilidade>();
  const extras: LinhaRentabilidade[] = [];
  for (const r of rentab.data?.projetos ?? []) {
    if (r.id && projetos.some((p) => p.id === r.id)) porId.set(r.id, r);
    else if (r.por_criar) extras.push(r);
  }

  const linhas: Linha[] = [
    ...projetos.map((p): Linha => {
      const r = porId.get(p.id);
      return {
        chave: p.id,
        projeto: p,
        nome: p.nome,
        codigo: p.codigo,
        cliente: p.cliente,
        orcamento: p.orcamento,
        estado: p.estado,
        ativo: p.ativo,
        porCriar: false,
        rendimentos: r?.rendimentos ?? 0,
        gastos: r?.gastos ?? 0,
        margem: r?.margem ?? 0,
        margem_pct: r?.margem_pct ?? null,
        orcamento_usado_pct: r?.orcamento_usado_pct ?? (p.orcamento && p.orcamento > 0 ? 0 : null),
        acima: r?.acima_do_orcamento ?? false,
        documentos: r?.documentos ?? 0,
      };
    }),
    ...extras.map((r): Linha => ({
      chave: `nome:${r.projeto}`,
      projeto: null,
      nome: r.projeto,
      codigo: null,
      cliente: null,
      orcamento: null,
      estado: null,
      ativo: true,
      porCriar: true,
      rendimentos: r.rendimentos,
      gastos: r.gastos,
      margem: r.margem,
      margem_pct: r.margem_pct,
      orcamento_usado_pct: null,
      acima: false,
      documentos: r.documentos,
    })),
  ];

  const q = query.trim().toLowerCase();
  const visiveis = linhas.filter((l) => {
    if (filtro === 'abertos' && l.projeto && (l.estado === 'closed' || !l.ativo)) return false;
    if (!q) return true;
    return [l.nome, l.codigo, l.cliente].some((v) => String(v ?? '').toLowerCase().includes(q));
  });

  /* ---------------------------------------------------------------- ações */

  const alternarEstado = async (p: Projeto) => {
    const fechar = p.estado !== 'closed';
    if (fechar) {
      const ok = await confirm({
        title: 'Arquivar este projeto?',
        description: `${p.nome} fica fechado e deixa de ser sugerido nos lançamentos. Pode reabri-lo quando quiser.`,
        confirmLabel: 'Arquivar',
      });
      if (!ok) return;
    }
    setOcupado(p.id);
    const { error } = await apiPatchOrError<Projeto>(
      `/projects/${encodeURIComponent(p.id)}`,
      fechar ? { status: 'closed' } : { status: 'open', active: true },
    );
    setOcupado(null);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(fechar ? 'Projeto arquivado.' : 'Projeto reaberto.');
    await recarregar();
  };

  const apagar = async (p: Projeto) => {
    const ok = await confirm({
      title: 'Eliminar este projeto?',
      description: `${p.nome} é eliminado. Se já tiver documentos associados, é fechado em vez de eliminado, para não perder o histórico.`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    setOcupado(p.id);
    const { data, error } = await apiDeleteOrError<ResultadoApagar>(`/projects/${encodeURIComponent(p.id)}`);
    setOcupado(null);
    if (error || !data) {
      toast.error(error || 'Não foi possível eliminar o projeto.');
      return;
    }
    if (data.status === 'closed') toast.info(data.detalhe || 'O projeto tinha documentos e foi fechado em vez de eliminado.');
    else toast.success('Projeto eliminado.');
    await recarregar();
  };

  /* --------------------------------------------------------------- render */

  const carregando = (lista.loading && !lista.data) || (rentab.loading && !rentab.data);
  const erro = lista.error || rentab.error;
  const totais = rentab.data?.totais;
  const naoAtribuido = rentab.data?.nao_atribuido;
  const colunas = 9;

  const anos = [anoAtual - 4, anoAtual - 3, anoAtual - 2, anoAtual - 1, anoAtual, anoAtual + 1];

  return (
    <div className="space-y-4 animate-in fade-in duration-300">

      <Card className="p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-neutral-400 pointer-events-none" aria-hidden="true" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Procurar por nome, código ou cliente"
            aria-label="Procurar projetos"
            className="pl-8"
          />
        </div>
        <Segmented<Filtro>
          aria-label="Mostrar"
          value={filtro}
          onChange={setFiltro}
          options={[
            { value: 'abertos', label: 'Abertos' },
            { value: 'todos', label: 'Todos' },
          ]}
        />
        <Select
          aria-label="Ano da rentabilidade"
          value={String(ano)}
          onChange={(e) => setAno(Number(e.target.value))}
          className="w-24"
        >
          {anos.map((a) => <option key={a} value={a}>{a}</option>)}
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <ExportMenu
            disabled={visiveis.length === 0}
            build={() => ({
              title: 'Rentabilidade por projeto',
              subtitle: `${ano} · valores sem IVA${q ? ` · pesquisa "${query.trim()}"` : ''}`,
              columns: [
                { key: 'codigo', label: 'Código' },
                { key: 'nome', label: 'Projeto' },
                { key: 'cliente', label: 'Cliente' },
                { key: 'estado', label: 'Estado' },
                { key: 'orcamento', label: 'Orçamento', type: 'money' },
                { key: 'gastos', label: 'Gasto', type: 'money' },
                { key: 'rendimentos', label: 'Receita', type: 'money' },
                { key: 'margem', label: 'Margem', type: 'money' },
                { key: 'margem_pct', label: 'Margem %', type: 'percent' },
                { key: 'usado', label: 'Orçamento usado', type: 'percent' },
              ],
              rows: visiveis.map((l) => ({
                codigo: l.codigo,
                nome: l.nome,
                cliente: l.cliente,
                estado: l.porCriar ? 'Não criado' : l.estado === 'closed' ? 'Fechado' : 'Aberto',
                orcamento: l.orcamento,
                gastos: l.gastos,
                rendimentos: l.rendimentos,
                margem: l.margem,
                margem_pct: l.margem_pct,
                usado: l.orcamento_usado_pct,
              })),
              totals: {
                nome: 'Total',
                gastos: visiveis.reduce((a, l) => a + l.gastos, 0),
                rendimentos: visiveis.reduce((a, l) => a + l.rendimentos, 0),
                margem: visiveis.reduce((a, l) => a + l.margem, 0),
              },
            })}
          />
          <Button onClick={() => setFormulario({ projeto: null })} icon={<Plus className="text-emerald-400" />}>
            Novo projeto
          </Button>
        </div>
      </Card>

      {totais && naoAtribuido && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label={`Receita ${ano}`} value={formatMoney(totais.rendimentos)} tone="positive" hint={`${totais.documentos} documento(s)`} />
          <Stat label={`Gasto ${ano}`} value={formatMoney(totais.gastos)} tone="negative" />
          <Stat
            label="Margem"
            value={formatMoney(totais.margem)}
            tone={totais.margem >= 0 ? 'positive' : 'negative'}
            hint={totais.margem_pct !== null ? `${formatPct(totais.margem_pct)} da receita` : undefined}
          />
          <Stat
            label="Sem projeto"
            value={`${naoAtribuido.documentos} doc.`}
            tone={naoAtribuido.documentos > 0 ? 'warning' : 'neutral'}
            hint={naoAtribuido.peso_pct !== null ? `${formatPct(naoAtribuido.peso_pct)} do movimento fica de fora` : 'Tudo atribuído'}
          />
        </div>
      )}

      {rentab.data?.mensagem && (
        <Card className="px-4 py-3 text-xs text-neutral-700">
          {rentab.data.mensagem}
          <span className="block text-2xs text-neutral-500 mt-0.5">{rentab.data.base}</span>
        </Card>
      )}

      <Card className="overflow-hidden">
        <Table>
          <THead>
            <tr>
              <Th>Projeto</Th>
              <Th className="hidden md:table-cell">Estado</Th>
              <Th numeric className="hidden md:table-cell">Orçamento</Th>
              <Th numeric>Gasto</Th>
              <Th numeric className="hidden sm:table-cell">Receita</Th>
              <Th numeric>Margem</Th>
              <Th className="hidden lg:table-cell">Orçamento usado</Th>
              <Th numeric className="hidden md:table-cell">Docs</Th>
              <Th align="right"><span className="sr-only">Ações</span></Th>
            </tr>
          </THead>
          <TBody className="font-medium">
            {carregando ? (
              <TableMessage colSpan={colunas}><LoadingState label="A carregar os projetos…" /></TableMessage>
            ) : erro ? (
              <TableMessage colSpan={colunas}>
                <ErrorState
                  message={mensagemErro(erro, 'Não foi possível carregar os projetos.')}
                  action={<Button variant="secondary" onClick={() => { lista.reload(); rentab.reload(); }}>Tentar novamente</Button>}
                />
              </TableMessage>
            ) : linhas.length === 0 ? (
              <TableMessage colSpan={colunas}>
                <EmptyState
                  icon={<FolderKanban />}
                  title="Ainda não há projetos"
                  description="Crie um projeto (obra, cliente, imóvel…) e indique-o nos lançamentos para saber quanto cada trabalho rende."
                  action={<Button onClick={() => setFormulario({ projeto: null })} icon={<Plus />}>Novo projeto</Button>}
                />
              </TableMessage>
            ) : visiveis.length === 0 ? (
              <TableMessage colSpan={colunas}>
                <EmptyState icon={<Search />} title="Nenhum projeto corresponde ao filtro" />
              </TableMessage>
            ) : visiveis.map((l) => {
              const p = l.projeto;
              const fechado = l.estado === 'closed' || !l.ativo;
              const abrir = p ? () => setExtratoDe(p) : undefined;
              return (
                <Tr
                  key={l.chave}
                  onClick={abrir}
                  onKeyDown={abrir ? (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) abrir(); } : undefined}
                  tabIndex={abrir ? 0 : undefined}
                  role={abrir ? 'link' : undefined}
                  aria-label={abrir ? `Ver extrato de ${l.nome}` : undefined}
                  className={cn('focus-visible:outline-none focus-visible:bg-neutral-50', l.acima && 'bg-rose-50/50 hover:bg-rose-50')}
                >
                  <Td className="text-neutral-900">
                    <div className="flex items-center gap-2.5">
                      <div className="size-7 rounded-md bg-neutral-100 text-neutral-600 flex items-center justify-center shrink-0">
                        <FolderKanban className="size-3.5" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {l.codigo && <span className="font-mono text-2xs text-neutral-500">{l.codigo}</span>}
                          <span className={cn('font-semibold', fechado && 'text-neutral-500')}>{l.nome}</span>
                          {l.acima && <Badge tone="danger">Acima do orçamento</Badge>}
                        </div>
                        {l.cliente && <div className="text-2xs text-neutral-500 truncate">{l.cliente}</div>}
                      </div>
                    </div>
                  </Td>
                  <Td className="hidden md:table-cell">
                    {l.porCriar ? (
                      <Badge tone="warning" title="Nome usado nos documentos, mas o projeto ainda não foi criado">Não criado</Badge>
                    ) : fechado ? (
                      <Badge>Fechado</Badge>
                    ) : (
                      <Badge tone="success">Aberto</Badge>
                    )}
                  </Td>
                  <Td numeric className="hidden md:table-cell text-neutral-600">
                    {l.orcamento !== null ? formatMoney(l.orcamento) : '—'}
                  </Td>
                  <Td numeric className={l.acima ? 'text-rose-600 font-semibold' : 'text-neutral-900'}>
                    {formatMoney(l.gastos)}
                  </Td>
                  <Td numeric className="hidden sm:table-cell text-neutral-900">{formatMoney(l.rendimentos)}</Td>
                  <Td numeric className={cn('font-semibold', l.margem < 0 ? 'text-rose-600' : 'text-emerald-700')}>
                    {formatMoney(l.margem)}
                    {l.margem_pct !== null && (
                      <div className="text-2xs font-normal text-neutral-500">{formatPct(l.margem_pct)}</div>
                    )}
                  </Td>
                  <Td className="hidden lg:table-cell">
                    <BarraUso pct={l.orcamento_usado_pct} acima={l.acima} />
                  </Td>
                  <Td numeric className="hidden md:table-cell text-neutral-600">{l.documentos}</Td>
                  <Td align="right">
                    {p && (
                      <div className="flex items-center justify-end gap-0.5">
                        <IconButton
                          label={`Editar ${p.nome}`}
                          onClick={(e) => { e.stopPropagation(); setFormulario({ projeto: p }); }}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <Pencil />
                        </IconButton>
                        <IconButton
                          label={p.estado === 'closed' ? `Reabrir ${p.nome}` : `Arquivar ${p.nome}`}
                          disabled={ocupado === p.id}
                          onClick={(e) => { e.stopPropagation(); alternarEstado(p); }}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          {p.estado === 'closed' ? <ArchiveRestore /> : <Archive />}
                        </IconButton>
                        <IconButton
                          label={`Eliminar ${p.nome}`}
                          variant="danger"
                          disabled={ocupado === p.id}
                          onClick={(e) => { e.stopPropagation(); apagar(p); }}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <Trash2 />
                        </IconButton>
                      </div>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </Card>

      {formulario && (
        <ProjetoDrawer
          projeto={formulario.projeto}
          onClose={() => setFormulario(null)}
          onSaved={async () => {
            setFormulario(null);
            await recarregar();
          }}
        />
      )}

      {extratoDe && (
        <ExtratoDrawer
          projeto={extratoDe}
          ano={ano}
          formatMoney={formatMoney}
          onClose={() => setExtratoDe(null)}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------- barra de utilização */

function BarraUso({ pct, acima }: { pct: number | null; acima: boolean }) {
  if (pct === null) return <span className="text-2xs text-neutral-400">Sem orçamento</span>;
  const cor = acima ? 'bg-rose-500' : pct >= 90 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div
        className="h-1.5 flex-1 rounded-full bg-neutral-100 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(pct, 100))}
        aria-label={`${Math.round(pct)}% do orçamento usado`}
      >
        <div className={cn('h-full rounded-full', cor)} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={cn('text-2xs tabular-nums w-12 text-right', acima ? 'text-rose-600 font-semibold' : 'text-neutral-500')}>
        {formatPct(pct)}
      </span>
    </div>
  );
}

/* ------------------------------------------------------ formulário (drawer) */

const FORM_ID = 'projeto-form';

function ProjetoDrawer({
  projeto, onClose, onSaved,
}: {
  projeto: Projeto | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const editar = projeto !== null;
  const [nome, setNome] = useState(projeto?.nome ?? '');
  const [codigo, setCodigo] = useState(projeto?.codigo ?? '');
  const [descricao, setDescricao] = useState(projeto?.descricao ?? '');
  const [orcamento, setOrcamento] = useState(valorParaCampo(projeto?.orcamento ?? null));
  const [contratado, setContratado] = useState(valorParaCampo(projeto?.valor_contratado ?? null));
  const [cliente, setCliente] = useState(projeto?.cliente ?? '');
  const [inicio, setInicio] = useState(projeto?.inicio ?? '');
  const [fim, setFim] = useState(projeto?.fim ?? '');
  const [estado, setEstado] = useState<'open' | 'closed'>(projeto?.estado === 'closed' ? 'closed' : 'open');
  const [aGravar, setAGravar] = useState(false);
  const [erroNome, setErroNome] = useState<string | null>(null);
  const [erroValores, setErroValores] = useState<{ orcamento?: string; contratado?: string }>({});
  const [erroDatas, setErroDatas] = useState<string | null>(null);

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    const nomeLimpo = nome.trim();
    const orc = lerValorOpcional(orcamento);
    const cont = lerValorOpcional(contratado);
    const errosV: { orcamento?: string; contratado?: string } = {};
    if (orc === 'invalido') errosV.orcamento = 'Use um número positivo, por exemplo 5000,00.';
    if (cont === 'invalido') errosV.contratado = 'Use um número positivo, por exemplo 6150,00.';
    const datasErradas = inicio && fim && fim < inicio ? 'A data de fim não pode ser anterior à de início.' : null;
    setErroNome(nomeLimpo ? null : 'O nome do projeto é obrigatório.');
    setErroValores(errosV);
    setErroDatas(datasErradas);
    if (!nomeLimpo || orc === 'invalido' || cont === 'invalido' || datasErradas) return;

    setAGravar(true);
    let erro: string | undefined;
    if (editar && projeto) {
      // PATCH: o servidor só altera os campos enviados. Campos esvaziados vão a null.
      const corpo = {
        name: nomeLimpo,
        // O código identifica o projeto: vazio mantém o atual em vez de o apagar.
        ...(codigo.trim() ? { code: codigo.trim() } : {}),
        description: descricao.trim() || null,
        budget: orc,
        contract_value: cont,
        entity_name: cliente.trim() || null,
        started_on: inicio || null,
        ended_on: fim || null,
        status: estado,
        ...(estado === 'open' ? { active: true } : {}),
      };
      ({ error: erro } = await apiPatchOrError<Projeto>(`/projects/${encodeURIComponent(projeto.id)}`, corpo));
    } else {
      const corpo: Record<string, string | number> = { name: nomeLimpo, status: estado };
      if (codigo.trim()) corpo.code = codigo.trim();
      if (descricao.trim()) corpo.description = descricao.trim();
      if (orc !== null) corpo.budget = orc;
      if (cont !== null) corpo.contract_value = cont;
      if (cliente.trim()) corpo.entity_name = cliente.trim();
      if (inicio) corpo.started_on = inicio;
      if (fim) corpo.ended_on = fim;
      ({ error: erro } = await apiPostOrError<Projeto>('/projects/', corpo));
    }
    setAGravar(false);
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(editar ? 'Projeto atualizado.' : 'Projeto criado.');
    await onSaved();
  };

  return (
    <SideDrawer
      title={editar ? 'Editar projeto' : 'Novo projeto'}
      subtitle={editar ? (projeto?.codigo ? `${projeto.codigo} · ${projeto.nome}` : projeto?.nome) : 'Um trabalho, obra ou cliente a que os documentos pertencem'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form={FORM_ID} loading={aGravar}>
            {editar ? 'Guardar alterações' : 'Criar projeto'}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submeter} className="space-y-3" noValidate>
        <Field label="Nome do projeto" required error={erroNome}>
          {(p) => (
            <Input {...p} autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Remodelação Rua Augusta 12" />
          )}
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Código" hint={editar ? undefined : 'Vazio: é atribuído automaticamente (P-001…).'}>
            {(p) => (
              <Input {...p} value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="P-001" className="font-mono" />
            )}
          </Field>
          <Field label="Estado">
            {(p) => (
              <Select {...p} value={estado} onChange={(e) => setEstado(e.target.value === 'closed' ? 'closed' : 'open')}>
                <option value="open">Aberto</option>
                <option value="closed">Fechado</option>
              </Select>
            )}
          </Field>
        </div>
        <Field label="Cliente">
          {(p) => (
            <Input {...p} value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nome do cliente (opcional)" />
          )}
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Orçamento de custos (€)" hint="Quanto prevê gastar, sem IVA." error={erroValores.orcamento}>
            {(p) => (
              <Input {...p} inputMode="decimal" value={orcamento} onChange={(e) => setOrcamento(e.target.value)} placeholder="0,00" className="text-right tabular-nums" />
            )}
          </Field>
          <Field label="Valor contratado (€)" hint="Quanto vai faturar, sem IVA." error={erroValores.contratado}>
            {(p) => (
              <Input {...p} inputMode="decimal" value={contratado} onChange={(e) => setContratado(e.target.value)} placeholder="0,00" className="text-right tabular-nums" />
            )}
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Início">
            {(p) => <Input {...p} type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />}
          </Field>
          <Field label="Fim" error={erroDatas}>
            {(p) => <Input {...p} type="date" value={fim} onChange={(e) => setFim(e.target.value)} />}
          </Field>
        </div>
        <Field label="Descrição">
          {(p) => (
            <Textarea {...p} rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Notas sobre o projeto (opcional)" className="resize-none" />
          )}
        </Field>
      </form>
    </SideDrawer>
  );
}

/* ------------------------------------------------------------ extrato (drawer) */

function ExtratoDrawer({
  projeto, ano, formatMoney, onClose,
}: {
  projeto: Projeto;
  ano: number;
  formatMoney: (n: number) => string;
  onClose: () => void;
}) {
  const [janela, setJanela] = useState<Janela>('ano');
  const extrato = useLoad(async () => {
    const qs = janela === 'ano' ? `?start=${ano}-01-01&end=${ano + 1}-01-01` : '';
    const data = await apiGet<Extrato>(`/projects/${encodeURIComponent(projeto.id)}/statement${qs}`);
    if (!data) throw new Error('Não foi possível carregar o extrato do projeto.');
    return data;
  }, [projeto.id, janela, ano]);

  const { data, loading, error, reload } = extrato;
  const titulo = projeto.codigo ? `${projeto.codigo} · ${projeto.nome}` : projeto.nome;
  const legenda = janela === 'ano' ? `Movimentos de ${ano}` : 'Todos os movimentos';

  return (
    <SideDrawer title={`Extrato — ${titulo}`} subtitle={projeto.cliente ?? 'Documento a documento, sem IVA'} onClose={onClose} widthClass="max-w-3xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<Janela>
            aria-label="Período do extrato"
            value={janela}
            onChange={setJanela}
            options={[
              { value: 'ano', label: String(ano) },
              { value: 'sempre', label: 'Sempre' },
            ]}
          />
          <ExportMenu
            className="ml-auto"
            size="sm"
            disabled={!data || data.movimentos.length === 0}
            build={() => ({
              title: `Extrato do projeto ${titulo}`,
              subtitle: `${legenda} · valores sem IVA`,
              columns: [
                { key: 'data', label: 'Data', type: 'date' },
                { key: 'documento', label: 'Documento' },
                { key: 'descricao', label: 'Descrição' },
                { key: 'entidade', label: 'Entidade' },
                { key: 'categoria', label: 'Categoria' },
                { key: 'tipo', label: 'Tipo' },
                { key: 'estado', label: 'Estado' },
                { key: 'valor', label: 'Valor', type: 'money' },
              ],
              rows: (data?.movimentos ?? []).map((m) => ({
                data: m.data,
                documento: m.documento,
                descricao: m.descricao,
                entidade: m.entidade,
                categoria: m.categoria,
                tipo: m.tipo === 'income' ? 'Receita' : m.tipo === 'expense' ? 'Despesa' : m.tipo,
                estado: estadoPagamento(m.estado),
                valor: m.tipo === 'expense' ? -m.valor : m.valor,
              })),
              totals: data ? { descricao: 'Margem', valor: data.margem } : undefined,
            })}
          />
        </div>

        {loading && !data ? (
          <LoadingState label="A carregar o extrato…" />
        ) : error ? (
          <ErrorState
            message={mensagemErro(error, 'Não foi possível carregar o extrato.')}
            action={<Button variant="secondary" onClick={() => reload()}>Tentar novamente</Button>}
          />
        ) : data ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Receita" value={formatMoney(data.rendimentos)} tone="positive" />
              <Stat
                label="Gasto"
                value={formatMoney(data.gastos)}
                tone={data.acima_do_orcamento ? 'negative' : 'neutral'}
                hint={data.orcamento_usado_pct !== null
                  ? `${formatPct(data.orcamento_usado_pct)} do orçamento${data.projeto.orcamento !== null ? ` de ${formatMoney(data.projeto.orcamento)}` : ''}`
                  : 'Sem orçamento definido'}
              />
              <Stat
                label="Margem"
                value={formatMoney(data.margem)}
                tone={data.margem >= 0 ? 'positive' : 'negative'}
                hint={data.margem_pct !== null ? `${formatPct(data.margem_pct)} da receita` : undefined}
              />
              <Stat
                label="Valor contratado"
                value={data.projeto.valor_contratado !== null ? formatMoney(data.projeto.valor_contratado) : '—'}
                hint={data.projeto.inicio || data.projeto.fim
                  ? `${formatDate(data.projeto.inicio)} a ${formatDate(data.projeto.fim)}`
                  : undefined}
              />
            </div>

            <Card className="overflow-hidden">
              <CardHeader icon={<Receipt />} title={legenda} subtitle={data.base} />
              <Table>
                <THead>
                  <tr>
                    <Th>Data</Th>
                    <Th>Descrição</Th>
                    <Th className="hidden md:table-cell">Categoria</Th>
                    <Th className="hidden md:table-cell">Estado</Th>
                    <Th numeric>Valor</Th>
                  </tr>
                </THead>
                <TBody className="font-medium">
                  {data.movimentos.length === 0 ? (
                    <TableMessage colSpan={5}>
                      <EmptyState
                        icon={<Receipt />}
                        title="Sem movimentos neste período"
                        description="Os documentos aparecem aqui quando o projeto é indicado no lançamento."
                      />
                    </TableMessage>
                  ) : data.movimentos.map((m) => (
                    <Tr key={m.id}>
                      <Td className="whitespace-nowrap text-neutral-600">{formatDate(m.data)}</Td>
                      <Td className="text-neutral-900">
                        <div className="font-semibold">{m.descricao || m.documento || '—'}</div>
                        <div className="text-2xs text-neutral-500">
                          {[m.documento && m.descricao ? m.documento : null, m.entidade].filter(Boolean).join(' · ')}
                        </div>
                      </Td>
                      <Td className="hidden md:table-cell text-neutral-600">{m.categoria || '—'}</Td>
                      <Td className="hidden md:table-cell"><Badge>{estadoPagamento(m.estado)}</Badge></Td>
                      <Td numeric className={m.tipo === 'income' ? 'text-emerald-700' : 'text-rose-600'}>
                        {m.tipo === 'expense' ? '−' : '+'}{formatMoney(m.valor)}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </Card>
          </>
        ) : null}
      </div>
    </SideDrawer>
  );
}
