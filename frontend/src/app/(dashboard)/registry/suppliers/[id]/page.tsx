'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { EntityAccount } from '@/components/entities/EntityAccount';
import { toast } from 'sonner';
import { fetchSuppliers, updateSupplier, fetchTransactions } from '@/services/data';
import { Supplier, Transaction } from '@/types';
import {
  ArrowLeft, Pencil, Save, X, Building2, Wallet,
  Mail, Phone, Tag, MapPin, Check, AlertTriangle
} from 'lucide-react';
import {
  Badge, Button, Card, CardHeader, CardBody, EmptyState, Field, Input, LoadingState, Textarea,
  Table, THead, TBody, Th, Tr, Td,
} from '@/components/ui';
import { formatDate } from '@/lib/format';

function EditInput({ label, value, onChange, placeholder }: { label: React.ReactNode; value: string | undefined; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <Field label={label}>
      {(p) => (
        <Input
          {...p}
          type="text"
          value={value ?? ''}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

function ReadValue({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="text-2xs uppercase tracking-wider text-neutral-500 font-bold flex items-center gap-1">{label}</span>
      {children}
    </div>
  );
}

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} icon={icon} />
      <CardBody>{children}</CardBody>
    </Card>
  );
}

export default function SupplierProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id || '');
  const { formatMoney, setPageHeader } = useApp();

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [history, setHistory] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<Partial<Supplier>>({});
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const sups = await fetchSuppliers();
      const trxs = await fetchTransactions();
      const s = sups.find(x => x.id === id);
      if (active) {
        if (s) {
          setSupplier(s);
          setForm(s);
          setHistory(trxs.filter(t => (t.entity_id === s.id) || (t.entity_name.toLowerCase() === s.name.toLowerCase())));
          setPageHeader(s.name, `NIF: ${s.nif || 'Não definido'}`);
        }
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [id, setPageHeader]);

  const set = (patch: Partial<Supplier>) => setForm((f) => ({ ...f, ...patch }));

  const startEdit = () => { setForm(supplier || {}); setEditMode(true); };
  const cancelEdit = () => { setForm(supplier || {}); setEditMode(false); };

  const save = async () => {
    if (!supplier) return;
    setSaving(true);
    const { data: updated, error } = await updateSupplier(supplier.id, form);
    if (!updated) {
      // Fica em modo de edição, com o que foi escrito, para se poder corrigir.
      setSaving(false);
      toast.error(error || 'Não foi possível guardar as alterações.');
      return;
    }
    const merged = { ...supplier, ...updated };
    setSupplier(merged);
    setForm(merged);
    setSaving(false);
    setEditMode(false);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2200);
  };

  if (loading) {
    return <LoadingState label="A carregar perfil do fornecedor…" className="py-24" />;
  }

  if (!supplier) {
    return (
      <EmptyState
        className="py-24"
        icon={<AlertTriangle className="text-amber-500" />}
        title="Fornecedor não encontrado"
        action={
          <Button variant="secondary" size="sm" icon={<ArrowLeft />} onClick={() => router.push('/registry/suppliers')}>
            Voltar à lista de fornecedores
          </Button>
        }
      />
    );
  }

  const v = editMode ? form : supplier;

  return (
    <div className="space-y-4 animate-in fade-in duration-300 pb-6">
      {/* Header Actions */}
      <div className="flex justify-between gap-3 pb-3">
        <Button variant="secondary" icon={<ArrowLeft />} onClick={() => router.push('/registry/suppliers')} aria-label="Voltar">
          <span className="hidden sm:inline">Voltar</span>
        </Button>

        <div className="flex items-center gap-2 shrink-0">
          {savedToast && (
            <Badge tone="success" className="text-xs px-2.5 py-1.5">
              <Check className="w-3.5 h-3.5" aria-hidden="true" /> Guardado
            </Badge>
          )}
          {!editMode ? (
            <Button icon={<Pencil />} onClick={startEdit}>
              Editar Perfil
            </Button>
          ) : (
            <>
              <Button variant="secondary" icon={<X />} onClick={cancelEdit}>
                Cancelar
              </Button>
              <Button icon={<Save />} onClick={save} loading={saving}>
                Guardar Alterações
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT COLUMN - Profile Details */}
        <div className="lg:col-span-1 space-y-4">
          <SectionCard title="Informações Principais" icon={<Building2 />}>
            <div className="space-y-4">
              {editMode ? (
                <EditInput label="Nome da Entidade" value={form.name} onChange={(x) => set({ name: x })} placeholder="Nome da empresa ou pessoa" />
              ) : (
                <ReadValue label="Nome da Entidade">
                  <div className="text-sm font-bold text-neutral-800">{v.name}</div>
                </ReadValue>
              )}
              {editMode ? (
                <EditInput label="NIF / NIPC" value={form.nif} onChange={(x) => set({ nif: x })} placeholder="Ex: PT500000000" />
              ) : (
                <ReadValue label="NIF / NIPC">
                  <div className="text-sm font-semibold text-neutral-700">{v.nif || '—'}</div>
                </ReadValue>
              )}
              {editMode ? (
                <EditInput label="Categoria de Despesa Padrão" value={form.default_category_name} onChange={(x) => set({ default_category_name: x })} placeholder="Ex: Marketing > Google Ads" />
              ) : (
                <ReadValue label="Categoria de Despesa Padrão">
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-700 bg-neutral-100 px-2.5 py-1 rounded-lg border border-neutral-200">
                    <Tag className="w-3.5 h-3.5 text-neutral-500" aria-hidden="true" />
                    {v.default_category_name || '—'}
                  </div>
                </ReadValue>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Contactos & Endereço" icon={<MapPin />}>
            <div className="space-y-4">
              {editMode ? (
                <EditInput label="Email de Faturação" value={form.email} onChange={(x) => set({ email: x })} placeholder="email@fornecedor.pt" />
              ) : (
                <ReadValue label={<><Mail className="w-3 h-3" aria-hidden="true" /> Email de Faturação</>}>
                  <div className="text-sm font-medium text-neutral-700">{v.email || '—'}</div>
                </ReadValue>
              )}
              {editMode ? (
                <EditInput label="Telemóvel / Telefone" value={form.phone} onChange={(x) => set({ phone: x })} placeholder="+351 900 000 000" />
              ) : (
                <ReadValue label={<><Phone className="w-3 h-3" aria-hidden="true" /> Telemóvel / Telefone</>}>
                  <div className="text-sm font-medium text-neutral-700">{v.phone || '—'}</div>
                </ReadValue>
              )}
              {editMode ? (
                <Field label="Morada">
                  {(p) => (
                    <Textarea
                      {...p}
                      rows={2}
                      value={form.address ?? ''}
                      onChange={(e) => set({ address: e.target.value })}
                      placeholder="Sede da empresa..."
                      className="resize-none"
                    />
                  )}
                </Field>
              ) : (
                <ReadValue label={<><MapPin className="w-3 h-3" aria-hidden="true" /> Morada</>}>
                  <div className="text-sm font-medium text-neutral-700 whitespace-pre-line">{v.address || '—'}</div>
                </ReadValue>
              )}
            </div>
          </SectionCard>
        </div>

        {/* RIGHT COLUMN - Financials & History */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-neutral-950 text-white rounded-2xl p-5 flex items-center justify-between shadow-xs">
            <div>
              <span className="text-2xs uppercase tracking-widest text-neutral-300 font-bold flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5" aria-hidden="true" /> Total Gasto
              </span>
              <div className="text-3xl font-black text-white mt-1 tabular-nums">
                {formatMoney(supplier.total_spent || 0)}
              </div>
              <p className="text-2xs text-neutral-400 mt-1">Total de despesas registadas para este fornecedor.</p>
            </div>
          </div>

          {/* Conta-corrente: os dois lados da relação, derivados dos documentos */}
          <EntityAccount entityId={supplier.id} formatMoney={formatMoney} focus="compras" />

          <Card className="overflow-hidden">
            <CardHeader title="Histórico de Movimentos" icon={<Wallet />} />
            {history.length > 0 ? (
              <Table>
                <THead>
                  <tr>
                    <Th>Data</Th>
                    <Th>Descrição</Th>
                    <Th>Categoria</Th>
                    <Th numeric>Valor</Th>
                    <Th align="right">Estado</Th>
                  </tr>
                </THead>
                <TBody>
                  {history.map(t => (
                    <Tr key={t.id} onClick={() => router.push(`/financial/cash-flow/${t.id}`)}>
                      <Td className="text-neutral-500 tabular-nums whitespace-nowrap">{formatDate(t.date)}</Td>
                      <Td className="font-semibold text-neutral-800">{t.description}</Td>
                      <Td className="text-neutral-600">{t.category_name}</Td>
                      <Td numeric className="font-bold text-neutral-900">-{formatMoney(t.amount)}</Td>
                      <Td align="right">
                        <Badge tone={t.status === 'paid' || t.status === 'received' ? 'success' : 'warning'}>
                          {t.status === 'paid' || t.status === 'received' ? 'Liquidado' : 'Pendente'}
                        </Badge>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            ) : (
              <EmptyState title="Ainda não existem movimentos para este fornecedor." />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
