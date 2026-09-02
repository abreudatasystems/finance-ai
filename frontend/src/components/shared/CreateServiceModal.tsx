'use client';

import React, { useState } from 'react';
import { Loader2, Briefcase, Tag, Calculator } from 'lucide-react';
import { Item } from '@/types';
import { apiPost } from '@/services/api';
import { SideDrawer } from './SideDrawer';

interface CreateServiceModalProps {
  onClose: () => void;
  onCreated: (newItem: Item) => void;
}

const FORM_ID = 'create-service-form';
type Tab = 'geral' | 'precos';

export const CreateServiceModal: React.FC<CreateServiceModalProps> = ({ onClose, onCreated }) => {
  const [activeTab, setActiveTab] = useState<Tab>('geral');
  const [submitting, setSubmitting] = useState(false);

  // Campos Gerais
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [family, setFamily] = useState('');
  const [serviceGroup, setServiceGroup] = useState('Consultoria');
  const [unit, setUnit] = useState('HR');

  // Preços e Custos
  const [price1, setPrice1] = useState<number>(0);
  const [priceIncludesVat, setPriceIncludesVat] = useState(false);
  const [vatRate, setVatRate] = useState('Normal');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !code.trim()) return;
    setSubmitting(true);

    const payload = {
      kind: 'service',
      code: code.trim(),
      description: description.trim(),
      family: family.trim() || undefined,
      unit: unit.trim() || undefined,
      service_group: serviceGroup,
      price_1: price1,
      price_includes_vat: priceIncludesVat,
      vat_rate: vatRate,
      active: true,
    };

    const created = await apiPost<Item>('/items/', payload);

    const newItem: Item = created ?? {
      id: `ITM-${Date.now()}`,
      company_id: 'COMP001',
      ...payload,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any;

    setSubmitting(false);
    onCreated(newItem);
    onClose();
  };

  const renderTabs = () => (
    <div className="flex space-x-1 bg-slate-100/50 p-1 rounded-xl mb-6 overflow-x-auto">
      <button
        type="button"
        onClick={() => setActiveTab('geral')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${activeTab === 'geral' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'}`}
      >
        <Briefcase className="w-3.5 h-3.5" />
        Dados do Serviço
      </button>
      <button
        type="button"
        onClick={() => setActiveTab('precos')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${activeTab === 'precos' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'}`}
      >
        <Calculator className="w-3.5 h-3.5" />
        Preços & Taxas
      </button>
    </div>
  );

  return (
    <SideDrawer
      title="Cadastrar Novo Serviço"
      subtitle="Registe um novo serviço prestado"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-xs hover:bg-slate-50 transition-colors"
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
            Guardar Serviço
          </button>
        </>
      }
    >
      {renderTabs()}

      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
        <div className={activeTab === 'geral' ? 'block animate-in fade-in slide-in-from-right-4 duration-300' : 'hidden'}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Código *</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="SERV-001"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50 uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Unidade Base</label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
                >
                  <option value="HR">Hora (HR)</option>
                  <option value="SV">Serviço (SV)</option>
                  <option value="DIA">Dia (DIA)</option>
                  <option value="MES">Mês (MES)</option>
                </select>
              </div>
            </div>
            
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Descrição *</label>
              <input
                type="text"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Consultoria Financeira - Horas"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Família / Categoria</label>
                <input
                  type="text"
                  value={family}
                  onChange={(e) => setFamily(e.target.value)}
                  placeholder="Consultoria"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Grupo de Serviço</label>
                <select
                  value={serviceGroup}
                  onChange={(e) => setServiceGroup(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
                >
                  <option value="Consultoria">Consultoria</option>
                  <option value="Manutenção">Manutenção</option>
                  <option value="Desenvolvimento">Desenvolvimento</option>
                  <option value="Avença">Avença</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className={activeTab === 'precos' ? 'block animate-in fade-in slide-in-from-right-4 duration-300' : 'hidden'}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Preço (Base)</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={price1}
                    onChange={(e) => setPrice1(parseFloat(e.target.value) || 0)}
                    className="w-full pl-8 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
                  />
                  <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">€</span>
                </div>
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={priceIncludesVat}
                    onChange={(e) => setPriceIncludesVat(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Preço inclui IVA
                </label>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Taxa de IVA Aplicável</label>
              <select
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
              >
                <option value="Normal">Taxa Normal (23%)</option>
                <option value="Intermédia">Taxa Intermédia (13%)</option>
                <option value="Reduzida">Taxa Reduzida (6%)</option>
                <option value="Isenta">Isento (0%)</option>
              </select>
            </div>
          </div>
        </div>
      </form>
    </SideDrawer>
  );
};
