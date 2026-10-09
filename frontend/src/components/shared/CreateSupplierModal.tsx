'use client';

import React, { useState } from 'react';
import { User, MapPin, FileText, Settings} from 'lucide-react';
import { Supplier } from '@/types';
import { apiPost } from '@/services/api';
import { SideDrawer } from './SideDrawer';
import { toast } from 'sonner';
import { Button, Field, Input, Segmented, Select, Textarea } from '@/components/ui';

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
  // Sem campo no formulário: fica registado por preencher, não por variar.
  const contactRole = '';
  
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
  const acceptAdEmails = false;

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

    // Se a gravação falha, falha. A versão anterior inventava aqui um registo
    // local, com um id fabricado e a empresa em código — o fornecedor aparecia na
    // lista como se tivesse sido guardado e desaparecia ao recarregar a página.
    const created = await apiPost<Supplier>('/suppliers/', payload);
    setSubmitting(false);

    if (!created) {
      toast.error('Não foi possível guardar. Verifique a ligação e tente de novo.');
      return;
    }

    onCreated(created);
    onClose();
  };

  const renderTabs = () => (
    <div className="mb-3 max-w-full overflow-x-auto">
      <Segmented<Tab>
        aria-label="Secções do formulário"
        value={activeTab}
        onChange={setActiveTab}
        options={[
          { value: 'geral', label: <span className="inline-flex items-center gap-1.5"><User className="size-3.5" />Geral</span> },
          { value: 'endereco', label: <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5" />Endereço</span> },
          { value: 'faturacao', label: <span className="inline-flex items-center gap-1.5"><FileText className="size-3.5" />Faturação & IVA</span> },
          { value: 'avancado', label: <span className="inline-flex items-center gap-1.5"><Settings className="size-3.5" />Avançado</span> },
        ]}
      />
    </div>
  );

  return (
    <SideDrawer
      title="Registar Novo Fornecedor"
      subtitle="Registe uma entidade de despesa com detalhe"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form={FORM_ID} loading={submitting}>
            Guardar Fornecedor
          </Button>
        </>
      }
    >
      {renderTabs()}

      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-3">
        <div className={activeTab === 'geral' ? 'block animate-in fade-in slide-in-from-right-4 duration-300' : 'hidden'}>
          <div className="space-y-3">
            <Field label="Nome do Fornecedor" required>
              {(p) => (
                <Input
                  {...p}
                  type="text"
                  required
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Microsoft, Empresa XPTO Lda..."
                />
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="NIF / NIPC">
                {(p) => (
                  <Input
                    {...p}
                    type="text"
                    value={nif}
                    onChange={(e) => setNif(e.target.value)}
                    placeholder="PT500000000"
                    className="font-mono"
                  />
                )}
              </Field>
              <Field label="Website">
                {(p) => (
                  <Input
                    {...p}
                    type="text"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="www.exemplo.com"
                  />
                )}
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Email Principal">
                {(p) => (
                  <Input
                    {...p}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="geral@fornecedor.com"
                  />
                )}
              </Field>
              <Field label="Telefone Fixo">
                {(p) => (
                  <Input
                    {...p}
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+351 210 000 000"
                  />
                )}
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nome do Contacto">
                {(p) => (
                  <Input
                    {...p}
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="João Silva"
                  />
                )}
              </Field>
              <Field label="Telemóvel Contacto">
                {(p) => (
                  <Input
                    {...p}
                    type="text"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    placeholder="+351 900 000 000"
                  />
                )}
              </Field>
            </div>
          </div>
        </div>

        <div className={activeTab === 'endereco' ? 'block animate-in fade-in slide-in-from-right-4 duration-300' : 'hidden'}>
           <div className="space-y-3">
            <Field label="Nome do Endereço (ex: Sede, Armazém)">
              {(p) => (
                <Input
                  {...p}
                  type="text"
                  value={addressName}
                  onChange={(e) => setAddressName(e.target.value)}
                  placeholder="Sede"
                />
              )}
            </Field>
            <Field label="Morada Completa">
              {(p) => (
                <Textarea
                  {...p}
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Rua da Empresa, Nº 123..."
                  className="resize-none"
                />
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Código Postal">
                {(p) => (
                  <Input
                    {...p}
                    type="text"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    placeholder="1000-001"
                  />
                )}
              </Field>
              <Field label="Localidade / Cidade">
                {(p) => (
                  <Input
                    {...p}
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Lisboa"
                  />
                )}
              </Field>
            </div>
            <Field label="País">
              {(p) => (
                <Select
                  {...p}
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                >
                  <option value="PT">Portugal</option>
                  <option value="ES">Espanha</option>
                  <option value="FR">França</option>
                  <option value="US">Estados Unidos</option>
                  {/* ... mais países ... */}
                </Select>
              )}
            </Field>
          </div>
        </div>

        <div className={activeTab === 'faturacao' ? 'block animate-in fade-in slide-in-from-right-4 duration-300' : 'hidden'}>
           <div className="space-y-3">
            <Field label="Sub-conta (Plano de Contas)">
              {(p) => (
                <Input
                  {...p}
                  type="text"
                  value={subAccount}
                  onChange={(e) => setSubAccount(e.target.value)}
                  placeholder="22.1.1.X"
                />
              )}
            </Field>
            <Field label="Categoria Padrão (IA)">
              {(p) => (
                <Select
                  {...p}
                  value={defaultCategory}
                  onChange={(e) => setDefaultCategory(e.target.value)}
                >
                  <option value="Marketing > Google Ads">Marketing &gt; Google Ads</option>
                  <option value="Software > Licenças & SaaS">Software &gt; Licenças &amp; SaaS</option>
                  <option value="Operações > Instalações & Energia">Operações &gt; Instalações &amp; Energia</option>
                  <option value="Viagens > Transporte">Viagens &gt; Transporte</option>
                </Select>
              )}
            </Field>

            <div className="space-y-3 pt-2">
              <label className="flex items-center gap-2 text-xs text-neutral-700 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={isTaxable}
                  onChange={(e) => setIsTaxable(e.target.checked)}
                  className="size-4 rounded border-neutral-300 accent-emerald-600 cursor-pointer"
                />
                Entidade Sujeita a IVA
              </label>
              <label className="flex items-center gap-2 text-xs text-neutral-700 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={isVatExempt}
                  onChange={(e) => setIsVatExempt(e.target.checked)}
                  className="size-4 rounded border-neutral-300 accent-emerald-600 cursor-pointer"
                />
                Isento de IVA
              </label>
              <label className="flex items-center gap-2 text-xs text-neutral-700 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={vatCashRegime}
                  onChange={(e) => setVatCashRegime(e.target.checked)}
                  className="size-4 rounded border-neutral-300 accent-emerald-600 cursor-pointer"
                />
                Regime de IVA de Caixa
              </label>
            </div>
          </div>
        </div>

        <div className={activeTab === 'avancado' ? 'block animate-in fade-in slide-in-from-right-4 duration-300' : 'hidden'}>
           <div className="space-y-3">
            <Field label="Observações em Documentos">
              {(p) => (
                <Textarea
                  {...p}
                  rows={2}
                  value={documentObservations}
                  onChange={(e) => setDocumentObservations(e.target.value)}
                  placeholder="Texto que aparecerá impresso nos documentos..."
                  className="resize-none"
                />
              )}
            </Field>
            <Field label="Observações Internas">
              {(p) => (
                <Textarea
                  {...p}
                  rows={2}
                  value={internalObservations}
                  onChange={(e) => setInternalObservations(e.target.value)}
                  placeholder="Informações apenas para uso interno..."
                  className="resize-none"
                />
              )}
            </Field>
            
            <div className="space-y-3 pt-2">
              <label className="flex items-center gap-2 text-xs text-neutral-700 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoInvoicing}
                  onChange={(e) => setAutoInvoicing(e.target.checked)}
                  className="size-4 rounded border-neutral-300 accent-emerald-600 cursor-pointer"
                />
                Faturação Automática
              </label>
              <label className="flex items-center gap-2 text-xs text-neutral-700 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={model10}
                  onChange={(e) => setModel10(e.target.checked)}
                  className="size-4 rounded border-neutral-300 accent-emerald-600 cursor-pointer"
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
