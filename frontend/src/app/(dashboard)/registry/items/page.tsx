'use client';

import { toast } from 'sonner';
import React, { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { fetchItems, deleteItem } from '@/services/data';
import { Item } from '@/types';
import { Package, Tag, Plus, Trash2, Briefcase, Search } from 'lucide-react';
import { CreateItemModal } from '@/components/shared/CreateItemModal';
import {
  Badge, Button, IconButton, Card, Input, Table, THead, TBody, Th, Tr, Td, TableMessage, LoadingState, EmptyState, useConfirm,
} from '@/components/ui';

export default function ItemsPage() {
  const { formatMoney, setPageHeader } = useApp();
  const confirm = useConfirm();
  const [items, setItems] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

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

  const q = query.trim().toLowerCase();
  const visible = q
    ? items.filter(p => [p.code, p.description, p.family, p.ean].some(v => String(v ?? '').toLowerCase().includes(q)))
    : items;

  return (
    <div className="space-y-4 animate-in fade-in duration-300">

      <Card className="p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-neutral-400 pointer-events-none" aria-hidden="true" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Procurar por código, descrição ou família"
            aria-label="Procurar itens"
            className="pl-8"
          />
        </div>
        <Button className="ml-auto" onClick={() => setIsModalOpen(true)} icon={<Plus className="text-emerald-400" />}>
          Novo item
        </Button>
      </Card>

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
            ) : visible.length === 0 ? (
              <TableMessage colSpan={7}>
                <EmptyState icon={<Search />} title="Nenhum item corresponde à pesquisa" />
              </TableMessage>
            ) : visible.map((p) => (
              <Tr key={p.id}>
                <Td className="font-semibold text-neutral-900">
                  <div className="flex items-center gap-2.5">
                    <div className={`size-7 rounded-md flex items-center justify-center shrink-0 ${p.kind === 'service' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                      {p.kind === 'service' ? <Briefcase className="size-3.5" aria-hidden="true" /> : <Package className="size-3.5" aria-hidden="true" />}
                    </div>
                    <div className="flex flex-col">
                      <span>{p.code}</span>
                      <span className="text-2xs text-neutral-500 font-medium">{p.description}</span>
                    </div>
                  </div>
                </Td>
                <Td>
                  <Badge tone={p.kind === 'service' ? 'warning' : 'success'}>
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
                <Td numeric className="font-semibold text-neutral-900">
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
