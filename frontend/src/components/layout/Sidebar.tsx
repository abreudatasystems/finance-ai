'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import {
  LayoutDashboard,
  Inbox,
  CheckSquare,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  BarChart3,
  FolderTree,
  Users,
  Building2,
  History,
  PanelLeftClose,
  PanelLeftOpen
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
  const { isSidebarCollapsed, toggleSidebar } = useApp();

  const navGroups: NavGroup[] = [
    {
      group: 'COMMAND CENTER',
      items: [
        { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }
      ]
    },
    {
      group: 'AUTOMATION ENGINE',
      items: [
        { label: 'Finance Inbox', href: '/documents/inbox', icon: Inbox, badge: '5' },
        { label: 'Aprovações IA', href: '/approvals', icon: CheckSquare, badge: '3', highlight: true }
      ]
    },
    {
      group: 'FINANCIAL OPERATIONS',
      items: [
        { label: 'Fluxo de Caixa', href: '/financial/cash-flow', icon: Wallet },
        { label: 'Contas a Pagar', href: '/financial/payables', icon: ArrowDownLeft },
        { label: 'Contas a Receber', href: '/financial/receivables', icon: ArrowUpRight }
      ]
    },
    {
      group: 'GESTÃO & AUDITORIA',
      items: [
        { label: 'Relatórios', href: '/reports', icon: BarChart3 },
        { label: 'Categorias', href: '/registry/categories', icon: FolderTree },
        { label: 'Fornecedores', href: '/registry/suppliers', icon: Building2 },
        { label: 'Clientes', href: '/registry/customers', icon: Users },
        { label: 'Auditoria', href: '/audit', icon: History }
      ]
    }
  ];

  return (
    <aside
      className={`fixed left-0 top-[74px] z-40 bg-black text-neutral-300 flex flex-col h-[calc(100vh-84px)] rounded-r-3xl border-r border-t border-b border-neutral-800/80 shadow-2xl transition-[width] duration-300 ease-in-out select-none overflow-hidden ${
        isSidebarCollapsed ? 'w-[72px]' : 'w-[250px] lg:w-[250px] md:w-[210px]'
      }`}
    >
      {/* Top Controls: Collapse / Expand Toggle Button */}
      <div className="h-12 border-b border-neutral-800/80 flex items-center bg-neutral-950/80 shrink-0">
        <div className="w-[52px] h-full flex items-center justify-center shrink-0">
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-xl hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors cursor-pointer"
            title={isSidebarCollapsed ? 'Expandir Menu' : 'Recolher Menu'}
          >
            {isSidebarCollapsed ? (
              <PanelLeftOpen className="w-5 h-5 text-emerald-400" />
            ) : (
              <PanelLeftClose className="w-5 h-5 text-neutral-400" />
            )}
          </button>
        </div>
        <span className={`text-[10px] font-bold text-neutral-400 tracking-wider uppercase whitespace-nowrap overflow-hidden transition-all duration-300 ease-in-out ${
          isSidebarCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100 pr-4'
        }`}>
          Navegação
        </span>
      </div>

      {/* Navigation Links Container */}
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-4 scrollbar-thin scrollbar-thumb-neutral-800">
        {navGroups.map((group, idx) => (
          <div key={idx} className="space-y-1">
            {/* FIXED HEADER HEIGHT (h-5) */}
            <div className="h-5 flex items-center px-4">
              <h3 className={`text-[9px] font-bold text-neutral-500 uppercase tracking-widest whitespace-nowrap overflow-hidden transition-opacity duration-300 ease-in-out ${
                isSidebarCollapsed ? 'opacity-0' : 'opacity-100'
              }`}>
                {group.group}
              </h3>
            </div>

            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={isSidebarCollapsed ? item.label : undefined}
                    className={`flex items-center h-11 rounded-xl text-xs font-semibold transition-all duration-200 group relative overflow-hidden ${
                      isActive
                        ? 'bg-neutral-900 text-white font-bold border border-neutral-700 shadow-xs'
                        : 'text-neutral-400 hover:text-white hover:bg-neutral-900/80'
                    }`}
                  >
                    {/* FIXED ICON BOX (52px wide) */}
                    <div className="w-[52px] h-full flex items-center justify-center shrink-0">
                      <Icon className={`w-[22px] h-[22px] transition-colors duration-200 ${
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
                      <span className={`text-[10px] rounded-full font-bold px-1.5 py-0.5 ml-auto mr-3 transition-opacity duration-300 ${
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
  );
};
