'use client';

/**
 * Cobranças.
 *
 * A single "a receber" total hides the only thing that matters: how long the
 * money has been out there. So the composition comes first — one stacked bar,
 * five ordered buckets in one hue ramp from light (not yet due) to dark (over
 * 90 days) — and then the counterparties, worst first.
 *
 * The per-entity table carries a column the product could not show before: how
 * long that counterparty *habitually* takes, learned from its settled history.
 * It is the same number the forecast uses, so the two screens cannot disagree.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, AlertTriangle, ChevronDown, Copy, Check, Mail, Phone,
  HandCoins, Clock, X,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Aging, AgingEntity, BucketKey, CollectionsOverview, ReminderDraft } from './types';
import { draftReminder, fetchCollections } from './api';

/** Light to dark as the debt ages — an ordinal scale, so one hue, five steps. */
const BUCKET_TONE: Record<BucketKey, string> = {
  a_vencer: 'bg-slate-200',
  d1_30: 'bg-amber-200',
  d31_60: 'bg-amber-400',
  d61_90: 'bg-orange-500',
  d90_mais: 'bg-rose-600',
};

const BUCKET_TEXT: Record<BucketKey, string> = {
  a_vencer: 'text-slate-600',
  d1_30: 'text-amber-700',
  d31_60: 'text-amber-800',
  d61_90: 'text-orange-700',
  d90_mais: 'text-rose-700',
};

const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' }) : '—';

/** The composition of what is open, in one bar. */
const AgingBar: React.FC<{ aging: Aging; formatMoney: (n: number) => string }> = ({
  aging, formatMoney,
}) => {
  const total = aging.total || 1;
  const present = aging.escaloes.filter((b) => b.total > 0);

  if (!present.length) {
    return <p className="text-slate-400 text-[11px]">Nada em aberto deste lado.</p>;
  }

  return (
    <div className="space-y-2.5">
      <div className="flex h-4 w-full rounded-full overflow-hidden bg-slate-100">
        {present.map((b) => (
          <div
            key={b.chave}
            className={BUCKET_TONE[b.chave]}
            style={{ width: `${(b.total / total) * 100}%` }}
            title={`${b.label}: ${formatMoney(b.total)} (${b.documentos} doc.)`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {aging.escaloes.map((b) => (
          <div key={b.chave} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${BUCKET_TONE[b.chave]}`} />
            <span className="text-[10px] text-slate-500">{b.label}</span>
            <span className={`text-[11px] font-bold ${b.total > 0 ? BUCKET_TEXT[b.chave] : 'text-slate-300'}`}>
              {formatMoney(b.total)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

/** The chaser, composed but not sent — pressing send stays a person's decision. */
const ReminderDialog: React.FC<{ draft: ReminderDraft; onClose: () => void }> = ({
  draft, onClose,
}) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft.corpo);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const mailto = draft.contacto?.email
    ? `mailto:${draft.contacto.email}?subject=${encodeURIComponent(draft.assunto)}&body=${encodeURIComponent(draft.corpo)}`
    : null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-lg w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between p-4 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-sm text-slate-900">Lembrete para {draft.destinatario}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {draft.documentos} documento(s) · {draft.total.toLocaleString('pt-PT', {
                style: 'currency', currency: 'EUR',
              })}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100" aria-label="Fechar">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-3">
          {(draft.contacto?.email || draft.contacto?.telefone) && (
            <div className="flex flex-wrap gap-3 text-[11px] text-slate-600">
              {draft.contacto.email && (
                <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{draft.contacto.email}</span>
              )}
              {draft.contacto.telefone && (
                <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{draft.contacto.telefone}</span>
              )}
            </div>
          )}
          <p className="text-[11px] font-semibold text-slate-700">{draft.assunto}</p>
          <pre className="whitespace-pre-wrap text-[11px] text-slate-700 bg-slate-50 rounded-xl p-3 border border-slate-100 font-sans">
            {draft.corpo}
          </pre>
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-100">
          <button
            onClick={copy}
            className="px-3 py-1.5 rounded-xl text-[11px] font-bold border border-slate-200 hover:bg-slate-50 flex items-center gap-1.5"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copiado' : 'Copiar texto'}
          </button>
          {mailto && (
            <a
              href={mailto}
              className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-slate-900 text-white hover:bg-slate-800"
            >
              Abrir no email
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

export const CollectionsPanel: React.FC = () => {
  const { formatMoney } = useApp();
  const [data, setData] = useState<CollectionsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [side, setSide] = useState<'income' | 'expense'>('income');
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReminderDraft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setData(await fetchCollections());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const aging: Aging | null = useMemo(
    () => (data ? (side === 'income' ? data.a_receber : data.a_pagar) : null),
    [data, side],
  );

  /** The same identity the backend groups under (collections.key_for). */
  const keyOf = (doc: { entity_id: string | null; entidade: string }) =>
    doc.entity_id || (doc.entidade || '').trim().toLowerCase() || 'sem-entidade';

  const documentsOf = useCallback(
    (entity: AgingEntity) =>
      aging ? aging.documentos.filter((d) => keyOf(d) === entity.chave) : [],
    [aging],
  );

  const chase = async (entity: AgingEntity) => {
    const ids = documentsOf(entity).filter((d) => d.dias_vencido > 0).map((d) => d.id);
    const target = ids.length ? ids : documentsOf(entity).map((d) => d.id);
    if (!target.length) return;

    setBusy(entity.chave);
    setError(null);
    const { data: composed, error: failure } = await draftReminder(
      target, entity.entidade, entity.entity_id,
    );
    setBusy(null);
    if (failure) setError(failure);
    else if (composed) setDraft(composed);
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> A somar o que está em aberto…
      </div>
    );
  }
  if (!data || !aging) return null;

  return (
    <div className="space-y-4 text-xs">
      {/* The sentence first: it says what to do before any number does. */}
      <div className={`rounded-2xl border p-4 flex items-start gap-3 ${
        data.a_receber.vencido > 0
          ? 'bg-amber-50 border-amber-200 text-amber-900'
          : 'bg-emerald-50 border-emerald-200 text-emerald-900'
      }`}>
        {data.a_receber.vencido > 0
          ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          : <Check className="w-4 h-4 shrink-0 mt-0.5" />}
        <p className="font-semibold leading-relaxed">{data.mensagem}</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <HandCoins className="w-4 h-4 text-indigo-600" />
            <h3 className="font-bold text-sm text-slate-900">Antiguidade de saldos</h3>
          </div>
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            {([['income', 'A receber'], ['expense', 'A pagar']] as const).map(([key, label]) => (
              <button
                key={key} onClick={() => { setSide(key); setOpen(null); }}
                className={`px-3 py-1.5 rounded-lg font-bold text-[11px] ${
                  side === key ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
            <p className="text-[9px] uppercase font-bold text-slate-500">Total em aberto</p>
            <p className="font-bold text-slate-900 text-sm mt-0.5">{formatMoney(aging.total)}</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
            <p className="text-[9px] uppercase font-bold text-slate-500">Já vencido</p>
            <p className="font-bold text-rose-700 text-sm mt-0.5">{formatMoney(aging.vencido)}</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
            <p className="text-[9px] uppercase font-bold text-slate-500">Peso do vencido</p>
            <p className="font-bold text-slate-900 text-sm mt-0.5">{aging.peso_vencido}%</p>
          </div>
        </div>

        <AgingBar aging={aging} formatMoney={formatMoney} />
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-800 px-3 py-2 font-semibold">
          {error}
        </div>
      )}

      {/* Worst first: the entity with the most overdue money is the first call. */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-[9px] uppercase text-slate-500 font-bold">
              <tr>
                <th className="px-4 py-2.5">Entidade</th>
                <th className="px-4 py-2.5 text-right">Em aberto</th>
                <th className="px-4 py-2.5 text-right">Vencido</th>
                <th className="px-4 py-2.5 text-right">Mais antigo</th>
                <th className="px-4 py-2.5 text-right">Costuma pagar</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {aging.entidades.map((entity) => {
                const expanded = open === entity.chave;
                return (
                  <React.Fragment key={entity.chave}>
                    <tr className="hover:bg-slate-50/60">
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => setOpen(expanded ? null : entity.chave)}
                          className="flex items-center gap-1.5 font-semibold text-slate-800"
                        >
                          <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                          {entity.entidade}
                          <span className="text-[10px] text-slate-400 font-normal">
                            ({entity.documentos})
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-slate-900">
                        {formatMoney(entity.total)}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-bold ${
                        entity.vencido > 0 ? 'text-rose-700' : 'text-slate-300'
                      }`}>
                        {formatMoney(entity.vencido)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-600">
                        {entity.mais_antigo > 0 ? `${entity.mais_antigo} dias` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {entity.historico >= 2 ? (
                          <span className="inline-flex items-center gap-1 text-slate-600" title={`Média de ${entity.historico} documentos já liquidados`}>
                            <Clock className="w-3 h-3 text-slate-400" />
                            {entity.atraso_medio === 0
                              ? 'a horas'
                              : `+${entity.atraso_medio} dias`}
                          </span>
                        ) : (
                          <span className="text-slate-300" title="Ainda sem histórico suficiente">sem histórico</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {side === 'income' && entity.total > 0 && (
                          <button
                            onClick={() => chase(entity)}
                            disabled={busy === entity.chave}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-bold border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                          >
                            {busy === entity.chave ? 'A preparar…' : 'Lembrete'}
                          </button>
                        )}
                      </td>
                    </tr>

                    {expanded && documentsOf(entity).map((doc) => (
                      <tr key={doc.id} className="bg-slate-50/70 text-[11px]">
                        <td className="px-4 py-2 pl-10 text-slate-600">
                          {doc.documento || doc.descricao}
                        </td>
                        <td className="px-4 py-2 text-right text-slate-700 font-semibold">
                          {formatMoney(doc.em_falta)}
                        </td>
                        <td className="px-4 py-2 text-right text-slate-500">
                          venc. {shortDate(doc.vencimento)}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <span className={BUCKET_TEXT[doc.escalao]}>
                            {doc.dias_vencido > 0 ? `${doc.dias_vencido} dias` : 'a vencer'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right text-slate-500" colSpan={2}>
                          previsto {shortDate(doc.previsao)}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}

              {!aging.entidades.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    Nada em aberto deste lado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {draft && <ReminderDialog draft={draft} onClose={() => setDraft(null)} />}
    </div>
  );
};
