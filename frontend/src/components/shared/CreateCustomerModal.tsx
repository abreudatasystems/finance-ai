'use client';

import React, { useState } from 'react';
import { X, Users, Mail, Phone, Tag } from 'lucide-react';
import { Customer } from '@/types';

interface CreateCustomerModalProps {
  onClose: () => void;
  onCreated: (newCust: Customer) => void;
}

export const CreateCustomerModal: React.FC<CreateCustomerModalProps> = ({ onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [nif, setNif] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [defaultCategory, setDefaultCategory] = useState('Vendas > Serviços de Consultoria');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newCust: Customer = {
      id: `CUST-${Date.now()}`,
      company_id: 'COMP001',
      name: name.trim(),
      nif: nif.trim() || 'PT500000000',
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      default_category_name: defaultCategory,
      total_revenue: 0
    };

    try {
      await fetch('http://127.0.0.1:8000/api/v1/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCust)
      });
    } catch (err) {
      // Local fallback
    }

    onCreated(newCust);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs select-none">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 bg-emerald-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-200" />
            <h2 className="font-bold text-sm">Cadastrar Novo Cliente</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 text-white/80 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nome do Cliente / Empresa *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Cliente ABC Lda, Tech Global..."
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-slate-50/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">NIF / NIPC</label>
              <input
                type="text"
                value={nif}
                onChange={(e) => setNif(e.target.value)}
                placeholder="PT508000000"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-slate-50/50 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Telefone</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+351 91 000 0000"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-slate-50/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email Principal</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="financeiro@clienteabc.pt"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-slate-50/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Categoria de Receita</label>
            <select
              value={defaultCategory}
              onChange={(e) => setDefaultCategory(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-slate-50/50"
            >
              <option value="Vendas > Serviços de Consultoria">Vendas &gt; Serviços de Consultoria</option>
              <option value="Vendas > Licenciamento SaaS">Vendas &gt; Licenciamento SaaS</option>
              <option value="Vendas > Manutenção & Suporte">Vendas &gt; Manutenção &amp; Suporte</option>
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
              className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors"
            >
              Salvar Cliente
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
