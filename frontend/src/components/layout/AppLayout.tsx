'use client';

import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { AIDrawer } from './AIDrawer';
import { CommandPalette } from './CommandPalette';
import { CreateTransactionModal } from '@/components/shared/CreateTransactionModal';
import { CreateCategoryModal } from '@/components/shared/CreateCategoryModal';
import { CreateSupplierModal } from '@/components/shared/CreateSupplierModal';
import { CreateCustomerModal } from '@/components/shared/CreateCustomerModal';
import { useApp } from '@/context/AppContext';

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [createModalType, setCreateModalType] = useState<string | null>(null);
  const { isAiDrawerOpen, isSidebarCollapsed } = useApp();

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col font-sans antialiased">
      {/* Full-width TopBar - Spans 100% across the top ABOVE the left sidebar */}
      <TopBar
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenCreateModal={(type) => setCreateModalType(type || 'transaction')}
        isAiDrawerOpen={isAiDrawerOpen}
      />

      {/* Main Viewport Container */}
      <div className="flex-1 flex min-w-0 pt-16">
        {/* Fixed Left Sidebar - Starts below TopBar with 10px vertical gap and curved border */}
        <Sidebar />

        {/* Main Right Content Area - Smoothly shifts when AI Side Panel is Open or Sidebar is Collapsed */}
        <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out ${
          isSidebarCollapsed ? 'pl-[90px]' : 'pl-[265px] md:pl-[225px] lg:pl-[265px]'
        } ${
          isAiDrawerOpen ? 'pr-[420px] md:pr-[360px] lg:pr-[420px]' : 'pr-0'
        }`}>
          {/* Page Content Viewport */}
          <main className="flex-1 px-4 sm:px-6 py-5 max-w-[1750px] w-full mx-auto space-y-4">
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
