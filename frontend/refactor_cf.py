import os
import re

base_dir = r'c:\Users\conex\Desktop\CEI\finance-ai\frontend'
cash_flow_page = os.path.join(base_dir, r'src\app\(dashboard)\financial\cash-flow\page.tsx')
payables_page = os.path.join(base_dir, r'src\app\(dashboard)\financial\payables\page.tsx')
receivables_page = os.path.join(base_dir, r'src\app\(dashboard)\financial\receivables\page.tsx')
cashflow_view = os.path.join(base_dir, r'src\components\cashflow\CashFlowView.tsx')

with open(cash_flow_page, 'r', encoding='utf-8') as f:
    content = f.read()

# Create CashFlowView.tsx
imports = """'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useApp } from '@/context/AppContext';
import { fetchTransactions } from '@/services/data';
import { settleMany } from '@/components/cashflow/api';
import { ForecastPanel } from '@/components/cashflow/ForecastPanel';
import { Transaction } from '@/types';
import {
  Wallet, ArrowUpRight, ArrowDownLeft, Filter, Search, Plus, FileText,
  Clock, CheckCircle2, X, Sparkles, ChevronRight, Tag, ShieldCheck,
  Building2, RefreshCcw, Bot, User, HandCoins
} from 'lucide-react';

export interface CashFlowViewProps {
  mode?: 'cash-flow' | 'payables' | 'receivables';
}
"""

component = content.split('function CashFlowContent() {')[1].split('export default function CashFlowPage()')[0]
component = "export function CashFlowContent({ mode = 'cash-flow' }: CashFlowViewProps) {" + component

# Modify state initializers based on mode
component = component.replace(
    "const [activeTab, setActiveTab] = useState<'all' | 'income' | 'expense' | 'pending' | 'open'>('all');",
    "const [activeTab, setActiveTab] = useState<'all' | 'income' | 'expense' | 'pending' | 'open'>(mode === 'cash-flow' ? 'all' : 'open');"
)
component = component.replace(
    "const [direction, setDirection] = React.useState<'all' | 'expense' | 'income'>('all');",
    "const [direction, setDirection] = React.useState<'all' | 'expense' | 'income'>(mode === 'payables' ? 'expense' : mode === 'receivables' ? 'income' : 'all');"
)

# Modify useEffect for Page Header
page_header_effect = """  useEffect(() => {
    if (mode === 'payables') {
      setPageHeader('Contas a Pagar', 'Gestão de despesas e obrigações financeiras pendentes');
    } else if (mode === 'receivables') {
      setPageHeader('Contas a Receber', 'Gestão de receitas e recebimentos pendentes');
    } else {
      setPageHeader('Fluxo de Caixa & Movimentos', 'Gestão profissional de todas as entradas, saídas e previsões de caixa');
    }
  }, [setPageHeader, mode]);"""
component = re.sub(r'useEffect\(\(\) => \{\s*setPageHeader.*?\s*\}, \[setPageHeader\]\);', page_header_effect, component, flags=re.DOTALL)

# Hide ForecastPanel if not cash-flow
component = component.replace('<ForecastPanel />', "{mode === 'cash-flow' && <ForecastPanel />}")

# Hide Tabs if not cash-flow
tabs_regex = r'<div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-600 w-full sm:w-auto overflow-x-auto whitespace-nowrap hide-scrollbar">.*?</div>'
tabs_replacement = "{mode === 'cash-flow' && (\n        <div className=\"flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-600 w-full sm:w-auto overflow-x-auto whitespace-nowrap hide-scrollbar\">" + \
    re.search(tabs_regex, component, re.DOTALL).group(0)[139:] + \
    "\n      )}"

# For the tabs hiding, since the regex is complex, we just do a string replacement on the exact block.
# Actually, it's easier to just hide the outer div elements.
component = component.replace(
    "{/* Navigation Tabs */}",
    "{/* Navigation Tabs */}\n        {mode === 'cash-flow' && ("
)
component = component.replace(
    "<span>Pendentes IA</span> <Bot className=\"w-3.5 h-3.5\" />\n          </button>\n        </div>",
    "<span>Pendentes IA</span> <Bot className=\"w-3.5 h-3.5\" />\n          </button>\n        </div>\n        )}"
)

# Hide Em Aberto direction toggles if mode != cash-flow
component = component.replace(
    "<div className=\"flex items-center bg-slate-100 p-1 rounded-xl w-full sm:w-auto sm:inline-flex\">",
    "{mode === 'cash-flow' && (\n            <div className=\"flex items-center bg-slate-100 p-1 rounded-xl w-full sm:w-auto sm:inline-flex\">"
)
component = component.replace(
    "                {label}\n              </button>\n            ))}\n          </div>",
    "                {label}\n              </button>\n            ))}\n          </div>\n          )}"
)

with open(cashflow_view, 'w', encoding='utf-8') as f:
    f.write(imports + component)

# Rewrite cash_flow_page
new_cash_flow_page = """'use client';

import React, { Suspense } from 'react';
import { CashFlowContent } from '@/components/cashflow/CashFlowView';

export default function CashFlowPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-400 text-xs">
          A carregar o fluxo de caixa…
        </div>
      }
    >
      <CashFlowContent mode="cash-flow" />
    </Suspense>
  );
}
"""
with open(cash_flow_page, 'w', encoding='utf-8') as f:
    f.write(new_cash_flow_page)

# Rewrite payables_page
new_payables = """'use client';

import React, { Suspense } from 'react';
import { CashFlowContent } from '@/components/cashflow/CashFlowView';

export default function PayablesPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-400 text-xs">
          A carregar contas a pagar…
        </div>
      }
    >
      <CashFlowContent mode="payables" />
    </Suspense>
  );
}
"""
with open(payables_page, 'w', encoding='utf-8') as f:
    f.write(new_payables)

# Rewrite receivables_page
new_receivables = """'use client';

import React, { Suspense } from 'react';
import { CashFlowContent } from '@/components/cashflow/CashFlowView';

export default function ReceivablesPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-400 text-xs">
          A carregar contas a receber…
        </div>
      }
    >
      <CashFlowContent mode="receivables" />
    </Suspense>
  );
}
"""
with open(receivables_page, 'w', encoding='utf-8') as f:
    f.write(new_receivables)

print("Refactored CashFlow into shared CashFlowView with distinct modes.")
