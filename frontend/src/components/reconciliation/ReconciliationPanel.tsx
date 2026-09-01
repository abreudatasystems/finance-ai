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

import React, { useCallback, useEffect, useState } from 'react';
import {
  Link2, Unlink, EyeOff, Eye, Loader2, Check, AlertCircle, ArrowRight,
  ArrowDownLeft, ArrowUpRight, RefreshCw, Scale,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { BankEntry, MatchSuggestion, ReconciliationOverview } from './types';
import {
  EntryFilter, fetchEntries, fetchOverview, fetchSuggestions, matchEntry, unmatchEntry, ignoreEntry,
} from './api';

const FILTERS: { id: EntryFilter; label: string }[] = [
  { id: 'unmatched', label: 'Por conciliar' },
  { id: 'suggested', label: 'Com sugestão' },
  { id: 'matched', label: 'Conciliados' },
  { id: 'ignored', label: 'Ignorados' },
  { id: 'all', label: 'Tudo' },
];

export const ReconciliationPanel: React.FC = () => {
  const { formatMoney } = useApp();

  const [filter, setFilter] = useState<EntryFilter>('unmatched');
  const [entries, setEntries] = useState<BankEntry[]>([]);
  const [overview, setOverview] = useState<ReconciliationOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const [e, o] = await Promise.all([fetchEntries(filter), fetchOverview()]);
    setEntries(e);
    setOverview(o);
    setLoading(false);
  }, [filter]);

  useEffect(() => { reload(); }, [reload]);

  const openCandidates = async (entry: BankEntry) => {
    if (openEntry === entry.id) { setOpenEntry(null); setSuggestions([]); return; }
    setOpenEntry(entry.id);
    setSuggestions([]);
    setLoadingSuggestions(true);
    setSuggestions(await fetchSuggestions(entry.id));
    setLoadingSuggestions(false);
  };

  const doMatch = async (entry: BankEntry, transactionId: string) => {
    setBusy(entry.id);
    setError(null);
    setNotice(null);
    const res = await matchEntry(entry.id, transactionId);
    setBusy(null);
    if (res.error || !res.data) { setError(res.error || 'Não foi possível conciliar.'); return; }
    setNotice(
      res.data.criou_pagamento
        ? `Conciliado — pagamento criado a partir do extrato. Lançamento agora ${res.data.payment_status}.`
        : `Conciliado com o pagamento já registado. Lançamento ${res.data.payment_status}.`,
    );
    setOpenEntry(null);
    await reload();
  };

  const doUnmatch = async (entry: BankEntry) => {
    const willDelete = entry.payment_source === 'bank';
    if (!window.confirm(willDelete
      ? 'Desfazer a conciliação? O pagamento que nasceu deste movimento é apagado e o lançamento volta a ficar em dívida.'
      : 'Desfazer a conciliação? O pagamento registado à mão mantém-se, apenas deixa de estar ligado ao extrato.')) return;
    setBusy(entry.id);
    setError(null);
    const res = await unmatchEntry(entry.id);
    setBusy(null);
    if (res.error) { setError(res.error); return; }
    setNotice(res.data?.pagamento_removido
      ? 'Conciliação desfeita e pagamento removido.'
      : 'Conciliação desfeita. O pagamento manual mantém-se.');
    await reload();
  };

  const doIgnore = async (entry: BankEntry, ignored: boolean) => {
    setBusy(entry.id);
    setError(null);
    const res = await ignoreEntry(entry.id, ignored);
    setBusy(null);
    if (res.error) { setError(res.error); return; }
    await reload();
  };

  return (
    <div className="space-y-4 text-xs">
      {/* ------------------------------------------------------------ progress */}
      {overview && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Scale className="w-4 h-4 text-indigo-600" /> Conciliação
            </span>
            <span className="font-mono text-slate-500">
              {overview.conciliados}/{overview.movimentos} movimentos · {overview.percentagem}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${overview.percentagem}%` }} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <p className="text-[9px] uppercase font-bold text-slate-400">Por conciliar</p>
              <p className="font-bold text-slate-900">{overview.por_conciliar} · {formatMoney(overview.valor_por_conciliar)}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase font-bold text-slate-400">Pagamentos sem extrato</p>
              <p className="font-bold text-slate-900">
                {overview.pagamentos_sem_extrato} · {formatMoney(overview.valor_pagamentos_sem_extrato)}
              </p>
            </div>
            <div>
              <p className="text-[9px] uppercase font-bold text-slate-400">Ignorados</p>
              <p className="font-bold text-slate-900">{overview.ignorados}</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 flex-wrap">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] transition-colors ${
                  filter === f.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button onClick={reload} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" title="Atualizar">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {notice && <p className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-[11px]">{notice}</p>}
        {error && <p className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-[11px] flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{error}
        </p>}

        {loading ? (
          <p className="py-10 text-center text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> A carregar movimentos…
          </p>
        ) : entries.length === 0 ? (
          <div className="py-12 text-center space-y-1">
            <Check className="w-7 h-7 text-emerald-500 mx-auto" />
            <p className="text-slate-600 font-semibold">
              {filter === 'unmatched' ? 'Não há movimentos por conciliar.' : 'Sem movimentos neste filtro.'}
            </p>
            <p className="text-[11px] text-slate-400">Importe um extrato para trazer os movimentos do banco.</p>
          </div>
        ) : (
          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
            {entries.map((entry) => {
              const isOut = entry.type === 'debit';
              return (
                <div key={entry.id}>
                  <div className="px-3 py-2.5 flex items-center gap-3 hover:bg-slate-50">
                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                      isOut ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
                    }`}>
                      {isOut ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                    </span>

                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{entry.description}</p>
                      <p className="text-[10px] text-slate-500">
                        {entry.date}
                        {entry.transaction && <> · ligado a <b>{entry.transaction.description}</b></>}
                        {entry.status === 'matched' && entry.payment_source === 'bank' && ' · pagamento criado pelo extrato'}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <p className={`font-bold font-mono ${isOut ? 'text-rose-700' : 'text-emerald-700'}`}>
                        {isOut ? '−' : '+'}{formatMoney(Math.abs(entry.amount))}
                      </p>
                      {entry.balance != null && (
                        <p className="text-[9px] text-slate-400 font-mono">saldo {formatMoney(entry.balance)}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {entry.status === 'matched' ? (
                        <button
                          onClick={() => doUnmatch(entry)} disabled={busy === entry.id}
                          className="px-2 py-1.5 rounded-lg border border-slate-200 text-slate-600 font-bold text-[10px] flex items-center gap-1 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {busy === entry.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlink className="w-3 h-3" />} Desfazer
                        </button>
                      ) : entry.status === 'ignored' ? (
                        <button
                          onClick={() => doIgnore(entry, false)} disabled={busy === entry.id}
                          className="px-2 py-1.5 rounded-lg border border-slate-200 text-slate-600 font-bold text-[10px] flex items-center gap-1 hover:bg-slate-50 disabled:opacity-50"
                        >
                          <Eye className="w-3 h-3" /> Repor
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => openCandidates(entry)}
                            className="px-2 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] flex items-center gap-1"
                          >
                            <Link2 className="w-3 h-3" /> {openEntry === entry.id ? 'Fechar' : 'Conciliar'}
                          </button>
                          <button
                            onClick={() => doIgnore(entry, true)} disabled={busy === entry.id}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                            title="Ignorar (comissões, transferências internas)"
                          >
                            <EyeOff className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* ------------------------------------------- candidates */}
                  {openEntry === entry.id && (
                    <div className="px-3 pb-3 bg-slate-50/70 border-t border-slate-100">
                      {loadingSuggestions ? (
                        <p className="py-3 text-slate-400 flex items-center gap-2">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> A procurar correspondências…
                        </p>
                      ) : suggestions.length === 0 ? (
                        <p className="py-3 text-[11px] text-slate-500">
                          Nenhum lançamento em aberto bate certo com este movimento. Lance a despesa ou a receita
                          primeiro, ou ignore o movimento se for uma comissão ou transferência interna.
                        </p>
                      ) : (
                        <div className="pt-3 space-y-2">
                          <p className="text-[10px] uppercase font-bold text-slate-400">
                            Lançamentos em aberto que podem corresponder
                          </p>
                          {suggestions.map((s) => (
                            <div key={s.transaction_id} className="p-2.5 rounded-xl bg-white border border-slate-200 flex flex-wrap items-center gap-2 justify-between">
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-800 truncate">
                                  {s.entity_name} · {s.description}
                                </p>
                                <p className="text-[10px] text-slate-500">
                                  {s.date}{s.due_date ? ` · vence ${s.due_date}` : ''} · {s.category_name}
                                  {' · em aberto '}<b>{formatMoney(s.outstanding)}</b>
                                </p>
                                <p className="text-[10px] text-emerald-700 mt-0.5">{s.porque}</p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[10px] font-bold text-slate-400 font-mono">{s.score}%</span>
                                <button
                                  onClick={() => doMatch(entry, s.transaction_id)} disabled={busy === entry.id}
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] flex items-center gap-1 disabled:opacity-50"
                                >
                                  {busy === entry.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
                                  Conciliar e liquidar
                                </button>
                              </div>
                            </div>
                          ))}
                          <p className="text-[10px] text-slate-400">
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
      </div>
    </div>
  );
};
