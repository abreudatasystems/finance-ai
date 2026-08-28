'use client';

import React, { useState } from 'react';
import { X, Building2, Mail, Phone, Tag } from 'lucide-react';
import { Supplier } from '@/types';

interface CreateSupplierModalProps {
  onClose: () => void;
  onCreated: (newSup: Supplier) => void;
}

export const CreateSupplierModal: React.FC<CreateSupplierModalProps> = ({ onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [nif, setNif] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [defaultCategory, setDefaultCategory] = useState('Marketing');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newSup: Supplier = {
      id: `SUP-${Date.now()}`,
      company_id: 'COMP001',
      name: name.trim(),
      nif: nif.trim() || 'PT000000000',
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      default_category_name: defaultCategory,
      total_spent: 0,
      last_transaction_date: new Date().toISOString().split('T')[0]
    };

    try {
      await fetch('http://127.0.0.1:8000/api/v1/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSup)
      });
    } catch (err) {
      // Local fallback
    }

    onCreated(newSup);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs select-none">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 bg-indigo-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-200" />
            <h2 className="font-bold text-sm">Cadastrar Novo Fornecedor</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 text-white/80 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nome do Fornecedor *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Google Ireland Ltd, Microsoft, EDP..."
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">NIF / NIPC</label>
              <input
                type="text"
                value={nif}
                onChange={(e) => setNif(e.target.value)}
                placeholder="PT500000000"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Telefone</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+351 21 000 0000"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email de Faturação</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="invoices@fornecedor.com"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Categoria Padrão (IA)</label>
            <select
              value={defaultCategory}
              onChange={(e) => setDefaultCategory(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
            >
              <option value="Marketing > Google Ads">Marketing &gt; Google Ads</option>
              <option value="Software > Licenças & SaaS">Software &gt; Licenças &amp; SaaS</option>
              <option value="Operações > Instalações & Energia">Operações &gt; Instalações &amp; Energia</option>
              <option value="Viagens > Transporte">Viagens &gt; Transporte</option>
            </select>
          </div>

          <div className="flex gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold text-xs hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-colors"
            >
              Salvar Fornecedor
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
