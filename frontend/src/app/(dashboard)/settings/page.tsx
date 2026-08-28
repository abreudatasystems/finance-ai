'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { fetchAIRules } from '@/services/data';
import { AIRule } from '@/types';
import { Settings, Building2, Sparkles, User, Users, ShieldCheck, Save, Check } from 'lucide-react';

export default function SettingsPage() {
  const { currentCompany, currency, setCurrency, userRole } = useApp();
  const [activeTab, setActiveTab] = useState<'company' | 'ai' | 'profile' | 'users'>('company');
  const [aiRules, setAiRules] = useState<AIRule[]>([]);
  const [autoClassify, setAutoClassify] = useState(true);
  const [approvalLevel, setApprovalLevel] = useState('always_confirm');
  const [confidenceThreshold, setConfidenceThreshold] = useState(85);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    async function load() {
      const rules = await fetchAIRules();
      setAiRules(rules);
    }
    load();
  }, []);

  const handleSave = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight">
            Configurações da Plataforma
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Gestão da empresa, preferências do motor de inteligência artificial e utilizadores
          </p>
        </div>

        <button
          onClick={handleSave}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 active:scale-95"
        >
          {savedSuccess ? <Check className="w-4 h-4 text-emerald-300" /> : <Save className="w-4 h-4" />}
          <span>{savedSuccess ? 'Guardado com Sucesso!' : 'Guardar Alterações'}</span>
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center bg-white p-1.5 rounded-2xl border border-slate-200/80 w-fit text-xs font-semibold">
        <button
          onClick={() => setActiveTab('company')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${
            activeTab === 'company' ? 'bg-indigo-600 text-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Empresa
        </button>

        <button
          onClick={() => setActiveTab('ai')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${
            activeTab === 'ai' ? 'bg-indigo-600 text-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          Inteligência Artificial
        </button>

        <button
          onClick={() => setActiveTab('profile')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${
            activeTab === 'profile' ? 'bg-indigo-600 text-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <User className="w-4 h-4" />
          Perfil
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${
            activeTab === 'users' ? 'bg-indigo-600 text-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Users className="w-4 h-4" />
          Utilizadores &amp; Roles
        </button>
      </div>

      {/* TAB CONTENT: Empresa */}
      {activeTab === 'company' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4 max-w-2xl text-xs">
          <h3 className="font-bold text-sm text-slate-900">Dados da Empresa Multi-tenant</h3>

          <div className="space-y-1">
            <label className="font-semibold text-slate-600">Nome da Empresa</label>
            <input
              type="text"
              defaultValue={currentCompany?.name || 'TechStart Lda'}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 font-medium"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-semibold text-slate-600">NIF</label>
              <input
                type="text"
                defaultValue={currentCompany?.nif || 'PT516789012'}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-600">Moeda por Omissão</label>
              <select
                value={currency}
                onChange={(e: any) => setCurrency(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 font-bold"
              >
                <option value="EUR">EUR (€) - Euro</option>
                <option value="USD">USD ($) - Dólar Americano</option>
                <option value="BRL">BRL (R$) - Real Brasileiro</option>
                <option value="GBP">GBP (£) - Libra Esterlina</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Inteligência Artificial */}
      {activeTab === 'ai' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4 max-w-2xl text-xs">
            <h3 className="font-bold text-sm text-indigo-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              Preferências &amp; Automação do Motor IA
            </h3>

            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <span className="font-bold text-slate-800 block">Classificação Automática por IA</span>
                <span className="text-slate-500 text-[11px]">Processar faturas assim que entram na Finance Inbox</span>
              </div>
              <button
                onClick={() => setAutoClassify(!autoClassify)}
                className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${autoClassify ? 'bg-indigo-600' : 'bg-slate-300'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${autoClassify ? 'translate-x-6' : ''}`} />
              </button>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-600">Nível de Aprovação Exigido</label>
              <select
                value={approvalLevel}
                onChange={(e) => setApprovalLevel(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 font-medium"
              >
                <option value="always_confirm">Confirmar Sempre (Recomendado para início)</option>
                <option value="auto_high">Auto-aprovar se Confiança &gt; 90%</option>
                <option value="fully_autonomous">Modo 100% Autónomo</option>
              </select>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between font-semibold text-slate-700">
                <span>Threshold Mínimo de Confiança:</span>
                <span className="text-indigo-600 font-bold">{confidenceThreshold}%</span>
              </div>
              <input
                type="range"
                min="60"
                max="98"
                value={confidenceThreshold}
                onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
                className="w-full text-indigo-600"
              />
            </div>
          </div>

          {/* AI Learned Rules Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4 text-xs">
            <h3 className="font-bold text-sm text-slate-900">Regras Aprendidas pela IA ({aiRules.length})</h3>
            
            <table className="w-full text-left">
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
        </div>
      )}

      {/* TAB CONTENT: Perfil */}
      {activeTab === 'profile' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4 max-w-xl text-xs">
          <h3 className="font-bold text-sm text-slate-900">Perfil do Utilizador</h3>
          
          <div className="space-y-1">
            <label className="font-semibold text-slate-600">Nome Completo</label>
            <input
              type="text"
              defaultValue="João Silva"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-600">Email</label>
            <input
              type="email"
              defaultValue="joao@techstart.pt"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200"
            />
          </div>
        </div>
      )}

      {/* TAB CONTENT: Utilizadores & Roles */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900">Membros da Equipa e Permissões</h3>
            <span className="text-slate-400 font-mono">2 Membros</span>
          </div>

          <table className="w-full text-left">
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
                <td className="p-3 font-bold text-slate-900">João Silva</td>
                <td className="p-3 text-slate-600">joao@techstart.pt</td>
                <td className="p-3">
                  <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 font-bold rounded text-[10px] uppercase">
                    Owner
                  </span>
                </td>
                <td className="p-3 text-slate-500">15/01/2026</td>
              </tr>
              <tr className="hover:bg-slate-50 font-medium">
                <td className="p-3 font-bold text-slate-900">Ana Costa</td>
                <td className="p-3 text-slate-600">ana@techstart.pt</td>
                <td className="p-3">
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-bold rounded text-[10px] uppercase">
                    Finance Manager
                  </span>
                </td>
                <td className="p-3 text-slate-500">10/02/2026</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}
