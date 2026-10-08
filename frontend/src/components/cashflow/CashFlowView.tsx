'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useApp } from '@/context/AppContext';
import { fetchTransactions } from '@/services/data';
import { settleMany } from '@/components/cashflow/api';
import { ForecastPanel } from '@/components/cashflow/ForecastPanel';
import { Transaction } from '@/types';
import { formatDate, documentStatusLabel } from '@/lib/format';
import { Search, CheckCircle2, X, Bot, User } from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge, Button, IconButton, Card, Input, Select, Table, THead, TBody, Th, Tr, Td, TableMessage,
  LoadingState, EmptyState, cn, useConfirm,
} from '@/components/ui';

export interface CashFlowViewProps {
  mode?: 'cash-flow' | 'payables' | 'receivables';
}
export function CashFlowContent({ mode = 'cash-flow' }: CashFlowViewProps) {
  const router = useRouter();
  const { formatMoney, setPageHeader } = useApp();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'income' | 'expense' | 'pending' | 'open'>(mode === 'cash-flow' ? 'all' : 'open');
  const [searchTerm, setSearchTerm] = useState('');
  // A list of every movement ever is unusable after two months. The period is
  // the first thing a cash flow needs.
  // Enquanto se olha para o que está em aberto, o sentido é a pergunta
  // seguinte: pagar e receber são duas listas de trabalho diferentes.
  const [direction, setDirection] = React.useState<'all' | 'expense' | 'income'>(mode === 'payables' ? 'expense' : mode === 'receivables' ? 'income' : 'all');
  const params = useSearchParams();

  // As contas a pagar e a receber encaminham para aqui; um marcador antigo ou
  // um alerta tem de aterrar já no separador e no sentido certos.
  useEffect(() => {
    const tab = params.get('tab');
    const dir = params.get('dir');
    if (tab === 'open') setActiveTab('open');
    if (dir === 'expense' || dir === 'income') setDirection(dir);
  }, [params]);
  const [period, setPeriod] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [settling, setSettling] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const confirm = useConfirm();

  useEffect(() => {
    async function load() {
      const trxs = await fetchTransactions();
      setTransactions(trxs);
      setLoaded(true);
    }
    load();
  }, []);

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

  const filteredTransactions = transactions.filter((t) => {
    const matchesPeriod = period === 'all' || activeTab === 'open' || (t.date || '').startsWith(period);
    const matchesTab =
      activeTab === 'all' ? true :
      activeTab === 'income' ? t.type === 'income' :
      activeTab === 'expense' ? t.type === 'expense' :
      t.status === 'pending_approval' || t.status === 'pending_ai';

    const matchesSearch =
      t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.entity_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.category_name.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesOpen = activeTab !== 'open' || Number(t.outstanding_amount ?? 0) > 0;
    const matchesDirection =
      activeTab !== 'open' || direction === 'all' || t.type === direction;
    return matchesPeriod && matchesTab && matchesSearch && matchesOpen && matchesDirection;
  });

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

  /* Vencido, hoje, próximos sete dias.
     A antiguidade de saldos das Cobranças responde "há quanto tempo"; isto
     responde "o que tenho de tratar esta semana", que é outra pergunta e a
     razão de este separador existir. */
  const buckets = React.useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 7);
    const week = horizon.toISOString().slice(0, 10);

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
    let running = 0;
    const map = new Map<string, number>();
    ordered.forEach((t) => {
      const amount = Number(t.payable_amount ?? t.gross_amount ?? t.amount ?? 0);
      running += t.type === 'income' ? amount : -amount;
      map.set(t.id, running);
    });
    return map;
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
    setTransactions(await fetchTransactions());
  };

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
      <Card className="flex flex-col sm:flex-row items-center justify-between gap-4 p-3">

        {/* Navigation Tabs */}
        {mode === 'cash-flow' && (
        <div
          role="tablist"
          aria-label="Tipo de lançamento"
          className="flex items-center bg-neutral-100 p-1 rounded-xl text-xs font-semibold text-neutral-600 w-full sm:w-auto overflow-x-auto whitespace-nowrap hide-scrollbar"
        >
          {([
            ['all', `Todos os Lançamentos (${transactions.length})`, 'text-neutral-900'],
            ['income', 'Receitas (+ €)', 'text-emerald-600'],
            ['expense', 'Despesas (- €)', 'text-rose-600'],
            ['open', 'Em aberto', 'text-neutral-900'],
          ] as const).map(([key, label, activeTone]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeTab === key}
              onClick={() => setActiveTab(key)}
              className={cn(
                'px-3.5 py-1.5 rounded-lg transition-all flex-shrink-0 cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
                activeTab === key ? cn('bg-white shadow-2xs font-bold', activeTone) : 'hover:text-neutral-900',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        )}

        {/* Period — the first thing a cash flow needs */}
        <Select
          value={period} onChange={(e) => setPeriod(e.target.value)}
          aria-label="Período"
          className="w-full sm:w-auto h-8 text-xs font-semibold"
        >
          {periodOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>

        {/* Filter Input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
          <Input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filtrar por movimento ou fornecedor..."
            aria-label="Filtrar lançamentos"
            className="h-8 pl-8 text-xs"
          />
        </div>

      </Card>

      {/* Em aberto: o sentido e os prazos, que é a lista de trabalho da semana.
          As contas a pagar e a receber viviam em páginas próprias a fazer isto
          pior; agora estão aqui, ao lado de quem as liquida. */}
      {activeTab === 'open' && (
        <div className="space-y-3">
          {mode === 'cash-flow' && (
            <div
              role="group"
              aria-label="Sentido"
              className="flex items-center bg-neutral-100 p-1 rounded-xl w-full sm:w-auto sm:inline-flex"
            >
            {([
              ['all', `Tudo (${buckets.aberto.count})`],
              ['expense', 'A pagar'],
              ['income', 'A receber'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={direction === key}
                onClick={() => setDirection(key)}
                className={cn(
                  'px-3 py-1.5 rounded-lg font-bold text-xs flex-1 sm:flex-none cursor-pointer',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
                  direction === key ? 'bg-white text-neutral-900 shadow-2xs' : 'text-neutral-600 hover:text-neutral-900',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="p-3 rounded-xl border-rose-200">
              <p className="text-2xs uppercase font-bold tracking-wider text-rose-700">Vencido</p>
              <p className="font-bold text-rose-700 text-sm mt-0.5 tabular-nums">{formatMoney(buckets.vencido.total)}</p>
              <p className="text-2xs text-neutral-500">{buckets.vencido.count} documento(s)</p>
            </Card>
            <Card className="p-3 rounded-xl border-amber-200">
              <p className="text-2xs uppercase font-bold tracking-wider text-amber-700">Vence hoje</p>
              <p className="font-bold text-amber-700 text-sm mt-0.5 tabular-nums">{formatMoney(buckets.hoje.total)}</p>
              <p className="text-2xs text-neutral-500">{buckets.hoje.count} documento(s)</p>
            </Card>
            <Card className="p-3 rounded-xl">
              <p className="text-2xs uppercase font-bold tracking-wider text-neutral-500">Próximos 7 dias</p>
              <p className="font-bold text-neutral-900 text-sm mt-0.5 tabular-nums">{formatMoney(buckets.semana.total)}</p>
              <p className="text-2xs text-neutral-500">{buckets.semana.count} documento(s)</p>
            </Card>
            <Card className="p-3 rounded-xl">
              <p className="text-2xs uppercase font-bold tracking-wider text-neutral-500">Total em aberto</p>
              <p className="font-bold text-neutral-900 text-sm mt-0.5 tabular-nums">{formatMoney(buckets.aberto.total)}</p>
              <p className="text-2xs text-neutral-500">
                <Link href="/financial/receivables" className="hover:text-emerald-700 underline-offset-2 hover:underline">
                  ver antiguidade →
                </Link>
              </p>
            </Card>
          </div>
        </div>
      )}

      {/* Totals for what is on screen, and the batch action */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-3 rounded-xl border-emerald-100">
          <p className="text-2xs uppercase font-bold tracking-wider text-emerald-700">Entradas do período</p>
          <p className="font-bold text-emerald-700 text-sm mt-0.5 tabular-nums">{formatMoney(totals.entradas)}</p>
        </Card>
        <Card className="p-3 rounded-xl border-rose-100">
          <p className="text-2xs uppercase font-bold tracking-wider text-rose-700">Saídas do período</p>
          <p className="font-bold text-rose-700 text-sm mt-0.5 tabular-nums">{formatMoney(totals.saidas)}</p>
        </Card>
        <Card className="p-3 rounded-xl">
          <p className="text-2xs uppercase font-bold tracking-wider text-neutral-500">Resultado do período</p>
          <p className={cn(
            'font-bold text-sm mt-0.5 tabular-nums',
            totals.entradas - totals.saidas < 0 ? 'text-rose-700' : 'text-neutral-900',
          )}>
            {formatMoney(totals.entradas - totals.saidas)}
          </p>
        </Card>
        <Card className="p-3 rounded-xl">
          <p className="text-2xs uppercase font-bold tracking-wider text-neutral-500">Ainda em aberto</p>
          <p className="font-bold text-neutral-900 text-sm mt-0.5 tabular-nums">{formatMoney(totals.aberto)}</p>
          {/* Money that never reaches either side: it goes to the State. */}
          {totals.retido > 0 && (
            <p className="text-2xs font-bold text-amber-700 mt-0.5 tabular-nums">
              {formatMoney(totals.retido)} retidos na fonte
            </p>
          )}
        </Card>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl bg-neutral-950 text-white text-xs">
          <span className="font-bold">{selected.size} selecionado(s)</span>
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

      {/* MAIN TRANSACTIONS TABLE */}
      <Card className="overflow-hidden">
        <Table>
          <THead>
            <tr>
              <Th className="w-8"><span className="sr-only">Selecionar</span></Th>
              <Th>Data</Th>
              <Th>Descrição Profissional</Th>
              <Th className="hidden md:table-cell">Entidade (Fornecedor/Cliente)</Th>
              <Th className="hidden lg:table-cell">Categoria (Hierarquia)</Th>
              <Th className="hidden xl:table-cell">Centro Custo</Th>
              <Th numeric className="hidden xl:table-cell">IVA</Th>
              <Th numeric>Valor Total</Th>
              <Th>Status</Th>
              <Th className="hidden sm:table-cell">Pagamento</Th>
              <Th numeric className="hidden lg:table-cell">Saldo acumulado</Th>
              <Th align="right" className="hidden xl:table-cell">Origem</Th>
            </tr>
          </THead>
          <TBody>
            {!loaded ? (
              <TableMessage colSpan={12}><LoadingState /></TableMessage>
            ) : filteredTransactions.length === 0 ? (
              <TableMessage colSpan={12}>
                <EmptyState
                  title="Sem lançamentos"
                  description={
                    transactions.length === 0
                      ? 'Ainda não há movimentos registados.'
                      : 'Nenhum lançamento corresponde ao período, separador ou filtro escolhidos.'
                  }
                />
              </TableMessage>
            ) : filteredTransactions.map((trx) => (
              <Tr
                key={trx.id}
                onClick={() => router.push(`/financial/cash-flow/${trx.id}`)}
                // Abre também com o teclado (Enter), não só com o rato.
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.target === e.currentTarget) router.push(`/financial/cash-flow/${trx.id}`);
                }}
                className="focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 font-medium"
              >
                <Td onClick={(e) => e.stopPropagation()}>
                  {Number(trx.outstanding_amount ?? 0) > 0 ? (
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
                <Td className="text-neutral-500 font-mono tabular-nums whitespace-nowrap">{formatDate(trx.date)}</Td>
                <Td className="font-bold text-neutral-900">{trx.description}</Td>
                <Td className="text-neutral-700 font-medium hidden md:table-cell">{trx.entity_name}</Td>
                <Td className="text-neutral-600 hidden lg:table-cell">{trx.category_name}</Td>
                <Td className="text-neutral-500 hidden xl:table-cell">{trx.cost_center_name || 'Geral'}</Td>
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
                <Td numeric className={cn('font-extrabold', trx.type === 'income' ? 'text-emerald-600' : 'text-neutral-900')}>
                  {trx.type === 'income' ? '+' : '-'}{formatMoney(moves(trx))}
                  {Number(trx.retention_amount ?? 0) > 0 && (
                    <span
                      className="block text-2xs font-bold text-amber-700 normal-case"
                      title={`Documento de ${formatMoney(Number(trx.gross_amount ?? trx.amount))}, com ${formatMoney(Number(trx.retention_amount))} de retenção na fonte`}
                    >
                      ret. −{formatMoney(Number(trx.retention_amount))}
                    </span>
                  )}
                </Td>
                <Td>
                  <Badge
                    tone={trx.status === 'paid' ? 'success' : trx.status === 'approved' ? 'neutral' : 'warning'}
                    className="uppercase"
                  >
                    {documentStatusLabel(trx.status)}
                  </Badge>
                </Td>
                <Td className="hidden sm:table-cell">
                  {trx.payment_status ? (
                    <Badge
                      tone={
                        trx.payment_status === 'paid' ? 'success'
                          : trx.payment_status === 'partially_paid' ? 'warning'
                          : trx.payment_status === 'overdue' ? 'danger'
                          : 'neutral'
                      }
                      className="uppercase"
                    >
                      {trx.payment_status === 'paid' ? 'Pago'
                        : trx.payment_status === 'partially_paid' ? 'Parcial'
                        : trx.payment_status === 'overdue' ? 'Vencido'
                        : 'Pendente'}
                    </Badge>
                  ) : (
                    <span className="text-neutral-300">—</span>
                  )}
                </Td>
                <Td numeric className={cn(
                  'font-mono hidden lg:table-cell',
                  (withRunning.get(trx.id) ?? 0) < 0 ? 'text-rose-600 font-bold' : 'text-neutral-500',
                )}>
                  {formatMoney(withRunning.get(trx.id) ?? 0)}
                </Td>
                <Td align="right" className="text-neutral-500 hidden xl:table-cell">
                  {trx.source === 'ai' ? (
                    <span className="flex items-center justify-end gap-1"><Bot className="w-3.5 h-3.5" aria-hidden="true" /> IA</span>
                  ) : (
                    <span className="flex items-center justify-end gap-1"><User className="w-3.5 h-3.5" aria-hidden="true" /> Manual</span>
                  )}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>

    </div>
  );
}
