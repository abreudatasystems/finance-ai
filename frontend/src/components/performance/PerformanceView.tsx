'use client';

/**
 * Desempenho — o mesmo dinheiro, cortado de duas maneiras.
 *
 * O orçamento pergunta *"gastámos no que tínhamos decidido gastar?"* e olha
 * por categoria, mês a mês. Os projetos perguntam *"este trabalho deu
 * lucro?"* e olham por trabalho, ao longo do tempo que ele durar. São a mesma
 * pergunta — para onde foi o dinheiro — em dois grãos diferentes, e por isso
 * viviam em duas páginas que se liam uma a seguir à outra.
 *
 * Os dois períodos ficam separados de propósito: um orçamento é mensal porque
 * é assim que se decide, e um projeto atravessa meses porque é assim que
 * acontece. Forçar um período comum daria números que não respondem a
 * pergunta nenhuma.
 */

import React, { useState } from 'react';
import { Target, FolderKanban } from 'lucide-react';
import { BudgetView } from '@/components/budgets/BudgetView';
import { ProjectsView } from '@/components/projects/ProjectsView';

export type PerformanceMode = 'budget' | 'projects';

const VIEWS = [
  {
    key: 'budget' as const,
    label: 'Por categoria',
    icon: Target,
    hint: 'O que estava orçamentado, face ao que aconteceu — mês a mês.',
  },
  {
    key: 'projects' as const,
    label: 'Por projeto',
    icon: FolderKanban,
    hint: 'Quanto rendeu e quanto custou cada trabalho — ao longo do ano.',
  },
];

export const PerformanceView: React.FC<{ initial?: PerformanceMode }> = ({
  initial = 'budget',
}) => {
  const [mode, setMode] = useState<PerformanceMode>(initial);
  const current = VIEWS.find((v) => v.key === mode) ?? VIEWS[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center bg-slate-100 p-1 rounded-xl w-full sm:w-auto">
          {VIEWS.map((view) => {
            const Icon = view.icon;
            return (
              <button
                key={view.key}
                onClick={() => setMode(view.key)}
                className={`px-3.5 py-1.5 rounded-lg font-bold text-[11px] flex-1 sm:flex-none flex items-center justify-center gap-1.5 transition-all ${
                  mode === view.key
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {view.label}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-500 leading-relaxed">{current.hint}</p>
      </div>

      {/* Ambos leem os documentos na mesma base — regime de acréscimo, sem IVA —
          por isso os dois cortes somam ao mesmo resultado da empresa. */}
      {mode === 'budget' ? <BudgetView /> : <ProjectsView />}
    </div>
  );
};
