'use client';

/**
 * Escolha da empresa — a porta de entrada depois do login.
 *
 * É uma vista à parte, fora da moldura do painel: aqui ainda não se está
 * "dentro" de nenhuma empresa. Mostra todas as empresas deste login com o
 * resumo dos últimos seis meses de cada uma, e é daqui que se entra numa
 * delas ou se abre uma nova.
 */

import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  ArrowRight, Building2, Check, LogOut, Plus, Search, ShieldCheck, Users, Zap,
} from 'lucide-react';
import { Badge, Button, EmptyState, Input, LoadingState, Stat } from '@/components/ui';
import { CompanyCreateWizard } from '@/components/companies/CompanyCreateWizard';
import { useApp } from '@/context/AppContext';
import { clearToken, getActiveCompany, isAuthenticated, redirectToLogin } from '@/services/api';
import { fetchCompanySnapshot, type CompanySnapshot } from '@/services/data';
import type { Company } from '@/types';

function money(amount: number, currency: string = 'EUR') {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

function initials(name: string) {
  return name
    .replace(/,?\s+(Lda|SA|Unipessoal|S\.A\.)\.?$/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}

/** Barras do resultado mês a mês: verde acima de zero, vermelho abaixo. */
function TrendBars({ values }: { values: number[] }) {
  const max = Math.max(1, ...values.map((v) => Math.abs(v)));
  return (
    <div className="flex items-center gap-1 h-8" aria-hidden="true">
      {values.map((v, i) => (
        <div key={i} className="flex-1 h-full flex flex-col justify-center">
          <div className="h-1/2 flex items-end">
            {v > 0 && <div className="w-full rounded-t-sm bg-emerald-500" style={{ height: `${(v / max) * 100}%` }} />}
          </div>
          <div className="h-1/2 flex items-start">
            {v < 0 && <div className="w-full rounded-b-sm bg-rose-400" style={{ height: `${(-v / max) * 100}%` }} />}
          </div>
        </div>
      ))}
    </div>
  );
}

function CompanyCard({
  company, snapshot, lastUsed, onEnter,
}: {
  company: Company;
  snapshot: CompanySnapshot | null | undefined;
  lastUsed: boolean;
  onEnter: () => void;
}) {
  const cur = company.currency || 'EUR';
  return (
    <button
      type="button"
      onClick={onEnter}
      aria-label={`Entrar em ${company.name}`}
      className="group text-left p-4 rounded-xl border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(24,24,27,0.04)] transition-all cursor-pointer hover:shadow-md hover:border-neutral-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
    >
      <div className="flex items-start gap-2.5">
        <div className="size-9 rounded-lg bg-neutral-900 text-white flex items-center justify-center font-semibold text-xs shrink-0">
          {initials(company.name) || <Building2 className="size-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-13 text-neutral-900 truncate">{company.name}</p>
            {lastUsed && <Badge tone="success" className="shrink-0">Última usada</Badge>}
          </div>
          <p className="text-2xs text-neutral-500 font-mono mt-0.5">{company.nif || 'Sem NIF'}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-2xs">
        {snapshot === undefined ? (
          <p className="col-span-3 text-neutral-400 py-2">A carregar resumo…</p>
        ) : snapshot === null ? (
          <p className="col-span-3 text-neutral-400 py-2">Resumo indisponível</p>
        ) : (
          <>
            <div>
              <p className="text-neutral-500 font-medium">Entradas</p>
              <p className="font-semibold text-neutral-900 text-xs tabular-nums">{money(snapshot.income, cur)}</p>
            </div>
            <div>
              <p className="text-neutral-500 font-medium">Saídas</p>
              <p className="font-semibold text-neutral-900 text-xs tabular-nums">{money(snapshot.expenses, cur)}</p>
            </div>
            <div>
              <p className="text-neutral-500 font-medium">Resultado</p>
              <p className={`font-semibold text-xs tabular-nums ${snapshot.result < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                {money(snapshot.result, cur)}
              </p>
            </div>
          </>
        )}
      </div>
      {snapshot && snapshot.trend.length > 0 && (
        <div className="mt-3">
          <TrendBars values={snapshot.trend} />
          <p className="text-2xs text-neutral-400 mt-1">Resultado dos últimos 6 meses</p>
        </div>
      )}

      <div className="mt-3 pt-2.5 border-t border-neutral-100 flex items-center justify-between text-2xs text-neutral-600">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <ShieldCheck className="size-3 text-neutral-400" aria-hidden="true" /> {company.role_label || company.role}
          </span>
          <span className="flex items-center gap-1">
            <Users className="size-3 text-neutral-400" aria-hidden="true" /> {company.member_count ?? 1}
          </span>
        </div>
        <span className="flex items-center gap-1 font-medium text-emerald-700 group-hover:gap-1.5 transition-all">
          Entrar <ArrowRight className="size-3.5" aria-hidden="true" />
        </span>
      </div>
    </button>
  );
}

/** Cartão para abrir uma empresa nova — fica na grelha, ao lado das outras. */
function NewCompanyCard({ onClick, first }: { onClick: () => void; first?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      className="group min-h-48 p-4 rounded-xl border border-dashed border-neutral-300 bg-white/60 flex flex-col items-center justify-center gap-2 text-center cursor-pointer transition-all hover:border-emerald-400 hover:bg-emerald-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
    >
      <span className="size-10 rounded-full bg-neutral-100 text-neutral-500 flex items-center justify-center transition-colors group-hover:bg-emerald-100 group-hover:text-emerald-700">
        <Plus className="size-5" aria-hidden="true" />
      </span>
      <span className="text-13 font-semibold text-neutral-800">{first ? 'Criar a primeira empresa' : 'Nova empresa'}</span>
      <span className="text-2xs text-neutral-500 max-w-[220px]">
        Dados, equipa e IVA separados das outras empresas.
      </span>
    </button>
  );
}

export default function CompaniesHubPage() {
  const { companies, companiesLoaded, currentUser, enterCompany, refreshCompanies, canCreateCompanies } = useApp();
  const [snapshots, setSnapshots] = useState<Record<string, CompanySnapshot | null>>({});
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  // Estável: a janela regista o Escape com esta função.
  const closeCreate = useCallback(() => setCreating(false), []);
  const [created, setCreated] = useState<string | null>(null);
  // A última empresa usada vive no localStorage; no servidor não há nenhuma.
  const lastUsed = useSyncExternalStore(() => () => {}, getActiveCompany, () => null);

  useEffect(() => {
    if (!isAuthenticated()) { redirectToLogin(); return; }
    document.title = 'Escolher empresa — Finance AI';
  }, []);

  useEffect(() => {
    let cancelled = false;
    companies.forEach((c) => {
      if (c.id in snapshots) return;
      fetchCompanySnapshot(c.id).then((s) => {
        if (!cancelled) setSnapshots((prev) => ({ ...prev, [c.id]: s }));
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando a lista muda
  }, [companies]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => c.name.toLowerCase().includes(q) || (c.nif || '').toLowerCase().includes(q));
  }, [companies, query]);

  // Totais do grupo só somam empresas na mesma moeda (o euro, quase sempre).
  const totals = useMemo(() => {
    const eur = companies.filter((c) => (c.currency || 'EUR') === 'EUR' && snapshots[c.id]);
    return eur.reduce(
      (t, c) => {
        const s = snapshots[c.id]!;
        return { income: t.income + s.income, expenses: t.expenses + s.expenses, result: t.result + s.result, n: t.n + 1 };
      },
      { income: 0, expenses: 0, result: 0, n: 0 },
    );
  }, [companies, snapshots]);

  const logout = () => {
    clearToken();
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- recarga completa intencional
    window.location.assign('/login');
  };

  const firstName = currentUser?.name?.split(' ')[0];

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans">
      <header className="h-16 px-4 sm:px-6 flex items-center justify-between max-w-6xl w-full mx-auto">
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-lg bg-neutral-900 flex items-center justify-center">
            <Zap className="size-3.5 fill-emerald-400 text-emerald-400" aria-hidden="true" />
          </div>
          <p className="font-semibold text-13 tracking-tight">
            Finance <span className="text-emerald-600">AI</span>
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {currentUser?.name && (
            <span className="hidden sm:flex items-center gap-2 pr-1.5 text-xs font-medium text-neutral-700">
              <span className="size-7 rounded-full bg-white border border-neutral-200 flex items-center justify-center text-2xs font-semibold text-neutral-700">
                {currentUser.name.charAt(0).toUpperCase()}
              </span>
              {currentUser.name}
            </span>
          )}
          <Button variant="ghost" size="sm" icon={<LogOut />} onClick={logout}>Terminar sessão</Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-14 pb-12 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <p className="text-13 font-medium text-emerald-700">{firstName ? `Olá, ${firstName}` : 'Bem-vindo'}</p>
            <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-neutral-900">
              Que empresa quer gerir hoje?
            </h1>
            <p className="text-13 text-neutral-500 mt-1.5">
              Cada empresa é independente: dados, equipa e IVA separados.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {companies.length > 4 && (
              <div className="relative">
                <Search className="size-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <Input
                  aria-label="Procurar empresa"
                  placeholder="Procurar por nome ou NIF"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-8 w-56"
                />
              </div>
            )}
          </div>
        </div>

        {created && (
          <p role="status" className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-1.5">
            <Check className="size-3.5" aria-hidden="true" /> Empresa <b>{created}</b> criada com o plano de contas padrão.
          </p>
        )}

        {creating && canCreateCompanies && (
          <CompanyCreateWizard
            onClose={closeCreate}
            onCreated={async (_company, name) => {
              setCreated(name);
              setCreating(false);
              await refreshCompanies();
            }}
          />
        )}

        {companies.length > 1 && totals.n > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Empresas" value={companies.length} />
            <Stat label="Entradas · 6 meses" value={money(totals.income)} />
            <Stat label="Saídas · 6 meses" value={money(totals.expenses)} />
            <Stat
              label="Resultado do grupo"
              value={money(totals.result)}
              tone={totals.result < 0 ? 'negative' : 'positive'}
            />
          </div>
        )}

        {!companiesLoaded ? (
          <LoadingState label="A carregar as suas empresas…" />
        ) : companies.length === 0 && canCreateCompanies ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <NewCompanyCard first onClick={() => setCreating(true)} />
          </div>
        ) : companies.length === 0 ? (
          <EmptyState
            icon={<Building2 />}
            title="Ainda não tem nenhuma empresa"
            description="Esta conta entrou por convite e ainda não pertence a nenhuma empresa."
          />
        ) : visible.length === 0 ? (
          <p className="text-13 text-neutral-500 text-center py-10">Nenhuma empresa corresponde a “{query}”.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {visible.map((c) => (
              <CompanyCard
                key={c.id}
                company={c}
                snapshot={snapshots[c.id]}
                lastUsed={c.id === lastUsed}
                onEnter={() => enterCompany(c.id)}
              />
            ))}
            {canCreateCompanies && <NewCompanyCard onClick={() => setCreating(true)} />}
          </div>
        )}
      </main>
    </div>
  );
}
