'use client';

import React, { useState } from 'react';
import { Package, Calculator} from 'lucide-react';
import { Item } from '@/types';
import { apiPost } from '@/services/api';
import { SideDrawer } from './SideDrawer';
import { toast } from 'sonner';
import { Button, Field, Input, Select } from '@/components/ui';

interface CreateItemModalProps {
  items: Item[];
  onClose: () => void;
  onCreated: (newItem: Item) => void;
}

const FORM_ID = 'create-item-form';
type Tab = 'geral' | 'precos';

export const CreateItemModal: React.FC<CreateItemModalProps> = ({ items, onClose, onCreated }) => {
  const [activeTab, setActiveTab] = useState<Tab>('geral');
  const [submitting, setSubmitting] = useState(false);

  // Campos Gerais
  const generateCode = (k: 'product' | 'service') => {
    const prefix = k === 'product' ? 'PROD' : 'SERV';
    const sameKindItems = items.filter(i => i.kind === k && i.code.startsWith(`${prefix}-`));
    let max = 0;
    for (const item of sameKindItems) {
      const numPart = item.code.split('-')[1];
      if (numPart && !isNaN(Number(numPart))) {
        max = Math.max(max, Number(numPart));
      }
    }
    return `${prefix}-${String(max + 1).padStart(3, '0')}`;
  };

  const [kind, setKind] = useState<'product' | 'service'>('product');
  const [code, setCode] = useState(() => generateCode('product'));
  
  const handleKindChange = (newKind: 'product' | 'service') => {
    setKind(newKind);
    setCode(generateCode(newKind));
  };

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
      kind,
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

    // Se a gravação falha, falha. A versão anterior inventava aqui um registo
    // local, com um id fabricado e a empresa em código — o produto aparecia na
    // lista como se tivesse sido guardado e desaparecia ao recarregar a página.
    const created = await apiPost<Item>('/items/', payload);
    setSubmitting(false);

    if (!created) {
      toast.error('Não foi possível guardar. Verifique a ligação e tente de novo.');
      return;
    }

    onCreated(created);
    onClose();
  };

  const renderTabs = () => (
    <div className="flex space-x-1 bg-neutral-100 p-1 rounded-xl mb-6 overflow-x-auto">
      <button
        type="button"
        onClick={() => setActiveTab('geral')}
        aria-pressed={activeTab === 'geral'}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${activeTab === 'geral' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/60'}`}
      >
        <Package className="w-3.5 h-3.5" />
        Dados do {kind === 'product' ? 'Produto' : 'Serviço'}
      </button>
      <button
        type="button"
        onClick={() => setActiveTab('precos')}
        aria-pressed={activeTab === 'precos'}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${activeTab === 'precos' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/60'}`}
      >
        <Calculator className="w-3.5 h-3.5" />
        Preços & Custos
      </button>
    </div>
  );

  return (
    <SideDrawer
      title="Registar Novo Item"
      subtitle="Registe um novo produto ou serviço no seu catálogo"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form={FORM_ID} loading={submitting} className="flex-1">
            Guardar Item
          </Button>
        </>
      }
    >
      <div role="group" aria-label="Tipo de item" className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-neutral-100 p-1 rounded-xl text-xs font-semibold text-neutral-600 mb-6">
        <button
          type="button"
          aria-pressed={kind === 'product'}
          onClick={() => handleKindChange('product')}
          className={`py-2 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${kind === 'product' ? 'bg-white text-neutral-900 font-bold shadow-sm border border-neutral-200/50' : 'hover:bg-neutral-200/60'}`}
        >
          Produto
        </button>
        <button
          type="button"
          aria-pressed={kind === 'service'}
          onClick={() => handleKindChange('service')}
          className={`py-2 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${kind === 'service' ? 'bg-white text-neutral-900 font-bold shadow-sm border border-neutral-200/50' : 'hover:bg-neutral-200/60'}`}
        >
          Serviço
        </button>
      </div>

      {renderTabs()}

      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
        <div className={activeTab === 'geral' ? 'block animate-in fade-in slide-in-from-right-4 duration-300' : 'hidden'}>
          <div className="space-y-4">

            <div className="grid grid-cols-2 gap-3">
              <Field label="Código (Automático)">
                {(p) => (
                  <Input
                    {...p}
                    type="text"
                    readOnly
                    value={code}
                    className="font-mono bg-neutral-50 text-neutral-500"
                  />
                )}
              </Field>
              {kind === 'product' && (
                <Field label="Código de Barras (EAN)">
                  {(p) => (
                    <Input
                      {...p}
                      type="text"
                      value={ean}
                      onChange={(e) => setEan(e.target.value)}
                      placeholder="5600000000000"
                    />
                  )}
                </Field>
              )}
            </div>
            
            <Field label="Descrição" required>
              {(p) => (
                <Input
                  {...p}
                  type="text"
                  required
                  autoFocus
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={kind === 'product' ? "Ex: Monitor Dell 24 polegadas" : "Ex: Consultoria de Gestão"}
                />
              )}
            </Field>

            {kind === 'product' && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Família / Categoria">
                  {(p) => (
                    <Input
                      {...p}
                      type="text"
                      value={family}
                      onChange={(e) => setFamily(e.target.value)}
                      placeholder="Informática"
                    />
                  )}
                </Field>
                <Field label="Unidade">
                  {(p) => (
                    <Select
                      {...p}
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                    >
                      <option value="UN">Unidade (UN)</option>
                      <option value="KG">Quilograma (KG)</option>
                      <option value="CX">Caixa (CX)</option>
                      <option value="MT">Metro (MT)</option>
                    </Select>
                  )}
                </Field>
              </div>
            )}

            {kind === 'product' && (
              <Field label="Tipo de Produto">
                {(p) => (
                  <Select
                    {...p}
                    value={productType}
                    onChange={(e) => setProductType(e.target.value)}
                  >
                    <option value="Mercadoria">Mercadoria</option>
                    <option value="Produto Acabado">Produto Acabado</option>
                    <option value="Matéria Prima">Matéria Prima</option>
                  </Select>
                )}
              </Field>
            )}
          </div>
        </div>

        <div className={activeTab === 'precos' ? 'block animate-in fade-in slide-in-from-right-4 duration-300' : 'hidden'}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Preço de Venda (Base)">
                {(p) => (
                  <div className="relative">
                    <Input
                      {...p}
                      type="number"
                      step="0.01"
                      min="0"
                      value={price1}
                      onChange={(e) => setPrice1(parseFloat(e.target.value) || 0)}
                      className="pl-8 text-right tabular-nums"
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400 font-bold" aria-hidden="true">€</span>
                  </div>
                )}
              </Field>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-xs text-neutral-700 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={priceIncludesVat}
                    onChange={(e) => setPriceIncludesVat(e.target.checked)}
                    className="size-4 rounded border-neutral-300 accent-emerald-600 cursor-pointer"
                  />
                  Preço inclui IVA
                </label>
              </div>
            </div>

            <Field label="Taxa de IVA Aplicável">
              {(p) => (
                <Select
                  {...p}
                  value={vatRate}
                  onChange={(e) => setVatRate(e.target.value)}
                >
                  <option value="Normal">Taxa Normal (23%)</option>
                  <option value="Intermédia">Taxa Intermédia (13%)</option>
                  <option value="Reduzida">Taxa Reduzida (6%)</option>
                  <option value="Isenta">Isento (0%)</option>
                </Select>
              )}
            </Field>

            {kind === 'product' && (
              <div className="pt-4 border-t border-neutral-200/60">
                <Field
                  label="Preço de Custo (Compra)"
                  hint="O preço de custo ajuda a calcular a margem de lucro nos relatórios."
                >
                  {(p) => (
                    <div className="relative w-1/2">
                      <Input
                        {...p}
                        type="number"
                        step="0.01"
                        min="0"
                        value={purchasePrice}
                        onChange={(e) => setPurchasePrice(parseFloat(e.target.value) || 0)}
                        className="pl-8 text-right tabular-nums"
                      />
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400 font-bold" aria-hidden="true">€</span>
                    </div>
                  )}
                </Field>
              </div>
            )}
          </div>
        </div>
      </form>
    </SideDrawer>
  );
};
