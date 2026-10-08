'use client';

import { toast } from 'sonner';
import React, { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { fetchItems, deleteItem } from '@/services/data';
import { Item } from '@/types';
import { Package, Tag, Plus, Trash2, Briefcase } from 'lucide-react';
import { CreateItemModal } from '@/components/shared/CreateItemModal';
import {
  Badge, Button, IconButton, Card, Table, THead, TBody, Th, Tr, Td, TableMessage, LoadingState, EmptyState, useConfirm,
} from '@/components/ui';

export default function ItemsPage() {
  const { formatMoney, setPageHeader } = useApp();
  const confirm = useConfirm();
  const [items, setItems] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      // Fetch all items by passing no kind, or fetch both and combine if API requires it.
      // Looking at the data service, passing undefined might fetch all, or we fetch both:
      const [prods, servs] = await Promise.all([
        fetchItems('product'),
        fetchItems('service')
      ]);
      setItems([...prods, ...servs].sort((a, b) => a.code.localeCompare(b.code)));
      setLoaded(true);
    }
    load();
  }, []);

  useEffect(() => {
    setPageHeader('Produtos e Serviços', 'Catálogo único de produtos e serviços para faturação');
  }, [setPageHeader]);

  const handleItemCreated = (newItem: Item) => {
    setItems(prev => [newItem, ...prev]);
  };

  const handleDelete = async (id: string, code: string) => {
    const ok = await confirm({
      title: 'Eliminar este item?',
      description: `${code} deixa de aparecer no catálogo.`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    setDeletingId(id);
    const outcome = await deleteItem(id);
    setDeletingId(null);
    if (!outcome.ok) {
      toast.error(outcome.error || 'Não foi possível eliminar.');
      return;
    }
    // Arquivado ou eliminado, deixa de constar desta lista; a mensagem do
    // servidor diz qual dos dois aconteceu.
    setItems(prev => prev.filter(c => c.id !== id));
    toast.success(outcome.message || 'Item eliminado.');
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">

      <div className="flex justify-end">
        <Button onClick={() => setIsModalOpen(true)} icon={<Plus className="text-emerald-400" />}>
          Novo item
        </Button>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <THead>
            <tr>
              <Th>Código e descrição</Th>
              <Th>Tipo</Th>
              <Th>EAN</Th>
              <Th>Família</Th>
              <Th>Taxa de IVA</Th>
              <Th numeric>Preço de venda</Th>
              <Th align="right"><span className="sr-only">Acções</span></Th>
            </tr>
          </THead>
          <TBody className="font-medium">
            {!loaded ? (
              <TableMessage colSpan={7}><LoadingState /></TableMessage>
            ) : items.length === 0 ? (
              <TableMessage colSpan={7}>
                <EmptyState
                  icon={<Package />}
                  title="Nenhum item registado"
                  description="Clique em «Novo item» para começar o catálogo."
                />
              </TableMessage>
            ) : items.map((p) => (
              <Tr key={p.id}>
                <Td className="font-bold text-neutral-900">
                  <div className="flex items-center gap-2.5">
                    <div className={`size-8 rounded-xl flex items-center justify-center border shrink-0 ${p.kind === 'service' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                      {p.kind === 'service' ? <Briefcase className="size-4" aria-hidden="true" /> : <Package className="size-4" aria-hidden="true" />}
                    </div>
                    <div className="flex flex-col">
                      <span>{p.code}</span>
                      <span className="text-2xs text-neutral-500 font-medium">{p.description}</span>
                    </div>
                  </div>
                </Td>
                <Td>
                  <Badge tone={p.kind === 'service' ? 'warning' : 'success'} className="uppercase tracking-wide">
                    {p.kind === 'service' ? 'Serviço' : 'Produto'}
                  </Badge>
                </Td>
                <Td className="font-mono text-neutral-600">{p.ean || '-'}</Td>
                <Td className="text-neutral-600">{p.family || '-'}</Td>
                <Td>
                  <Badge>
                    <Tag className="size-3 text-neutral-500" aria-hidden="true" />
                    {p.vat_rate}
                  </Badge>
                </Td>
                <Td numeric className="font-bold text-neutral-900">
                  <div className="flex flex-col items-end">
                    <span>{formatMoney(p.price_1)}</span>
                    {p.price_includes_vat && <span className="text-2xs text-neutral-500 font-medium">c/ IVA</span>}
                  </div>
                </Td>
                <Td align="right">
                  <IconButton
                    label={`Eliminar ${p.code}`}
                    variant="danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(p.id, p.code);
                    }}
                    disabled={deletingId === p.id}
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
        <CreateItemModal
          items={items}
          onClose={() => setIsModalOpen(false)}
          onCreated={handleItemCreated}
        />
      )}

    </div>
  );
}
