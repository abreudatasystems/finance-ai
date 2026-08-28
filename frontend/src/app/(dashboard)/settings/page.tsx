'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { fetchAIRules } from '@/services/data';
import { clearToken } from '@/services/api';
import { AIRule } from '@/types';
import {
  Building2, Sparkles, User, Users, Save, Check, LogOut, ShieldCheck, Mail, BadgeCheck,
} from 'lucide-react';

type Tab = 'company' | 'ai' | 'profile' | 'users';

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
  { id: 'ai', label: 'Inteligência Artificial', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'profile', label: 'Perfil', icon: <User className="w-4 h-4" /> },
  { id: 'users', label: 'Utilizadores & Roles', icon: <Users className="w-4 h-4" /> },
];

export default function SettingsPage() {
  const router = useRouter();
  const { currentCompany, currency, setCurrency, currentUser, userRole } = useApp();

  const [activeTab, setActiveTab] = useState<Tab>('company');
  const [aiRules, setAiRules] = useState<AIRule[]>([]);
  const [settings, setSettings] = useState<StoredSettings>(DEFAULT_SETTINGS);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    async function load() {
      setAiRules(await fetchAIRules());
    }
    load();

    try {
      const raw = window.localStorage.getItem(SETTINGS_KEY);
      if (raw) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
  }, []);

  const patch = (p: Partial<StoredSettings>) => setSettings((s) => ({ ...s, ...p }));

  const handleSave = () => {
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight">Configurações da Plataforma</h1>
          <p className="text-xs text-slate-500 font-medium">
            Gestão da empresa, preferências do motor de inteligência artificial e utilizadores
          </p>
        </div>

        <button
          onClick={handleSave}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 active:scale-95 shrink-0"
        >
          {savedSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          <span>{savedSuccess ? 'Guardado com sucesso!' : 'Guardar Alterações'}</span>
        </button>
      </div>

      {/* Navigation Tabs — horizontally scrollable on small screens */}
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="flex items-center bg-white p-1.5 rounded-2xl border border-slate-200/80 w-max text-xs font-semibold gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap ${
                activeTab === t.id ? 'bg-indigo-600 text-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

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
    </div>
  );
}
