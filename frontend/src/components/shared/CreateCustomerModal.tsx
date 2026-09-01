'use client';

import React, { useState } from 'react';
import { Users, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Customer } from '@/types';
import { apiPost } from '@/services/api';
import { SideDrawer } from './SideDrawer';

interface CreateCustomerModalProps {
  onClose: () => void;
  onCreated: (newCust: Customer) => void;
}

const FORM_ID = 'create-customer-form';

export const CreateCustomerModal: React.FC<CreateCustomerModalProps> = ({ onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [nif, setNif] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [defaultCategory, setDefaultCategory] = useState('Vendas > Serviços de Consultoria');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);

    const created = await apiPost<Customer>('/customers/', {
      name: name.trim(),
      nif: nif.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      default_category_name: defaultCategory,
      // address: address.trim() || undefined,
      // notes: notes.trim() || undefined,
    });

    const newCust: Customer = created ?? {
      id: `CUST-${Date.now()}`,
      company_id: 'COMP001',
      name: name.trim(),
      nif: nif.trim() || 'PT500000000',
      email: email.trim(),
      phone: phone.trim() || undefined,
      default_category_name: defaultCategory,
      total_revenue: 0,
    };

    setSubmitting(false);
    onCreated(newCust);
    onClose();
  };

  return (
    <SideDrawer
      title="Cadastrar Novo Cliente"
      subtitle="Registe uma entidade de receita"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-xs hover:bg-white transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form={FORM_ID}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Salvar Cliente
          </button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Nome do Cliente / Empresa *</label>
          <input
            type="text"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex: Cliente ABC Lda, Tech Global..."
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-slate-50/50"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">NIF / NIPC</label>
            <input
              type="text"
              value={nif}
              onChange={(e) => setNif(e.target.value)}
              placeholder="PT508000000"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-slate-50/50 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Telefone</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+351 91 000 0000"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-slate-50/50"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email Principal</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="financeiro@clienteabc.pt"
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-slate-50/50"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Categoria de Receita</label>
          <select
            value={defaultCategory}
            onChange={(e) => setDefaultCategory(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-slate-50/50"
          >
            <option value="Vendas > Serviços de Consultoria">Vendas &gt; Serviços de Consultoria</option>
            <option value="Vendas > Licenciamento SaaS">Vendas &gt; Licenciamento SaaS</option>
            <option value="Vendas > Manutenção & Suporte">Vendas &gt; Manutenção &amp; Suporte</option>
          </select>
        </div>

        {/* Advanced Options Accordion */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 hover:text-emerald-700 transition-colors cursor-pointer"
          >
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {showAdvanced ? 'Ocultar opções avançadas' : 'Mostrar opções avançadas (Morada, Notas...)'}
          </button>

          {showAdvanced && (
            <div className="mt-4 space-y-4 animate-in slide-in-from-top-2 duration-200 fade-in">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Morada Completa</label>
                <textarea
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Rua Exemplo, 123, Lisboa"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-slate-50/50 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Observações Internas (Notas)</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Condições especiais, detalhes de pagamento..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-slate-50/50 resize-none"
                />
              </div>
            </div>
          )}
        </div>
      </form>
    </SideDrawer>
  );
};
