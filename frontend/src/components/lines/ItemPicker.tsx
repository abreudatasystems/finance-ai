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
import { Package, Briefcase, Search, X } from 'lucide-react';
import { CatalogueItem } from './types';
import { IconButton, LoadingState, cn, inputClass } from '@/components/ui';

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
        <span className="inline-flex items-center gap-0.5 pl-2 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-800 font-mono text-2xs">
          {selected.code}
          <IconButton
            label="Desligar do artigo (a linha fica como está)"
            onClick={onClear}
            className="size-6 text-emerald-500 hover:text-emerald-800 hover:bg-emerald-100 [&_svg]:size-3"
          >
            <X />
          </IconButton>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-neutral-200 text-neutral-500 hover:text-emerald-700 hover:border-emerald-200 text-2xs font-bold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          <Search className="w-3 h-3" /> Catálogo
        </button>
      )}

      {open && (
        <div className="absolute z-30 mt-1 left-0 w-72 max-w-[80vw] rounded-xl border border-neutral-200 bg-white shadow-lg overflow-hidden">
          <div className="p-2 border-b border-neutral-100">
            <input
              autoFocus
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Código, descrição ou família…"
              aria-label="Procurar no catálogo"
              className={cn(inputClass, 'h-8 px-2.5 text-xs')}
            />
          </div>

          <div className="max-h-56 overflow-y-auto">
            {loading ? (
              <LoadingState label="A carregar o catálogo…" className="py-4" />
            ) : matches.length === 0 ? (
              <p className="px-3 py-4 text-center text-neutral-500 text-xs">
                {items.length === 0
                  ? 'Ainda não há artigos. Registe-os em Produtos ou Serviços.'
                  : 'Nenhum artigo com esse nome.'}
              </p>
            ) : (
              matches.map((item) => {
                const Icon = item.kind === 'service' ? Briefcase : Package;
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => { onPick(item); setOpen(false); setTerm(''); }}
                    className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-emerald-50/60 border-b border-neutral-50 last:border-0 cursor-pointer focus-visible:outline-none focus-visible:bg-emerald-50"
                  >
                    <Icon className="w-3.5 h-3.5 text-neutral-400 shrink-0" aria-hidden="true" />
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold text-neutral-800 text-xs truncate">
                        {item.description}
                      </span>
                      <span className="block text-2xs text-neutral-500 font-mono">
                        {item.code}
                        {item.vat_rate ? ` · IVA ${item.vat_rate}` : ''}
                        {item.price_includes_vat ? ' · preço c/ IVA' : ''}
                      </span>
                    </span>
                    <span className="font-mono text-xs tabular-nums text-neutral-600 shrink-0">
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
