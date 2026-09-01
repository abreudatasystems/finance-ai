'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Currency, Company, UserRole, User } from '@/types';
import { fetchCompanies, fetchCurrentUser } from '@/services/data';
import { getActiveCompany, setActiveCompany } from '@/services/api';

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
  /** Re-reads the companies this login belongs to (after creating or joining one). */
  refreshCompanies: () => Promise<Company[]>;
  /** False for accounts that only exist because they were invited. */
  canCreateCompanies: boolean;
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

  /** Pick the company this session works in: the remembered one, else the first. */
  const applyActive = (comps: Company[], preferred?: string | null) => {
    if (comps.length === 0) return;
    const chosen = comps.find((c) => c.id === preferred) || comps[0];
    setCurrentCompany(chosen);
    setCurrency(chosen.currency);
    setUserRole((chosen.role as UserRole) || 'owner');
    setActiveCompany(chosen.id);
  };

  const refreshCompanies = async (): Promise<Company[]> => {
    const comps = await fetchCompanies();
    setCompanies(comps);
    applyActive(comps, currentCompany?.id || getActiveCompany());
    return comps;
  };

  useEffect(() => {
    async function initData() {
      const comps = await fetchCompanies();
      setCompanies(comps);
      applyActive(comps, getActiveCompany());
      setCurrentUser(await fetchCurrentUser());
    }
    initData();
  }, []);

  /**
   * Switch tenant. The company id is stored before reloading so every request
   * of the next session carries the new X-Company-Id from the first byte — no
   * window in which a page still shows the previous company's numbers.
   */
  const switchCompany = (companyId: string) => {
    const comp = companies.find((c) => c.id === companyId);
    if (!comp || comp.id === currentCompany?.id) return;
    setActiveCompany(comp.id);
    setCurrentCompany(comp);
    setCurrency(comp.currency);
    setUserRole((comp.role as UserRole) || 'owner');
    if (typeof window !== 'undefined') window.location.reload();
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
        refreshCompanies,
        canCreateCompanies: currentUser?.can_create_companies !== false,
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
