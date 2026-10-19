'use client';

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  CalendarRange, ChevronLeft, ChevronRight, Copy, Target, Trash2,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useLoad } from '@/lib/use-load';
import { apiDeleteOrError, apiError, apiFetch, apiGet, apiPostOrError } from '@/services/api';
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorState, ExportMenu, IconButton, Input,
  LoadingState, Segmented, Stat, Table, TBody, Td, Th, THead, TableMessage, Tr, cn, useConfirm,
} from '@/components/ui';

/* ------------------------------------------------------------------ tipos */
/* Espelham backend/app/services/budgets.py (compare, year, copy_period).   */

type Sentido = 'favorável' | 'desfavorável';

interface Desvio {
  desvio: number;
  desvio_pct: number | null;
  sentido: Sentido;
  relevante: boolean;
}

interface LinhaComparacao extends Desvio {
  budget_id: string | null;
  category_id: string;
  categoria: string;
  tipo: string; // 'income' | 'expense'
  orcamento: number;
  realizado: number;
  documentos: number;
  sem_orcamento: boolean;
}

interface TotalComparacao extends Desvio {
  orcamento: number;
  realizado: number;
}

interface Comparacao {
  periodo: string;
  inicio: string;
  fim: string;
  linhas: LinhaComparacao[];
  rendimentos: TotalComparacao;
  gastos: TotalComparacao;
  resultado: TotalComparacao;
  sem_orcamento: boolean;
  mensagem: string;
}

interface Par { orcamento: number; realizado: number }

interface MesAno {
  periodo: string;
  mes: number;
  rendimentos: Par;
  gastos: Par;
  resultado: Par;
  tem_orcamento: boolean;
}

interface VistaAnual {
  ano: number;
  meses: MesAno[];
}

interface ResultadoCopia {
  status: string;
  origem: string;
  destino: string;
  copiados: number;
  ignorados: number;
}

type Vista = 'mes' | 'ano';

/* --------------------------------------------------------------- utilitários */

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function periodoAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function deslocarPeriodo(periodo: string, delta: number): string {
  const [y, m] = periodo.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ano = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

function nomePeriodo(periodo: string): string {
  const [y, m] = periodo.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return periodo;
  return `${MESES[m - 1]} de ${y}`;
}

function periodoValido(periodo: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(periodo);
}

/** "1.234,56" / "1234.56" / "1 234,5 €" → 1234.56. Vazio é zero; inválido ou negativo é null. */
function lerValor(texto: string): number | null {
  let s = texto.replace(/[\s€]/g, '');
  if (s === '') return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function valorParaCampo(valor: number): string {
  return valor ? String(valor).replace('.', ',') : '';
}

function tipoLabel(tipo: string): string {
  return tipo === 'income' ? 'Receita' : 'Despesa';
}

function formatPct(pct: number | null): string {
  if (pct === null) return '—';
  const s = pct.toFixed(1).replace('.', ',');
  return `${pct > 0 ? '+' : ''}${s}%`;
}

/* ---------------------------------------------------------- campo em linha */

function CampoOrcamento({
  valor, desativado, rotulo, onGravar,
}: {
  valor: number;
  desativado?: boolean;
  rotulo: string;
  onGravar: (valor: number) => Promise<boolean>;
}) {
  const [rascunho, setRascunho] = useState(valorParaCampo(valor));
  const [aGravar, setAGravar] = useState(false);

  const gravar = async () => {
    const lido = lerValor(rascunho);
    if (lido === null) {
      toast.error('Valor inválido. Use um número positivo, por exemplo 1500,00.');
      setRascunho(valorParaCampo(valor));
      return;
    }
    if (Math.abs(lido - valor) < 0.005) {
      setRascunho(valorParaCampo(valor));
      return;
    }
    setAGravar(true);
    const ok = await onGravar(lido);
    setAGravar(false);
    if (!ok) setRascunho(valorParaCampo(valor));
  };

  return (
    <Input
      type="text"
      inputMode="decimal"
      aria-label={rotulo}
      value={rascunho}
      placeholder="0,00"
      disabled={desativado || aGravar}
      onChange={(e) => setRascunho(e.target.value)}
      onBlur={gravar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setRascunho(valorParaCampo(valor));
      }}
      className={cn('w-28 text-right tabular-nums ml-auto', aGravar && 'opacity-60')}
    />
  );
}

/* -------------------------------------------------------- barra de progresso */

function BarraProgresso({ linha }: { linha: LinhaComparacao }) {
  const { orcamento, realizado, tipo } = linha;
  const pct = orcamento > 0 ? (realizado / orcamento) * 100 : realizado > 0 ? 100 : 0;
  const passou = realizado > orcamento && realizado > 0;
  let cor = 'bg-emerald-500';
  if (tipo === 'income') {
    cor = pct >= 100 ? 'bg-emerald-500' : 'bg-sky-500';
  } else if (passou) {
    cor = 'bg-rose-500';
  } else if (pct >= 90) {
    cor = 'bg-amber-500';
  }
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div
        className="h-1.5 flex-1 rounded-full bg-neutral-100 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(pct, 100))}
        aria-label={`${linha.categoria}: ${Math.round(pct)}% do orçamento`}
      >
        <div className={cn('h-full rounded-full', cor)} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={cn('text-2xs tabular-nums w-10 text-right', passou && tipo !== 'income' ? 'text-rose-600 font-semibold' : 'text-neutral-500')}>
        {orcamento > 0 ? `${Math.round(pct)}%` : '—'}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ página */

export default function BudgetsPage() {
  const { formatMoney, setPageHeader } = useApp();
  const confirm = useConfirm();
  const [vista, setVista] = useState<Vista>('mes');
  const [periodo, setPeriodo] = useState<string>(periodoAtual);
  const [ano, setAno] = useState<number>(() => new Date().getFullYear());
  const [aCopiar, setACopiar] = useState(false);
  const [aApagar, setAApagar] = useState<string | null>(null);

  useEffect(() => {
    setPageHeader('Orçamentos', 'O que planeou para cada categoria face ao que realmente aconteceu (valores sem IVA)');
  }, [setPageHeader]);

  const comparacao = useLoad(async () => {
    const data = await apiGet<Comparacao>(`/budgets/comparison?period=${encodeURIComponent(periodo)}`);
    if (!data) throw new Error('Não foi possível carregar o orçamento deste mês.');
    return data;
  }, [periodo], { enabled: vista === 'mes' });

  const anual = useLoad(async () => {
    const data = await apiGet<VistaAnual>(`/budgets/year?year=${ano}`);
    if (!data) throw new Error('Não foi possível carregar a vista anual.');
    return data;
  }, [ano], { enabled: vista === 'ano' });

  const anterior = deslocarPeriodo(periodo, -1);

  const gravarOrcamento = async (linha: LinhaComparacao, valor: number): Promise<boolean> => {
    try {
      const res = await apiFetch('/budgets/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_id: linha.category_id, period: periodo, amount: valor }),
      });
      const erro = await apiError(res);
      if (erro) {
        toast.error(erro);
        return false;
      }
    } catch {
      toast.error('Não foi possível contactar o servidor.');
      return false;
    }
    toast.success(`Orçamento de ${linha.categoria} guardado.`);
    await comparacao.refresh();
    return true;
  };

  const apagarOrcamento = async (linha: LinhaComparacao) => {
    if (!linha.budget_id) return;
    const ok = await confirm({
      title: 'Remover o orçamento desta categoria?',
      description: `${linha.categoria} deixa de ter valor planeado em ${nomePeriodo(periodo)}. Os movimentos não são afetados.`,
      confirmLabel: 'Remover',
      danger: true,
    });
    if (!ok) return;
    setAApagar(linha.budget_id);
    const { error } = await apiDeleteOrError(`/budgets/${encodeURIComponent(linha.budget_id)}`);
    setAApagar(null);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success('Orçamento removido.');
    await comparacao.refresh();
  };

  const copiarAnterior = async () => {
    setACopiar(true);
    const { data, error } = await apiPostOrError<ResultadoCopia>('/budgets/copy', { origem: anterior, destino: periodo });
    setACopiar(false);
    if (error || !data) {
      toast.error(error || 'Não foi possível copiar o orçamento.');
      return;
    }
    if (data.copiados === 0) {
      toast.info(`Nada copiado: as ${data.ignorados} categoria(s) de ${nomePeriodo(anterior)} já têm orçamento neste mês.`);
    } else {
      toast.success(
        `${data.copiados} categoria(s) copiada(s) de ${nomePeriodo(anterior)}`
        + (data.ignorados ? ` (${data.ignorados} já tinham valor e ficaram como estavam).` : '.'),
      );
    }
    await comparacao.refresh();
  };

  const abrirMes = (p: string) => {
    setPeriodo(p);
    setVista('mes');
  };

  /* --------------------------------------------------------------- render */

  const barra = (
    <Card className="p-3 flex flex-wrap items-center gap-2">
      <Segmented<Vista>
        aria-label="Vista"
        value={vista}
        onChange={setVista}
        options={[
          { value: 'mes', label: 'Mês' },
          { value: 'ano', label: 'Ano' },
        ]}
      />

      {vista === 'mes' ? (
        <div className="flex items-center gap-1">
          <IconButton label="Mês anterior" variant="secondary" size="md" onClick={() => setPeriodo((p) => deslocarPeriodo(p, -1))}>
            <ChevronLeft />
          </IconButton>
          <Input
            type="month"
            aria-label="Mês"
            value={periodo}
            onChange={(e) => { if (periodoValido(e.target.value)) setPeriodo(e.target.value); }}
            className="w-40"
          />
          <IconButton label="Mês seguinte" variant="secondary" size="md" onClick={() => setPeriodo((p) => deslocarPeriodo(p, 1))}>
            <ChevronRight />
          </IconButton>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <IconButton label="Ano anterior" variant="secondary" size="md" onClick={() => setAno((a) => a - 1)}>
            <ChevronLeft />
          </IconButton>
          <span className="w-16 text-center text-13 font-semibold tabular-nums text-neutral-900">{ano}</span>
          <IconButton label="Ano seguinte" variant="secondary" size="md" onClick={() => setAno((a) => a + 1)}>
            <ChevronRight />
          </IconButton>
        </div>
      )}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {vista === 'mes' ? (
          <>
            <Button
              variant="secondary"
              icon={<Copy />}
              loading={aCopiar}
              disabled={comparacao.loading || !!comparacao.error}
              onClick={copiarAnterior}
              title={`Copia o orçamento de ${nomePeriodo(anterior)} para as categorias ainda sem valor`}
            >
              Copiar mês anterior
            </Button>
            <ExportMenu
              disabled={!comparacao.data || comparacao.data.linhas.length === 0}
              build={() => {
                const d = comparacao.data;
                return {
                  title: 'Orçamento face ao realizado',
                  subtitle: `${nomePeriodo(periodo)} · valores sem IVA`,
                  columns: [
                    { key: 'categoria', label: 'Categoria' },
                    { key: 'tipo', label: 'Tipo' },
                    { key: 'orcamento', label: 'Orçamentado', type: 'money' },
                    { key: 'realizado', label: 'Realizado', type: 'money' },
                    { key: 'desvio', label: 'Desvio', type: 'money' },
                    { key: 'desvio_pct', label: 'Desvio %', type: 'percent' },
                    { key: 'sentido', label: 'Sentido' },
                  ],
                  rows: (d?.linhas ?? []).map((l) => ({
                    categoria: l.categoria,
                    tipo: tipoLabel(l.tipo),
                    orcamento: l.orcamento,
                    realizado: l.realizado,
                    desvio: l.desvio,
                    desvio_pct: l.desvio_pct,
                    sentido: l.relevante ? l.sentido : '',
                  })),
                  totals: d ? {
                    categoria: 'Resultado',
                    orcamento: d.resultado.orcamento,
                    realizado: d.resultado.realizado,
                    desvio: d.resultado.desvio,
                    desvio_pct: d.resultado.desvio_pct,
                  } : undefined,
                };
              }}
            />
          </>
        ) : (
          <ExportMenu
            disabled={!anual.data}
            build={() => {
              const meses = anual.data?.meses ?? [];
              const soma = (f: (m: MesAno) => number) => meses.reduce((a, m) => a + f(m), 0);
              return {
                title: 'Orçamento anual',
                subtitle: `${ano} · valores sem IVA`,
                columns: [
                  { key: 'mes', label: 'Mês' },
                  { key: 'rend_orc', label: 'Receitas orçamentadas', type: 'money' },
                  { key: 'rend_real', label: 'Receitas realizadas', type: 'money' },
                  { key: 'gast_orc', label: 'Despesas orçamentadas', type: 'money' },
                  { key: 'gast_real', label: 'Despesas realizadas', type: 'money' },
                  { key: 'res_orc', label: 'Resultado orçamentado', type: 'money' },
                  { key: 'res_real', label: 'Resultado realizado', type: 'money' },
                ],
                rows: meses.map((m) => ({
                  mes: nomePeriodo(m.periodo),
                  rend_orc: m.rendimentos.orcamento,
                  rend_real: m.rendimentos.realizado,
                  gast_orc: m.gastos.orcamento,
                  gast_real: m.gastos.realizado,
                  res_orc: m.resultado.orcamento,
                  res_real: m.resultado.realizado,
                })),
                totals: {
                  mes: 'Total',
                  rend_orc: soma((m) => m.rendimentos.orcamento),
                  rend_real: soma((m) => m.rendimentos.realizado),
                  gast_orc: soma((m) => m.gastos.orcamento),
                  gast_real: soma((m) => m.gastos.realizado),
                  res_orc: soma((m) => m.resultado.orcamento),
                  res_real: soma((m) => m.resultado.realizado),
                },
              };
            }}
          />
        )}
      </div>
    </Card>
  );

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {barra}
      {vista === 'mes' ? (
        <VistaMes
          estado={comparacao}
          periodo={periodo}
          formatMoney={formatMoney}
          aApagar={aApagar}
          onGravar={gravarOrcamento}
          onApagar={apagarOrcamento}
        />
      ) : (
        <VistaAno estado={anual} ano={ano} formatMoney={formatMoney} onAbrirMes={abrirMes} />
      )}
    </div>
  );
}

/* --------------------------------------------------------------- vista mês */

interface EstadoCarga<T> {
  data: T | undefined;
  loading: boolean;
  error: unknown;
  reload: () => Promise<void>;
}

function mensagemErro(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function tomDesvio(d: Desvio): string {
  if (!d.relevante || d.desvio === 0) return 'text-neutral-500';
  return d.sentido === 'favorável' ? 'text-emerald-700' : 'text-rose-600';
}

function VistaMes({
  estado, periodo, formatMoney, aApagar, onGravar, onApagar,
}: {
  estado: EstadoCarga<Comparacao>;
  periodo: string;
  formatMoney: (n: number) => string;
  aApagar: string | null;
  onGravar: (linha: LinhaComparacao, valor: number) => Promise<boolean>;
  onApagar: (linha: LinhaComparacao) => void;
}) {
  const { data, loading, error, reload } = estado;

  if (loading && (!data || data.periodo !== periodo)) {
    return <Card><LoadingState label="A carregar o orçamento…" /></Card>;
  }
  if (error) {
    return (
      <Card>
        <ErrorState
          message={mensagemErro(error, 'Não foi possível carregar o orçamento.')}
          action={<Button variant="secondary" onClick={() => reload()}>Tentar novamente</Button>}
        />
      </Card>
    );
  }
  if (!data) return null;

  const statDesvio = (t: TotalComparacao) => (
    <span className={tomDesvio(t)}>
      Orçamentado {formatMoney(t.orcamento)} · desvio {formatMoney(t.desvio)} ({formatPct(t.desvio_pct)})
    </span>
  );
  const tomTotal = (t: TotalComparacao) =>
    !t.relevante ? 'neutral' as const : t.sentido === 'favorável' ? 'positive' as const : 'negative' as const;

  const colunas = 8;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Receitas realizadas" value={formatMoney(data.rendimentos.realizado)} tone={tomTotal(data.rendimentos)} hint={statDesvio(data.rendimentos)} />
        <Stat label="Despesas realizadas" value={formatMoney(data.gastos.realizado)} tone={tomTotal(data.gastos)} hint={statDesvio(data.gastos)} />
        <Stat label="Resultado" value={formatMoney(data.resultado.realizado)} tone={tomTotal(data.resultado)} hint={statDesvio(data.resultado)} />
      </div>

      {data.mensagem && (
        <Card className={cn('px-4 py-3 text-xs', data.sem_orcamento ? 'text-amber-800 bg-amber-50/60 border-amber-200' : 'text-neutral-700')}>
          {data.mensagem}
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader
          icon={<Target />}
          title={`Orçamento de ${nomePeriodo(periodo)}`}
          subtitle="Clique no valor orçamentado para o alterar; grava ao sair do campo ou com Enter."
        />
        <Table>
          <THead>
            <tr>
              <Th>Categoria</Th>
              <Th className="hidden md:table-cell">Tipo</Th>
              <Th numeric>Orçamentado</Th>
              <Th numeric>Realizado</Th>
              <Th numeric className="hidden sm:table-cell">Desvio</Th>
              <Th numeric className="hidden md:table-cell">Desvio %</Th>
              <Th className="hidden lg:table-cell">Execução</Th>
              <Th align="right"><span className="sr-only">Ações</span></Th>
            </tr>
          </THead>
          <TBody className="font-medium">
            {data.linhas.length === 0 ? (
              <TableMessage colSpan={colunas}>
                <EmptyState
                  icon={<Target />}
                  title="Ainda não há categorias"
                  description="Crie categorias de receita e despesa para poder definir o orçamento de cada uma."
                />
              </TableMessage>
            ) : data.linhas.map((l) => {
              const passou = l.tipo !== 'income' && l.realizado > l.orcamento && l.realizado > 0;
              const semCategoria = l.category_id === 'sem-categoria';
              return (
                <Tr key={l.category_id} className={cn(passou && 'bg-rose-50/50 hover:bg-rose-50')}>
                  <Td className="text-neutral-900">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold">{l.categoria}</span>
                      {l.sem_orcamento && <Badge tone="warning">Sem orçamento</Badge>}
                      {passou && !l.sem_orcamento && <Badge tone="danger">Acima do orçamento</Badge>}
                    </div>
                    <div className="text-2xs text-neutral-500 md:hidden">{tipoLabel(l.tipo)}</div>
                  </Td>
                  <Td className="hidden md:table-cell">
                    <Badge tone={l.tipo === 'income' ? 'success' : 'neutral'}>{tipoLabel(l.tipo)}</Badge>
                  </Td>
                  <Td numeric>
                    <CampoOrcamento
                      key={`${l.category_id}-${l.orcamento}`}
                      valor={l.orcamento}
                      desativado={semCategoria}
                      rotulo={`Orçamento de ${l.categoria}`}
                      onGravar={(v) => onGravar(l, v)}
                    />
                  </Td>
                  <Td numeric className="text-neutral-900">
                    {formatMoney(l.realizado)}
                    {l.documentos > 0 && (
                      <div className="text-2xs text-neutral-500 font-normal">{l.documentos} doc.</div>
                    )}
                  </Td>
                  <Td numeric className={cn('hidden sm:table-cell', tomDesvio(l))}>
                    {l.relevante ? formatMoney(l.desvio) : '—'}
                  </Td>
                  <Td numeric className={cn('hidden md:table-cell', tomDesvio(l))}>
                    {formatPct(l.desvio_pct)}
                  </Td>
                  <Td className="hidden lg:table-cell">
                    <BarraProgresso linha={l} />
                  </Td>
                  <Td align="right">
                    {l.budget_id && (
                      <IconButton
                        label={`Remover orçamento de ${l.categoria}`}
                        variant="danger"
                        disabled={aApagar === l.budget_id}
                        onClick={() => onApagar(l)}
                      >
                        <Trash2 />
                      </IconButton>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </>
  );
}

/* ---------------------------------------------------------------- vista ano */

function VistaAno({
  estado, ano, formatMoney, onAbrirMes,
}: {
  estado: EstadoCarga<VistaAnual>;
  ano: number;
  formatMoney: (n: number) => string;
  onAbrirMes: (periodo: string) => void;
}) {
  const { data, loading, error, reload } = estado;

  if (loading && (!data || data.ano !== ano)) {
    return <Card><LoadingState label="A carregar o ano…" /></Card>;
  }
  if (error) {
    return (
      <Card>
        <ErrorState
          message={mensagemErro(error, 'Não foi possível carregar a vista anual.')}
          action={<Button variant="secondary" onClick={() => reload()}>Tentar novamente</Button>}
        />
      </Card>
    );
  }
  if (!data) return null;

  const meses = data.meses;
  const soma = (f: (m: MesAno) => number) => meses.reduce((a, m) => a + f(m), 0);
  const total = {
    rendOrc: soma((m) => m.rendimentos.orcamento),
    rendReal: soma((m) => m.rendimentos.realizado),
    gastOrc: soma((m) => m.gastos.orcamento),
    gastReal: soma((m) => m.gastos.realizado),
    resOrc: soma((m) => m.resultado.orcamento),
    resReal: soma((m) => m.resultado.realizado),
  };
  const algumOrcamento = meses.some((m) => m.tem_orcamento);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat
          label={`Receitas ${ano}`}
          value={formatMoney(total.rendReal)}
          tone={total.rendReal >= total.rendOrc ? 'positive' : 'negative'}
          hint={`Orçamentado ${formatMoney(total.rendOrc)}`}
        />
        <Stat
          label={`Despesas ${ano}`}
          value={formatMoney(total.gastReal)}
          tone={total.gastReal <= total.gastOrc ? 'positive' : 'negative'}
          hint={`Orçamentado ${formatMoney(total.gastOrc)}`}
        />
        <Stat
          label={`Resultado ${ano}`}
          value={formatMoney(total.resReal)}
          tone={total.resReal >= total.resOrc ? 'positive' : 'negative'}
          hint={`Orçamentado ${formatMoney(total.resOrc)}`}
        />
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          icon={<CalendarRange />}
          title={`Orçamento de ${ano}, mês a mês`}
          subtitle="Clique num mês para ver o detalhe por categoria."
        />
        <Table>
          <THead>
            <tr>
              <Th>Mês</Th>
              <Th numeric className="hidden md:table-cell">Receitas orç.</Th>
              <Th numeric>Receitas</Th>
              <Th numeric className="hidden md:table-cell">Despesas orç.</Th>
              <Th numeric>Despesas</Th>
              <Th numeric className="hidden lg:table-cell">Resultado orç.</Th>
              <Th numeric className="hidden sm:table-cell">Resultado</Th>
            </tr>
          </THead>
          <TBody className="font-medium">
            {!algumOrcamento && (
              <TableMessage colSpan={7}>
                <EmptyState
                  className="py-4"
                  icon={<Target />}
                  title={`Ainda não há orçamento definido em ${ano}`}
                  description="Os valores realizados aparecem na mesma; abra um mês para definir o orçamento."
                />
              </TableMessage>
            )}
            {meses.map((m) => {
              const despesaAcima = m.tem_orcamento && m.gastos.realizado > m.gastos.orcamento;
              return (
                <Tr
                  key={m.periodo}
                  onClick={() => onAbrirMes(m.periodo)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onAbrirMes(m.periodo); }}
                  tabIndex={0}
                  role="link"
                  aria-label={`Abrir orçamento de ${nomePeriodo(m.periodo)}`}
                  className="focus-visible:outline-none focus-visible:bg-neutral-50"
                >
                  <Td className="text-neutral-900">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold capitalize">{MESES[m.mes - 1]}</span>
                      {!m.tem_orcamento && <Badge>Sem orçamento</Badge>}
                    </div>
                  </Td>
                  <Td numeric className="hidden md:table-cell text-neutral-500">{formatMoney(m.rendimentos.orcamento)}</Td>
                  <Td numeric className="text-neutral-900">{formatMoney(m.rendimentos.realizado)}</Td>
                  <Td numeric className="hidden md:table-cell text-neutral-500">{formatMoney(m.gastos.orcamento)}</Td>
                  <Td numeric className={despesaAcima ? 'text-rose-600 font-semibold' : 'text-neutral-900'}>
                    {formatMoney(m.gastos.realizado)}
                  </Td>
                  <Td numeric className="hidden lg:table-cell text-neutral-500">{formatMoney(m.resultado.orcamento)}</Td>
                  <Td numeric className={cn('hidden sm:table-cell font-semibold', m.resultado.realizado < 0 ? 'text-rose-600' : 'text-neutral-900')}>
                    {formatMoney(m.resultado.realizado)}
                  </Td>
                </Tr>
              );
            })}
            <tr className="bg-neutral-50/80 font-semibold text-neutral-900">
              <Td>Total</Td>
              <Td numeric className="hidden md:table-cell">{formatMoney(total.rendOrc)}</Td>
              <Td numeric>{formatMoney(total.rendReal)}</Td>
              <Td numeric className="hidden md:table-cell">{formatMoney(total.gastOrc)}</Td>
              <Td numeric>{formatMoney(total.gastReal)}</Td>
              <Td numeric className="hidden lg:table-cell">{formatMoney(total.resOrc)}</Td>
              <Td numeric className={cn('hidden sm:table-cell', total.resReal < 0 && 'text-rose-600')}>{formatMoney(total.resReal)}</Td>
            </tr>
          </TBody>
        </Table>
      </Card>
    </>
  );
}
