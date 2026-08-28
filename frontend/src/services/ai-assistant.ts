import { fetchTransactions } from './data';
import { Currency } from '@/types';

export interface AIActionItem {
  label: string;
  action: string;
  payload?: any;
}

export interface AIMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  actionCard?: {
    type: 'create_transaction' | 'show_chart' | 'show_alerts' | 'show_transactions';
    title: string;
    data: any;
    status?: 'pending' | 'confirmed' | 'cancelled';
  };
  actions?: AIActionItem[];
}

export const INITIAL_AI_MESSAGES: AIMessage[] = [
  {
    id: 'msg-1',
    sender: 'ai',
    text: 'Olá João. Sou o seu **Finance AI Copilot**. Estou a monitorizar a saúde financeira da **TechStart Lda** em tempo real.',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    actionCard: {
      type: 'show_alerts',
      title: 'Destaques e Alertas Automáticos',
      data: {
        highlights: [
          '[Atrasado] Fatura EDP Comercial pendente há 5 dias (€180,00)',
          '[Aviso] Fornecedor Google Ireland aumentou preço (+43%)',
          '[Saudável] Saldo de caixa com 8 meses de runway (€45.230,00)'
        ]
      }
    }
  }
];

export async function processUserMessage(prompt: string, currency: Currency = 'EUR', pagePath: string = '/dashboard'): Promise<AIMessage> {
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api/v1';

  try {
    const res = await fetch(`${API_BASE}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: prompt,
        prompt: prompt,
        company_id: 'COMP001',
        currency,
        context: {
          page: pagePath,
          period: '2026-08'
        }
      })
    });

    if (res.ok) {
      const data = await res.json();
      return {
        id: data.id || `msg-ai-${Date.now()}`,
        sender: 'ai',
        text: data.text || 'Análise concluída.',
        timestamp: data.timestamp || timestamp,
        actionCard: data.actionCard,
        actions: data.actions
      };
    }
  } catch (err) {
    // API fallback
  }

  // Fallback engine
  const p = prompt.toLowerCase();
  if (p.includes('fluxo') || p.includes('caixa')) {
    return {
      id: `msg-ai-${Date.now()}`,
      sender: 'ai',
      text: 'Com base no histórico dos últimos 30 dias, o seu **Fluxo de Caixa Operacional** apresenta um saldo líquido positivo de **+€4.500,00**.',
      timestamp,
      actions: [
        { label: 'Ver Movimentos', action: 'open_transactions' },
        { label: 'Exportar Relatório', action: 'create_report' }
      ]
    };
  }

  return {
    id: `msg-ai-${Date.now()}`,
    sender: 'ai',
    text: `Analisei a sua solicitação sobre "${prompt}". Todos os registos foram sincronizados com a base de dados relacional.`,
    timestamp,
    actions: [
      { label: 'Ver Detalhes', action: 'open_transactions' }
    ]
  };
}
