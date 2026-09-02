'use client';

import React, { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { fetchItems, deleteItem } from '@/services/data';
import { Item } from '@/types';
import { Briefcase, Tag, Plus, Trash2, Calculator } from 'lucide-react';
import { CreateServiceModal } from '@/components/shared/CreateServiceModal';
import { useRouter } from 'next/navigation';

export default function ServicesPage() {
  const { formatMoney, setPageHeader } = useApp();
  const router = useRouter();
  const [services, setServices] = useState<Item[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const items = await fetchItems('COMP001', 'service');
      setServices(items);
    }
    load();
  }, []);

  useEffect(() => {
    setPageHeader('Gestão de Serviços', 'Catálogo de serviços prestados para faturação e propostas');
  }, [setPageHeader]);

  const handleServiceCreated = (newServ: Item) => {
    setServices(prev => [newServ, ...prev]);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem a certeza que deseja eliminar este serviço?')) return;
    setDeletingId(id);
    await deleteItem(id);
    setServices(prev => prev.filter(c => c.id !== id));
    setDeletingId(null);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      
      {/* Header Actions */}
      <div className="flex justify-end pb-3">
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2 bg-black hover:bg-neutral-800 active:scale-95 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer border border-neutral-900"
        >
          <Plus className="w-4 h-4 text-emerald-400" />
          <span>Novo Serviço</span>
        </button>
      </div>

      {/* STANDARDIZED ENTERPRISE TABLE */}
      <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-neutral-50/80 border-b border-neutral-200/80 text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                <th className="py-3 px-4">Código & Descrição</th>
                <th className="py-3 px-4">Família</th>
                <th className="py-3 px-4">Grupo de Serviço</th>
                <th className="py-3 px-4">Taxa IVA</th>
                <th className="py-3 px-4 text-right">Preço Venda</th>
                <th className="py-3 px-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-xs font-medium text-neutral-800">
              {services.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    Nenhum serviço registado. Clique em &quot;Novo Serviço&quot; para começar.
                  </td>
                </tr>
              ) : services.map((s) => (
                <tr 
                  key={s.id} 
                  className="hover:bg-neutral-50/60 transition-colors"
                >
                  <td className="py-3.5 px-4 font-bold text-neutral-900">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-cyan-50 text-cyan-700 flex items-center justify-center font-bold text-xs border border-cyan-200">
                        <Briefcase className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col">
                        <span>{s.code}</span>
                        <span className="text-[10px] text-neutral-500 font-medium">{s.description}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-neutral-600">
                    {s.family || '-'}
                  </td>
                  <td className="py-3.5 px-4 text-neutral-600">
                    {s.service_group || '-'}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="inline-flex items-center gap-1 font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 text-[10px]">
                      <Tag className="w-3 h-3 text-slate-500" />
                      {s.vat_rate}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right font-bold text-cyan-600">
                    <div className="flex flex-col items-end">
                      <span>{formatMoney(s.price_1)}</span>
                      {s.price_includes_vat && <span className="text-[9px] text-neutral-400 font-medium">c/ IVA</span>}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(s.id);
                      }}
                      disabled={deletingId === s.id}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer inline-flex"
                      title="Eliminar Serviço"
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
        <CreateServiceModal
          onClose={() => setIsModalOpen(false)}
          onCreated={handleServiceCreated}
        />
      )}

    </div>
  );
}
