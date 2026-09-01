'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Currency, Company, UserRole, User } from '@/types';
import { fetchCompanies, fetchUsers } from '@/services/data';

interface AppContextType {
  currentCompany: Company | null;
  companies: Company[];
  currency: Currency;
  setCurrency: (c: Currency) => void;
  currencySymbol: string;
  userRole: UserRole;
  currentUser: User | null;
  isAiDrawerOpen: boolean;
  openAiDrawer: () => void;
  closeAiDrawer: () => void;
  toggleAiDrawer: () => void;
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;
  isMobileMenuOpen: boolean;
  toggleMobileMenu: () => void;
  closeMobileMenu: () => void;
  switchCompany: (companyId: string) => void;
  formatMoney: (amount: number) => string;
  pageTitle: string;
  pageSubtitle: string;
  setPageHeader: (title: string, subtitle?: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null);
  const [currency, setCurrency] = useState<Currency>('EUR');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<UserRole>('owner');
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [pageTitle, setPageTitle] = useState<string>('');
  const [pageSubtitle, setPageSubtitle] = useState<string>('');

  const setPageHeader = (title: string, subtitle: string = '') => {
    setPageTitle(title);
    setPageSubtitle(subtitle);
  };

  useEffect(() => {
    async function initData() {
      const comps = await fetchCompanies();
      setCompanies(comps);
      if (comps.length > 0) {
        setCurrentCompany(comps[0]);
        setCurrency(comps[0].currency);
      }
      const users = await fetchUsers();
      if (users.length > 0) {
        setCurrentUser(users[0]);
      }
    }
    initData();
  }, []);

  const switchCompany = (companyId: string) => {
    const comp = companies.find(c => c.id === companyId);
    if (comp) {
      setCurrentCompany(comp);
      setCurrency(comp.currency);
      if (currentUser) {
        const mem = currentUser.memberships.find(m => m.company_id === companyId);
        if (mem) setUserRole(mem.role);
      }
    }
  };

  const openAiDrawer = () => setIsAiDrawerOpen(true);
  const closeAiDrawer = () => setIsAiDrawerOpen(false);
  const toggleAiDrawer = () => setIsAiDrawerOpen(prev => !prev);
  const toggleSidebar = () => setIsSidebarCollapsed(prev => !prev);
  const toggleMobileMenu = () => setIsMobileMenuOpen(prev => !prev);
  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  const getSymbol = (curr: Currency) => {
    switch (curr) {
      case 'EUR': return '€';
      case 'USD': return '$';
      case 'BRL': return 'R$';
      case 'GBP': return '£';
      default: return '€';
    }
  };

  const currencySymbol = getSymbol(currency);

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('pt-PT', {
      style: 'currency',
      currency: currency
    }).format(amount);
  };

  return (
    <AppContext.Provider
      value={{
        currentCompany,
        companies,
        currency,
        setCurrency,
        currencySymbol,
        userRole,
        currentUser,
        isAiDrawerOpen,
        openAiDrawer,
        closeAiDrawer,
        toggleAiDrawer,
        isSidebarCollapsed,
        toggleSidebar,
        isMobileMenuOpen,
        toggleMobileMenu,
        closeMobileMenu,
        switchCompany,
        formatMoney,
        pageTitle,
        pageSubtitle,
        setPageHeader
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
