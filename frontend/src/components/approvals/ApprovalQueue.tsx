'use client';

/**
 * The queue: everything the AI read and nobody has decided on yet.
 *
 * Selection drives the batch bar — approving twenty utility bills one by one is
 * the reason people stop using a tool like this. Items below the confidence
 * threshold are marked, and opening one leads to the inspector, where the
 * document and the numbers sit side by side.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Inbox, Sparkles, AlertTriangle, Check, X, RefreshCw, ChevronRight, Mail, Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/context/AppContext';
import { ApprovalDetail, ApprovalRow, ApprovalSummary } from './types';
import { QueueFilter, fetchApproval, fetchQueue, fetchSummary, decideMany } from './api';
import { ApprovalInspector } from './ApprovalInspector';
import { Badge, Button, Card, CardBody, EmptyState, IconButton, LoadingState, useConfirm } from '@/components/ui';
import { formatDate } from '@/lib/format';

const FILTERS: { id: QueueFilter; label: string }[] = [
  { id: 'pending', label: 'Por aprovar' },
  { id: 'approved', label: 'Aprovados' },
  { id: 'rejected', label: 'Rejeitados' },
  { id: 'all', label: 'Tudo' },
];

const channelIcon = (channel?: string | null) =>
  channel === 'email'
    ? <Mail className="w-3 h-3" aria-label="Recebido por email" />
    : <Upload className="w-3 h-3" aria-label="Carregado à mão" />;

export const ApprovalQueue: React.FC = () => {
  const { formatMoney } = useApp();
  const confirm = useConfirm();

  const [filter, setFilter] = useState<QueueFilter>('pending');
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [summary, setSummary] = useState<ApprovalSummary | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApprovalDetail | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const [q, s] = await Promise.all([fetchQueue(filter), fetchSummary()]);
    setRows(q);
    setSummary(s);
    setSelected(new Set());
    setLoading(false);
  }, [filter]);

  useEffect(() => { reload(); }, [reload]);

  const open = async (id: string) => {
    const d = await fetchApproval(id);
    if (!d) { toast.error('Não foi possível abrir este item.'); return; }
    setDetail(d);
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  };

  const runBatch = async (action: 'approved' | 'rejected') => {
    if (selected.size === 0) return;
    if (action === 'rejected' && !(await confirm({
      title: `Rejeitar ${selected.size} documento(s)?`,
      description: 'Os documentos rejeitados não criam obrigações a pagar.',
      danger: true,
      confirmLabel: 'Rejeitar',
    }))) return;
    setBusy(true);
    setNotice(null);
    const res = await decideMany([...selected], action);
    setBusy(false);
    if (res.error || !res.data) { toast.error(res.error || 'Falhou.'); return; }
    const { decididos, falhados, erros } = res.data;
    setNotice(
      falhados
        ? `${decididos} processado(s), ${falhados} falhado(s): ${erros.map((e) => e.detail).join('; ')}`
        : `${decididos} documento(s) ${action === 'approved' ? 'aprovados — obrigações criadas' : 'rejeitados'}.`,
    );
    await reload();
  };

  if (detail) {
    return (
      <ApprovalInspector
        detail={detail}
        formatMoney={formatMoney}
        onClose={() => setDetail(null)}
        onDone={async () => { setDetail(null); setNotice('Decisão registada.'); await reload(); }}
      />
    );
  }

  return (
    <div className="space-y-4 text-xs">
      {/* ----------------------------------------------------------- counters */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-3">
            <p className="text-2xs uppercase font-bold text-neutral-500">Por aprovar</p>
            <p className="font-bold text-neutral-900 text-base tabular-nums">{summary.pendentes}</p>
          </Card>
          <Card className="p-3">
            <p className="text-2xs uppercase font-bold text-neutral-500">Valor em espera</p>
            <p className="font-bold text-neutral-900 text-base tabular-nums">{formatMoney(summary.valor_pendente)}</p>
          </Card>
          <Card className="p-3 border-amber-200">
            <p className="text-2xs uppercase font-bold text-amber-600">A precisar de revisão</p>
            <p className="font-bold text-amber-700 text-base tabular-nums">{summary.por_rever}</p>
          </Card>
          <Card className="p-3">
            <p className="text-2xs uppercase font-bold text-neutral-500">Já decididos</p>
            <p className="font-bold text-neutral-900 text-base tabular-nums">{summary.aprovados + summary.rejeitados}</p>
          </Card>
        </div>
      )}

      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1" role="tablist" aria-label="Filtrar aprovações">
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

          {/* -------------------------------------------------------- batch bar */}
          {filter === 'pending' && rows.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200">
              <label className="flex items-center gap-2 font-semibold text-neutral-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.size === rows.length && rows.length > 0}
                  onChange={toggleAll}
                  className="rounded accent-emerald-600"
                />
                {selected.size > 0 ? `${selected.size} selecionado(s)` : 'Selecionar tudo'}
              </label>
              {selected.size > 0 && (
                <div className="flex items-center gap-1.5 ml-auto">
                  <Button variant="accent" size="sm" onClick={() => runBatch('approved')} loading={busy} icon={<Check />}>
                    Aprovar selecionados
                  </Button>
                  <Button
                    variant="secondary" size="sm" onClick={() => runBatch('rejected')} disabled={busy} icon={<X />}
                    className="hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200"
                  >
                    Rejeitar
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ------------------------------------------------------------ rows */}
          {loading ? (
            <LoadingState />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<Inbox />}
              title={filter === 'pending' ? 'Nada por aprovar.' : 'Sem registos neste filtro.'}
              description="Os documentos enviados para a caixa de entrada aparecem aqui depois de a IA os ler."
            />
          ) : (
            <div className="divide-y divide-neutral-100 border border-neutral-200 rounded-xl overflow-hidden">
              {rows.map((r) => (
                <div key={r.id} className="px-3 py-2.5 flex items-center gap-3 hover:bg-neutral-50">
                  {filter === 'pending' && (
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      className="rounded shrink-0 accent-emerald-600"
                      aria-label={`Selecionar ${r.supplier_name}`}
                    />
                  )}

                  <button
                    type="button"
                    onClick={() => open(r.id)}
                    className="flex-1 min-w-0 text-left cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-neutral-900 truncate">{r.supplier_name}</span>
                      <span className="text-2xs text-neutral-500 font-mono">{r.document_number || r.document_name}</span>
                      {r.needs_attention && r.status === 'pending' && (
                        <Badge tone="warning">
                          <AlertTriangle className="w-3 h-3" aria-hidden="true" /> Rever
                        </Badge>
                      )}
                      {r.status !== 'pending' && (
                        <Badge tone={r.status === 'rejected' ? 'danger' : 'success'}>
                          {r.status === 'rejected' ? 'Rejeitado' : r.status === 'edited' ? 'Aprovado c/ correções' : 'Aprovado'}
                        </Badge>
                      )}
                    </div>
                    <p className="text-2xs text-neutral-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      {channelIcon(r.channel)} {formatDate(r.date)}
                      {r.due_date && <> · vence {formatDate(r.due_date)}</>}
                      {' · '}{r.suggested_category}
                      {r.decided_by && <> · decidido por {r.decided_by}</>}
                    </p>
                  </button>

                  <div className="text-right shrink-0">
                    <p className="font-bold text-neutral-900 tabular-nums">{formatMoney(r.amount)}</p>
                    <p className="text-2xs text-neutral-500 flex items-center justify-end gap-1" title="Confiança da IA">
                      <Sparkles className="w-3 h-3" aria-hidden="true" /> {r.ai_confidence}%
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-neutral-300 shrink-0" aria-hidden="true" />
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
};
