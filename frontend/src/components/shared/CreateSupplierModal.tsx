'use client';

import React, { useState } from 'react';
import { Building2, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Supplier } from '@/types';
import { apiPost } from '@/services/api';
import { SideDrawer } from './SideDrawer';

interface CreateSupplierModalProps {
  onClose: () => void;
  onCreated: (newSup: Supplier) => void;
}

const FORM_ID = 'create-supplier-form';

export const CreateSupplierModal: React.FC<CreateSupplierModalProps> = ({ onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [nif, setNif] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [defaultCategory, setDefaultCategory] = useState('Marketing > Google Ads');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);

    const created = await apiPost<Supplier>('/suppliers/', {
      name: name.trim(),
      nif: nif.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      default_category_name: defaultCategory,
      // address: address.trim() || undefined,
      // notes: notes.trim() || undefined,
    });

    const newSup: Supplier = created ?? {
      id: `SUP-${Date.now()}`,
      company_id: 'COMP001',
      name: name.trim(),
      nif: nif.trim() || 'PT000000000',
      email: email.trim(),
      phone: phone.trim() || undefined,
      default_category_name: defaultCategory,
      total_spent: 0,
      last_transaction_date: new Date().toISOString().split('T')[0],
    };

    setSubmitting(false);
    onCreated(newSup);
    onClose();
  };

  return (
    <SideDrawer
      title="Cadastrar Novo Fornecedor"
      subtitle="Registe uma entidade de despesa"
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
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Salvar Fornecedor
          </button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Nome do Fornecedor *</label>
          <input
            type="text"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex: Google Ireland Ltd, Microsoft, EDP..."
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">NIF / NIPC</label>
            <input
              type="text"
              value={nif}
              onChange={(e) => setNif(e.target.value)}
              placeholder="PT500000000"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Telefone</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+351 21 000 0000"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email de Faturação</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="invoices@fornecedor.com"
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Categoria Padrão (IA)</label>
          <select
            value={defaultCategory}
            onChange={(e) => setDefaultCategory(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
          >
            <option value="Marketing > Google Ads">Marketing &gt; Google Ads</option>
            <option value="Software > Licenças & SaaS">Software &gt; Licenças &amp; SaaS</option>
            <option value="Operações > Instalações & Energia">Operações &gt; Instalações &amp; Energia</option>
            <option value="Viagens > Transporte">Viagens &gt; Transporte</option>
          </select>
        </div>

        {/* Advanced Options Accordion */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 transition-colors cursor-pointer"
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
                  placeholder="Rua Sede do Fornecedor, 123..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Observações Internas (Notas)</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Condições de pagamento, dias de vencimento padrão..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50 resize-none"
                />
              </div>
            </div>
          )}
        </div>
      </form>
    </SideDrawer>
  );
};
