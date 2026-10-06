'use client';

import React, { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { fetchItems, deleteItem } from '@/services/data';
import {Item} from '@/types';
import {Package, Tag, Plus, Trash2, Briefcase} from 'lucide-react';
import { CreateItemModal } from '@/components/shared/CreateItemModal';

export default function ItemsPage() {
  const { formatMoney, setPageHeader } = useApp();
  const [items, setItems] = useState<Item[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      // Fetch all items by passing no kind, or fetch both and combine if API requires it.
      // Looking at the data service, passing undefined might fetch all, or we fetch both:
      const [prods, servs] = await Promise.all([
        fetchItems('product'),
        fetchItems('service')
      ]);
      setItems([...prods, ...servs].sort((a, b) => a.code.localeCompare(b.code)));
    }
    load();
  }, []);

  useEffect(() => {
    setPageHeader('Produtos e Serviços', 'Catálogo único de produtos e serviços para faturação');
  }, [setPageHeader]);

  const handleItemCreated = (newItem: Item) => {
    setItems(prev => [newItem, ...prev]);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem a certeza que deseja eliminar este item?')) return;
    setDeletingId(id);
    await deleteItem(id);
    setItems(prev => prev.filter(c => c.id !== id));
    setDeletingId(null);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      
      {/* Header Actions */}
      <div className="flex justify-end pb-3">
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2 bg-neutral-950 hover:bg-neutral-800 active:scale-95 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer border border-neutral-900"
        >
          <Plus className="w-4 h-4 text-emerald-400" />
          <span>Novo Item</span>
        </button>
      </div>

      {/* STANDARDIZED ENTERPRISE TABLE */}
      <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-neutral-50/80 border-b border-neutral-200/80 text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                <th className="py-3 px-4">Código & Descrição</th>
                <th className="py-3 px-4">Tipo</th>
                <th className="py-3 px-4">EAN</th>
                <th className="py-3 px-4">Família</th>
                <th className="py-3 px-4">Taxa IVA</th>
                <th className="py-3 px-4 text-right">Preço Venda</th>
                <th className="py-3 px-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-xs font-medium text-neutral-800">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    Nenhum item registado. Clique em &quot;Novo Item&quot; para começar.
                  </td>
                </tr>
              ) : items.map((p) => (
                <tr 
                  key={p.id} 
                  className="hover:bg-neutral-50/60 transition-colors"
                >
                  <td className="py-3.5 px-4 font-bold text-neutral-900">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs border ${p.kind === 'service' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-indigo-50 text-indigo-700 border-indigo-200'}`}>
                        {p.kind === 'service' ? <Briefcase className="w-4 h-4" /> : <Package className="w-4 h-4" />}
                      </div>
                      <div className="flex flex-col">
                        <span>{p.code}</span>
                        <span className="text-[10px] text-neutral-500 font-medium">{p.description}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className={`inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-md border text-[10px] uppercase tracking-wide ${p.kind === 'service' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-indigo-50 text-indigo-700 border-indigo-200'}`}>
                      {p.kind === 'service' ? 'Serviço' : 'Produto'}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 tabular-nums text-neutral-600">
                    {p.ean || '-'}
                  </td>
                  <td className="py-3.5 px-4 text-neutral-600">
                    {p.family || '-'}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="inline-flex items-center gap-1 font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 text-[10px]">
                      <Tag className="w-3 h-3 text-slate-500" />
                      {p.vat_rate}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right font-bold text-indigo-600">
                    <div className="flex flex-col items-end">
                      <span>{formatMoney(p.price_1)}</span>
                      {p.price_includes_vat && <span className="text-[10px] text-neutral-400 font-medium">c/ IVA</span>}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button aria-label="Eliminar Item"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(p.id);
                      }}
                      disabled={deletingId === p.id}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer inline-flex"
                      title="Eliminar Item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Creation Modal */}
      {isModalOpen && (
        <CreateItemModal
          items={items}
          onClose={() => setIsModalOpen(false)}
          onCreated={handleItemCreated}
        />
      )}

    </div>
  );
}
