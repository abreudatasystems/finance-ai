'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { IconButton } from '@/components/ui';
import {
  LayoutDashboard, Wallet, BarChart3, Users, Truck, Receipt, PanelLeftClose, PanelLeftOpen, ScanText,
  FileText, HandCoins, Landmark, Package,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string | number;
  highlight?: boolean;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const { isSidebarCollapsed, toggleSidebar, isMobileMenuOpen, closeMobileMenu } = useApp();

  const navGroups: NavGroup[] = [
    {
      group: 'VISÃO GERAL',
      items: [
        // Os alertas vivem no sino da barra de topo (AlertsBell).
        { label: 'Painel', href: '/dashboard', icon: LayoutDashboard },
      ]
    },
    {
      group: 'TESOURARIA',
      items: [
        { label: 'Fluxo de Caixa', href: '/financial/cash-flow', icon: Wallet },
        { label: 'Contas a Pagar', href: '/financial/payables', icon: Receipt },
        { label: 'Contas a Receber', href: '/financial/receivables', icon: HandCoins },
        { label: 'Conciliação Bancária', href: '/financial/bank-reconciliation', icon: Landmark }
      ]
    },
    {
      group: 'INTELIGÊNCIA ARTIFICIAL',
      items: [
        { label: 'Automação (OCR)', href: '/documents/inbox', icon: ScanText, highlight: true },
      ]
    },
    {
      group: 'RELATÓRIOS & FISCALIDADE',
      items: [
        { label: 'Relatórios', href: '/reports', icon: BarChart3 },
        { label: 'Demonstração de Resultados', href: '/reports/dre', icon: FileText }
      ]
    },
    {
      group: 'REGISTOS',
      items: [
        { label: 'Produtos e Serviços', href: '/registry/items', icon: Package },
        { label: 'Fornecedores', href: '/registry/suppliers', icon: Truck },
        { label: 'Clientes', href: '/registry/customers', icon: Users }
      ]
    },
    // As Configurações abrem-se pela roda dentada da barra de topo.
  ];

  // Só o item mais específico fica activo: em /reports/dre acende "Demonstração
  // de Resultados", não também "Relatórios".
  const matches = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href + '/'));
  const activeHref = navGroups
    .flatMap((g) => g.items.map((i) => i.href))
    .filter(matches)
    .sort((a, b) => b.length - a.length)[0];

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-200"
          onClick={closeMobileMenu}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed left-0 top-[64px] md:top-[68px] z-50 bg-black text-neutral-300 flex flex-col h-[calc(100vh-64px)] md:h-[calc(100vh-74px)] rounded-none md:rounded-r-2xl border-r border-t border-b border-neutral-800/80 shadow-2xl transition-all duration-300 ease-in-out select-none overflow-hidden
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          ${isSidebarCollapsed ? 'w-[60px]' : 'w-[224px] md:w-[200px] lg:w-[224px]'}
        `}
      >
      {/* Top Controls: Collapse / Expand Toggle Button */}
      <div className="h-10 border-b border-neutral-800/80 flex items-center bg-neutral-950/80 shrink-0">
        <div className="w-[44px] ml-2 h-full flex items-center justify-center shrink-0">
          <IconButton
            label={isSidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
            onClick={toggleSidebar}
            aria-expanded={!isSidebarCollapsed}
            className="size-7 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 [&_svg]:size-4"
          >
            {isSidebarCollapsed ? (
              <PanelLeftOpen className="text-emerald-400" />
            ) : (
              <PanelLeftClose />
            )}
          </IconButton>
        </div>
        <span className={`text-2xs font-bold text-neutral-400 tracking-wider uppercase whitespace-nowrap overflow-hidden transition-all duration-300 ease-in-out ${
          isSidebarCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100 pr-4'
        }`}>
          Navegação
        </span>
      </div>

      {/* Navigation Links Container */}
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-2.5 scrollbar-thin scrollbar-thumb-neutral-800">
        {navGroups.map((group, idx) => (
          <div key={idx} className="space-y-0.5">
            {/* FIXED HEADER HEIGHT (h-5) */}
            <div className="h-5 flex items-center px-3">
              <h3 className={`text-2xs font-bold text-neutral-500 uppercase tracking-widest whitespace-nowrap overflow-hidden transition-opacity duration-300 ease-in-out ${
                isSidebarCollapsed ? 'opacity-0' : 'opacity-100'
              }`}>
                {group.group}
              </h3>
            </div>

            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = item.href === activeHref;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={isSidebarCollapsed ? item.label : undefined}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex items-center h-8 rounded-lg text-xs font-semibold transition-all duration-200 group relative overflow-hidden ${
                      isActive
                        ? 'bg-neutral-900 text-white font-bold border border-neutral-700 shadow-xs'
                        : 'text-neutral-400 hover:text-white hover:bg-neutral-900/80'
                    }`}
                  >
                    {/* FIXED ICON BOX (52px wide) */}
                    <div className="w-[44px] h-full flex items-center justify-center shrink-0">
                      <Icon className={`w-[17px] h-[17px] transition-colors duration-200 ${
                        isActive ? 'text-emerald-400' : 'text-neutral-400 group-hover:text-white'
                      }`} />
                    </div>

                    {/* TEXT LABEL */}
                    <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 ease-in-out ${
                      isSidebarCollapsed ? 'w-0 opacity-0 pointer-events-none' : 'w-auto opacity-100 pr-3'
                    }`}>
                      {item.label}
                    </span>

                    {/* Badge */}
                    {item.badge && !isSidebarCollapsed && (
                      <span className={`text-2xs rounded-full font-bold px-1.5 py-0.5 ml-auto mr-3 transition-opacity duration-300 ${
                        item.highlight 
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                          : 'bg-neutral-800 text-neutral-400 border border-neutral-700'
                      }`}>
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
    </>
  );
};
