'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, FileText, Wallet, FolderTree, Building2, Sparkles, ArrowRight } from 'lucide-react';
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
    { label: 'Ir para Dashboard', path: '/dashboard', icon: Wallet, group: 'Navegação' },
    { label: 'Ir para Finance Inbox', path: '/documents/inbox', icon: FileText, group: 'Navegação' },
    { label: 'Ir para Fluxo de Caixa', path: '/financial/cash-flow', icon: Wallet, group: 'Navegação' },
    { label: 'Ir para Aprovações IA', path: '/approvals', icon: Sparkles, group: 'Navegação' },
    { label: 'Ir para Categorias', path: '/registry/categories', icon: FolderTree, group: 'Navegação' },
    { label: 'Ir para Fornecedores', path: '/registry/suppliers', icon: Building2, group: 'Navegação' }
  ];

  const filteredLinks = quickLinks.filter(l => l.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6 md:p-20 select-none">
      {/* Backdrop */}
      <div 
        onClick={onClose} 
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-150" 
      />

      <div className="relative max-w-xl mx-auto bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Search Header */}
        <div className="flex items-center px-4 border-b border-slate-100">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar documentos, fornecedores, lançamentos ou comandos (Ctrl+K)..."
            className="w-full px-3 py-4 text-xs bg-transparent border-none focus:outline-none text-slate-800 placeholder-slate-400 font-medium"
            autoFocus
          />
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-1">
          {/* Ask AI Trigger */}
          <button
            onClick={() => {
              onClose();
              openAiDrawer();
            }}
            className="w-full px-3 py-2.5 rounded-xl bg-gradient-to-r from-indigo-50 to-violet-50 hover:from-indigo-100 hover:to-violet-100 text-indigo-700 font-semibold text-xs flex items-center justify-between transition-colors border border-indigo-100"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600 animate-pulse" />
              <span>Perguntar à Finance AI: &ldquo;{query || 'Resumo financeiro'}&rdquo;</span>
            </div>
            <ArrowRight className="w-4 h-4 text-indigo-500" />
          </button>

          <div className="px-3 pt-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Navegação Rápida
          </div>

          {filteredLinks.map((link, idx) => {
            const Icon = link.icon;
            return (
              <button
                key={idx}
                onClick={() => navigateTo(link.path)}
                className="w-full px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded-xl flex items-center justify-between transition-colors group"
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition-colors" />
                  <span>{link.label}</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">{link.path}</span>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-2">
            <span>Usar <kbd className="px-1 bg-white border rounded">↑</kbd> <kbd className="px-1 bg-white border rounded">↓</kbd> para navegar</span>
          </div>
          <span>Pressione <kbd className="px-1 bg-white border rounded">ESC</kbd> para fechar</span>
        </div>
      </div>
    </div>
  );
};
