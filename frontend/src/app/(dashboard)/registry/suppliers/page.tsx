'use client';

import React, { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { fetchSuppliers } from '@/services/data';
import { Supplier } from '@/types';
import { Building2, Mail, Plus, Tag, Calendar, CheckCircle2 } from 'lucide-react';
import { CreateSupplierModal } from '@/components/shared/CreateSupplierModal';

export default function SuppliersPage() {
  const { formatMoney } = useApp();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    async function load() {
      const sups = await fetchSuppliers();
      setSuppliers(sups);
    }
    load();
  }, []);

  const handleSupplierCreated = (newSup: Supplier) => {
    setSuppliers(prev => [...prev, newSup]);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200/80 pb-3">
        <div>
          <h1 className="text-lg font-bold text-neutral-900 tracking-tight">
            Gestão de Fornecedores
          </h1>
          <p className="text-xs text-neutral-500 font-medium">
            Cadastro inteligente com categorias padrão associadas automaticamente a faturas recebidas
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2 bg-black hover:bg-neutral-800 active:scale-95 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer border border-neutral-900"
        >
          <Plus className="w-4 h-4 text-emerald-400" />
          <span>Novo Fornecedor</span>
        </button>
      </div>

      {/* STANDARDIZED ENTERPRISE TABLE */}
      <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-neutral-50/80 border-b border-neutral-200/80 text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                <th className="py-3 px-4">Entidade / Fornecedor</th>
                <th className="py-3 px-4">NIF</th>
                <th className="py-3 px-4">Categoria Padrão</th>
                <th className="py-3 px-4">Email de Contacto</th>
                <th className="py-3 px-4">Último Movimento</th>
                <th className="py-3 px-4 text-right">Total Acumulado Gasto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-xs font-medium text-neutral-800">
              {suppliers.map((s) => (
                <tr key={s.id} className="hover:bg-neutral-50/60 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-neutral-900">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-neutral-100 text-neutral-800 flex items-center justify-center font-bold text-xs border border-neutral-200">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <span>{s.name}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-neutral-600">
                    {s.nif}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="inline-flex items-center gap-1 font-semibold text-neutral-800 bg-neutral-100 px-2.5 py-1 rounded-lg border border-neutral-200">
                      <Tag className="w-3 h-3 text-neutral-600" />
                      {s.default_category_name}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-neutral-600">
                    <div className="flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-neutral-400" />
                      <span>{s.email || 'Sem email'}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-neutral-600">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                      <span>{s.last_transaction_date}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-right font-bold text-neutral-900">
                    {formatMoney(s.total_spent)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Creation Modal */}
      {isModalOpen && (
        <CreateSupplierModal
          onClose={() => setIsModalOpen(false)}
          onCreated={handleSupplierCreated}
        />
      )}

    </div>
  );
}
