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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, Trash2, Loader2, Save, Rows3, AlertCircle, Info, X,
} from 'lucide-react';
import { CatalogueItem, InvoiceLine, LineDraft, RateBreakdown } from './types';
import {
  fetchLines, replaceLines, clearLines, fetchCatalogue, fetchVatRates, LinePayload,
} from './api';
import { ItemPicker } from './ItemPicker';

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
  const [rows, setRows] = useState<LineDraft[]>([]);
  const [saved, setSaved] = useState<InvoiceLine[]>([]);
  const [byRate, setByRate] = useState<RateBreakdown[]>([]);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalogue, setCatalogue] = useState<CatalogueItem[]>([]);
  const [rateTable, setRateTable] = useState<Record<string, number>>({});
  const [loadingCatalogue, setLoadingCatalogue] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchLines(transactionId);
    setSaved(data?.linhas || []);
    setByRate(data?.por_taxa || []);
    setRows((data?.linhas || []).map(toDraft));
    setLoading(false);
  }, [transactionId]);

  useEffect(() => { load(); }, [load]);

  // O catálogo e a tabela de taxas são da empresa, não do documento: carregam
  // uma vez e servem todas as linhas.
  useEffect(() => {
    let alive = true;
    (async () => {
      const [items, rates] = await Promise.all([fetchCatalogue(), fetchVatRates()]);
      if (!alive) return;
      setCatalogue(items);
      setRateTable(rates);
      setLoadingCatalogue(false);
    })();
    return () => { alive = false; };
  }, []);

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
    if (payload.length === 0) { setError('Preencha pelo menos uma linha com descrição.'); return; }

    setBusy(true);
    setError(null);
    const res = await replaceLines(transactionId, payload);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    setEditing(false);
    await load();
    onChanged?.();
  };

  const removeAll = async () => {
    if (!window.confirm('Remover as linhas? O documento volta a ter uma única taxa no cabeçalho e o total deixa de ser recalculado a partir delas.')) return;
    setBusy(true);
    setError(null);
    const res = await clearLines(transactionId);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    setEditing(false);
    await load();
    onChanged?.();
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> A carregar linhas…
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs p-5 space-y-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Rows3 className="w-4 h-4 text-indigo-600" />
          <h3 className="font-bold text-sm text-slate-900">Linhas do documento</h3>
          {saved.length > 0 && (
            <span className="text-[10px] text-slate-400 font-mono">
              {saved.length} linha(s) · {byRate.length} taxa(s)
            </span>
          )}
        </div>
        {!readOnly && (
          <div className="flex items-center gap-1.5">
            {saved.length > 0 && !editing && (
              <button onClick={removeAll} disabled={busy}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 font-bold text-[11px] hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50">
                Remover linhas
              </button>
            )}
            <button
              onClick={() => { setEditing((v) => !v); if (!editing && rows.length === 0) setRows([emptyRow()]); }}
              className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] flex items-center gap-1.5"
            >
              {editing ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {editing ? 'Cancelar' : saved.length ? 'Editar linhas' : 'Detalhar por linhas'}
            </button>
          </div>
        )}
      </div>

      <p className="flex items-start gap-2 px-3 py-2 rounded-xl bg-indigo-50/60 border border-indigo-100 text-indigo-900 text-[11px]">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        Uma fatura pode ter 6%, 13% e 23% ao mesmo tempo. Detalhando por linhas, o total do
        lançamento passa a ser a <b>soma das linhas</b> e o apuramento do IVA lê cada taxa
        separadamente.
      </p>

      {error && (
        <p className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-[11px] flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{error}
        </p>
      )}

      {/* --------------------------------------------------------- editing */}
      {editing ? (
        <div className="space-y-2">
          <div className="hidden sm:grid grid-cols-12 gap-2 px-1 text-[9px] uppercase font-bold text-slate-400">
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
                  <input
                    value={row.description} onChange={(e) => update(index, { description: e.target.value })}
                    placeholder="Ex.: Pão e leite"
                    className="flex-1 min-w-0 px-2.5 py-2 rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
                <input
                  value={row.quantity} onChange={(e) => update(index, { quantity: e.target.value })}
                  inputMode="decimal" placeholder="1"
                  className="col-span-4 sm:col-span-2 px-2.5 py-2 rounded-lg border border-slate-200 font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
                />
                <input
                  value={row.unit_price} onChange={(e) => update(index, { unit_price: e.target.value })}
                  inputMode="decimal" placeholder="0,00"
                  className="col-span-4 sm:col-span-2 px-2.5 py-2 rounded-lg border border-slate-200 font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
                />
                <div className="col-span-3 sm:col-span-2 flex items-center gap-1">
                  <input
                    value={row.vat_rate} onChange={(e) => update(index, { vat_rate: e.target.value })}
                    inputMode="decimal" list="taxas-iva"
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-200 font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
                <button
                  onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                  className="col-span-1 p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 justify-self-end"
                  title="Remover linha"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center justify-between px-1 text-[10px] text-slate-500 font-mono">
                <span>
                  base {formatMoney(preview.lines[index]?.net || 0)} + IVA {formatMoney(preview.lines[index]?.vat || 0)}
                </span>
                <span className="font-bold text-slate-700">{formatMoney(preview.lines[index]?.gross || 0)}</span>
              </div>

              {num(row.vat_rate) === 0 && (
                <input
                  value={row.vat_exemption_reason || ''}
                  onChange={(e) => update(index, { vat_exemption_reason: e.target.value })}
                  placeholder="Motivo da isenção (ex.: art.º 53.º do CIVA)"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50/50 text-[11px] focus:outline-hidden focus:ring-2 focus:ring-amber-100"
                />
              )}
            </div>
          ))}
          <datalist id="taxas-iva">
            {RATES.map((r) => <option key={r} value={r} />)}
          </datalist>

          <button
            onClick={() => setRows((prev) => [...prev, emptyRow()])}
            className="w-full px-3 py-2 rounded-xl border border-dashed border-slate-300 text-slate-600 font-bold text-[11px] hover:bg-slate-50 flex items-center justify-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Acrescentar linha
          </button>

          {/* -------------------------------------------------- live totals */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-1 font-mono text-[11px]">
            {preview.buckets.map(([rate, b]) => (
              <div key={rate} className="flex justify-between text-slate-600">
                <span>IVA {rate}% sobre {formatMoney(b.base)}</span>
                <span>{formatMoney(b.iva)}</span>
              </div>
            ))}
            <div className="flex justify-between pt-1 border-t border-slate-200 text-slate-700">
              <span>Base total</span><span className="font-bold">{formatMoney(preview.net)}</span>
            </div>
            <div className="flex justify-between text-slate-700">
              <span>IVA total</span><span className="font-bold">{formatMoney(preview.vat)}</span>
            </div>
            <div className="flex justify-between text-slate-900">
              <span className="font-bold">Total do documento</span>
              <span className="font-bold">{formatMoney(preview.gross)}</span>
            </div>
          </div>

          <button
            onClick={save} disabled={busy}
            className="w-full px-3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar linhas e recalcular o lançamento
          </button>
        </div>
      ) : saved.length === 0 ? (
        <p className="py-4 text-center text-slate-400 text-[11px]">
          Este lançamento não está detalhado por linhas — usa a taxa única do cabeçalho.
        </p>
      ) : (
        /* ---------------------------------------------------------- saved */
        <div className="space-y-3">
          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
            {saved.map((line) => (
              <div key={line.id} className="px-3 py-2 flex items-center gap-3">
                <span className="text-[10px] font-mono text-slate-300 w-4 shrink-0">{line.line_number}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 truncate">
                    {line.item_code && (
                      <span className="mr-1.5 font-mono text-[10px] text-indigo-600">{line.item_code}</span>
                    )}
                    {line.description}
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono">
                    {line.quantity != null && line.unit_price != null && (
                      <>{line.quantity} × {formatMoney(line.unit_price)} · </>
                    )}
                    base {formatMoney(line.net_amount)} · IVA {line.vat_rate ?? 0}% = {formatMoney(line.vat_amount)}
                  </p>
                  {line.vat_exemption_reason && (
                    <p className="text-[10px] text-amber-700">{line.vat_exemption_reason}</p>
                  )}
                </div>
                <span className="font-bold font-mono text-slate-900 shrink-0">{formatMoney(line.gross_amount)}</span>
              </div>
            ))}
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-1 font-mono text-[11px]">
            <p className="text-[9px] uppercase font-bold text-slate-400 font-sans mb-1">Resumo por taxa</p>
            {byRate.map((b) => (
              <div key={b.vat_rate} className="flex justify-between text-slate-600">
                <span>{b.vat_rate}% · base {formatMoney(b.base_tributavel)}</span>
                <span>IVA {formatMoney(b.iva)}</span>
              </div>
            ))}
            <div className="flex justify-between pt-1 border-t border-slate-200 text-slate-900">
              <span className="font-bold">Total</span>
              <span className="font-bold">{formatMoney(byRate.reduce((s, b) => s + b.total, 0))}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
