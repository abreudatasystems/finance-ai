'use client';

import React, { useState } from 'react';
import { Loader2, Package, Tag, Calculator } from 'lucide-react';
import { Item } from '@/types';
import { apiPost } from '@/services/api';
import { SideDrawer } from './SideDrawer';

interface CreateProductModalProps {
  onClose: () => void;
  onCreated: (newItem: Item) => void;
}

const FORM_ID = 'create-product-form';
type Tab = 'geral' | 'precos';

export const CreateProductModal: React.FC<CreateProductModalProps> = ({ onClose, onCreated }) => {
  const [activeTab, setActiveTab] = useState<Tab>('geral');
  const [submitting, setSubmitting] = useState(false);

  // Campos Gerais
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [family, setFamily] = useState('');
  const [unit, setUnit] = useState('UN');
  const [ean, setEan] = useState('');
  const [productType, setProductType] = useState('Mercadoria');

  // Preços e Custos
  const [price1, setPrice1] = useState<number>(0);
  const [priceIncludesVat, setPriceIncludesVat] = useState(false);
  const [vatRate, setVatRate] = useState('Normal');
  const [purchasePrice, setPurchasePrice] = useState<number>(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !code.trim()) return;
    setSubmitting(true);

    const payload = {
      kind: 'product',
      code: code.trim(),
      description: description.trim(),
      family: family.trim() || undefined,
      unit: unit.trim() || undefined,
      ean: ean.trim() || undefined,
      product_type: productType,
      price_1: price1,
      price_includes_vat: priceIncludesVat,
      vat_rate: vatRate,
      purchase_price: purchasePrice,
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
        <Package className="w-3.5 h-3.5" />
        Dados do Produto
      </button>
      <button
        type="button"
        onClick={() => setActiveTab('precos')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${activeTab === 'precos' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'}`}
      >
        <Calculator className="w-3.5 h-3.5" />
        Preços & Custos
      </button>
    </div>
  );

  return (
    <SideDrawer
      title="Cadastrar Novo Produto"
      subtitle="Registe uma nova mercadoria ou produto"
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
            Guardar Produto
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
                  placeholder="PROD-001"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50 uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Código de Barras (EAN)</label>
                <input
                  type="text"
                  value={ean}
                  onChange={(e) => setEan(e.target.value)}
                  placeholder="5600000000000"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Descrição *</label>
              <input
                type="text"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Monitor Dell 24 polegadas"
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
                  placeholder="Informática"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Unidade</label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
                >
                  <option value="UN">Unidade (UN)</option>
                  <option value="KG">Quilograma (KG)</option>
                  <option value="CX">Caixa (CX)</option>
                  <option value="MT">Metro (MT)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Tipo de Produto</label>
              <select
                value={productType}
                onChange={(e) => setProductType(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
              >
                <option value="Mercadoria">Mercadoria</option>
                <option value="Produto Acabado">Produto Acabado</option>
                <option value="Matéria Prima">Matéria Prima</option>
              </select>
            </div>
          </div>
        </div>

        <div className={activeTab === 'precos' ? 'block animate-in fade-in slide-in-from-right-4 duration-300' : 'hidden'}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Preço de Venda (Base)</label>
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

            <div className="pt-4 border-t border-slate-200/60">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Preço de Custo (Compra)</label>
              <div className="relative w-1/2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(parseFloat(e.target.value) || 0)}
                  className="w-full pl-8 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
                />
                <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">€</span>
              </div>
              <p className="mt-1.5 text-[10px] text-slate-500">O preço de custo ajuda a calcular a margem de lucro nos relatórios.</p>
            </div>
          </div>
        </div>
      </form>
    </SideDrawer>
  );
};
