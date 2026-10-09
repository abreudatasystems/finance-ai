'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useApp } from '@/context/AppContext';
import { useLoad } from '@/lib/use-load';
import { fetchTransactions } from '@/services/data';
import { settleMany } from '@/components/cashflow/api';
import { ForecastPanel } from '@/components/cashflow/ForecastPanel';
import { Transaction } from '@/types';
import { formatDate, documentStatusLabel } from '@/lib/format';
import { Search, CheckCircle2, X, Bot, User, Landmark } from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge, Button, IconButton, Card, Input, Select, Table, THead, TBody, Th, Tr, Td, TableMessage,
  LoadingState, EmptyState, Segmented, Stat, cn, useConfirm,
} from '@/components/ui';

const NO_TRANSACTIONS: Transaction[] = [];

/** A data de hoje no fuso de quem usa (toISOString dava o dia anterior entre as 00h e a 01h em Portugal). */
function localDay(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00`) - Date.parse(`${from}T00:00:00`)) / 86_400_000);
}

type Tab = 'all' | 'income' | 'expense' | 'open' | 'settled';

/** O banco confirma os pagamentos deste documento? */
function BankBadge({ status }: { status?: Transaction['bank_status'] }) {
  if (status === 'confirmed') return <Badge tone="success">Confirmado</Badge>;
  if (status === 'partial') return <Badge tone="warning">Parcial</Badge>;
  if (status === 'unconfirmed') return <Badge tone="neutral">Por confirmar</Badge>;
  return <span className="text-neutral-300">—</span>;
}

export interface CashFlowViewProps {
  mode?: 'cash-flow' | 'payables' | 'receivables';
}
export function CashFlowContent({ mode = 'cash-flow' }: CashFlowViewProps) {
  const router = useRouter();
  const { formatMoney, setPageHeader } = useApp();
  // `data` fica `undefined` até à primeira resposta; depois de liquidar volta a
  // ler sem esconder a tabela (por isso "carregado" = já houve uma resposta).
  const { data: loadedTransactions, reload: reloadTransactions } = useLoad(fetchTransactions, []);
  const transactions = loadedTransactions ?? NO_TRANSACTIONS;
  const loaded = loadedTransactions !== undefined;
  const [activeTab, setActiveTab] = useState<Tab>(mode === 'cash-flow' ? 'all' : 'open');
  // Contas a pagar e a receber são o livro de um só sentido; o fluxo de caixa tem os dois.
  const isLedger = mode !== 'cash-flow';
  const ledgerType: 'expense' | 'income' | null = mode === 'payables' ? 'expense' : mode === 'receivables' ? 'income' : null;
  const [searchTerm, setSearchTerm] = useState('');
  // A list of every movement ever is unusable after two months. The period is
  // the first thing a cash flow needs.
  // Enquanto se olha para o que está em aberto, o sentido é a pergunta
  // seguinte: pagar e receber são duas listas de trabalho diferentes.
  const [direction, setDirection] = React.useState<'all' | 'expense' | 'income'>(mode === 'payables' ? 'expense' : mode === 'receivables' ? 'income' : 'all');
  const params = useSearchParams();

  // As contas a pagar e a receber encaminham para aqui; um marcador antigo ou
  // um alerta tem de aterrar já no separador e no sentido certos.
  // Ajustado durante o render quando o URL muda, não num efeito.
  const [seenParams, setSeenParams] = useState<typeof params | null>(null);
  if (params !== seenParams) {
    setSeenParams(params);
    const tab = params.get('tab');
    const dir = params.get('dir');
    if (tab === 'open') setActiveTab('open');
    if (dir === 'expense' || dir === 'income') setDirection(dir);
  }
  const [period, setPeriod] = useState<string>(() => localDay().slice(0, 7));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [settling, setSettling] = useState(false);
  const confirm = useConfirm();


    useEffect(() => {
    if (mode === 'payables') {
      setPageHeader('Contas a Pagar', 'Gestão de despesas e obrigações financeiras pendentes');
    } else if (mode === 'receivables') {
      setPageHeader('Contas a Receber', 'Gestão de receitas e recebimentos pendentes');
    } else {
      setPageHeader('Fluxo de Caixa', 'Todas as entradas, saídas e previsões de caixa');
    }
  }, [setPageHeader, mode]);

  const periodOptions = React.useMemo(() => {
    const out: { value: string; label: string }[] = [{ value: 'all', label: 'Tudo' }];
    const now = new Date();
    for (let i = 0; i < 12; i += 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push({
        value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' }),
      });
    }
    return out;
  }, []);

  /* Contas a pagar = todas as despesas; contas a receber = todas as receitas.
     Juntas dão exatamente o fluxo de caixa — nada fica só de um lado. */
  const scoped = React.useMemo(
    () => (ledgerType ? transactions.filter((t) => t.type === ledgerType) : transactions),
    [transactions, ledgerType],
  );
  const isOpen = (t: Transaction) => Number(t.outstanding_amount ?? 0) > 0;
  const counts = React.useMemo(() => ({
    all: scoped.length,
    open: scoped.filter(isOpen).length,
    settled: scoped.filter((t) => !isOpen(t)).length,
  }), [scoped]);

  const filteredTransactions = React.useMemo(() => scoped.filter((t) => {
    // O que está em aberto não tem mês: uma fatura de março por pagar é trabalho de hoje.
    const matchesPeriod = period === 'all' || activeTab === 'open' || (t.date || '').startsWith(period);
    const matchesTab =
      activeTab === 'all' ? true :
      activeTab === 'income' ? t.type === 'income' :
      activeTab === 'expense' ? t.type === 'expense' :
      activeTab === 'open' ? isOpen(t) :
      !isOpen(t);

    const matchesSearch =
      t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.entity_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.category_name.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesDirection =
      isLedger || activeTab !== 'open' || direction === 'all' || t.type === direction;
    return matchesPeriod && matchesTab && matchesSearch && matchesDirection;
  }), [scoped, period, activeTab, searchTerm, direction, isLedger]);

  /* What actually moves through the bank. Not the document total: any
     retention at source goes to the State, so a cash flow that sums the gross
     overstates every retained invoice by the withholding. */
  const moves = (t: Transaction) =>
    Number(t.payable_amount ?? t.gross_amount ?? t.amount ?? 0);

  /* Totals for what is on screen — a cash flow without them is a list. */
  const totals = filteredTransactions.reduce(
    (acc, t) => {
      const amount = moves(t);
      if (t.type === 'income') acc.entradas += amount; else acc.saidas += amount;
      acc.aberto += Number(t.outstanding_amount ?? 0);
      acc.retido += Number(t.retention_amount ?? 0);
      return acc;
    },
    { entradas: 0, saidas: 0, aberto: 0, retido: 0 },
  );

  /* Pago mas sem linha do extrato a prová-lo: o trabalho da conciliação. */
  const unconfirmed = React.useMemo(() => {
    const rows = scoped.filter((t) => t.bank_status === 'unconfirmed' || t.bank_status === 'partial');
    return { count: rows.length, total: rows.reduce((a, t) => a + Number(t.paid_amount ?? 0), 0) };
  }, [scoped]);
  const paidTotal = filteredTransactions.reduce((a, t) => a + Number(t.paid_amount ?? 0), 0);
  const today = localDay();

  /* Vencido, hoje, próximos sete dias.
     A antiguidade de saldos das Cobranças responde "há quanto tempo"; isto
     responde "o que tenho de tratar esta semana", que é outra pergunta e a
     razão de este separador existir. */
  const buckets = React.useMemo(() => {
    const today = localDay();
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 7);
    const week = localDay(horizon);

    const open = filteredTransactions.filter((t) => Number(t.outstanding_amount ?? 0) > 0);
    const due = (t: Transaction) => t.due_date || t.date || '';
    const sum = (rows: Transaction[]) =>
      rows.reduce((acc, t) => acc + Number(t.outstanding_amount ?? 0), 0);

    const overdue = open.filter((t) => due(t) < today);
    const dueToday = open.filter((t) => due(t) === today);
    const dueWeek = open.filter((t) => due(t) > today && due(t) <= week);

    return {
      vencido: { total: sum(overdue), count: overdue.length },
      hoje: { total: sum(dueToday), count: dueToday.length },
      semana: { total: sum(dueWeek), count: dueWeek.length },
      aberto: { total: sum(open), count: open.length },
    };
  }, [filteredTransactions]);

  /* Oldest first, carrying a running balance — how a cash flow is read. */
  const withRunning = React.useMemo(() => {
    const ordered = [...filteredTransactions].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const signed = ordered.map((t) => {
      const amount = Number(t.payable_amount ?? t.gross_amount ?? t.amount ?? 0);
      return t.type === 'income' ? amount : -amount;
    });
    // Soma acumulada sem mutação: cada saldo é o anterior mais o movimento.
    const balances = signed.reduce<number[]>(
      (acc, v, i) => acc.concat((i === 0 ? 0 : acc[i - 1]) + v),
      [],
    );
    return new Map(ordered.map((t, i) => [t.id, balances[i]] as const));
  }, [filteredTransactions]);

  const settleSelected = async () => {
    if (selected.size === 0) return;
    if (!(await confirm({
      title: `Marcar ${selected.size} lançamento(s) como liquidado(s) hoje?`,
      description: 'É registado um pagamento ou recebimento, com a data de hoje, pelo valor em aberto de cada um.',
      confirmLabel: 'Marcar como liquidado',
    }))) return;
    setSettling(true);
    const res = await settleMany([...selected]);
    setSettling(false);
    if (res.error || !res.data) { toast.error(res.error || 'Não foi possível liquidar.'); return; }
    const { liquidados, falhados, total } = res.data;
    if (falhados) {
      toast.warning(`${liquidados} liquidado(s) (${formatMoney(total)}), ${falhados} por liquidar.`);
    } else {
      toast.success(`${liquidados} lançamento(s) liquidado(s) — ${formatMoney(total)}.`);
    }
    setSelected(new Set());
    await reloadTransactions();
  };

  const columns = isLedger ? 9 : 11;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  return (
    <div className="space-y-4 animate-in fade-in duration-300">

      {/* Will the money be there? Everything else on this page is history;
          this is the only part that looks forward. */}
      {mode === 'cash-flow' && <ForecastPanel />}

      {/* Tabs & Filter Header */}
      <Card className="p-3 flex flex-wrap items-center gap-2">

        {/* Navigation Tabs */}
        {mode === 'cash-flow' && (
          <Segmented
            aria-label="Tipo de lançamento"
            value={activeTab}
            onChange={setActiveTab}
            className="max-w-full overflow-x-auto hide-scrollbar"
            options={[
              { value: 'all', label: `Todos os Lançamentos (${transactions.length})` },
              { value: 'income', label: 'Receitas (+ €)' },
              { value: 'expense', label: 'Despesas (- €)' },
              { value: 'open', label: 'Em aberto' },
            ]}
          />
        )}

        {isLedger && (
          <Segmented
            aria-label="Estado"
            value={activeTab}
            onChange={setActiveTab}
            className="max-w-full overflow-x-auto hide-scrollbar"
            options={[
              { value: 'open', label: `Em aberto (${counts.open})` },
              { value: 'settled', label: `${mode === 'payables' ? 'Pagas' : 'Recebidas'} (${counts.settled})` },
              { value: 'all', label: `Todas (${counts.all})` },
            ]}
          />
        )}

        {/* Period — the first thing a cash flow needs. O que está em aberto não tem mês. */}
        {activeTab !== 'open' && (
          <Select
            value={period} onChange={(e) => setPeriod(e.target.value)}
            aria-label="Período"
            className="w-full sm:w-auto"
          >
            {periodOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        )}

        {/* Filter Input */}
        <div className="relative w-full sm:w-64 sm:ml-auto">
          <Search className="size-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
          <Input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={mode === 'receivables' ? 'Procurar documento ou cliente…' : mode === 'payables' ? 'Procurar documento ou fornecedor…' : 'Procurar movimento ou entidade…'}
            aria-label="Filtrar lançamentos"
            className="pl-8"
          />
        </div>

      </Card>

      {/* Em aberto: o sentido e os prazos, que é a lista de trabalho da semana.
          As contas a pagar e a receber viviam em páginas próprias a fazer isto
          pior; agora estão aqui, ao lado de quem as liquida. */}
      {activeTab === 'open' && (
        <div className="space-y-3">
          {mode === 'cash-flow' && (
            <Segmented
              aria-label="Sentido"
              value={direction}
              onChange={setDirection}
              options={[
                { value: 'all', label: `Tudo (${buckets.aberto.count})` },
                { value: 'expense', label: 'A pagar' },
                { value: 'income', label: 'A receber' },
              ]}
            />
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat
              label="Vencido"
              value={formatMoney(buckets.vencido.total)}
              hint={`${buckets.vencido.count} documento(s)`}
              tone="negative"
            />
            <Stat
              label="Vence hoje"
              value={formatMoney(buckets.hoje.total)}
              hint={`${buckets.hoje.count} documento(s)`}
              tone="warning"
            />
            <Stat
              label="Próximos 7 dias"
              value={formatMoney(buckets.semana.total)}
              hint={`${buckets.semana.count} documento(s)`}
            />
            <Stat
              label="Total em aberto"
              value={formatMoney(buckets.aberto.total)}
              hint={`${buckets.aberto.count} documento(s)`}
            />
          </div>
        </div>
      )}

      {/* Pagamentos que o banco ainda não confirma — a ponte para a conciliação. */}
      {unconfirmed.count > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg border border-sky-200 bg-sky-50 text-sky-900 text-xs">
          <Landmark className="size-4 text-sky-600 shrink-0" aria-hidden="true" />
          <span>
            <b className="font-semibold tabular-nums">{unconfirmed.count}</b> documento(s) com pagamentos registados
            (<span className="tabular-nums">{formatMoney(unconfirmed.total)}</span>) que o extrato ainda não confirma.
          </span>
          <Link
            href="/financial/bank-reconciliation"
            className="ml-auto font-semibold text-sky-800 hover:underline underline-offset-2"
          >
            Conciliar com o extrato →
          </Link>
        </div>
      )}

      {/* Totals for what is on screen, and the batch action */}
      {isLedger ? (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label={`Total · ${filteredTransactions.length} documento(s)`} value={formatMoney(totals.entradas + totals.saidas)} />
        <Stat
          label={mode === 'payables' ? 'Já pago' : 'Já recebido'}
          value={formatMoney(paidTotal)}
          tone="positive"
        />
        <Stat
          label="Ainda em aberto"
          value={formatMoney(totals.aberto)}
          tone={totals.aberto > 0 ? 'warning' : 'neutral'}
          hint={totals.retido > 0 ? (
            <span className="font-medium text-amber-700 tabular-nums">
              {formatMoney(totals.retido)} retidos na fonte
            </span>
          ) : undefined}
        />
        <Stat
          label="Por confirmar no banco"
          value={formatMoney(unconfirmed.total)}
          hint={`${unconfirmed.count} documento(s)`}
        />
      </div>
      ) : (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Entradas do período" value={formatMoney(totals.entradas)} tone="positive" />
        <Stat label="Saídas do período" value={formatMoney(totals.saidas)} tone="negative" />
        <Stat
          label="Resultado do período"
          value={formatMoney(totals.entradas - totals.saidas)}
          tone={totals.entradas - totals.saidas < 0 ? 'negative' : 'neutral'}
        />
        {/* Money that never reaches either side: it goes to the State. */}
        <Stat
          label="Ainda em aberto"
          value={formatMoney(totals.aberto)}
          hint={totals.retido > 0 ? (
            <span className="font-medium text-amber-700 tabular-nums">
              {formatMoney(totals.retido)} retidos na fonte
            </span>
          ) : undefined}
        />
      </div>
      )}

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg bg-neutral-900 text-white text-xs">
          <span className="font-medium">{selected.size} selecionado(s)</span>
          <Button
            variant="accent"
            size="sm"
            onClick={settleSelected}
            loading={settling}
            icon={<CheckCircle2 />}
            className="ml-auto"
          >
            Marcar como liquidado hoje
          </Button>
          <IconButton
            label="Limpar selecção"
            onClick={() => setSelected(new Set())}
            className="text-neutral-300 hover:text-white hover:bg-white/10"
          >
            <X />
          </IconButton>
        </div>
      )}

      {/* Main transactions table */}
      <Card className="overflow-hidden">
        <Table>
          <THead>
            <tr>
              <Th className="w-8"><span className="sr-only">Selecionar</span></Th>
              <Th>{isLedger ? 'Vencimento' : 'Data'}</Th>
              <Th>Descrição</Th>
              <Th className="hidden md:table-cell">{mode === 'payables' ? 'Fornecedor' : mode === 'receivables' ? 'Cliente' : 'Entidade'}</Th>
              <Th className="hidden lg:table-cell">Categoria</Th>
              {!isLedger && <Th className="hidden xl:table-cell">Projeto</Th>}
              {!isLedger && <Th numeric className="hidden xl:table-cell">IVA</Th>}
              <Th numeric>Valor</Th>
              {isLedger && <Th numeric>Em falta</Th>}
              <Th className="hidden sm:table-cell">Pagamento</Th>
              <Th className="hidden sm:table-cell">Banco</Th>
              {!isLedger && <Th numeric className="hidden lg:table-cell">Acumulado</Th>}
              {!isLedger && <Th align="right" className="hidden xl:table-cell">Origem</Th>}
            </tr>
          </THead>
          <TBody>
            {!loaded ? (
              <TableMessage colSpan={columns}><LoadingState /></TableMessage>
            ) : filteredTransactions.length === 0 ? (
              <TableMessage colSpan={columns}>
                <EmptyState
                  title={activeTab === 'open' ? 'Nada em aberto' : 'Sem lançamentos'}
                  description={
                    scoped.length === 0
                      ? 'Ainda não há movimentos registados.'
                      : activeTab === 'open'
                        ? `Não há nada por ${mode === 'receivables' ? 'receber' : mode === 'payables' ? 'pagar' : 'liquidar'}.`
                        : 'Nenhum lançamento corresponde ao período, separador ou filtro escolhidos.'
                  }
                />
              </TableMessage>
            ) : filteredTransactions.map((trx) => {
              const due = trx.due_date || trx.date;
              const late = isOpen(trx) && due < today ? daysBetween(due, today) : 0;
              return (
              <Tr
                key={trx.id}
                onClick={() => router.push(`/financial/cash-flow/${trx.id}`)}
                // Abre também com o teclado (Enter), não só com o rato.
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.target === e.currentTarget) router.push(`/financial/cash-flow/${trx.id}`);
                }}
                className="focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
              >
                <Td onClick={(e) => e.stopPropagation()}>
                  {isOpen(trx) ? (
                    <input
                      type="checkbox" checked={selected.has(trx.id)}
                      onChange={() => toggle(trx.id)}
                      className="rounded accent-emerald-600 cursor-pointer"
                      title="Selecionar para liquidar"
                      aria-label={`Selecionar ${trx.description} para liquidar`}
                    />
                  ) : (
                    <span className="text-neutral-300" aria-hidden="true">—</span>
                  )}
                </Td>
                <Td className="whitespace-nowrap tabular-nums">
                  {isLedger ? (
                    <>
                      <span className={cn(late > 0 ? 'text-rose-600 font-medium' : due === today && isOpen(trx) ? 'text-amber-600 font-medium' : 'text-neutral-600')}>
                        {formatDate(due)}
                      </span>
                      {late > 0 && <span className="block text-2xs text-rose-600">há {late} dia(s)</span>}
                      {!late && due === today && isOpen(trx) && <span className="block text-2xs text-amber-600">hoje</span>}
                    </>
                  ) : (
                    <span className="text-neutral-500">{formatDate(trx.date)}</span>
                  )}
                </Td>
                <Td>
                  <span className="font-medium text-neutral-900">{trx.description}</span>
                  {(trx.document_number || (trx.status !== 'approved' && trx.status !== 'paid')) && (
                    <span className="flex items-center gap-1.5 mt-0.5 text-2xs text-neutral-500">
                      {trx.document_number}
                      {trx.status !== 'approved' && trx.status !== 'paid' && (
                        <Badge tone="warning">{documentStatusLabel(trx.status)}</Badge>
                      )}
                    </span>
                  )}
                </Td>
                <Td className="text-neutral-700 hidden md:table-cell">{trx.entity_name}</Td>
                <Td className="text-neutral-600 hidden lg:table-cell">{trx.category_name}</Td>
                {!isLedger && <Td className="text-neutral-500 hidden xl:table-cell">{trx.cost_center_name || 'Geral'}</Td>}
                {!isLedger && (
                  <Td numeric className="text-neutral-500 hidden xl:table-cell">
                    {trx.vat_amount ? (
                      <>
                        {formatMoney(Number(trx.vat_amount))}
                        {trx.vat_rate ? <span className="text-2xs text-neutral-400 ml-1">({trx.vat_rate}%)</span> : null}
                      </>
                    ) : (
                      <span className="text-neutral-300">—</span>
                    )}
                  </Td>
                )}
                <Td numeric className={cn('font-semibold', trx.type === 'income' ? 'text-emerald-600' : 'text-neutral-900')}>
                  {!isLedger && (trx.type === 'income' ? '+' : '-')}{formatMoney(moves(trx))}
                  {Number(trx.retention_amount ?? 0) > 0 && (
                    <span
                      className="block text-2xs font-medium text-amber-700"
                      title={`Documento de ${formatMoney(Number(trx.gross_amount ?? trx.amount))}, com ${formatMoney(Number(trx.retention_amount))} de retenção na fonte`}
                    >
                      ret. −{formatMoney(Number(trx.retention_amount))}
                    </span>
                  )}
                </Td>
                {isLedger && (
                  <Td numeric className={cn(isOpen(trx) ? 'font-semibold text-neutral-900' : 'text-neutral-300')}>
                    {isOpen(trx) ? formatMoney(Number(trx.outstanding_amount)) : '—'}
                  </Td>
                )}
                <Td className="hidden sm:table-cell">
                  {trx.payment_status ? (
                    <Badge
                      tone={
                        trx.payment_status === 'paid' ? 'success'
                          : trx.payment_status === 'partially_paid' ? 'warning'
                          : trx.payment_status === 'overdue' ? 'danger'
                          : 'neutral'
                      }
                    >
                      {trx.payment_status === 'paid' ? (trx.type === 'income' ? 'Recebido' : 'Pago')
                        : trx.payment_status === 'partially_paid' ? 'Parcial'
                        : trx.payment_status === 'overdue' ? 'Vencido'
                        : trx.payment_status === 'cancelled' ? 'Anulado'
                        : 'Pendente'}
                    </Badge>
                  ) : (
                    <span className="text-neutral-300">—</span>
                  )}
                </Td>
                <Td className="hidden sm:table-cell"><BankBadge status={trx.bank_status} /></Td>
                {!isLedger && (
                  <Td numeric className={cn(
                    'hidden lg:table-cell',
                    (withRunning.get(trx.id) ?? 0) < 0 ? 'text-rose-600 font-medium' : 'text-neutral-500',
                  )}>
                    {formatMoney(withRunning.get(trx.id) ?? 0)}
                  </Td>
                )}
                {!isLedger && (
                  <Td align="right" className="text-neutral-500 hidden xl:table-cell">
                    {trx.source === 'ai' ? (
                      <span className="flex items-center justify-end gap-1"><Bot className="size-3.5" aria-hidden="true" /> IA</span>
                    ) : (
                      <span className="flex items-center justify-end gap-1"><User className="size-3.5" aria-hidden="true" /> Manual</span>
                    )}
                  </Td>
                )}
              </Tr>
              );
            })}
          </TBody>
        </Table>
      </Card>

    </div>
  );
}
