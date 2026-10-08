'use client';

import React, { useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { AIDrawer } from './AIDrawer';
import { CommandPalette } from './CommandPalette';
import { CreateTransactionModal } from '@/components/shared/CreateTransactionModal';
import { CreateCategoryModal } from '@/components/shared/CreateCategoryModal';
import { CreateSupplierModal } from '@/components/shared/CreateSupplierModal';
import { CreateCustomerModal } from '@/components/shared/CreateCustomerModal';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { isAuthenticated, redirectToLogin } from '@/services/api';

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [createModalType, setCreateModalType] = useState<string | null>(null);
  const { isAiDrawerOpen, isSidebarCollapsed, pageTitle } = useApp();
  const router = useRouter();

  // Sem sessão não há empresa: em vez de um painel a 0 €, vai-se ao login.
  useEffect(() => {
    if (!isAuthenticated()) redirectToLogin();
  }, []);

  return (
    <div className="min-h-screen bg-white text-neutral-900 flex flex-col font-sans antialiased">
      {/* Full-width TopBar - Spans 100% across the top ABOVE the left sidebar */}
      <TopBar
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenCreateModal={(type) => {
          // Um documento entra pela Automação (OCR); não há formulário para ele.
          if (type === 'document') router.push('/documents/inbox');
          else setCreateModalType(type || 'transaction');
        }}
        isAiDrawerOpen={isAiDrawerOpen}
      />

      {/* Main Viewport Container */}
      <div className="flex-1 flex min-w-0 pt-16">
        {/* Fixed Left Sidebar - Starts below TopBar with 10px vertical gap and curved border */}
        <Sidebar />

        {/* Main Right Content Area - Smoothly shifts when AI Side Panel is Open or Sidebar is Collapsed */}
        <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out pl-0 ${
          isSidebarCollapsed ? 'md:pl-[110px]' : 'md:pl-[245px] lg:pl-[285px]'
        } ${
          isAiDrawerOpen ? 'pr-0 xl:pr-[420px]' : 'pr-0'
        }`}>
          {/* Page Content Viewport */}
          <main className="flex-1 px-4 sm:px-6 py-5 max-w-[1750px] w-full mx-auto space-y-4">
            {/* O título da página no telemóvel, onde a barra de topo não tem espaço. */}
            {pageTitle && (
              <h1 className="sm:hidden text-lg font-extrabold text-neutral-900 tracking-tight">{pageTitle}</h1>
            )}
            {children}
          </main>
        </div>
      </div>

      {/* Side-by-Side Transversal AI Assistant Panel */}
      <AIDrawer />

      {/* Global Command Palette Ctrl+K */}
      <CommandPalette
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />

      {/* Quick "+ Novo" Creation Modals */}
      {createModalType && (createModalType === 'transaction' || createModalType === 'expense' || createModalType === 'income') && (
        <CreateTransactionModal
          initialType={createModalType}
          onClose={() => setCreateModalType(null)}
        />
      )}

      {createModalType === 'category' && (
        <CreateCategoryModal
          onClose={() => setCreateModalType(null)}
          onCreated={() => setCreateModalType(null)}
        />
      )}

      {createModalType === 'supplier' && (
        <CreateSupplierModal
          onClose={() => setCreateModalType(null)}
          onCreated={() => setCreateModalType(null)}
        />
      )}

      {createModalType === 'customer' && (
        <CreateCustomerModal
          onClose={() => setCreateModalType(null)}
          onCreated={() => setCreateModalType(null)}
        />
      )}
    </div>
  );
};
