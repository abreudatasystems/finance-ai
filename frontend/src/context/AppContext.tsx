'use client';

import React, { createContext, useCallback, useContext, useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Currency, Company, UserRole, User } from '@/types';
import { fetchCompanies, fetchCurrentUser } from '@/services/data';
import { clearActiveCompany, getActiveCompany, setActiveCompany } from '@/services/api';

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
  /** Escolhe a empresa e abre o painel dela (a partir da página de escolha). */
  enterCompany: (companyId: string) => void;
  /** True depois de a lista de empresas ter chegado do servidor. */
  companiesLoaded: boolean;
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
  const [companiesLoaded, setCompaniesLoaded] = useState(false);
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null);
  const [currency, setCurrency] = useState<Currency>('EUR');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<UserRole>('owner');
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const pathname = usePathname();
  // O título pertence à rota que o definiu: ao mudar de página, uma página que
  // não define título não herda o da anterior.
  const [pageHeader, setPageHeaderState] = useState<{ title: string; subtitle: string; path: string | null }>({
    title: '',
    subtitle: '',
    path: null,
  });

  const setPageHeader = useCallback(
    (title: string, subtitle: string = '') => {
      setPageHeaderState({ title, subtitle, path: pathname });
    },
    [pathname],
  );

  const headerIsCurrent = pageHeader.path === pathname;
  const pageTitle = headerIsCurrent ? pageHeader.title : '';
  const pageSubtitle = headerIsCurrent ? pageHeader.subtitle : '';

  /**
   * Pick the company this session works in: the remembered one, else the first.
   * Only a company the user actually chose is remembered — without a choice the
   * app sends them to /companies to pick one (see AppLayout).
   */
  const applyActive = (comps: Company[], preferred?: string | null) => {
    if (comps.length === 0) return;
    const remembered = comps.find((c) => c.id === preferred);
    const chosen = remembered || comps[0];
    setCurrentCompany(chosen);
    setCurrency(chosen.currency);
    setUserRole((chosen.role as UserRole) || 'owner');
    if (remembered) setActiveCompany(chosen.id);
    // Uma empresa lembrada a que já não se tem acesso (saiu da equipa) é esquecida.
    else if (preferred) clearActiveCompany();
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
      setCompaniesLoaded(true);
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

  const enterCompany = (companyId: string) => {
    setActiveCompany(companyId);
    // Recarga completa, pela mesma razão que switchCompany.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- recarga completa intencional
    if (typeof window !== 'undefined') window.location.assign('/dashboard');
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
        enterCompany,
        companiesLoaded,
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
