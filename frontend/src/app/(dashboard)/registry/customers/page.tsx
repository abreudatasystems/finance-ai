'use client';

import React, { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { fetchCustomers } from '@/services/data';
import { Customer } from '@/types';
import { Users, Mail, Phone, Plus, Tag, Trash2 } from 'lucide-react';
import { CreateCustomerModal } from '@/components/shared/CreateCustomerModal';
import { deleteCustomer } from '@/services/data';
import { useRouter } from 'next/navigation';

export default function CustomersPage() {
  const { formatMoney, setPageHeader } = useApp();
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const custs = await fetchCustomers();
      setCustomers(custs);
    }
    load();
  }, []);

  useEffect(() => {
    setPageHeader('Gestão de Clientes', 'Cadastro de clientes para emissão e reconciliação automática de recebimentos');
  }, [setPageHeader]);

  const handleCustomerCreated = (newCust: Customer) => {
    setCustomers(prev => [...prev, newCust]);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem a certeza que deseja eliminar este cliente?')) return;
    setDeletingId(id);
    await deleteCustomer(id);
    setCustomers(prev => prev.filter(c => c.id !== id));
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
          <span>Novo Cliente</span>
        </button>
      </div>

      {/* STANDARDIZED ENTERPRISE TABLE */}
      <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-neutral-50/80 border-b border-neutral-200/80 text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                <th className="py-3 px-4">Nome do Cliente</th>
                <th className="py-3 px-4">NIF</th>
                <th className="py-3 px-4">Categoria de Receita Padrão</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Telemóvel / Telefone</th>
                <th className="py-3 px-4 text-right">Faturação Acumulada</th>
                <th className="py-3 px-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-xs font-medium text-neutral-800">
              {customers.map((c) => (
                <tr 
                  key={c.id} 
                  onClick={() => router.push(`/registry/customers/${c.id}`)}
                  className="hover:bg-neutral-50/60 transition-colors cursor-pointer"
                >
                  <td className="py-3.5 px-4 font-bold text-neutral-900">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-xs border border-emerald-200">
                        <Users className="w-4 h-4" />
                      </div>
                      <span>{c.name}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-neutral-600">
                    {c.nif}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                      <Tag className="w-3 h-3 text-emerald-600" />
                      {c.default_category_name}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-neutral-600">
                    <div className="flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-neutral-400" />
                      <span>{c.email || 'Sem email'}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-neutral-600 font-mono">
                    <div className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-neutral-400" />
                      <span>{c.phone || 'Sem contacto'}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-right font-bold text-emerald-600">
                    +{formatMoney(c.total_revenue)}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(c.id);
                      }}
                      disabled={deletingId === c.id}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="Eliminar Cliente"
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
        <CreateCustomerModal
          onClose={() => setIsModalOpen(false)}
          onCreated={handleCustomerCreated}
        />
      )}

    </div>
  );
}
