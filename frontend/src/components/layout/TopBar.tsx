'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useApp } from '@/context/AppContext';
import { Button, IconButton } from '@/components/ui';
import {
  Search,
  Sparkles,
  Bell,
  Plus,
  Building2,
  ChevronDown,
  Tag,
  Truck,
  FileText,
  TrendingDown,
  TrendingUp,
  CreditCard,
  UserCheck,
  Zap,
  Settings,
  Menu
} from 'lucide-react';

interface TopBarProps {
  onOpenSearch?: () => void;
  onOpenCreateModal?: (type?: string) => void;
  isAiDrawerOpen?: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({ onOpenSearch, onOpenCreateModal, isAiDrawerOpen }) => {
  const {
    currentCompany,
    companies,
    switchCompany,
    toggleAiDrawer,
    toggleMobileMenu,
    currentUser,
    pageTitle,
    pageSubtitle
  } = useApp();

  const [isCompanyDropdownOpen, setIsCompanyDropdownOpen] = useState(false);
  const [isCreateDropdownOpen, setIsCreateDropdownOpen] = useState(false);

  return (
    <header className={`h-16 bg-white/80 backdrop-blur-md fixed top-0 left-0 z-50 flex items-center justify-between px-5 select-none transition-all duration-300 ${
      isAiDrawerOpen ? 'right-[420px] md:right-[360px] lg:right-[420px]' : 'right-0'
    }`}>
      
      {/* Left Section: Brand Logo + Company Switcher */}
      <div className="flex items-center gap-3 sm:gap-5 min-w-0 flex-1">
        {/* Hamburger Menu (Mobile Only) */}
        <IconButton label="Abrir menu" onClick={toggleMobileMenu} size="md" className="md:hidden [&_svg]:size-5">
          <Menu />
        </IconButton>

        {/* Brand Logo */}
        <Link href="/dashboard" aria-label="Finance AI — Painel" className="flex items-center gap-2 sm:gap-2.5 group shrink-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-black flex items-center justify-center text-white font-bold shadow-md group-hover:scale-105 transition-all border border-neutral-800">
            <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-emerald-400 text-emerald-400" />
          </div>
          <div className="hidden sm:flex items-center gap-1 font-extrabold text-neutral-900 text-base tracking-tight">
            Finance <span className="text-emerald-600">AI</span>
          </div>
        </Link>

        <div className="hidden sm:block h-5 w-px bg-neutral-200" />

        {/* Company Dropdown */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setIsCompanyDropdownOpen(!isCompanyDropdownOpen)}
            aria-haspopup="menu"
            aria-expanded={isCompanyDropdownOpen}
            aria-label={`Empresa activa: ${currentCompany?.name || 'Empresa'}. Mudar de empresa`}
            className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-xl border border-neutral-200/80 hover:border-neutral-300 bg-neutral-50/80 hover:bg-neutral-100/80 text-2xs sm:text-xs font-semibold text-neutral-800 transition-colors cursor-pointer"
          >
            <Building2 className="w-3.5 h-3.5 text-neutral-700 hidden sm:block" />
            <span className="truncate max-w-[100px] sm:max-w-none">{currentCompany?.name || 'Empresa'}</span>
            <ChevronDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-neutral-400" />
          </button>

          {isCompanyDropdownOpen && (
            <div role="menu" className="absolute top-full left-0 mt-1.5 w-56 bg-white rounded-xl border border-neutral-200 shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-3 py-1.5 text-2xs font-bold text-neutral-400 uppercase tracking-wider">
                As minhas empresas
              </div>
              {companies.map((comp) => (
                <button
                  type="button"
                  key={comp.id}
                  role="menuitemradio"
                  aria-checked={comp.id === currentCompany?.id}
                  onClick={() => {
                    switchCompany(comp.id);
                    setIsCompanyDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:bg-neutral-100 ${
                    comp.id === currentCompany?.id
                      ? 'bg-neutral-100 text-neutral-900 font-bold'
                      : 'text-neutral-700 hover:bg-neutral-50 font-medium'
                  }`}
                >
                  <span className="truncate">{comp.name}</span>
                  {/* The role travels with the company: the same login can be
                      owner here and consulta there. */}
                  <span className="text-2xs text-neutral-500 font-bold uppercase shrink-0">
                    {comp.role_label || comp.currency}
                  </span>
                </button>
              ))}

              <div className="h-px bg-neutral-100 my-1" />
              <Link
                href="/settings/companies"
                role="menuitem"
                onClick={() => setIsCompanyDropdownOpen(false)}
                className="w-full text-left px-3 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-50 flex items-center gap-2"
              >
                <Building2 className="w-3.5 h-3.5" /> Gerir empresas
              </Link>
            </div>
          )}
        </div>

        {/* Dynamic Page Header */}
        {/* No telemóvel não cabe ao lado do seletor de empresa: o AppLayout
            mostra-o no topo do conteúdo. */}
        {(pageTitle || pageSubtitle) && (
          <div className="hidden sm:flex flex-col min-w-0 border-l-2 border-emerald-500 pl-2.5 sm:pl-3 justify-center">
            <h1 className="text-xs sm:text-sm font-extrabold text-neutral-900 leading-tight tracking-tight truncate">{pageTitle}</h1>
            {pageSubtitle && (
              <span className="hidden sm:block text-2xs font-medium text-neutral-500 leading-tight truncate">{pageSubtitle}</span>
            )}
          </div>
        )}

      </div>

      {/* Right Section: Actions & Utilities */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0 pl-2">
        
        {/* Quick Search Ctrl+K */}
        <button
          type="button"
          onClick={onOpenSearch}
          aria-label="Pesquisar ou atalhos (Ctrl+K)"
          className="flex items-center gap-2 px-2 sm:px-3.5 py-2 rounded-xl border border-neutral-200/80 bg-neutral-50/80 hover:bg-neutral-100/80 text-neutral-400 text-xs transition-colors cursor-pointer"
        >
          <Search className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-neutral-400" />
          <span className="hidden sm:inline text-neutral-500 font-medium">Pesquisar ou atalhos...</span>
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-2xs font-mono bg-white border border-neutral-200 rounded-md text-neutral-400 font-semibold shadow-2xs ml-2">
            ⌘K
          </kbd>
        </button>

        {/* Global "+ Novo" Dropdown Button */}
        <div className="relative">
          <Button
            onClick={() => setIsCreateDropdownOpen(!isCreateDropdownOpen)}
            aria-label="Criar novo"
            aria-haspopup="menu"
            aria-expanded={isCreateDropdownOpen}
            size="sm"
            icon={<Plus className="text-emerald-400" />}
            className="px-2.5 sm:px-3"
          >
            <span className="hidden sm:inline">Novo</span>
            <ChevronDown className="opacity-70 hidden sm:block" />
          </Button>

          {isCreateDropdownOpen && (
            <div role="menu" className="absolute top-full right-0 mt-1.5 w-52 bg-white rounded-xl border border-neutral-200 shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-150">
              <button
                type="button"
                onClick={() => {
                  setIsCreateDropdownOpen(false);
                  onOpenCreateModal?.('transaction');
                }}
                role="menuitem"
                className="w-full text-left px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 focus-visible:outline-none focus-visible:bg-neutral-100 flex items-center gap-2 cursor-pointer"
              >
                <CreditCard className="w-3.5 h-3.5 text-neutral-900" />
                Novo Lançamento
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCreateDropdownOpen(false);
                  onOpenCreateModal?.('expense');
                }}
                role="menuitem"
                className="w-full text-left px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 focus-visible:outline-none focus-visible:bg-neutral-100 flex items-center gap-2 cursor-pointer"
              >
                <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
                Nova Despesa
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCreateDropdownOpen(false);
                  onOpenCreateModal?.('income');
                }}
                role="menuitem"
                className="w-full text-left px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 focus-visible:outline-none focus-visible:bg-neutral-100 flex items-center gap-2 cursor-pointer"
              >
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                Nova Receita
              </button>
              <div className="my-1 border-t border-neutral-100" />
              <button
                type="button"
                onClick={() => {
                  setIsCreateDropdownOpen(false);
                  onOpenCreateModal?.('category');
                }}
                role="menuitem"
                className="w-full text-left px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 focus-visible:outline-none focus-visible:bg-neutral-100 flex items-center gap-2 cursor-pointer"
              >
                <Tag className="w-3.5 h-3.5 text-neutral-800" />
                Nova Categoria
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCreateDropdownOpen(false);
                  onOpenCreateModal?.('supplier');
                }}
                role="menuitem"
                className="w-full text-left px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 focus-visible:outline-none focus-visible:bg-neutral-100 flex items-center gap-2 cursor-pointer"
              >
                <Truck className="w-3.5 h-3.5 text-neutral-800" />
                Novo Fornecedor
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCreateDropdownOpen(false);
                  onOpenCreateModal?.('customer');
                }}
                role="menuitem"
                className="w-full text-left px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 focus-visible:outline-none focus-visible:bg-neutral-100 flex items-center gap-2 cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                Novo Cliente
              </button>
              <div className="my-1 border-t border-neutral-100" />
              <button
                type="button"
                onClick={() => {
                  setIsCreateDropdownOpen(false);
                  onOpenCreateModal?.('document');
                }}
                role="menuitem"
                className="w-full text-left px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 focus-visible:outline-none focus-visible:bg-neutral-100 flex items-center gap-2 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-amber-500" />
                Carregar documento (IA)
              </button>
            </div>
          )}
        </div>

        {/* AI Assistant Side Panel Trigger Button */}
        <Button
          onClick={toggleAiDrawer}
          variant={isAiDrawerOpen ? 'primary' : 'secondary'}
          size="sm"
          aria-pressed={isAiDrawerOpen}
          className="hidden sm:inline-flex"
          title="Abrir ou fechar o Assistente"
          icon={<Sparkles className={isAiDrawerOpen ? 'text-emerald-400' : 'text-emerald-600'} />}
        >
          Assistente
        </Button>

        {/* Notification Bell */}
        {/* Era um botão sem acção, com um ponto vermelho a piscar sempre —
            houvesse ou não alertas. Agora leva à página dos alertas reais. */}
        <Link
          href="/alerts"
          className="relative p-2 rounded-xl text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 transition-colors cursor-pointer"
          title="Alertas"
          aria-label="Ver alertas"
        >
          <Bell className="w-4 h-4" />
        </Link>

        {/* Settings Button */}
        <Link
          href="/settings"
          className="hidden sm:flex p-2 rounded-xl text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 transition-colors cursor-pointer items-center justify-center"
          title="Configurações da Plataforma"
          aria-label="Configurações"
        >
          <Settings className="w-4 h-4" />
        </Link>

        {/* User Profile Avatar */}
        <div className="flex items-center gap-2 pl-1">
          <div className="w-8 h-8 rounded-xl bg-black text-white flex items-center justify-center font-bold text-xs shadow-2xs border border-neutral-800">
            {currentUser?.name?.charAt(0) || 'U'}
          </div>
        </div>

      </div>
    </header>
  );
};
