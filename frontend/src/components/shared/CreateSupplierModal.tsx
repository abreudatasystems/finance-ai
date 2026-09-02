'use client';

import React, { useState } from 'react';
import { Loader2, User, MapPin, FileText, Settings, Building2 } from 'lucide-react';
import { Supplier } from '@/types';
import { apiPost } from '@/services/api';
import { SideDrawer } from './SideDrawer';

interface CreateSupplierModalProps {
  onClose: () => void;
  onCreated: (newSup: Supplier) => void;
}

const FORM_ID = 'create-supplier-form';
type Tab = 'geral' | 'endereco' | 'faturacao' | 'avancado';

export const CreateSupplierModal: React.FC<CreateSupplierModalProps> = ({ onClose, onCreated }) => {
  const [activeTab, setActiveTab] = useState<Tab>('geral');
  const [submitting, setSubmitting] = useState(false);

  // Campos
  const [name, setName] = useState('');
  const [nif, setNif] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [mobile, setMobile] = useState('');
  const [website, setWebsite] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactRole, setContactRole] = useState('');
  
  const [addressName, setAddressName] = useState('');
  const [address, setAddress] = useState(''); // Usa-se address como morada principal
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('PT');

  const [isTaxable, setIsTaxable] = useState(true);
  const [vatCashRegime, setVatCashRegime] = useState(false);
  const [isVatExempt, setIsVatExempt] = useState(false);
  const [subAccount, setSubAccount] = useState('');
  const [defaultCategory, setDefaultCategory] = useState('Marketing > Google Ads');

  const [documentObservations, setDocumentObservations] = useState('');
  const [internalObservations, setInternalObservations] = useState('');
  const [autoInvoicing, setAutoInvoicing] = useState(false);
  const [model10, setModel10] = useState(false);
  const [acceptAdEmails, setAcceptAdEmails] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);

    const payload = {
      name: name.trim(),
      nif: nif.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      mobile: mobile.trim() || undefined,
      website: website.trim() || undefined,
      contact_name: contactName.trim() || undefined,
      contact_role: contactRole.trim() || undefined,
      address_name: addressName.trim() || undefined,
      address: address.trim() || undefined,
      postal_code: postalCode.trim() || undefined,
      city: city.trim() || undefined,
      country: country.trim() || undefined,
      is_taxable: isTaxable,
      vat_cash_regime: vatCashRegime,
      is_vat_exempt: isVatExempt,
      sub_account: subAccount.trim() || undefined,
      default_category_name: defaultCategory,
      document_observations: documentObservations.trim() || undefined,
      internal_observations: internalObservations.trim() || undefined,
      auto_invoicing: autoInvoicing,
      model_10: model10,
      accept_ad_emails: acceptAdEmails
    };

    const created = await apiPost<Supplier>('/suppliers/', payload);

    const newSup: Supplier = created ?? {
      id: `SUP-${Date.now()}`,
      company_id: 'COMP001',
      ...payload,
      total_spent: 0,
      last_transaction_date: new Date().toISOString().split('T')[0],
    } as any;

    setSubmitting(false);
    onCreated(newSup);
    onClose();
  };

  const renderTabs = () => (
    <div className="flex space-x-1 bg-slate-100/50 p-1 rounded-xl mb-6 overflow-x-auto">
      <button
        type="button"
        onClick={() => setActiveTab('geral')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${activeTab === 'geral' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'}`}
      >
        <User className="w-3.5 h-3.5" />
        Geral
      </button>
      <button
        type="button"
        onClick={() => setActiveTab('endereco')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${activeTab === 'endereco' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'}`}
      >
        <MapPin className="w-3.5 h-3.5" />
        Endereço
      </button>
      <button
        type="button"
        onClick={() => setActiveTab('faturacao')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${activeTab === 'faturacao' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'}`}
      >
        <FileText className="w-3.5 h-3.5" />
        Faturação & IVA
      </button>
      <button
        type="button"
        onClick={() => setActiveTab('avancado')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${activeTab === 'avancado' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'}`}
      >
        <Settings className="w-3.5 h-3.5" />
        Avançado
      </button>
    </div>
  );

  return (
    <SideDrawer
      title="Cadastrar Novo Fornecedor"
      subtitle="Registe uma entidade de despesa com detalhe"
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
            Guardar Fornecedor
          </button>
        </>
      }
    >
      {renderTabs()}

      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
        <div className={activeTab === 'geral' ? 'block animate-in fade-in slide-in-from-right-4 duration-300' : 'hidden'}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Nome do Fornecedor *</label>
              <input
                type="text"
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Microsoft, Empresa XPTO Lda..."
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
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Website</label>
                <input
                  type="text"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="www.exemplo.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email Principal</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="geral@fornecedor.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Telefone Fixo</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+351 210 000 000"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Nome do Contacto</label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="João Silva"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Telemóvel Contacto</label>
                <input
                  type="text"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="+351 900 000 000"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
                />
              </div>
            </div>
          </div>
        </div>

        <div className={activeTab === 'endereco' ? 'block animate-in fade-in slide-in-from-right-4 duration-300' : 'hidden'}>
           <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Nome do Endereço (ex: Sede, Armazém)</label>
              <input
                type="text"
                value={addressName}
                onChange={(e) => setAddressName(e.target.value)}
                placeholder="Sede"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Morada Completa</label>
              <textarea
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Rua da Empresa, Nº 123..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50 resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Código Postal</label>
                <input
                  type="text"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="1000-001"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Localidade / Cidade</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Lisboa"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">País</label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
              >
                <option value="PT">Portugal</option>
                <option value="ES">Espanha</option>
                <option value="FR">França</option>
                <option value="US">Estados Unidos</option>
                {/* ... mais países ... */}
              </select>
            </div>
          </div>
        </div>

        <div className={activeTab === 'faturacao' ? 'block animate-in fade-in slide-in-from-right-4 duration-300' : 'hidden'}>
           <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Sub-conta (Plano de Contas)</label>
              <input
                type="text"
                value={subAccount}
                onChange={(e) => setSubAccount(e.target.value)}
                placeholder="22.1.1.X"
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

            <div className="space-y-3 pt-2">
              <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={isTaxable}
                  onChange={(e) => setIsTaxable(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Entidade Sujeita a IVA
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={isVatExempt}
                  onChange={(e) => setIsVatExempt(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Isento de IVA
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={vatCashRegime}
                  onChange={(e) => setVatCashRegime(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Regime de IVA de Caixa
              </label>
            </div>
          </div>
        </div>

        <div className={activeTab === 'avancado' ? 'block animate-in fade-in slide-in-from-right-4 duration-300' : 'hidden'}>
           <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Observações em Documentos</label>
              <textarea
                rows={2}
                value={documentObservations}
                onChange={(e) => setDocumentObservations(e.target.value)}
                placeholder="Texto que aparecerá impresso nos documentos..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50 resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Observações Internas</label>
              <textarea
                rows={2}
                value={internalObservations}
                onChange={(e) => setInternalObservations(e.target.value)}
                placeholder="Informações apenas para uso interno..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50 resize-none"
              />
            </div>
            
            <div className="space-y-3 pt-2">
              <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoInvoicing}
                  onChange={(e) => setAutoInvoicing(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Faturação Automática
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={model10}
                  onChange={(e) => setModel10(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Incluir no Modelo 10 (IRS)
              </label>
            </div>
          </div>
        </div>
      </form>
    </SideDrawer>
  );
};
