'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { EntityAccount } from '@/components/entities/EntityAccount';
import { fetchCustomers, updateCustomer, fetchTransactions } from '@/services/data';
import { Customer, Transaction } from '@/types';
import {
  ArrowLeft, Pencil, Save, X, Loader2, Building2, Wallet,
  Mail, Phone, Tag, MapPin, Check, AlertTriangle
} from 'lucide-react';

function EditInput({ value, onChange, placeholder }: { value: string | undefined; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white"
    />
  );
}

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5">
      <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2 mb-4">
        <span className="text-emerald-600">{icon}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}

export default function CustomerProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id || '');
  const { formatMoney, setPageHeader } = useApp();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [history, setHistory] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<Partial<Customer>>({});
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  useEffect(() => {
    // O guardião `active` já evitava escrever num ecrã desmontado, mas o
    // pedido seguia à mesma até ao fim. O sinal corta-o à saída.
    const controller = new AbortController();
    let active = true;
    (async () => {
      setLoading(true);
      const custs = await fetchCustomers();
      const trxs = await fetchTransactions(controller.signal);
      const c = custs.find(x => x.id === id);
      if (active) {
        if (c) {
          setCustomer(c);
          setForm(c);
          setHistory(trxs.filter(t => (t.entity_id === c.id) || (t.entity_name.toLowerCase() === c.name.toLowerCase())));
          setPageHeader(c.name, `NIF: ${c.nif || 'Não definido'}`);
        }
        setLoading(false);
      }
    })();
    return () => { active = false; controller.abort(); };
  }, [id, setPageHeader]);

  const set = (patch: Partial<Customer>) => setForm((f) => ({ ...f, ...patch }));

  const startEdit = () => { setForm(customer || {}); setEditMode(true); };
  const cancelEdit = () => { setForm(customer || {}); setEditMode(false); };

  const save = async () => {
    if (!customer) return;
    setSaving(true);
    const updated = await updateCustomer(customer.id, form);
    const merged = updated ?? { ...customer, ...form } as Customer;
    setCustomer(merged);
    setForm(merged);
    setSaving(false);
    setEditMode(false);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2200);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400 text-sm gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> A carregar perfil do cliente…
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="text-center py-24 space-y-3">
        <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
        <p className="text-sm font-semibold text-slate-700">Cliente não encontrado</p>
        <button onClick={() => router.push('/registry/customers')} className="text-xs text-emerald-600 font-bold hover:underline">
          ← Voltar à lista de clientes
        </button>
      </div>
    );
  }

  const v = editMode ? form : customer;

  return (
    <div className="space-y-4 animate-in fade-in duration-300 pb-6">
      {/* Header Actions */}
      <div className="flex justify-between gap-3 pb-3">
        <button onClick={() => router.push('/registry/customers')} className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 shadow-xs flex items-center gap-2 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-xs font-bold hidden sm:inline">Voltar</span>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          {savedToast && (
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> Guardado
            </span>
          )}
          {!editMode ? (
            <button onClick={startEdit} className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors">
              <Pencil className="w-3.5 h-3.5" /> Editar Perfil
            </button>
          ) : (
            <>
              <button onClick={cancelEdit} className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold text-xs hover:bg-slate-50 flex items-center gap-1.5">
                <X className="w-3.5 h-3.5" /> Cancelar
              </button>
              <button onClick={save} disabled={saving} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs disabled:opacity-70 transition-colors">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Guardar Alterações
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT COLUMN - Profile Details */}
        <div className="lg:col-span-1 space-y-4">
          <SectionCard title="Informações Principais" icon={<Building2 className="w-4 h-4" />}>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">Nome da Entidade</span>
                {editMode ? (
                  <EditInput value={form.name} onChange={(x) => set({ name: x })} placeholder="Nome da empresa ou pessoa" />
                ) : (
                  <div className="text-sm font-bold text-slate-800">{v.name}</div>
                )}
              </div>
              <div className="space-y-1.5">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">NIF / NIPC</span>
                {editMode ? (
                  <EditInput value={form.nif} onChange={(x) => set({ nif: x })} placeholder="Ex: PT500000000" />
                ) : (
                  <div className="text-sm font-semibold text-slate-700">{v.nif || '—'}</div>
                )}
              </div>
              <div className="space-y-1.5">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">Categoria de Receita Padrão</span>
                {editMode ? (
                  <EditInput value={form.default_category_name} onChange={(x) => set({ default_category_name: x })} placeholder="Ex: Vendas > Serviços" />
                ) : (
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                    <Tag className="w-3.5 h-3.5 text-emerald-500" />
                    {v.default_category_name || '—'}
                  </div>
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Contactos & Endereço" icon={<MapPin className="w-4 h-4" />}>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block flex items-center gap-1">
                  <Mail className="w-3 h-3" /> Email de Faturação
                </span>
                {editMode ? (
                  <EditInput value={form.email} onChange={(x) => set({ email: x })} placeholder="email@cliente.pt" />
                ) : (
                  <div className="text-sm font-medium text-slate-700">{v.email || '—'}</div>
                )}
              </div>
              <div className="space-y-1.5">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block flex items-center gap-1">
                  <Phone className="w-3 h-3" /> Telemóvel / Telefone
                </span>
                {editMode ? (
                  <EditInput value={form.phone} onChange={(x) => set({ phone: x })} placeholder="+351 900 000 000" />
                ) : (
                  <div className="text-sm font-medium text-slate-700">{v.phone || '—'}</div>
                )}
              </div>
            </div>
          </SectionCard>
        </div>

        {/* RIGHT COLUMN - Financials & History */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-gradient-to-br from-slate-900 to-emerald-950 text-white rounded-2xl p-5 flex items-center justify-between shadow-xs">
            <div>
              <span className="text-[10px] uppercase tracking-widest text-emerald-200 font-bold flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5" /> Faturação Acumulada
              </span>
              <div className="text-3xl font-black text-white mt-1">
                {formatMoney(customer.total_revenue || 0)}
              </div>
              <p className="text-[11px] text-emerald-100/70 mt-1">Total de receitas registadas para este cliente.</p>
            </div>
          </div>

          {/* Conta-corrente: os dois lados da relação, derivados dos documentos */}
          <EntityAccount entityId={customer.id} formatMoney={formatMoney} focus="vendas" />

          <SectionCard title="Histórico de Movimentos" icon={<Wallet className="w-4 h-4" />}>
            {history.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                      <th className="pb-2">Data</th>
                      <th className="pb-2">Descrição</th>
                      <th className="pb-2">Categoria</th>
                      <th className="pb-2 text-right">Valor</th>
                      <th className="pb-2 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {history.map(t => (
                      <tr 
                        key={t.id} 
                        onClick={() => router.push(`/financial/cash-flow/${t.id}`)}
                        className="hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        <td className="py-2.5 text-slate-500 font-mono">{t.date}</td>
                        <td className="py-2.5 font-semibold text-slate-800">{t.description}</td>
                        <td className="py-2.5 text-slate-600">{t.category_name}</td>
                        <td className="py-2.5 text-right font-bold text-emerald-600">+{formatMoney(t.amount)}</td>
                        <td className="py-2.5 text-right">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            t.status === 'paid' || t.status === 'received' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                          }`}>
                            {t.status === 'paid' || t.status === 'received' ? 'Liquidado' : 'Pendente'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-sm font-medium text-slate-500">Ainda não existem movimentos para este cliente.</p>
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
