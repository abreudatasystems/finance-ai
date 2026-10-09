'use client';

/**
 * Linhas do documento — what makes a mixed-VAT invoice bookable as one thing.
 *
 * A Portuguese invoice regularly carries 6%, 13% and 23% on the same paper.
 * Each line here has its own base and rate; the document's totals are the sum
 * of the lines and are written by the server, never typed beside them — which
 * is what stops a document from disagreeing with itself.
 *
 * Adding lines takes over the header totals. Removing them all hands the
 * header back its own single rate.
 */

import React, { useMemo, useState } from 'react';
import {
  Plus, Trash2, Save, Rows3, Info, X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Button, IconButton, Card, CardHeader, CardBody, EmptyState, Input, LoadingState, cn, useConfirm,
} from '@/components/ui';
import { CatalogueItem, InvoiceLine, LineDraft, RateBreakdown } from './types';
import {
  fetchLines, replaceLines, clearLines, fetchCatalogue, fetchVatRates, LinePayload,
} from './api';
import { ItemPicker } from './ItemPicker';
import { useLoad } from '@/lib/use-load';

const NO_LINES: InvoiceLine[] = [];
const NO_RATES: RateBreakdown[] = [];
const NO_ITEMS: CatalogueItem[] = [];
const NO_RATE_TABLE: Record<string, number> = {};

interface Props {
  transactionId: string;
  formatMoney: (n: number) => string;
  /** Called after a save or a clear, so the page can refresh the header. */
  onChanged?: () => void;
  readOnly?: boolean;
}

/** Portuguese mainland rates; the field stays free for the rest. */
const RATES = ['23', '13', '6', '0'];

const num = (value: string) => {
  const parsed = parseFloat((value || '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

const emptyRow = (): LineDraft => ({ description: '', quantity: '1', unit_price: '', vat_rate: '23' });

const toDraft = (line: InvoiceLine): LineDraft => ({
  description: line.description,
  item_id: line.item_id ?? null,
  item_code: line.item_code ?? null,
  quantity: line.quantity != null ? String(line.quantity) : '1',
  // A line typed as a base has no unit price; show the base as the price of one.
  unit_price: line.unit_price != null ? String(line.unit_price) : String(line.net_amount),
  vat_rate: line.vat_rate != null ? String(line.vat_rate) : '0',
  vat_exemption_reason: line.vat_exemption_reason || undefined,
});

export const InvoiceLinesEditor: React.FC<Props> = ({
  transactionId, formatMoney, onChanged, readOnly = false,
}) => {
  // As linhas editáveis partem das gravadas: postas no formulário quando a
  // leitura chega (e de novo depois de gravar ou limpar).
  const [rows, setRows] = useState<LineDraft[]>([]);
  const { data, loading, reload: load } = useLoad(
    () => fetchLines(transactionId),
    [transactionId],
    { onSuccess: (d) => setRows((d?.linhas || []).map(toDraft)) },
  );
  const saved: InvoiceLine[] = data?.linhas || NO_LINES;
  const byRate: RateBreakdown[] = data?.por_taxa || NO_RATES;
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();

  // O catálogo e a tabela de taxas são da empresa, não do documento: carregam
  // uma vez e servem todas as linhas.
  const { data: companyData, loading: loadingCatalogue } = useLoad(
    () => Promise.all([fetchCatalogue(), fetchVatRates()]),
    [],
  );
  const catalogue: CatalogueItem[] = companyData?.[0] ?? NO_ITEMS;
  const rateTable: Record<string, number> = companyData?.[1] ?? NO_RATE_TABLE;

  /** Live arithmetic while typing — the same rule the server applies. */
  const preview = useMemo(() => {
    const lines = rows.map((r) => {
      const net = round2(num(r.quantity) * num(r.unit_price));
      const rate = num(r.vat_rate);
      const vat = round2((net * rate) / 100);
      return { net, rate, vat, gross: round2(net + vat) };
    });
    const buckets = new Map<number, { base: number; iva: number }>();
    lines.forEach((l) => {
      const b = buckets.get(l.rate) || { base: 0, iva: 0 };
      buckets.set(l.rate, { base: round2(b.base + l.net), iva: round2(b.iva + l.vat) });
    });
    return {
      lines,
      net: round2(lines.reduce((s, l) => s + l.net, 0)),
      vat: round2(lines.reduce((s, l) => s + l.vat, 0)),
      gross: round2(lines.reduce((s, l) => s + l.gross, 0)),
      buckets: [...buckets.entries()].sort((a, b) => b[0] - a[0]),
    };
  }, [rows]);

  const update = (index: number, patch: Partial<LineDraft>) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  /**
   * O artigo escolhido preenche a linha.
   *
   * Um preço gravado com IVA incluído volta à base, porque a linha soma o IVA
   * a seguir — mantê-lo incluído facturaria a taxa duas vezes. É a mesma conta
   * que o servidor faz ao gravar, e é por isso que a pré-visualização bate
   * certo com o que fica na base de dados.
   */
  const pickItem = (index: number, item: CatalogueItem) => {
    const rate = item.vat_rate ? rateTable[item.vat_rate.trim().toLowerCase()] : undefined;
    let price = item.price_1 || 0;
    if (item.price_includes_vat && rate) price = round2(price / (1 + rate / 100));
    update(index, {
      item_id: item.id,
      item_code: item.code,
      description: rows[index]?.description?.trim() || item.description,
      unit_price: price ? String(price) : '',
      vat_rate: rate != null ? String(rate) : rows[index]?.vat_rate || '',
    });
  };

  const save = async () => {
    const payload: LinePayload[] = rows
      .filter((r) => r.description.trim())
      .map((r) => ({
        description: r.description.trim(),
        item_id: r.item_id || undefined,
        quantity: num(r.quantity),
        unit_price: num(r.unit_price),
        vat_rate: num(r.vat_rate),
        vat_exemption_reason: num(r.vat_rate) === 0 ? r.vat_exemption_reason : undefined,
      }));
    if (payload.length === 0) { toast.error('Preencha pelo menos uma linha com descrição.'); return; }

    setBusy(true);
    const res = await replaceLines(transactionId, payload);
    setBusy(false);
    if (res.error) { toast.error(res.error); return; }
    setEditing(false);
    await load();
    onChanged?.();
  };

  const removeAll = async () => {
    if (!(await confirm({
      title: 'Remover as linhas?',
      description: 'O documento volta a ter uma única taxa no cabeçalho e o total deixa de ser recalculado a partir delas.',
      danger: true,
      confirmLabel: 'Remover linhas',
    }))) return;
    setBusy(true);
    const res = await clearLines(transactionId);
    setBusy(false);
    if (res.error) { toast.error(res.error); return; }
    setEditing(false);
    await load();
    onChanged?.();
  };

  if (loading) {
    return (
      <Card>
        <LoadingState label="A carregar linhas…" />
      </Card>
    );
  }

  const cell = 'font-mono tabular-nums';

  return (
    <Card className="text-xs">
      <CardHeader
        icon={<Rows3 />}
        title="Linhas do documento"
        subtitle={saved.length > 0 ? `${saved.length} linha(s) · ${byRate.length} taxa(s)` : undefined}
        className="flex-wrap"
        actions={!readOnly ? (
          <>
            {saved.length > 0 && !editing && (
              <Button variant="secondary" size="sm" onClick={removeAll} disabled={busy}>
                Remover linhas
              </Button>
            )}
            <Button
              variant={editing ? 'secondary' : 'primary'}
              size="sm"
              icon={editing ? <X /> : <Plus />}
              onClick={() => { setEditing((v) => !v); if (!editing && rows.length === 0) setRows([emptyRow()]); }}
            >
              {editing ? 'Cancelar' : saved.length ? 'Editar linhas' : 'Detalhar por linhas'}
            </Button>
          </>
        ) : undefined}
      />

      <CardBody className="space-y-3">
        <p className="flex items-start gap-2 px-3 py-2 rounded-lg bg-sky-50 border border-sky-200 text-sky-900 text-xs">
          <Info className="size-3.5 shrink-0 mt-0.5 text-sky-600" aria-hidden="true" />
          <span>
            Uma fatura pode ter 6%, 13% e 23% ao mesmo tempo. Ao detalhar por linhas, o total do
            lançamento passa a ser a <b>soma das linhas</b> e o apuramento do IVA lê cada taxa
            separadamente.
          </span>
        </p>

        {/* --------------------------------------------------------- editing */}
        {editing ? (
          <div className="space-y-2">
            <div className="hidden sm:grid grid-cols-12 gap-2 px-1 text-2xs font-medium text-neutral-500" aria-hidden="true">
              <span className="col-span-5">Artigo e descrição</span>
              <span className="col-span-2">Qtd.</span>
              <span className="col-span-2">Preço unit.</span>
              <span className="col-span-2">IVA %</span>
              <span className="col-span-1" />
            </div>

            {rows.map((row, index) => (
              <div key={index} className="space-y-1">
                <div className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-12 sm:col-span-5 flex items-center gap-2">
                    <ItemPicker
                      items={catalogue}
                      loading={loadingCatalogue}
                      selectedId={row.item_id}
                      onPick={(item) => pickItem(index, item)}
                      onClear={() => update(index, { item_id: null, item_code: null })}
                      formatMoney={formatMoney}
                    />
                    <Input
                      value={row.description} onChange={(e) => update(index, { description: e.target.value })}
                      placeholder="Ex.: Pão e leite"
                      aria-label={`Descrição da linha ${index + 1}`}
                      className="flex-1 min-w-0"
                    />
                  </div>
                  <Input
                    value={row.quantity} onChange={(e) => update(index, { quantity: e.target.value })}
                    inputMode="decimal" placeholder="1"
                    aria-label={`Quantidade da linha ${index + 1}`}
                    className={cn(cell, 'col-span-4 sm:col-span-2')}
                  />
                  <Input
                    value={row.unit_price} onChange={(e) => update(index, { unit_price: e.target.value })}
                    inputMode="decimal" placeholder="0,00"
                    aria-label={`Preço unitário da linha ${index + 1}`}
                    className={cn(cell, 'col-span-4 sm:col-span-2')}
                  />
                  <div className="col-span-3 sm:col-span-2 flex items-center gap-1">
                    <Input
                      value={row.vat_rate} onChange={(e) => update(index, { vat_rate: e.target.value })}
                      inputMode="decimal" list="taxas-iva"
                      aria-label={`Taxa de IVA da linha ${index + 1} (%)`}
                      className={cell}
                    />
                  </div>
                  <IconButton
                    label="Remover linha"
                    variant="danger"
                    onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                    className="col-span-1 justify-self-end"
                  >
                    <Trash2 />
                  </IconButton>
                </div>

                <div className="flex items-center justify-between px-1 text-2xs text-neutral-500 font-mono tabular-nums">
                  <span>
                    base {formatMoney(preview.lines[index]?.net || 0)} + IVA {formatMoney(preview.lines[index]?.vat || 0)}
                  </span>
                  <span className="font-semibold text-neutral-700">{formatMoney(preview.lines[index]?.gross || 0)}</span>
                </div>

                {num(row.vat_rate) === 0 && (
                  <Input
                    value={row.vat_exemption_reason || ''}
                    onChange={(e) => update(index, { vat_exemption_reason: e.target.value })}
                    placeholder="Motivo da isenção (ex.: art.º 53.º do CIVA)"
                    aria-label={`Motivo da isenção de IVA da linha ${index + 1}`}
                    className="text-xs border-amber-200 bg-amber-50/50 focus:border-amber-400 focus:ring-amber-100"
                  />
                )}
              </div>
            ))}
            <datalist id="taxas-iva">
              {RATES.map((r) => <option key={r} value={r} />)}
            </datalist>

            <Button
              variant="secondary"
              size="sm"
              icon={<Plus />}
              onClick={() => setRows((prev) => [...prev, emptyRow()])}
              className="w-full border-dashed"
            >
              Acrescentar linha
            </Button>

            {/* -------------------------------------------------- live totals */}
            <div className="rounded-lg bg-neutral-50 border border-neutral-200 px-3 py-2 space-y-1 font-mono tabular-nums text-xs">
              {preview.buckets.map(([rate, b]) => (
                <div key={rate} className="flex justify-between text-neutral-600">
                  <span>IVA {rate}% sobre {formatMoney(b.base)}</span>
                  <span>{formatMoney(b.iva)}</span>
                </div>
              ))}
              <div className="flex justify-between pt-1 border-t border-neutral-200 text-neutral-700">
                <span>Base total</span><span className="font-semibold">{formatMoney(preview.net)}</span>
              </div>
              <div className="flex justify-between text-neutral-700">
                <span>IVA total</span><span className="font-semibold">{formatMoney(preview.vat)}</span>
              </div>
              <div className="flex justify-between text-neutral-900">
                <span className="font-semibold">Total do documento</span>
                <span className="font-semibold">{formatMoney(preview.gross)}</span>
              </div>
            </div>

            <Button onClick={save} loading={busy} icon={<Save />} className="w-full">
              Guardar linhas e recalcular o lançamento
            </Button>
          </div>
        ) : saved.length === 0 ? (
          <EmptyState
            icon={<Rows3 />}
            title="Sem linhas"
            description="Este lançamento não está detalhado por linhas — usa a taxa única do cabeçalho."
            className="py-6"
          />
        ) : (
          /* ---------------------------------------------------------- saved */
          <div className="space-y-3">
            <div className="border border-neutral-200 rounded-lg divide-y divide-neutral-100 overflow-hidden">
              {saved.map((line) => (
                <div key={line.id} className="px-3 py-2 flex items-center gap-3">
                  <span className="text-2xs font-mono text-neutral-400 w-4 shrink-0">{line.line_number}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-neutral-800 truncate">
                      {line.item_code && (
                        <span className="mr-1.5 font-mono text-2xs text-emerald-700">{line.item_code}</span>
                      )}
                      {line.description}
                    </p>
                    <p className="text-2xs text-neutral-500 font-mono tabular-nums">
                      {line.quantity != null && line.unit_price != null && (
                        <>{line.quantity} × {formatMoney(line.unit_price)} · </>
                      )}
                      base {formatMoney(line.net_amount)} · IVA {line.vat_rate ?? 0}% = {formatMoney(line.vat_amount)}
                    </p>
                    {line.vat_exemption_reason && (
                      <p className="text-2xs text-amber-700">{line.vat_exemption_reason}</p>
                    )}
                  </div>
                  <span className="font-semibold font-mono tabular-nums text-neutral-900 shrink-0">{formatMoney(line.gross_amount)}</span>
                </div>
              ))}
            </div>

            <div className="rounded-lg bg-neutral-50 border border-neutral-200 px-3 py-2 space-y-1 font-mono tabular-nums text-xs">
              <p className="text-xs font-medium text-neutral-500 font-sans mb-1">Resumo por taxa</p>
              {byRate.map((b) => (
                <div key={b.vat_rate} className="flex justify-between text-neutral-600">
                  <span>{b.vat_rate}% · base {formatMoney(b.base_tributavel)}</span>
                  <span>IVA {formatMoney(b.iva)}</span>
                </div>
              ))}
              <div className="flex justify-between pt-1 border-t border-neutral-200 text-neutral-900">
                <span className="font-semibold">Total</span>
                <span className="font-semibold">{formatMoney(byRate.reduce((s, b) => s + b.total, 0))}</span>
              </div>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
};
