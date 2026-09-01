'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { fetchAIRules, fetchAuditLogs, updateCompany } from '@/services/data';
import { clearToken } from '@/services/api';
import { AIRule, AuditLogItem } from '@/types';
import Link from 'next/link';
import { ChartOfAccounts } from '@/components/settings/ChartOfAccounts';
import {
  Building2, Sparkles, User, Users, Save, Check, LogOut, ShieldCheck, Mail, BadgeCheck, History,
  FolderTree
} from 'lucide-react';

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

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'company', label: 'Empresa', icon: <Building2 className="w-4 h-4" /> },
  { id: 'categories', label: 'Categorias', icon: <FolderTree className="w-4 h-4" /> },
  { id: 'ai', label: 'Inteligência Artificial', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'profile', label: 'Perfil', icon: <User className="w-4 h-4" /> },
  { id: 'users', label: 'Utilizadores & Roles', icon: <Users className="w-4 h-4" /> },
  { id: 'audit', label: 'Auditoria & Logs', icon: <History className="w-4 h-4" /> },
];

export default function SettingsPage() {
  const router = useRouter();
  const { currentCompany, currency, setCurrency, currentUser, userRole, setPageHeader } = useApp();

  const [activeTab, setActiveTab] = useState<Tab>('company');
  const [aiRules, setAiRules] = useState<AIRule[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [settings, setSettings] = useState<StoredSettings>(DEFAULT_SETTINGS);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [vatRegime, setVatRegime] = useState('normal');
  const [vatPeriodicity, setVatPeriodicity] = useState('quarterly');
  const [legalForm, setLegalForm] = useState('');

  useEffect(() => {
    const comp = currentCompany as unknown as Record<string, string> | null;
    if (!comp) return;
    setVatRegime(comp.vat_regime || 'normal');
    setVatPeriodicity(comp.vat_periodicity || 'quarterly');
    setLegalForm(comp.legal_form || '');
  }, [currentCompany]);

  useEffect(() => {
    async function load() {
      setAiRules(await fetchAIRules());
      setAuditLogs(await fetchAuditLogs());
    }
    load();

    try {
      const raw = window.localStorage.getItem(SETTINGS_KEY);
      if (raw) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    setPageHeader('Configurações da Plataforma', 'Gestão da empresa, preferências do motor de inteligência artificial e utilizadores');
  }, [setPageHeader]);

  const patch = (p: Partial<StoredSettings>) => setSettings((s) => ({ ...s, ...p }));

  const handleSave = async () => {
    if (currentCompany?.id) {
      await updateCompany(currentCompany.id, {
        vat_regime: vatRegime,
        vat_periodicity: vatPeriodicity,
        legal_form: legalForm || undefined,
      });
    }
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleLogout = () => {
    clearToken();
    router.push('/login');
  };

  const displayName = currentUser?.name || 'João Silva';
  const displayEmail = currentUser?.email || 'joao@techstart.pt';
  const initials = displayName.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Header Actions */}
      <div className="flex justify-end pb-4">
        <button
          onClick={handleSave}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 active:scale-95 shrink-0"
        >
          {savedSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          <span>{savedSuccess ? 'Guardado com sucesso!' : 'Guardar Alterações'}</span>
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-6 items-start">
        {/* Settings Sidebar */}
        <div className="w-full md:w-[250px] shrink-0 bg-white rounded-3xl border border-slate-200/80 py-3 px-2 shadow-xs space-y-4 sticky top-4">
          <div className="h-5 flex items-center px-4">
            <h3 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap overflow-hidden">Menu de Configuração</h3>
          </div>
          <div className="space-y-0.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`w-full text-left h-11 px-3 rounded-xl transition-all flex items-center gap-3 text-xs font-semibold ${
                  activeTab === t.id 
                    ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-100 shadow-xs' 
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <div className={`w-[32px] flex items-center justify-center shrink-0 ${activeTab === t.id ? 'text-indigo-600' : 'text-slate-400'}`}>
                  {t.icon}
                </div>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Settings Content */}
        <div className="flex-1 min-w-0 w-full">
          {/* TAB: Empresa */}
      {activeTab === 'company' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4 max-w-2xl text-xs">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-indigo-600" />
            <h3 className="font-bold text-sm text-slate-900">Dados da Empresa (Multi-tenant)</h3>
          </div>

          <div className="space-y-1.5">
            <label className="font-semibold text-slate-600">Nome da Empresa</label>
            <input
              type="text"
              defaultValue={currentCompany?.name || 'TechStart Lda'}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-medium"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-600">NIF</label>
              <input
                type="text"
                defaultValue={currentCompany?.nif || 'PT516789012'}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-slate-600">Moeda por Omissão</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as typeof currency)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-bold"
              >
                <option value="EUR">EUR (€) - Euro</option>
                <option value="USD">USD ($) - Dólar Americano</option>
                <option value="BRL">BRL (R$) - Real Brasileiro</option>
                <option value="GBP">GBP (£) - Libra Esterlina</option>
              </select>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 space-y-3">
            <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" /> Perfil Fiscal (Portugal)
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-600">Forma jurídica</label>
                <select
                  value={legalForm}
                  onChange={(e) => setLegalForm(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-medium"
                >
                  <option value="">Não definida</option>
                  <option value="ENI">ENI — Empresário em Nome Individual</option>
                  <option value="Unipessoal Lda">Unipessoal Lda</option>
                  <option value="Lda">Lda</option>
                  <option value="SA">SA</option>
                  <option value="Associação">Associação</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-600">Regime de IVA</label>
                <select
                  value={vatRegime}
                  onChange={(e) => setVatRegime(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-medium"
                >
                  <option value="normal">Regime Normal (liquida e deduz)</option>
                  <option value="isencao_art53">Isenção — art.º 53.º do CIVA</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-600">Periodicidade</label>
                <select
                  value={vatPeriodicity}
                  onChange={(e) => setVatPeriodicity(e.target.value)}
                  disabled={vatRegime === 'isencao_art53'}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-medium disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="quarterly">Trimestral (volume &lt; 650 mil €)</option>
                  <option value="monthly">Mensal (volume ≥ 650 mil €)</option>
                </select>
              </div>
            </div>

            <p className="text-[10px] text-slate-400">
              Define como o <Link href="/fiscal/vat" className="text-indigo-600 font-semibold hover:underline">apuramento do IVA</Link> é
              calculado e os prazos de entrega. Na isenção do art.º 53.º não se liquida nem deduz IVA.
            </p>
          </div>

          <div className="flex items-start gap-2 p-3 bg-indigo-50/60 rounded-xl border border-indigo-100 text-[11px] text-indigo-800">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-indigo-600" />
            <span>
              Todos os dados desta empresa estão isolados por <span className="font-mono font-bold">company_id</span>,
              garantido no servidor a partir da sua sessão autenticada.
            </span>
          </div>
        </div>
      )}

      {/* TAB: Inteligência Artificial */}
      {/* TAB: Categorias */}
      {activeTab === 'categories' && <ChartOfAccounts />}

      {activeTab === 'ai' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4 max-w-2xl text-xs">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              Preferências &amp; Automação do Motor IA
            </h3>

            <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <span className="font-bold text-slate-800 block">Classificação Automática por IA</span>
                <span className="text-slate-500 text-[11px]">Processar faturas assim que entram na Finance Inbox</span>
              </div>
              <button
                role="switch"
                aria-checked={settings.autoClassify}
                onClick={() => patch({ autoClassify: !settings.autoClassify })}
                className={`w-12 h-6 rounded-full transition-colors relative p-0.5 shrink-0 ${settings.autoClassify ? 'bg-indigo-600' : 'bg-slate-300'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${settings.autoClassify ? 'translate-x-6' : ''}`} />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-slate-600">Nível de Aprovação Exigido</label>
              <select
                value={settings.approvalLevel}
                onChange={(e) => patch({ approvalLevel: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-medium"
              >
                <option value="always_confirm">Confirmar Sempre (Recomendado para início)</option>
                <option value="auto_high">Auto-aprovar se Confiança &gt; 90%</option>
                <option value="fully_autonomous">Modo 100% Autónomo</option>
              </select>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between font-semibold text-slate-700">
                <span>Threshold Mínimo de Confiança</span>
                <span className="text-indigo-600 font-bold">{settings.confidenceThreshold}%</span>
              </div>
              <input
                type="range"
                min="60"
                max="98"
                value={settings.confidenceThreshold}
                onChange={(e) => patch({ confidenceThreshold: Number(e.target.value) })}
                className="w-full accent-indigo-600"
              />
              <p className="text-[10px] text-slate-400">
                Faturas com confiança abaixo deste valor exigem revisão manual em Aprovações.
              </p>
            </div>
          </div>

          {/* AI Learned Rules Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4 text-xs">
            <h3 className="font-bold text-sm text-slate-900">Regras Aprendidas pela IA ({aiRules.length})</h3>

            {aiRules.length === 0 ? (
              <p className="text-slate-400 py-6 text-center">Ainda não existem regras aprendidas.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[520px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] tracking-wider font-bold">
                      <th className="p-3">Fornecedor</th>
                      <th className="p-3">Categoria Associada</th>
                      <th className="p-3">Nível Confiança</th>
                      <th className="p-3">Vezes Utilizada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {aiRules.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50 font-medium">
                        <td className="p-3 font-bold text-slate-900">{r.supplier_name}</td>
                        <td className="p-3 text-indigo-700 font-semibold">{r.category_name}</td>
                        <td className="p-3 font-mono text-emerald-600 font-bold">{r.confidence}%</td>
                        <td className="p-3 font-mono text-slate-600">{r.uses_count} vezes</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: Perfil */}
      {activeTab === 'profile' && (
        <div className="space-y-5 max-w-xl">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-5 text-xs">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
                {initials}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-sm text-slate-900">{displayName}</h3>
                  <BadgeCheck className="w-4 h-4 text-indigo-500" />
                </div>
                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 font-bold rounded text-[10px] uppercase">
                  {userRole}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-slate-600">Nome Completo</label>
              <input
                type="text"
                defaultValue={displayName}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-slate-600 flex items-center gap-1">
                <Mail className="w-3.5 h-3.5 text-slate-400" /> Email
              </label>
              <input
                type="email"
                defaultValue={displayEmail}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Session / danger zone */}
          <div className="bg-white rounded-2xl border border-rose-200/70 shadow-xs p-6 text-xs">
            <h3 className="font-bold text-sm text-slate-900 mb-1">Sessão</h3>
            <p className="text-slate-500 mb-4">Termine a sessão neste dispositivo. Terá de iniciar sessão novamente.</p>
            <button
              onClick={handleLogout}
              className="px-4 py-2.5 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 font-bold text-xs flex items-center gap-2 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Terminar Sessão
            </button>
          </div>
        </div>
      )}

      {/* TAB: Utilizadores & Roles */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900">Membros da Equipa e Permissões</h3>
            <span className="text-slate-400 font-mono">2 Membros</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[560px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] tracking-wider font-bold">
                  <th className="p-3">Nome</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Role / Permissão</th>
                  <th className="p-3">Data de Entrada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr className="hover:bg-slate-50 font-medium">
                  <td className="p-3 font-bold text-slate-900">{displayName}</td>
                  <td className="p-3 text-slate-600">{displayEmail}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 font-bold rounded text-[10px] uppercase">Owner</span>
                  </td>
                  <td className="p-3 text-slate-500">15/01/2026</td>
                </tr>
                <tr className="hover:bg-slate-50 font-medium">
                  <td className="p-3 font-bold text-slate-900">Ana Costa</td>
                  <td className="p-3 text-slate-600">ana@techstart.pt</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-bold rounded text-[10px] uppercase">Finance Manager</span>
                  </td>
                  <td className="p-3 text-slate-500">10/02/2026</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: Auditoria & Logs */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-6">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-indigo-600" />
            <h3 className="font-bold text-sm text-slate-900">Auditoria &amp; Activity Log</h3>
          </div>
          <p className="text-xs text-slate-500 -mt-4">Histórico cronológico de todas as ações executadas por utilizadores e pelo motor autónomo de IA</p>

          <div className="relative border-l-2 border-slate-200 pl-6 space-y-6">
            {auditLogs.map((item) => {
              const isAiAction = item.user.includes('AI') || item.user.includes('Engine');
              return (
                <div key={item.id} className="relative group">
                  {/* Bullet node */}
                  <div className={`absolute -left-[31px] top-0.5 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center ${
                    isAiAction ? 'bg-indigo-600' : 'bg-slate-800'
                  }`}>
                    {isAiAction ? <Sparkles className="w-2.5 h-2.5 text-white" /> : <User className="w-2.5 h-2.5 text-white" />}
                  </div>

                  <div className="p-4 bg-slate-50 hover:bg-slate-100/80 transition-colors rounded-xl border border-slate-200/70 space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{item.user}</span>
                        <span className="px-2 py-0.5 bg-slate-200 text-slate-700 text-[10px] font-bold rounded">
                          {item.action}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono">{item.timestamp}</span>
                    </div>

                    <p className="text-slate-700 font-medium">{item.description}</p>
                    
                    <div className="pt-1 text-[10px] text-slate-400 font-mono">
                      Módulo: {item.module} {item.entity_id && `• Entity ID: ${item.entity_id}`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
