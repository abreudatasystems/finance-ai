'use client';

import React, { useState, useEffect } from 'react';
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

const SETTINGS_KEY = 'finance_ai_settings';

interface StoredSettings {
  autoClassify: boolean;
  approvalLevel: string;
  confidenceThreshold: number;
}

const DEFAULT_SETTINGS: StoredSettings = {
  autoClassify: true,
  approvalLevel: 'always_confirm',
  confidenceThreshold: 85,
};

/** As preferências guardadas neste navegador (ou as de omissão). */
function readStoredSettings(): StoredSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return DEFAULT_SETTINGS;
}

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'company', label: 'Empresa', icon: <Building2 className="w-4 h-4" /> },
  { id: 'categories', label: 'Categorias', icon: <FolderTree className="w-4 h-4" /> },
  { id: 'ai', label: 'Inteligência Artificial', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'profile', label: 'Perfil', icon: <User className="w-4 h-4" /> },
  { id: 'users', label: 'Equipa & Permissões', icon: <Users className="w-4 h-4" /> },
  { id: 'audit', label: 'Auditoria & Logs', icon: <History className="w-4 h-4" /> },
];

export default function SettingsPage() {
  const router = useRouter();
  const { currentCompany, currency, setCurrency, currentUser, userRole, setPageHeader, refreshCompanies } = useApp();

  const [activeTab, setActiveTab] = useState<Tab>('company');
  const { data: aiRules } = useLoad(fetchAIRules, [], { initialData: [] as AIRule[] });
  const { data: auditLogs } = useLoad(fetchAuditLogs, [], { initialData: [] as AuditLogItem[] });
  const [settings, setSettings] = useState<StoredSettings>(DEFAULT_SETTINGS);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [vatRegime, setVatRegime] = useState('normal');
  const [vatPeriodicity, setVatPeriodicity] = useState('quarterly');
  const [legalForm, setLegalForm] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyNif, setCompanyNif] = useState('');
  const [saving, setSaving] = useState(false);

  // O formulário da empresa parte dos dados da empresa activa e volta a
  // partir deles sempre que ela muda (outra empresa, ou gravada de novo).
  // Ajustado durante o render, não num efeito:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [formCompany, setFormCompany] = useState<typeof currentCompany>(null);
  if (currentCompany && currentCompany !== formCompany) {
    const comp = currentCompany as unknown as Record<string, string>;
    setFormCompany(currentCompany);
    setVatRegime(comp.vat_regime || 'normal');
    setVatPeriodicity(comp.vat_periodicity || 'quarterly');
    setLegalForm(comp.legal_form || '');
    setCompanyName(comp.name || '');
    setCompanyNif(comp.nif || '');
  }

  // As preferências da IA vivem no localStorage, que só existe no navegador:
  // lidas depois de montar (o HTML do servidor usa as de omissão) e postas no
  // formulário quando chegam.
  useLoad(async () => readStoredSettings(), [], { onSuccess: setSettings });

  useEffect(() => {
    setPageHeader('Configurações', 'Gestão da empresa, preferências do motor de inteligência artificial e utilizadores');
  }, [setPageHeader]);

  const patch = (p: Partial<StoredSettings>) => setSettings((s) => ({ ...s, ...p }));

  const handleSave = async () => {
    // As preferências da IA ficam neste navegador; os dados da empresa vão
    // para o servidor. Só se diz "guardado" quando o servidor o confirma —
    // antes, uma falha mostrava sucesso e nome/NIF nunca eram enviados.
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
    if (currentCompany?.id) {
      if (!companyName.trim()) {
        toast.error('O nome da empresa não pode ficar vazio.');
        return;
      }
      setSaving(true);
      const { error } = await apiPatchOrError(`/companies/${currentCompany.id}`, {
        name: companyName.trim(),
        nif: companyNif.trim() || undefined,
        vat_regime: vatRegime,
        vat_periodicity: vatPeriodicity,
        legal_form: legalForm || undefined,
      });
      setSaving(false);
      if (error) {
        toast.error(error);
        return;
      }
      await refreshCompanies();
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
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Header Actions */}
      <div className="flex justify-end pb-4">
        <Button
          onClick={handleSave}
          loading={saving}
          icon={savedSuccess ? <Check /> : <Save />}
        >
          {saving ? 'A guardar…' : savedSuccess ? 'Guardado com sucesso!' : 'Guardar Alterações'}
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-6 items-start">
        {/* Settings Sidebar */}
        <Card className="w-full md:w-[250px] shrink-0 py-3 px-2 space-y-4 md:sticky md:top-4">
          <div className="h-5 flex items-center px-4">
            <h3 className="text-2xs font-bold text-neutral-400 uppercase tracking-widest whitespace-nowrap overflow-hidden">Menu de Configuração</h3>
          </div>
          <nav aria-label="Secções de configuração" className="space-y-0.5">
            {TABS.map((t) => (
              <button
                type="button"
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                aria-current={activeTab === t.id ? 'page' : undefined}
                className={`w-full text-left h-11 px-3 rounded-xl transition-colors flex items-center gap-3 text-xs font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  activeTab === t.id
                    ? 'bg-black text-white font-bold'
                    : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50'
                }`}
              >
                <div className={`w-[32px] flex items-center justify-center shrink-0 ${activeTab === t.id ? 'text-emerald-400' : 'text-neutral-400'}`}>
                  {t.icon}
                </div>
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
              <CardHeader icon={<Building2 />} title="Dados da Empresa (Multi-tenant)" />
              <CardBody className="space-y-4 text-xs">
                <Field label="Nome da Empresa" required>
                  {(p) => (
                    <Input
                      {...p}
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                    />
                  )}
                </Field>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="NIF">
                    {(p) => (
                      <Input
                        {...p}
                        type="text"
                        value={companyNif}
                        onChange={(e) => setCompanyNif(e.target.value)}
                        className="font-mono"
                      />
                    )}
                  </Field>

                  <Field label="Moeda por Omissão">
                    {(p) => (
                      <Select
                        {...p}
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value as typeof currency)}
                      >
                        <option value="EUR">EUR (€) - Euro</option>
                        <option value="USD">USD ($) - Dólar Americano</option>
                        <option value="BRL">BRL (R$) - Real Brasileiro</option>
                        <option value="GBP">GBP (£) - Libra Esterlina</option>
                      </Select>
                    )}
                  </Field>
                </div>

                <div className="pt-3 border-t border-neutral-100 space-y-3">
                  <h4 className="font-bold text-neutral-900 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" /> Perfil Fiscal (Portugal)
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Forma jurídica">
                      {(p) => (
                        <Select {...p} value={legalForm} onChange={(e) => setLegalForm(e.target.value)}>
                          <option value="">Não definida</option>
                          <option value="ENI">ENI — Empresário em Nome Individual</option>
                          <option value="Unipessoal Lda">Unipessoal Lda</option>
                          <option value="Lda">Lda</option>
                          <option value="SA">SA</option>
                          <option value="Associação">Associação</option>
                        </Select>
                      )}
                    </Field>

                    <Field label="Regime de IVA">
                      {(p) => (
                        <Select {...p} value={vatRegime} onChange={(e) => setVatRegime(e.target.value)}>
                          <option value="normal">Regime Normal (liquida e deduz)</option>
                          <option value="isencao_art53">Isenção — art.º 53.º do CIVA</option>
                        </Select>
                      )}
                    </Field>

                    <Field label="Periodicidade">
                      {(p) => (
                        <Select
                          {...p}
                          value={vatPeriodicity}
                          onChange={(e) => setVatPeriodicity(e.target.value)}
                          disabled={vatRegime === 'isencao_art53'}
                        >
                          <option value="quarterly">Trimestral (volume &lt; 650 mil €)</option>
                          <option value="monthly">Mensal (volume ≥ 650 mil €)</option>
                        </Select>
                      )}
                    </Field>
                  </div>

                  <p className="text-2xs text-neutral-500">
                    Define como o <Link href="/reports" className="text-emerald-700 font-semibold hover:underline">apuramento do IVA</Link> é
                    calculado e os prazos de entrega. Na isenção do art.º 53.º não se liquida nem deduz IVA.
                  </p>
                </div>

                <div className="flex items-start gap-2 p-3 bg-neutral-50 rounded-xl border border-neutral-200 text-xs text-neutral-700">
                  <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" aria-hidden="true" />
                  <span>
                    Todos os dados desta empresa estão isolados por <span className="font-mono font-bold">company_id</span>,
                    garantido no servidor a partir da sua sessão autenticada.
                  </span>
                </div>
              </CardBody>
            </Card>
          )}

          {/* TAB: Categorias */}
          {activeTab === 'categories' && <ChartOfAccounts />}

          {/* TAB: Inteligência Artificial */}
          {activeTab === 'ai' && (
            <div className="space-y-5">
              <Card className="max-w-2xl">
                <CardHeader icon={<Sparkles />} title="Preferências & Automação do Motor IA" />
                <CardBody className="space-y-4 text-xs">
                  <div className="flex items-center justify-between gap-3 p-3.5 bg-neutral-50 rounded-xl border border-neutral-200">
                    <div>
                      <span id="auto-classify-label" className="font-bold text-neutral-800 block">Classificação Automática por IA</span>
                      <span className="text-neutral-500 text-xs">Processar faturas assim que dão entrada na Automação (OCR)</span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={settings.autoClassify}
                      aria-labelledby="auto-classify-label"
                      onClick={() => patch({ autoClassify: !settings.autoClassify })}
                      className={`w-12 h-6 rounded-full transition-colors relative p-0.5 shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 ${settings.autoClassify ? 'bg-emerald-600' : 'bg-neutral-300'}`}
                    >
                      <div className={`w-5 h-5 bg-white rounded-full transition-transform ${settings.autoClassify ? 'translate-x-6' : ''}`} />
                    </button>
                  </div>

                  <Field label="Nível de Aprovação Exigido">
                    {(p) => (
                      <Select
                        {...p}
                        value={settings.approvalLevel}
                        onChange={(e) => patch({ approvalLevel: e.target.value })}
                      >
                        <option value="always_confirm">Confirmar Sempre (Recomendado para início)</option>
                        <option value="auto_high">Auto-aprovar se Confiança &gt; 90%</option>
                        <option value="fully_autonomous">Modo 100% Autónomo</option>
                      </Select>
                    )}
                  </Field>

                  <div className="space-y-2">
                    <div className="flex justify-between font-semibold text-neutral-700">
                      <label htmlFor="confidence-threshold">Threshold Mínimo de Confiança</label>
                      <span className="text-emerald-700 font-bold tabular-nums">{settings.confidenceThreshold}%</span>
                    </div>
                    <input
                      id="confidence-threshold"
                      type="range"
                      min="60"
                      max="98"
                      value={settings.confidenceThreshold}
                      onChange={(e) => patch({ confidenceThreshold: Number(e.target.value) })}
                      className="w-full accent-emerald-600"
                    />
                    <p className="text-2xs text-neutral-500">
                      Faturas com confiança abaixo deste valor exigem revisão manual em Aprovações.
                      {' '}Estas preferências ficam guardadas apenas neste navegador.
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
                          <Td className="font-bold text-neutral-900">{r.supplier_name}</Td>
                          <Td className="text-neutral-700 font-semibold">{r.category_name}</Td>
                          <Td numeric className="text-emerald-700 font-bold">{r.confidence}%</Td>
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
            <div className="space-y-5 max-w-xl">
              {/* Alterar a palavra-passe exige saber a atual — ver ChangePassword. */}
              <ChangePassword />
              <TwoFactorSettings />

              <Card>
                <CardBody className="space-y-5 text-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-2xl bg-black text-white flex items-center justify-center font-bold text-lg">
                      {initials}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-bold text-sm text-neutral-900">{displayName}</h3>
                        <BadgeCheck className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                      </div>
                      <Badge tone="success" className="uppercase">{userRole}</Badge>
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
              <Card className="border-rose-200/70">
                <CardBody className="text-xs">
                  <h3 className="font-bold text-sm text-neutral-900 mb-1">Sessão</h3>
                  <p className="text-neutral-500 mb-4">Termine a sessão neste dispositivo. Terá de iniciar sessão novamente.</p>
                  <Button variant="danger" onClick={handleLogout} icon={<LogOut />}>
                    Terminar Sessão
                  </Button>
                </CardBody>
              </Card>
            </div>
          )}

          {/* TAB: Utilizadores & Roles */}
          {activeTab === 'users' && (
            <div className="space-y-5">
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
                  <div className="relative border-l-2 border-neutral-200 pl-6 space-y-6">
                    {auditLogs.map((item) => {
                      const isAiAction = item.user.includes('AI') || item.user.includes('Engine');
                      return (
                        <div key={item.id} className="relative group">
                          {/* Bullet node */}
                          <div className={`absolute -left-[31px] top-0.5 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center ${
                            isAiAction ? 'bg-emerald-600' : 'bg-neutral-800'
                          }`}>
                            {isAiAction ? <Sparkles className="w-2.5 h-2.5 text-white" /> : <User className="w-2.5 h-2.5 text-white" />}
                          </div>

                          <div className="p-4 bg-neutral-50 hover:bg-neutral-100/80 transition-colors rounded-xl border border-neutral-200/70 space-y-1 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-neutral-900">{item.user}</span>
                                <Badge>{item.action}</Badge>
                              </div>
                              <span className="text-2xs text-neutral-500 font-mono">{item.timestamp}</span>
                            </div>

                            <p className="text-neutral-700 font-medium">{item.description}</p>

                            <div className="pt-1 text-2xs text-neutral-500 font-mono">
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
