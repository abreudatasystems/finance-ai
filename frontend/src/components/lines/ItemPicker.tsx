'use client';

/**
 * Escolher um artigo do catálogo para uma linha de documento.
 *
 * O catálogo propõe, a linha decide. Escolher aqui preenche o descritivo, o
 * preço e a taxa — e a partir daí tudo continua editável, porque uma fatura
 * regularmente diz algo diferente do catálogo: um desconto, uma quantidade
 * fora do normal, uma taxa que mudou. O que fica gravado na linha é o que
 * ficou escrito, não o que o artigo diz hoje.
 *
 * O artigo escolhido fica registado na linha para se saber de onde ela veio —
 * é o que permite mais tarde perguntar quanto se vendeu de cada coisa.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Package, Briefcase, Search, X, Loader2 } from 'lucide-react';
import { CatalogueItem } from './types';

interface Props {
  items: CatalogueItem[];
  loading: boolean;
  /** O artigo já escolhido nesta linha, se houver. */
  selectedId?: string | null;
  onPick: (item: CatalogueItem) => void;
  onClear: () => void;
  formatMoney: (n: number) => string;
}

export const ItemPicker: React.FC<Props> = ({
  items, loading, selectedId, onPick, onClear, formatMoney,
}) => {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const box = useRef<HTMLDivElement>(null);

  // Fechar ao clicar fora: o painel sobrepõe-se às linhas seguintes e ficar
  // aberto por engano tapa o que a pessoa está a tentar escrever.
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) || null,
    [items, selectedId],
  );

  const matches = useMemo(() => {
    const needle = term.trim().toLowerCase();
    const active = items.filter((item) => item.active !== false);
    const pool = needle
      ? active.filter((item) =>
          `${item.code} ${item.description} ${item.family || ''}`.toLowerCase().includes(needle))
      : active;
    return pool.slice(0, 40);
  }, [items, term]);

  return (
    <div className="relative" ref={box}>
      {selected ? (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-800 font-mono text-[10px]">
          {selected.code}
          <button
            onClick={onClear}
            title="Desligar do artigo (a linha fica como está)"
            className="text-indigo-400 hover:text-indigo-700"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ) : (
        <button
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 text-slate-500 hover:text-indigo-700 hover:border-indigo-200 text-[10px] font-bold"
        >
          <Search className="w-3 h-3" /> Catálogo
        </button>
      )}

      {open && (
        <div className="absolute z-30 mt-1 left-0 w-72 max-w-[80vw] rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <input
              autoFocus
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Código, descrição ou família…"
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div className="max-h-56 overflow-y-auto">
            {loading ? (
              <p className="px-3 py-4 text-center text-slate-400 text-[11px] flex items-center justify-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> A carregar o catálogo…
              </p>
            ) : matches.length === 0 ? (
              <p className="px-3 py-4 text-center text-slate-400 text-[11px]">
                {items.length === 0
                  ? 'Ainda não há artigos. Registe-os em Produtos ou Serviços.'
                  : 'Nenhum artigo com esse nome.'}
              </p>
            ) : (
              matches.map((item) => {
                const Icon = item.kind === 'service' ? Briefcase : Package;
                return (
                  <button
                    key={item.id}
                    onClick={() => { onPick(item); setOpen(false); setTerm(''); }}
                    className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-indigo-50/60 border-b border-slate-50 last:border-0"
                  >
                    <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold text-slate-800 text-[11px] truncate">
                        {item.description}
                      </span>
                      <span className="block text-[10px] text-slate-400 font-mono">
                        {item.code}
                        {item.vat_rate ? ` · IVA ${item.vat_rate}` : ''}
                        {item.price_includes_vat ? ' · preço c/ IVA' : ''}
                      </span>
                    </span>
                    <span className="font-mono text-[11px] text-slate-600 shrink-0">
                      {formatMoney(item.price_1 || 0)}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
