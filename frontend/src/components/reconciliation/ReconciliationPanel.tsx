'use client';

/**
 * Conciliação — o extrato do banco e os documentos lado a lado.
 *
 * À esquerda, as linhas do extrato; à direita, para a linha escolhida, o que
 * ela pode ser:
 *
 * - um **pagamento já registado** à mão que o banco ainda não confirmava —
 *   conciliar só o confirma;
 * - um **documento em aberto** (por pagar / por receber) — conciliar regista o
 *   pagamento que a linha descreve e o documento fica liquidado.
 *
 * As sugestões trazem a razão escrita; quando nenhuma serve (pagamento
 * parcial, descrição irreconhecível) pode escolher-se qualquer documento em
 * aberto do mesmo sentido. Comissões e transferências internas ignoram-se.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useLoad } from '@/lib/use-load';
import {
  Link2, Unlink, EyeOff, Eye, Loader2, Check, ArrowDownLeft, ArrowUpRight, RefreshCw, Scale,
  Search, FileText, CircleCheck, Landmark,
} from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/context/AppContext';
import { BankEntry, MatchSuggestion, ReconciliationOverview } from './types';
import {
  EntryFilter, fetchEntries, fetchOverview, fetchSuggestions, matchEntry, unmatchEntry, ignoreEntry,
} from './api';
import {
  Badge, Button, Card, CardHeader, EmptyState, IconButton, Input, LoadingState, Segmented, Stat, cn, useConfirm,
} from '@/components/ui';
import { formatDate } from '@/lib/format';

const FILTERS: { id: EntryFilter; label: string }[] = [
  { id: 'unmatched', label: 'Por conciliar' },
  { id: 'suggested', label: 'Com sugestão' },
  { id: 'matched', label: 'Conciliados' },
  { id: 'ignored', label: 'Ignorados' },
  { id: 'all', label: 'Tudo' },
];

/** Estado de pagamento do lançamento, como vem da API, em português. */
const PAYMENT_STATUS: Record<string, string> = {
  paid: 'liquidado',
  partially_paid: 'parcialmente pago',
  pending: 'em aberto',
  overdue: 'vencido',
  cancelled: 'anulado',
};
const paymentStatusLabel = (s?: string | null) => (s ? PAYMENT_STATUS[s] || s : '—');

const NO_ENTRIES: BankEntry[] = [];

export const ReconciliationPanel: React.FC = () => {
  const { formatMoney } = useApp();
  const confirm = useConfirm();

  const [filter, setFilter] = useState<EntryFilter>('unmatched');
  // Só a resposta mais recente escreve no ecrã (o useLoad ignora as antigas).
  const { data, loading, reload } = useLoad(
    () => Promise.all([fetchEntries(filter), fetchOverview()]),
    [filter],
  );
  const entries: BankEntry[] = data?.[0] ?? NO_ENTRIES;
  const overview: ReconciliationOverview | null = data?.[1] ?? null;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // A linha escolhida, ou a primeira da lista: o lado direito nunca fica vazio sem razão.
  const selected = entries.find((e) => e.id === selectedId) ?? entries[0] ?? null;

  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<MatchSuggestion[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Cada pedido de sugestões leva um número; só o mais recente escreve.
  const seq = useRef(0);
  const selectedKey = selected && selected.status !== 'matched' && selected.status !== 'ignored' ? selected.id : null;
  useEffect(() => {
    if (!selectedKey) return;
    const mine = ++seq.current;
    let cancelled = false;
    // A promessa resolve sempre depois do efeito: o setState fica num callback.
    Promise.resolve().then(() => { if (!cancelled) setLoadingCandidates(true); });
    fetchSuggestions(selectedKey, showAll).then((found) => {
      if (cancelled || mine !== seq.current) return;
      setCandidates(found);
      setLoadingCandidates(false);
    });
    return () => { cancelled = true; };
  }, [selectedKey, showAll]);

  const visibleCandidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) =>
      `${c.entity_name} ${c.description} ${c.document_number || ''}`.toLowerCase().includes(q));
  }, [candidates, query]);

  const choose = (entry: BankEntry) => {
    setSelectedId(entry.id);
    setShowAll(false);
    setQuery('');
    setNotice(null);
  };

  const doMatch = async (entry: BankEntry, c: MatchSuggestion) => {
    setBusy(entry.id);
    setNotice(null);
    const res = await matchEntry(entry.id, c.kind === 'payment' && c.payment_id
      ? { paymentId: c.payment_id }
      : { transactionId: c.transaction_id });
    setBusy(null);
    if (res.error || !res.data) { toast.error(res.error || 'Não foi possível conciliar.'); return; }
    setNotice(
      res.data.criou_pagamento
        ? `Conciliado — pagamento criado a partir do extrato. Documento agora ${paymentStatusLabel(res.data.payment_status)}.`
        : `Conciliado — o pagamento já registado ficou confirmado pelo banco.`,
    );
    setSelectedId(null);
    await reload();
  };

  const doUnmatch = async (entry: BankEntry) => {
    const willDelete = entry.payment_source === 'bank';
    const ok = await confirm({
      title: 'Desfazer a conciliação?',
      description: willDelete
        ? 'O pagamento que nasceu deste movimento é apagado e o documento volta a ficar em dívida.'
        : 'O pagamento registado à mão mantém-se, apenas deixa de estar confirmado pelo extrato.',
      danger: true,
      confirmLabel: 'Desfazer',
    });
    if (!ok) return;
    setBusy(entry.id);
    const res = await unmatchEntry(entry.id);
    setBusy(null);
    if (res.error) { toast.error(res.error); return; }
    setNotice(res.data?.pagamento_removido
      ? 'Conciliação desfeita e pagamento removido.'
      : 'Conciliação desfeita. O pagamento manual mantém-se.');
    await reload();
  };

  const doIgnore = async (entry: BankEntry, ignored: boolean) => {
    setBusy(entry.id);
    const res = await ignoreEntry(entry.id, ignored);
    setBusy(null);
    if (res.error) { toast.error(res.error); return; }
    setSelectedId(null);
    await reload();
  };

  const signed = (entry: BankEntry) =>
    `${entry.type === 'debit' ? '−' : '+'}${formatMoney(Math.abs(entry.amount))}`;

  return (
    <div className="space-y-3 text-xs">
      {/* ------------------------------------------------------------ progresso */}
      {overview && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat
            label="Conciliado"
            value={`${overview.percentagem}%`}
            hint={`${overview.conciliados} de ${overview.movimentos} movimentos do extrato`}
            tone={overview.percentagem === 100 && overview.movimentos > 0 ? 'positive' : 'neutral'}
          />
          <Stat
            label="Movimentos por conciliar"
            value={formatMoney(overview.valor_por_conciliar)}
            hint={`${overview.por_conciliar} movimento(s)`}
            tone={overview.por_conciliar > 0 ? 'warning' : 'neutral'}
          />
          <Stat
            label="Pagamentos sem extrato"
            value={formatMoney(overview.valor_pagamentos_sem_extrato)}
            hint={`${overview.pagamentos_sem_extrato} registados à mão, por confirmar`}
          />
          <Stat label="Ignorados" value={overview.ignorados} hint="comissões, transferências internas" />
        </div>
      )}

      {notice && (
        <p role="status" className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2">
          <Check className="size-3.5 shrink-0" aria-hidden="true" /> {notice}
        </p>
      )}

      <div className="grid lg:grid-cols-2 gap-3 items-start">
        {/* ------------------------------------------------- esquerda: o banco */}
        <Card className="overflow-hidden">
          <CardHeader
            icon={<Landmark />}
            title="Extrato bancário"
            subtitle="O que o banco diz que aconteceu"
            actions={(
              <IconButton label="Atualizar" onClick={reload}>
                <RefreshCw />
              </IconButton>
            )}
          />
          <div className="px-3 py-2 border-b border-neutral-100">
            <Segmented
              aria-label="Filtrar movimentos"
              value={filter}
              onChange={(f) => { setFilter(f); setSelectedId(null); }}
              className="max-w-full overflow-x-auto hide-scrollbar"
              options={FILTERS.map((f) => ({ value: f.id, label: f.label }))}
            />
          </div>

          {loading && !data ? (
            <LoadingState label="A carregar movimentos…" />
          ) : entries.length === 0 ? (
            <EmptyState
              icon={<Check className="text-emerald-500" />}
              title={filter === 'unmatched' ? 'Não há movimentos por conciliar.' : 'Sem movimentos neste filtro.'}
              description={overview?.movimentos ? undefined : 'Importe um extrato (em baixo) para trazer os movimentos do banco.'}
            />
          ) : (
            <ul className="divide-y divide-neutral-100 max-h-[560px] overflow-y-auto" aria-label="Movimentos do extrato">
              {entries.map((entry) => {
                const isOut = entry.type === 'debit';
                const active = selected?.id === entry.id;
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => choose(entry)}
                      aria-pressed={active}
                      className={cn(
                        'w-full text-left px-3 py-2 flex items-center gap-2.5 cursor-pointer transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/60',
                        active ? 'bg-emerald-50/70 shadow-[inset_2px_0_0_0_var(--color-emerald-500)]' : 'hover:bg-neutral-50',
                      )}
                    >
                      <span className={cn(
                        'size-6 rounded-md flex items-center justify-center shrink-0',
                        isOut ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600',
                      )} aria-hidden="true">
                        {isOut ? <ArrowDownLeft className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-medium text-neutral-800 truncate">{entry.description}</span>
                        <span className="block text-2xs text-neutral-500 truncate">
                          {formatDate(entry.date)}
                          {entry.transaction && <> · {entry.transaction.entity_name || entry.transaction.description}</>}
                        </span>
                      </span>
                      <span className="text-right shrink-0">
                        <span className={cn('block font-semibold tabular-nums', isOut ? 'text-rose-700' : 'text-emerald-700')}>
                          {signed(entry)}
                        </span>
                        {entry.status === 'matched' ? (
                          <Badge tone="success">Conciliado</Badge>
                        ) : entry.status === 'ignored' ? (
                          <Badge>Ignorado</Badge>
                        ) : entry.status === 'suggested' ? (
                          <Badge tone="warning">Com sugestão</Badge>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* ------------------------------------------- direita: os documentos */}
        <Card className="overflow-hidden lg:sticky lg:top-20">
          <CardHeader
            icon={<FileText />}
            title="Documento correspondente"
            subtitle="A fatura ou o pagamento que esse movimento liquida"
          />

          {!selected ? (
            <EmptyState
              icon={<Scale />}
              title="Escolha um movimento do extrato"
              description="Ao lado aparecem os documentos que lhe podem corresponder."
            />
          ) : (
            <div className="p-4 space-y-3">
              {/* A linha do banco que se está a conciliar */}
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-2xs text-neutral-500">Movimento de {formatDate(selected.date)}</p>
                  <p className="font-medium text-neutral-900 truncate">{selected.description}</p>
                </div>
                <p className={cn('text-sm font-semibold tabular-nums shrink-0', selected.type === 'debit' ? 'text-rose-700' : 'text-emerald-700')}>
                  {signed(selected)}
                </p>
              </div>

              {selected.status === 'matched' ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 flex items-start gap-2">
                    <CircleCheck className="size-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="font-medium text-neutral-900">
                        {selected.transaction?.entity_name} · {selected.transaction?.description}
                      </p>
                      <p className="text-2xs text-neutral-600">
                        Documento {paymentStatusLabel(selected.transaction?.payment_status)}
                        {selected.payment_source === 'bank' ? ' · pagamento criado pelo extrato' : ' · pagamento registado à mão, confirmado'}
                      </p>
                      {selected.transaction && (
                        <Link href={`/financial/cash-flow/${selected.transaction.id}`} className="text-2xs font-medium text-emerald-700 hover:underline">
                          Abrir documento →
                        </Link>
                      )}
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => doUnmatch(selected)} loading={busy === selected.id} icon={<Unlink />}>
                    Desfazer conciliação
                  </Button>
                </div>
              ) : selected.status === 'ignored' ? (
                <div className="space-y-3">
                  <p className="text-neutral-600">Este movimento foi posto de parte (comissão, transferência interna…).</p>
                  <Button variant="secondary" size="sm" onClick={() => doIgnore(selected, false)} disabled={busy === selected.id} icon={<Eye />}>
                    Repor para conciliar
                  </Button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-neutral-700">
                      {showAll ? 'Todos os documentos em aberto' : 'Sugestões'}
                    </p>
                    <Segmented
                      aria-label="Que documentos mostrar"
                      value={showAll ? 'all' : 'best'}
                      onChange={(v) => { setShowAll(v === 'all'); setQuery(''); }}
                      options={[
                        { value: 'best', label: 'Sugestões' },
                        { value: 'all', label: 'Procurar outro' },
                      ]}
                    />
                  </div>

                  {showAll && (
                    <div className="relative">
                      <Search className="size-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                      <Input
                        type="search"
                        aria-label="Procurar documento"
                        placeholder="Procurar por entidade, descrição ou número"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="pl-8"
                      />
                    </div>
                  )}

                  {loadingCandidates ? (
                    <p role="status" className="py-3 text-neutral-500 flex items-center gap-2">
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> A procurar correspondências…
                    </p>
                  ) : visibleCandidates.length === 0 ? (
                    <p className="py-2 text-neutral-500">
                      {showAll
                        ? `Não há ${selected.type === 'debit' ? 'despesas' : 'receitas'} em aberto${query ? ' com essa pesquisa' : ''}.`
                        : 'Nenhum documento bate certo ao cêntimo. Use «Procurar outro» para um pagamento parcial, ou ignore o movimento se for uma comissão ou transferência interna.'}
                    </p>
                  ) : (
                    <ul className="space-y-2 max-h-[420px] overflow-y-auto">
                      {visibleCandidates.map((c) => (
                        <li
                          key={`${c.kind}-${c.payment_id || c.transaction_id}`}
                          className="px-3 py-2 rounded-lg border border-neutral-200 bg-white flex flex-wrap items-center gap-2 justify-between"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-neutral-900 truncate">
                              {c.entity_name} · {c.description}
                            </p>
                            <p className="text-2xs text-neutral-500">
                              {c.kind === 'payment'
                                ? <>pago a {formatDate(c.payment_date || c.date)} · {formatMoney(c.amount)}</>
                                : <>{c.due_date ? `vence ${formatDate(c.due_date)}` : formatDate(c.date)} · em aberto <b className="font-semibold tabular-nums">{formatMoney(c.outstanding)}</b></>}
                              {c.document_number ? ` · ${c.document_number}` : ''}
                            </p>
                            <p className={cn('text-2xs mt-0.5', c.score > 0 ? 'text-emerald-700' : 'text-neutral-500')}>{c.porque}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {c.score > 0 && (
                              <span className="text-2xs font-medium text-neutral-500 tabular-nums" title="Confiança da sugestão">{c.score}%</span>
                            )}
                            <Button
                              variant="accent" size="sm"
                              onClick={() => doMatch(selected, c)}
                              loading={busy === selected.id}
                              icon={<Link2 />}
                            >
                              {c.kind === 'payment' ? 'Confirmar' : 'Conciliar'}
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="pt-2 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-2xs text-neutral-500 max-w-sm">
                      Conciliar um documento em aberto regista o pagamento a partir do extrato; confirmar um
                      pagamento já registado só o liga ao banco.
                    </p>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => doIgnore(selected, true)}
                      disabled={busy === selected.id}
                      icon={<EyeOff />}
                    >
                      Ignorar movimento
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
