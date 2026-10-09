'use client';

import { toast } from 'sonner';
import React, { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { fetchSuppliers } from '@/services/data';
import { Supplier } from '@/types';
import { Truck, Mail, Plus, Tag, Calendar, Trash2, Search } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { CreateSupplierModal } from '@/components/shared/CreateSupplierModal';
import { deleteSupplier } from '@/services/data';
import { useRouter } from 'next/navigation';
import {
  Badge, Button, IconButton, Card, Input, Table, THead, TBody, Th, Tr, Td, TableMessage, LoadingState, EmptyState, useConfirm,
} from '@/components/ui';

export default function SuppliersPage() {
  const { formatMoney, setPageHeader } = useApp();
  const router = useRouter();
  const confirm = useConfirm();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    async function load() {
      const sups = await fetchSuppliers();
      setSuppliers(sups);
      setLoaded(true);
    }
    load();
  }, []);

  useEffect(() => {
    setPageHeader('Fornecedores', 'Cada fornecedor tem uma categoria padrão, aplicada automaticamente às faturas recebidas');
  }, [setPageHeader]);

  const handleSupplierCreated = (newSup: Supplier) => {
    setSuppliers(prev => [...prev, newSup]);
  };

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: 'Eliminar este fornecedor?',
      description: `${name} deixa de aparecer nesta lista.`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    setDeletingId(id);
    const outcome = await deleteSupplier(id);
    setDeletingId(null);
    if (!outcome.ok) {
      toast.error(outcome.error || 'Não foi possível eliminar.');
      return;
    }
    // Arquivado ou eliminado, deixa de constar desta lista; a mensagem do
    // servidor diz qual dos dois aconteceu.
    setSuppliers(prev => prev.filter(s => s.id !== id));
    toast.success(outcome.message || 'Fornecedor eliminado.');
  };

  const q = query.trim().toLowerCase();
  const visible = q
    ? suppliers.filter(s => [s.name, s.nif, s.email, s.default_category_name].some(v => String(v ?? '').toLowerCase().includes(q)))
    : suppliers;

  const open = (id: string) => router.push(`/registry/suppliers/${id}`);

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
            aria-label="Procurar fornecedores"
            className="pl-8"
          />
        </div>
        <Button className="ml-auto" onClick={() => setIsModalOpen(true)} icon={<Plus className="text-emerald-400" />}>
          Novo fornecedor
        </Button>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <THead>
            <tr>
              <Th>Fornecedor</Th>
              <Th>NIF</Th>
              <Th>Categoria padrão</Th>
              <Th>Email de contacto</Th>
              <Th>Último movimento</Th>
              <Th numeric>Total gasto</Th>
              <Th align="right"><span className="sr-only">Acções</span></Th>
            </tr>
          </THead>
          <TBody className="font-medium">
            {!loaded ? (
              <TableMessage colSpan={7}><LoadingState /></TableMessage>
            ) : suppliers.length === 0 ? (
              <TableMessage colSpan={7}>
                <EmptyState
                  icon={<Truck />}
                  title="Ainda não há fornecedores"
                  description="Registe o primeiro fornecedor para classificar as faturas recebidas automaticamente."
                />
              </TableMessage>
            ) : visible.length === 0 ? (
              <TableMessage colSpan={7}>
                <EmptyState icon={<Search />} title="Nenhum fornecedor corresponde à pesquisa" />
              </TableMessage>
            ) : visible.map((s) => (
              <Tr
                key={s.id}
                onClick={() => open(s.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) open(s.id); }}
                tabIndex={0}
                role="link"
                aria-label={`Abrir ficha de ${s.name}`}
                className="focus-visible:outline-none focus-visible:bg-neutral-50"
              >
                <Td className="font-semibold text-neutral-900">
                  <div className="flex items-center gap-2.5">
                    <div className="size-7 rounded-md bg-neutral-100 text-neutral-600 flex items-center justify-center shrink-0">
                      <Truck className="size-3.5" aria-hidden="true" />
                    </div>
                    <span>{s.name}</span>
                  </div>
                </Td>
                <Td className="font-mono text-neutral-600">{s.nif}</Td>
                <Td>
                  <Badge>
                    <Tag className="size-3 text-neutral-500" aria-hidden="true" />
                    {s.default_category_name}
                  </Badge>
                </Td>
                <Td className="text-neutral-600">
                  <div className="flex items-center gap-1.5">
                    <Mail className="size-3.5 text-neutral-400" aria-hidden="true" />
                    <span>{s.email || 'Sem email'}</span>
                  </div>
                </Td>
                <Td className="text-neutral-600 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="size-3.5 text-neutral-400" aria-hidden="true" />
                    <span>{formatDate(s.last_transaction_date)}</span>
                  </div>
                </Td>
                <Td numeric className="font-semibold text-neutral-900">
                  {formatMoney(s.total_spent)}
                </Td>
                <Td align="right">
                  <IconButton
                    label={`Eliminar ${s.name}`}
                    variant="danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(s.id, s.name);
                    }}
                    onKeyDown={(e) => e.stopPropagation()}
                    disabled={deletingId === s.id}
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
        <CreateSupplierModal
          onClose={() => setIsModalOpen(false)}
          onCreated={handleSupplierCreated}
        />
      )}

    </div>
  );
}
