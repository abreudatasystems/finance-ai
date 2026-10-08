'use client';

/**
 * Conciliação — matching what the bank says against what the books say.
 *
 * The rule this screen makes visible: a bank line is proof that money moved,
 * so matching one **settles the obligation**. When there is no payment yet,
 * the match creates the one the bank line describes; undoing it removes that
 * payment again. A payment registered by hand is only linked and unlinked.
 *
 * Suggestions come from the server with a reason attached — a score with no
 * explanation is not something anyone should act on.
 */

import React, { useRef, useState } from 'react';
import { useLoad } from '@/lib/use-load';
import {
  Link2, Unlink, EyeOff, Eye, Loader2, Check, ArrowRight,
  ArrowDownLeft, ArrowUpRight, RefreshCw, Scale,
} from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/context/AppContext';
import { BankEntry, MatchSuggestion, ReconciliationOverview } from './types';
import {
  EntryFilter, fetchEntries, fetchOverview, fetchSuggestions, matchEntry, unmatchEntry, ignoreEntry,
} from './api';
import { Button, Card, CardHeader, CardBody, EmptyState, IconButton, LoadingState, useConfirm } from '@/components/ui';
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
  // Só a resposta mais recente escreve no ecrã (o useLoad ignora as antigas):
  // sem isto, trocar depressa de filtro deixava a resposta antiga por baixo do
  // rótulo novo.
  const { data, loading, reload } = useLoad(
    () => Promise.all([fetchEntries(filter), fetchOverview()]),
    [filter],
  );
  const entries: BankEntry[] = data?.[0] ?? NO_ENTRIES;
  const overview: ReconciliationOverview | null = data?.[1] ?? null;
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Sugestões: cada pedido leva um número; só o mais recente escreve.
  const suggestionSeq = useRef(0);

  const openCandidates = async (entry: BankEntry) => {
    if (openEntry === entry.id) { setOpenEntry(null); setSuggestions([]); return; }
    setOpenEntry(entry.id);
    setSuggestions([]);
    setLoadingSuggestions(true);
    const mine = ++suggestionSeq.current;
    const found = await fetchSuggestions(entry.id);
    if (mine !== suggestionSeq.current) return;
    setSuggestions(found);
    setLoadingSuggestions(false);
  };

  const doMatch = async (entry: BankEntry, transactionId: string) => {
    setBusy(entry.id);
    setNotice(null);
    const res = await matchEntry(entry.id, transactionId);
    setBusy(null);
    if (res.error || !res.data) { toast.error(res.error || 'Não foi possível conciliar.'); return; }
    setNotice(
      res.data.criou_pagamento
        ? `Conciliado — pagamento criado a partir do extrato. Lançamento agora ${paymentStatusLabel(res.data.payment_status)}.`
        : `Conciliado com o pagamento já registado. Lançamento ${paymentStatusLabel(res.data.payment_status)}.`,
    );
    setOpenEntry(null);
    await reload();
  };

  const doUnmatch = async (entry: BankEntry) => {
    const willDelete = entry.payment_source === 'bank';
    const ok = await confirm({
      title: 'Desfazer a conciliação?',
      description: willDelete
        ? 'O pagamento que nasceu deste movimento é apagado e o lançamento volta a ficar em dívida.'
        : 'O pagamento registado à mão mantém-se, apenas deixa de estar ligado ao extrato.',
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
    await reload();
  };

  return (
    <div className="space-y-4 text-xs">
      {/* ------------------------------------------------------------ progress */}
      {overview && (
        <Card>
          <CardHeader
            icon={<Scale />}
            title="Conciliação"
            actions={
              <span className="tabular-nums text-neutral-500">
                {overview.conciliados}/{overview.movimentos} movimentos · {overview.percentagem}%
              </span>
            }
          />
          <CardBody className="space-y-3">
            <div
              className="h-2 rounded-full bg-neutral-100 overflow-hidden"
              role="progressbar"
              aria-valuenow={overview.percentagem}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Percentagem conciliada"
            >
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${overview.percentagem}%` }} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <p className="text-2xs uppercase font-bold text-neutral-500">Por conciliar</p>
                <p className="font-bold text-neutral-900 tabular-nums">{overview.por_conciliar} · {formatMoney(overview.valor_por_conciliar)}</p>
              </div>
              <div>
                <p className="text-2xs uppercase font-bold text-neutral-500">Pagamentos sem extrato</p>
                <p className="font-bold text-neutral-900 tabular-nums">
                  {overview.pagamentos_sem_extrato} · {formatMoney(overview.valor_pagamentos_sem_extrato)}
                </p>
              </div>
              <div>
                <p className="text-2xs uppercase font-bold text-neutral-500">Ignorados</p>
                <p className="font-bold text-neutral-900 tabular-nums">{overview.ignorados}</p>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 flex-wrap" role="tablist" aria-label="Filtrar movimentos">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={`px-2.5 py-1.5 rounded-lg font-bold text-2xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    filter === f.id ? 'bg-black text-white' : 'text-neutral-600 hover:bg-neutral-100'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <IconButton label="Atualizar" onClick={reload}>
              <RefreshCw />
            </IconButton>
          </div>

          {notice && (
            <p role="status" className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-2xs">
              {notice}
            </p>
          )}

          {loading ? (
            <LoadingState label="A carregar movimentos…" />
          ) : entries.length === 0 ? (
            <EmptyState
              icon={<Check className="text-emerald-500" />}
              title={filter === 'unmatched' ? 'Não há movimentos por conciliar.' : 'Sem movimentos neste filtro.'}
              description="Importe um extrato para trazer os movimentos do banco."
            />
          ) : (
            <div className="border border-neutral-200 rounded-xl divide-y divide-neutral-100 overflow-hidden">
              {entries.map((entry) => {
                const isOut = entry.type === 'debit';
                return (
                  <div key={entry.id}>
                    <div className="px-3 py-2.5 flex items-center gap-3 hover:bg-neutral-50">
                      <span className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                        isOut ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
                      }`} aria-hidden="true">
                        {isOut ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                      </span>

                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-neutral-800 truncate">{entry.description}</p>
                        <p className="text-2xs text-neutral-500">
                          {formatDate(entry.date)}
                          {entry.transaction && <> · ligado a <b>{entry.transaction.description}</b></>}
                          {entry.status === 'matched' && entry.payment_source === 'bank' && ' · pagamento criado pelo extrato'}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <p className={`font-bold tabular-nums ${isOut ? 'text-rose-700' : 'text-emerald-700'}`}>
                          {isOut ? '−' : '+'}{formatMoney(Math.abs(entry.amount))}
                        </p>
                        {entry.balance != null && (
                          <p className="text-2xs text-neutral-400 tabular-nums">saldo {formatMoney(entry.balance)}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {entry.status === 'matched' ? (
                          <Button
                            variant="secondary" size="sm"
                            onClick={() => doUnmatch(entry)}
                            loading={busy === entry.id}
                            icon={<Unlink />}
                          >
                            Desfazer
                          </Button>
                        ) : entry.status === 'ignored' ? (
                          <Button
                            variant="secondary" size="sm"
                            onClick={() => doIgnore(entry, false)}
                            disabled={busy === entry.id}
                            icon={<Eye />}
                          >
                            Repor
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              onClick={() => openCandidates(entry)}
                              icon={<Link2 />}
                              aria-expanded={openEntry === entry.id}
                            >
                              {openEntry === entry.id ? 'Fechar' : 'Conciliar'}
                            </Button>
                            <IconButton
                              label="Ignorar (comissões, transferências internas)"
                              onClick={() => doIgnore(entry, true)}
                              disabled={busy === entry.id}
                            >
                              <EyeOff />
                            </IconButton>
                          </>
                        )}
                      </div>
                    </div>

                    {/* ------------------------------------------- candidates */}
                    {openEntry === entry.id && (
                      <div className="px-3 pb-3 bg-neutral-50/70 border-t border-neutral-100">
                        {loadingSuggestions ? (
                          <p role="status" className="py-3 text-neutral-500 flex items-center gap-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> A procurar correspondências…
                          </p>
                        ) : suggestions.length === 0 ? (
                          <p className="py-3 text-2xs text-neutral-500">
                            Nenhum lançamento em aberto bate certo com este movimento. Lance a despesa ou a receita
                            primeiro, ou ignore o movimento se for uma comissão ou transferência interna.
                          </p>
                        ) : (
                          <div className="pt-3 space-y-2">
                            <p className="text-2xs uppercase font-bold text-neutral-500">
                              Lançamentos em aberto que podem corresponder
                            </p>
                            {suggestions.map((s) => (
                              <div key={s.transaction_id} className="p-2.5 rounded-xl bg-white border border-neutral-200 flex flex-wrap items-center gap-2 justify-between">
                                <div className="min-w-0">
                                  <p className="font-semibold text-neutral-800 truncate">
                                    {s.entity_name} · {s.description}
                                  </p>
                                  <p className="text-2xs text-neutral-500">
                                    {formatDate(s.date)}{s.due_date ? ` · vence ${formatDate(s.due_date)}` : ''} · {s.category_name}
                                    {' · em aberto '}<b className="tabular-nums">{formatMoney(s.outstanding)}</b>
                                  </p>
                                  <p className="text-2xs text-emerald-700 mt-0.5">{s.porque}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-2xs font-bold text-neutral-500 tabular-nums" title="Confiança da sugestão">{s.score}%</span>
                                  <Button
                                    variant="accent" size="sm"
                                    onClick={() => doMatch(entry, s.transaction_id)}
                                    loading={busy === entry.id}
                                    icon={<ArrowRight />}
                                  >
                                    Conciliar e liquidar
                                  </Button>
                                </div>
                              </div>
                            ))}
                            <p className="text-2xs text-neutral-500">
                              Conciliar regista o pagamento em falta a partir deste movimento — o lançamento passa a
                              pago sem ninguém escrever o valor à mão.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
};
