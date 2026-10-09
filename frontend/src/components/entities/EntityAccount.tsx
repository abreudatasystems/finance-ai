'use client';

/**
 * Conta-corrente — one account for a counterparty, both sides of it.
 *
 * Suppliers and customers are one register now, so a company you buy from and
 * also invoice shows a single balance: what we still owe them, what they still
 * owe us, and the difference. Every figure is derived from the documents on
 * the right, which is why they can never drift apart.
 */

import React from 'react';
import {
  Scale, ArrowDownLeft, ArrowUpRight, FileText, Clock,
} from 'lucide-react';
import Link from 'next/link';
import { EntityStatement } from './types';
import { fetchEntityStatement } from './api';
import { Badge, BadgeTone, Card, CardHeader, CardBody, EmptyState, LoadingState, Stat } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useLoad } from '@/lib/use-load';

interface Props {
  entityId: string;
  formatMoney: (n: number) => string;
  /** Show only one side when the page is already about suppliers or customers. */
  focus?: 'all' | 'compras' | 'vendas';
}

const statusTone = (status: string): BadgeTone =>
  status === 'paid' ? 'success'
    : status === 'partially_paid' ? 'warning'
    : status === 'overdue' ? 'danger'
    : 'neutral';

const statusLabel = (status: string) =>
  ({ paid: 'Liquidado', partially_paid: 'Parcial', overdue: 'Vencido', pending: 'Em aberto', cancelled: 'Anulado' } as Record<string, string>)[status] || status;

export const EntityAccount: React.FC<Props> = ({ entityId, formatMoney, focus = 'all' }) => {
  const { data, loading } = useLoad<EntityStatement | null>(() => fetchEntityStatement(entityId), [entityId]);

  if (loading) {
    return (
      <Card>
        <LoadingState label="A carregar conta-corrente…" />
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <EmptyState title="Sem conta-corrente para esta entidade." />
      </Card>
    );
  }

  const e = data.entidade;
  const showBuy = focus !== 'vendas' && (e.is_supplier || e.compras.documentos > 0);
  const showSell = focus !== 'compras' && (e.is_customer || e.vendas.documentos > 0);

  return (
    <Card className="text-xs">
      <CardHeader
        icon={<Scale />}
        title={
          <span className="flex items-center gap-2">
            Conta-corrente <Badge>{e.papel}</Badge>
          </span>
        }
        actions={e.ultimo_movimento ? (
          <span className="text-2xs text-neutral-500 flex items-center gap-1">
            <Clock className="w-3 h-3" aria-hidden="true" /> último movimento {formatDate(e.ultimo_movimento)}
          </span>
        ) : undefined}
      />

      <CardBody className="space-y-3">
        <div className="grid sm:grid-cols-3 gap-3">
          {showBuy && (
            <Stat
              label="Compras"
              icon={<ArrowDownLeft />}
              value={formatMoney(e.compras.faturado)}
              hint={<>pago {formatMoney(e.compras.pago)} · <span className="font-medium text-rose-700">em dívida {formatMoney(e.compras.em_divida)}</span></>}
            />
          )}
          {showSell && (
            <Stat
              label="Vendas"
              icon={<ArrowUpRight />}
              value={formatMoney(e.vendas.faturado)}
              hint={<>recebido {formatMoney(e.vendas.recebido)} · <span className="font-medium text-emerald-700">por receber {formatMoney(e.vendas.por_receber)}</span></>}
            />
          )}
          <Stat
            label="Saldo"
            tone={e.saldo > 0 ? 'negative' : e.saldo < 0 ? 'positive' : 'neutral'}
            value={formatMoney(Math.abs(e.saldo))}
            hint={e.saldo > 0 ? 'a nosso débito — devemos-lhe'
              : e.saldo < 0 ? 'a nosso crédito — devem-nos'
              : 'contas saldadas'}
          />
        </div>

        {data.movimentos.length === 0 ? (
          <EmptyState title="Ainda não há movimentos com esta entidade." className="py-6" />
        ) : (
          <div className="border border-neutral-200 rounded-lg divide-y divide-neutral-100 overflow-hidden max-h-80 overflow-y-auto">
            {data.movimentos.map((m) => (
              <Link
                key={m.id}
                href={`/financial/cash-flow/${m.id}`}
                className="px-3 py-2 flex items-center gap-3 hover:bg-neutral-50"
              >
                <FileText className="w-3.5 h-3.5 text-neutral-300 shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-neutral-800 truncate">
                    {m.document_number ? `${m.document_number} · ` : ''}{m.description}
                  </p>
                  <p className="text-2xs text-neutral-500">
                    {formatDate(m.date)}{m.due_date ? ` · vence ${formatDate(m.due_date)}` : ''}{m.category_name ? ` · ${m.category_name}` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`font-semibold tabular-nums ${m.type === 'income' ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {m.type === 'income' ? '+' : '−'}{formatMoney(m.amount)}
                  </p>
                  {m.outstanding_amount > 0 && (
                    <p className="text-2xs text-neutral-400 tabular-nums">falta {formatMoney(m.outstanding_amount)}</p>
                  )}
                </div>
                <Badge tone={statusTone(m.payment_status)} className="shrink-0">
                  {statusLabel(m.payment_status)}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
};
