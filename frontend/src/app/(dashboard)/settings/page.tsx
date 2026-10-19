'use client';

import React, { useState, useEffect } from 'react';
import { CompanyProfileFields } from '@/components/companies/CompanyProfileFields';
import {
  EMPTY_PROFILE, profileFromCompany, toPayload, validateProfile, type CompanyProfile, type ProfileErrors,
} from '@/components/companies/profile';
import { useLoad } from '@/lib/use-load';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { fetchAIRules, fetchAuditLogs } from '@/services/data';
import { clearToken, apiPatchOrError } from '@/services/api';
import { toast } from 'sonner';
import { AIRule, AuditLogItem } from '@/types';
import Link from 'next/link';
import { ChartOfAccounts } from '@/components/settings/ChartOfAccounts';
import { TeamPanel } from '@/components/settings/TeamPanel';
import { ChangePassword } from '@/components/settings/ChangePassword';
import { TwoFactorSettings } from '@/components/settings/TwoFactorSettings';
import { DataExport } from '@/components/settings/DataExport';
import {
  Building2, Sparkles, User, Users, Save, Check, LogOut, ShieldCheck, BadgeCheck, History,
  FolderTree
} from 'lucide-react';
import {
  Button, Card, CardHeader, CardBody, Table, THead, TBody, Th, Tr, Td, Field, Input, Select,
  EmptyState, Badge,
} from '@/components/ui';

type Tab = 'company' | 'categories' | 'ai' | 'profile' | 'users' | 'audit';


const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'company', label: 'Empresa', icon: <Building2 className="size-4" /> },
  { id: 'categories', label: 'Categorias', icon: <FolderTree className="size-4" /> },
  { id: 'ai', label: 'Inteligência Artificial', icon: <Sparkles className="size-4" /> },
  { id: 'profile', label: 'Perfil', icon: <User className="size-4" /> },
  { id: 'users', label: 'Equipa & Permissões', icon: <Users className="size-4" /> },
  { id: 'audit', label: 'Auditoria & Logs', icon: <History className="size-4" /> },
];

export default function SettingsPage() {
  const router = useRouter();
  const { currentCompany, currency, setCurrency, currentUser, userRole, setPageHeader, refreshCompanies } = useApp();

  const [activeTab, setActiveTab] = useState<Tab>('company');
  const { data: aiRules } = useLoad(fetchAIRules, [], { initialData: [] as AIRule[] });
  const { data: auditLogs } = useLoad(fetchAuditLogs, [], { initialData: [] as AuditLogItem[] });
  // A moeda e o limite da IA são da empresa e gravam-se no servidor; antes a
  // moeda só trocava o símbolo neste ecrã e o limite ficava no navegador.
  const [companyCurrency, setCompanyCurrency] = useState<typeof currency>(currency);
  const [aiThreshold, setAiThreshold] = useState(80);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [profile, setProfile] = useState<CompanyProfile>(EMPTY_PROFILE);
  const [profileErrors, setProfileErrors] = useState<ProfileErrors>({});
  const [saving, setSaving] = useState(false);

  // O formulário da empresa parte dos dados da empresa activa e volta a
  // partir deles sempre que ela muda (outra empresa, ou gravada de novo).
  // Ajustado durante o render, não num efeito:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [formCompany, setFormCompany] = useState<typeof currentCompany>(null);
  if (currentCompany && currentCompany !== formCompany) {
    setFormCompany(currentCompany);
    setProfile(profileFromCompany(currentCompany));
    setProfileErrors({});
    setCompanyCurrency(currentCompany.currency);
    setAiThreshold(currentCompany.ai_review_threshold ?? 80);
  }
  const changeProfile = (patch: Partial<CompanyProfile>) => setProfile((p) => ({ ...p, ...patch }));

  useEffect(() => {
    setPageHeader('Configurações', 'Gestão da empresa, preferências do motor de inteligência artificial e utilizadores');
  }, [setPageHeader]);

  const handleSave = async () => {
    // Só se diz "guardado" quando o servidor o confirma — antes, uma falha
    // mostrava sucesso e nome/NIF nunca eram enviados.
    if (currentCompany?.id) {
      const found = validateProfile(profile, 'update');
      setProfileErrors(found);
      if (Object.keys(found).length) {
        setActiveTab('company');
        toast.error('Há campos da empresa a corrigir.');
        return;
      }
      setSaving(true);
      const { error } = await apiPatchOrError(`/companies/${currentCompany.id}`, {
        ...toPayload(profile, 'update'),
        currency: companyCurrency,
        ai_review_threshold: aiThreshold,
      });
      setSaving(false);
      if (error) {
        toast.error(error);
        return;
      }
      await refreshCompanies();
      setCurrency(companyCurrency);
    }
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleLogout = () => {
    clearToken();
    router.push('/login');
  };

  // Sem nome inventado enquanto o utilizador carrega.
  const displayName = currentUser?.name || '';
  const displayEmail = currentUser?.email || '';
  const initials = displayName.split(' ').filter(Boolean).map((n) => n[0]).slice(0, 2).join('').toUpperCase() || '—';

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header Actions */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          loading={saving}
          icon={savedSuccess ? <Check /> : <Save />}
        >
          {saving ? 'A guardar…' : savedSuccess ? 'Guardado com sucesso!' : 'Guardar Alterações'}
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-start">
        {/* Settings Sidebar */}
        <Card className="w-full md:w-[220px] shrink-0 p-2 space-y-1 md:sticky md:top-4">
          <h3 className="px-2.5 pt-1 pb-1.5 text-xs font-medium text-neutral-500 whitespace-nowrap overflow-hidden">Menu de configuração</h3>
          <nav aria-label="Secções de configuração" className="space-y-0.5">
            {TABS.map((t) => (
              <button
                type="button"
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                aria-current={activeTab === t.id ? 'page' : undefined}
                className={`w-full text-left h-8 px-2.5 rounded-md transition-colors flex items-center gap-2 text-13 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 [&_svg]:size-3.5 ${
                  activeTab === t.id
                    ? 'bg-neutral-100 text-neutral-900 font-medium'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50'
                }`}
              >
                <span className={`flex items-center justify-center shrink-0 ${activeTab === t.id ? 'text-emerald-600' : 'text-neutral-400'}`}>
                  {t.icon}
                </span>
                {t.label}
              </button>
            ))}
          </nav>
        </Card>

        {/* Settings Content */}
        <div className="flex-1 min-w-0 w-full">
          {/* TAB: Empresa */}
          {activeTab === 'company' && (
            <Card className="max-w-2xl">
              <CardHeader icon={<Building2 />} title="Ficha da empresa" subtitle="Identificação, sede, fiscalidade, contabilista e prazos" />
              <CardBody className="space-y-4 text-xs">
                <CompanyProfileFields value={profile} onChange={changeProfile} errors={profileErrors} />

                <div className="pt-3 border-t border-neutral-100 grid sm:grid-cols-2 gap-3">
                  <Field label="Moeda da empresa" hint="A moeda em que a empresa regista os valores. Mudar não converte valores já lançados.">
                    {(p) => (
                      <Select
                        {...p}
                        value={companyCurrency}
                        onChange={(e) => setCompanyCurrency(e.target.value as typeof currency)}
                      >
                        <option value="EUR">EUR (€) - Euro</option>
                        <option value="USD">USD ($) - Dólar Americano</option>
                        <option value="BRL">BRL (R$) - Real Brasileiro</option>
                        <option value="GBP">GBP (£) - Libra Esterlina</option>
                      </Select>
                    )}
                  </Field>
                  <p className="text-2xs text-neutral-500 self-end pb-2">
                    O IVA define o <Link href="/reports" className="text-emerald-700 font-semibold hover:underline">apuramento</Link> e
                    os prazos de entrega. As contas bancárias gerem-se na Conciliação Bancária.
                  </p>
                </div>

                <div className="flex items-start gap-2 rounded-lg border px-3 py-2 text-xs bg-neutral-50 border-neutral-200 text-neutral-700">
                  <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" aria-hidden="true" />
                  <span>
                    Os dados desta empresa ficam separados dos das outras empresas: só quem pertence à equipa os vê.
                  </span>
                </div>
              </CardBody>
            </Card>
          )}

          {/* TAB: Categorias */}
          {activeTab === 'categories' && <ChartOfAccounts />}

          {/* TAB: Inteligência Artificial */}
          {activeTab === 'ai' && (
            <div className="space-y-4">
              <Card className="max-w-2xl">
                <CardHeader icon={<Sparkles />} title="Preferências & Automação do Motor IA" />
                <CardBody className="space-y-4 text-xs">
                  {/* Os interruptores de "auto-aprovar" e "modo autónomo" não
                      faziam nada. Fica o que é verdade: nada entra nas contas
                      sem uma pessoa aprovar, e o limite de confiança é real. */}
                  <div className="flex items-start gap-2 px-3 py-2.5 bg-neutral-50 rounded-lg border border-neutral-200">
                    <ShieldCheck className="size-4 shrink-0 mt-0.5 text-emerald-600" aria-hidden="true" />
                    <span className="text-neutral-700">
                      Cada fatura lida pela IA é <b className="font-semibold">sempre confirmada por uma pessoa</b> em
                      Documentos antes de entrar nas contas. A IA lê, classifica e propõe; quem aprova decide.
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-medium text-neutral-700">
                      <label htmlFor="confidence-threshold">Confiança mínima para não pedir revisão</label>
                      <span className="text-emerald-700 font-semibold tabular-nums">{aiThreshold}%</span>
                    </div>
                    <input
                      id="confidence-threshold"
                      type="range"
                      min="50"
                      max="99"
                      value={aiThreshold}
                      onChange={(e) => setAiThreshold(Number(e.target.value))}
                      className="w-full accent-emerald-600"
                    />
                    <p className="text-2xs text-neutral-500">
                      Faturas lidas com confiança abaixo deste valor ficam marcadas &quot;a rever&quot; na fila de aprovação.
                      {' '}Vale para toda a equipa desta empresa; grave com &quot;Guardar&quot;.
                    </p>
                  </div>
                </CardBody>
              </Card>

              {/* AI Learned Rules Table */}
              <Card className="overflow-hidden">
                <CardHeader title={`Regras Aprendidas pela IA (${aiRules.length})`} />
                {aiRules.length === 0 ? (
                  <EmptyState title="Ainda não existem regras aprendidas." />
                ) : (
                  <Table className="min-w-[520px]">
                    <THead>
                      <tr>
                        <Th>Fornecedor</Th>
                        <Th>Categoria Associada</Th>
                        <Th numeric>Nível Confiança</Th>
                        <Th numeric>Vezes Utilizada</Th>
                      </tr>
                    </THead>
                    <TBody>
                      {aiRules.map((r) => (
                        <Tr key={r.id}>
                          <Td className="font-medium text-neutral-900">{r.supplier_name}</Td>
                          <Td className="text-neutral-700">{r.category_name}</Td>
                          <Td numeric className="text-emerald-700 font-semibold">{r.confidence}%</Td>
                          <Td numeric className="text-neutral-600">{r.uses_count} vezes</Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                )}
              </Card>
            </div>
          )}

          {/* TAB: Perfil */}
          {activeTab === 'profile' && (
            <div className="space-y-4 max-w-xl">
              {/* Alterar a palavra-passe exige saber a atual — ver ChangePassword. */}
              <ChangePassword />
              <TwoFactorSettings />

              <Card>
                <CardBody className="space-y-4 text-xs">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-lg bg-neutral-900 text-white flex items-center justify-center font-semibold text-sm">
                      {initials}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-semibold text-sm text-neutral-900">{displayName}</h3>
                        <BadgeCheck className="size-3.5 text-emerald-600" aria-hidden="true" />
                      </div>
                      <Badge tone="success">{userRole}</Badge>
                    </div>
                  </div>

                  <Field label="Nome Completo">
                    {(p) => <Input {...p} type="text" value={displayName} readOnly className="bg-neutral-50 text-neutral-600" />}
                  </Field>

                  {/* Os campos são só de leitura: não há forma de os gravar, e um
                    campo editável que não grava faz crer que gravou. */}
                  <Field label="Email" hint="Para mudar o nome ou o email da conta, contacte o administrador.">
                    {(p) => <Input {...p} type="email" value={displayEmail} readOnly className="bg-neutral-50 text-neutral-600" />}
                  </Field>
                </CardBody>
              </Card>

              {/* Session / danger zone */}
              <Card>
                <CardBody className="text-xs">
                  <h3 className="text-13 font-semibold text-neutral-900 mb-1">Sessão</h3>
                  <p className="text-neutral-500 mb-3">Termine a sessão neste dispositivo. Terá de iniciar sessão novamente.</p>
                  <Button variant="danger" onClick={handleLogout} icon={<LogOut />}>
                    Terminar sessão
                  </Button>
                </CardBody>
              </Card>
            </div>
          )}

          {/* TAB: Utilizadores & Roles */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              <TeamPanel />
              {/* Levar os dados embora é administração da empresa, não uma opção
                  de perfil: fica ao lado de quem tem acesso a eles. */}
              <DataExport />
            </div>
          )}

          {/* TAB: Auditoria & Logs */}
          {activeTab === 'audit' && (
            <Card>
              <CardHeader
                icon={<History />}
                title="Auditoria & Activity Log"
                subtitle="Histórico cronológico de todas as ações executadas por utilizadores e pelo motor autónomo de IA"
              />
              <CardBody>
                {auditLogs.length === 0 ? (
                  <EmptyState title="Ainda não há registos de auditoria." />
                ) : (
                  <div className="relative border-l border-neutral-200 pl-5 space-y-3 ml-1.5">
                    {auditLogs.map((item) => {
                      const isAiAction = item.user.includes('AI') || item.user.includes('Engine');
                      return (
                        <div key={item.id} className="relative group">
                          {/* Bullet node */}
                          <div className={`absolute -left-[28px] top-2 size-4 rounded-full border-2 border-white flex items-center justify-center ${
                            isAiAction ? 'bg-emerald-600' : 'bg-neutral-800'
                          }`}>
                            {isAiAction ? <Sparkles className="w-2.5 h-2.5 text-white" /> : <User className="w-2.5 h-2.5 text-white" />}
                          </div>

                          <div className="px-3 py-2 bg-neutral-50 hover:bg-neutral-100/80 transition-colors rounded-lg border border-neutral-200/70 space-y-1 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-neutral-900">{item.user}</span>
                                <Badge>{item.action}</Badge>
                              </div>
                              <span className="text-2xs text-neutral-500 font-mono">{item.timestamp}</span>
                            </div>

                            <p className="text-neutral-700 font-medium">{item.description}</p>

                            <div className="text-2xs text-neutral-500 font-mono">
                              Módulo: {item.module} {item.entity_id && `• Entity ID: ${item.entity_id}`}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
