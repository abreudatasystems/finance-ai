'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useApp } from '@/context/AppContext';
import {
  Search,
  Sparkles,
  Bell,
  Plus,
  Building2,
  ChevronDown,
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
      <div className="flex items-center gap-3 sm:gap-5">
        {/* Hamburger Menu (Mobile Only) */}
        <button
          onClick={toggleMobileMenu}
          className="md:hidden p-1.5 rounded-lg text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 transition-colors"
        >
          <Menu className="w-6 h-6" />
        </button>

        {/* Brand Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 sm:gap-2.5 group">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-black flex items-center justify-center text-white font-bold shadow-md group-hover:scale-105 transition-all border border-neutral-800">
            <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-emerald-400 text-emerald-400" />
          </div>
          <div className="hidden sm:flex items-center gap-1 font-extrabold text-neutral-900 text-base tracking-tight">
            Finance <span className="text-emerald-600">AI</span>
          </div>
        </Link>

        <div className="hidden sm:block h-5 w-px bg-neutral-200" />

        {/* Company Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsCompanyDropdownOpen(!isCompanyDropdownOpen)}
            className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-xl border border-neutral-200/80 hover:border-neutral-300 bg-neutral-50/80 hover:bg-neutral-100/80 text-[10px] sm:text-xs font-semibold text-neutral-800 transition-colors cursor-pointer"
          >
            <Building2 className="w-3.5 h-3.5 text-neutral-700 hidden sm:block" />
            <span className="truncate max-w-[100px] sm:max-w-none">{currentCompany?.name || 'Empresa'}</span>
            <ChevronDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-neutral-400" />
          </button>

          {isCompanyDropdownOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-56 bg-white rounded-xl border border-neutral-200 shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-3 py-1.5 text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                Minhas Empresas
              </div>
              {companies.map((comp) => (
                <button
                  key={comp.id}
                  onClick={() => {
                    switchCompany(comp.id);
                    setIsCompanyDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors cursor-pointer ${
                    comp.id === currentCompany?.id
                      ? 'bg-neutral-100 text-neutral-900 font-bold'
                      : 'text-neutral-700 hover:bg-neutral-50 font-medium'
                  }`}
                >
                  <span>{comp.name}</span>
                  <span className="text-[10px] text-neutral-400 font-mono">{comp.currency}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Dynamic Page Header */}
        {(pageTitle || pageSubtitle) && (
          <>
            <div className="hidden lg:block h-6 w-px bg-neutral-200 ml-1" />
            <div className="hidden lg:flex flex-col ml-1 border-l-2 border-emerald-400 pl-3 justify-center">
              <span className="text-[13px] font-extrabold text-neutral-900 leading-none tracking-tight">{pageTitle}</span>
              {pageSubtitle && <span className="text-[10px] font-medium text-neutral-500 leading-none mt-1">{pageSubtitle}</span>}
            </div>
          </>
        )}

      </div>

      {/* Right Section: Actions & Utilities */}
      <div className="flex items-center gap-3">
        
        {/* Quick Search Ctrl+K */}
        <button
          onClick={onOpenSearch}
          className="flex items-center gap-2 px-2 sm:px-3.5 py-2 rounded-xl border border-neutral-200/80 bg-neutral-50/80 hover:bg-neutral-100/80 text-neutral-400 text-xs transition-colors cursor-pointer"
        >
          <Search className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-neutral-400" />
          <span className="hidden sm:inline text-neutral-500 font-medium">Pesquisar ou atalhos...</span>
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-white border border-neutral-200 rounded-md text-neutral-400 font-semibold shadow-2xs ml-2">
            ⌘K
          </kbd>
        </button>

        {/* Global "+ Novo" Dropdown Button */}
        <div className="relative">
          <button
            onClick={() => setIsCreateDropdownOpen(!isCreateDropdownOpen)}
            className="flex items-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-2 rounded-xl bg-black hover:bg-neutral-800 active:scale-95 text-white font-bold text-xs shadow-xs border border-neutral-900 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">Novo</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-70 ml-0.5 hidden sm:block" />
          </button>

          {isCreateDropdownOpen && (
            <div className="absolute top-full right-0 mt-1.5 w-52 bg-white rounded-xl border border-neutral-200 shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-150">
              <button
                onClick={() => {
                  setIsCreateDropdownOpen(false);
                  onOpenCreateModal?.('transaction');
                }}
                className="w-full text-left px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 flex items-center gap-2 cursor-pointer"
              >
                <CreditCard className="w-3.5 h-3.5 text-neutral-900" />
                Novo Lançamento
              </button>
              <button
                onClick={() => {
                  setIsCreateDropdownOpen(false);
                  onOpenCreateModal?.('expense');
                }}
                className="w-full text-left px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 flex items-center gap-2 cursor-pointer"
              >
                <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
                Nova Despesa
              </button>
              <button
                onClick={() => {
                  setIsCreateDropdownOpen(false);
                  onOpenCreateModal?.('income');
                }}
                className="w-full text-left px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 flex items-center gap-2 cursor-pointer"
              >
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                Nova Receita
              </button>
              <div className="my-1 border-t border-neutral-100" />
              <button
                onClick={() => {
                  setIsCreateDropdownOpen(false);
                  onOpenCreateModal?.('category');
                }}
                className="w-full text-left px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 flex items-center gap-2 cursor-pointer"
              >
                <Building2 className="w-3.5 h-3.5 text-neutral-800" />
                Nova Categoria
              </button>
              <button
                onClick={() => {
                  setIsCreateDropdownOpen(false);
                  onOpenCreateModal?.('supplier');
                }}
                className="w-full text-left px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 flex items-center gap-2 cursor-pointer"
              >
                <Building2 className="w-3.5 h-3.5 text-neutral-800" />
                Novo Fornecedor
              </button>
              <button
                onClick={() => {
                  setIsCreateDropdownOpen(false);
                  onOpenCreateModal?.('customer');
                }}
                className="w-full text-left px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 flex items-center gap-2 cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                Novo Cliente
              </button>
              <div className="my-1 border-t border-neutral-100" />
              <button
                onClick={() => {
                  setIsCreateDropdownOpen(false);
                  onOpenCreateModal?.('document');
                }}
                className="w-full text-left px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 flex items-center gap-2 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-amber-500" />
                Upload Documento IA
              </button>
            </div>
          )}
        </div>

        {/* AI Assistant Side Panel Trigger Button */}
        <button
          onClick={toggleAiDrawer}
          className={`hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer border ${
            isAiDrawerOpen 
              ? 'bg-black text-white border-black shadow-xs' 
              : 'bg-neutral-100 hover:bg-neutral-200/80 text-neutral-900 border-neutral-200/80 shadow-2xs'
          }`}
          title="Alternar Painel Lateral Finance AI"
        >
          <Sparkles className={`w-4 h-4 ${isAiDrawerOpen ? 'text-emerald-400' : 'text-emerald-600 animate-pulse'}`} />
          <span>Finance Copilot</span>
        </button>

        {/* Notification Bell */}
        <button className="relative p-2 rounded-xl text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 transition-colors cursor-pointer" title="Notificações">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white animate-ping" />
        </button>

        {/* Settings Button */}
        <Link
          href="/settings"
          className="hidden sm:flex p-2 rounded-xl text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 transition-colors cursor-pointer items-center justify-center"
          title="Configurações da Plataforma"
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
