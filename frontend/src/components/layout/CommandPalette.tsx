'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, FileText, Wallet, FolderTree, Truck, Sparkles, ArrowRight, CheckCheck, LayoutDashboard } from 'lucide-react';
import { IconButton } from '@/components/ui';
import { useApp } from '@/context/AppContext';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const router = useRouter();
  const { openAiDrawer } = useApp();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const navigateTo = (path: string) => {
    router.push(path);
    onClose();
  };

  const quickLinks = [
    { label: 'Ir para o Painel', path: '/dashboard', icon: LayoutDashboard, group: 'Navegação' },
    { label: 'Ir para Automação (OCR)', path: '/documents/inbox', icon: FileText, group: 'Navegação' },
    { label: 'Ir para Fluxo de Caixa', path: '/financial/cash-flow', icon: Wallet, group: 'Navegação' },
    { label: 'Ir para Aprovações', path: '/documents/approvals', icon: CheckCheck, group: 'Navegação' },
    { label: 'Ir para Configurações (categorias)', path: '/settings', icon: FolderTree, group: 'Navegação' },
    { label: 'Ir para Fornecedores', path: '/registry/suppliers', icon: Truck, group: 'Navegação' }
  ];

  const filteredLinks = quickLinks.filter(l => l.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6 md:p-20 select-none">
      {/* Backdrop */}
      <div 
        onClick={onClose} 
        aria-hidden="true"
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-150" 
      />

      <div className="relative max-w-xl mx-auto bg-white rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Search Header */}
        <div className="flex items-center px-4 border-b border-neutral-100">
          <Search className="w-4 h-4 text-neutral-400 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ir para uma página ou perguntar ao assistente…"
            aria-label="Pesquisar"
            className="w-full px-3 py-4 text-xs bg-transparent border-none focus:outline-none text-neutral-800 placeholder-neutral-400 font-medium"
            autoFocus
          />
          <IconButton label="Fechar pesquisa (Esc)" onClick={onClose}>
            <X />
          </IconButton>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-1">
          {/* Ask AI Trigger */}
          <button
            type="button"
            onClick={() => {
              onClose();
              openAiDrawer();
            }}
            className="w-full px-3 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold text-xs flex items-center justify-between transition-colors border border-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <span>Perguntar à Finance AI: &ldquo;{query || 'Resumo financeiro'}&rdquo;</span>
            </div>
            <ArrowRight className="w-4 h-4 text-emerald-600" />
          </button>

          <div className="px-3 pt-2 text-2xs font-bold text-neutral-400 uppercase tracking-wider">
            Navegação rápida
          </div>

          {filteredLinks.length === 0 && (
            <p className="px-3 py-2 text-xs text-neutral-500">Nenhuma página corresponde à pesquisa.</p>
          )}

          {filteredLinks.map((link, idx) => {
            const Icon = link.icon;
            return (
              <button
                type="button"
                key={idx}
                onClick={() => navigateTo(link.path)}
                className="w-full px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 rounded-xl flex items-center justify-between transition-colors group focus-visible:outline-none focus-visible:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 text-neutral-400 group-hover:text-emerald-600 transition-colors" />
                  <span>{link.label}</span>
                </div>
                <span className="text-2xs text-neutral-400 font-mono">{link.path}</span>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-neutral-50 border-t border-neutral-100 flex items-center justify-between text-2xs text-neutral-400">
          <div className="flex items-center gap-2">
            <span>Use <kbd className="px-1 bg-white border border-neutral-200 rounded">Tab</kbd> para navegar</span>
          </div>
          <span>Pressione <kbd className="px-1 bg-white border border-neutral-200 rounded">Esc</kbd> para fechar</span>
        </div>
      </div>
    </div>
  );
};
