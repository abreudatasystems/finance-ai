'use client';

import { toast } from 'sonner';
import React, { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { fetchCustomers } from '@/services/data';
import { Customer } from '@/types';
import { Users, Mail, Phone, Plus, Tag, Trash2, Search } from 'lucide-react';
import { CreateCustomerModal } from '@/components/shared/CreateCustomerModal';
import { deleteCustomer } from '@/services/data';
import { useRouter } from 'next/navigation';
import {
  Badge, Button, IconButton, Card, Input, Table, THead, TBody, Th, Tr, Td, TableMessage, LoadingState, EmptyState, useConfirm,
} from '@/components/ui';

export default function CustomersPage() {
  const { formatMoney, setPageHeader } = useApp();
  const router = useRouter();
  const confirm = useConfirm();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    async function load() {
      const custs = await fetchCustomers();
      setCustomers(custs);
      setLoaded(true);
    }
    load();
  }, []);

  useEffect(() => {
    setPageHeader('Clientes', 'Registo de clientes para faturação e conciliação de recebimentos');
  }, [setPageHeader]);

  const handleCustomerCreated = (newCust: Customer) => {
    setCustomers(prev => [...prev, newCust]);
  };

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: 'Eliminar este cliente?',
      description: `${name} deixa de aparecer nesta lista.`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    setDeletingId(id);
    const outcome = await deleteCustomer(id);
    setDeletingId(null);
    if (!outcome.ok) {
      toast.error(outcome.error || 'Não foi possível eliminar.');
      return;
    }
    // Arquivado ou eliminado, deixa de constar desta lista; a mensagem do
    // servidor diz qual dos dois aconteceu.
    setCustomers(prev => prev.filter(c => c.id !== id));
    toast.success(outcome.message || 'Cliente eliminado.');
  };

  const q = query.trim().toLowerCase();
  const visible = q
    ? customers.filter(c => [c.name, c.nif, c.email, c.phone, c.default_category_name].some(v => String(v ?? '').toLowerCase().includes(q)))
    : customers;

  const open = (id: string) => router.push(`/registry/customers/${id}`);

  return (
    <div className="space-y-4 animate-in fade-in duration-300">

      <Card className="p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-neutral-400 pointer-events-none" aria-hidden="true" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Procurar por nome, NIF ou email"
            aria-label="Procurar clientes"
            className="pl-8"
          />
        </div>
        <Button className="ml-auto" onClick={() => setIsModalOpen(true)} icon={<Plus className="text-emerald-400" />}>
          Novo cliente
        </Button>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <THead>
            <tr>
              <Th>Cliente</Th>
              <Th>NIF</Th>
              <Th>Categoria de receita padrão</Th>
              <Th>Email</Th>
              <Th>Telefone</Th>
              <Th numeric>Faturação acumulada</Th>
              <Th align="right"><span className="sr-only">Acções</span></Th>
            </tr>
          </THead>
          <TBody className="font-medium">
            {!loaded ? (
              <TableMessage colSpan={7}><LoadingState /></TableMessage>
            ) : customers.length === 0 ? (
              <TableMessage colSpan={7}>
                <EmptyState
                  icon={<Users />}
                  title="Ainda não há clientes"
                  description="Registe o primeiro cliente para associar os recebimentos automaticamente."
                />
              </TableMessage>
            ) : visible.length === 0 ? (
              <TableMessage colSpan={7}>
                <EmptyState icon={<Search />} title="Nenhum cliente corresponde à pesquisa" />
              </TableMessage>
            ) : visible.map((c) => (
              <Tr
                key={c.id}
                onClick={() => open(c.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) open(c.id); }}
                tabIndex={0}
                role="link"
                aria-label={`Abrir ficha de ${c.name}`}
                className="focus-visible:outline-none focus-visible:bg-neutral-50"
              >
                <Td className="font-semibold text-neutral-900">
                  <div className="flex items-center gap-2.5">
                    <div className="size-7 rounded-md bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                      <Users className="size-3.5" aria-hidden="true" />
                    </div>
                    <span>{c.name}</span>
                  </div>
                </Td>
                <Td className="font-mono text-neutral-600">{c.nif}</Td>
                <Td>
                  <Badge tone="success">
                    <Tag className="size-3" aria-hidden="true" />
                    {c.default_category_name}
                  </Badge>
                </Td>
                <Td className="text-neutral-600">
                  <div className="flex items-center gap-1.5">
                    <Mail className="size-3.5 text-neutral-400" aria-hidden="true" />
                    <span>{c.email || 'Sem email'}</span>
                  </div>
                </Td>
                <Td className="text-neutral-600 font-mono">
                  <div className="flex items-center gap-1.5">
                    <Phone className="size-3.5 text-neutral-400" aria-hidden="true" />
                    <span>{c.phone || 'Sem contacto'}</span>
                  </div>
                </Td>
                <Td numeric className="font-semibold text-emerald-700">
                  +{formatMoney(c.total_revenue)}
                </Td>
                <Td align="right">
                  <IconButton
                    label={`Eliminar ${c.name}`}
                    variant="danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(c.id, c.name);
                    }}
                    onKeyDown={(e) => e.stopPropagation()}
                    disabled={deletingId === c.id}
                  >
                    <Trash2 />
                  </IconButton>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>

      {/* Creation Modal */}
      {isModalOpen && (
        <CreateCustomerModal
          onClose={() => setIsModalOpen(false)}
          onCreated={handleCustomerCreated}
        />
      )}

    </div>
  );
}
