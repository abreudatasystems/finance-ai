import { Currency } from '@/types';
import { apiFetch } from './api';

export interface AIActionItem {
  label: string;
  action: string;
  /** O que a acção leva consigo. A forma depende da acção, e quem a trata é
   *  que a sabe — por isso `unknown` e não `any`: obriga a verificar. */
  payload?: unknown;
}

export interface AIMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  actionCard?: AIActionCard;
  actions?: AIActionItem[];
  /** 'ia' quando respondeu o Claude; 'basico' no motor de palavras-chave. */
  mode?: AIMode;
  /** Nota curta do servidor (ex.: porque está em modo básico). */
  notice?: string;
}

export type AIMode = 'ia' | 'basico';

/** Uma mensagem anterior, enviada ao servidor para dar contexto à IA. */
export interface AIHistoryItem {
  role: 'user' | 'assistant';
  text: string;
}

/** Quantas mensagens anteriores seguem com cada pergunta (≈ 10 trocas). */
export const AI_HISTORY_LIMIT = 20;

/** O histórico a enviar: só texto, sem a saudação inicial, as mais recentes. */
export function buildHistory(messages: AIMessage[]): AIHistoryItem[] {
  return messages
    .filter(m => m.id !== INITIAL_AI_MESSAGES[0]?.id && m.text.trim())
    .slice(-AI_HISTORY_LIMIT)
    .map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', text: m.text }));
}

/** O cartão que uma resposta pode trazer, com a forma que cada tipo tem.

 *  Era `data: any`, e por isso o componente lia campos que ninguém garantia
 *  existirem. Uma união discriminada pelo `type` faz o compilador verificar
 *  que cada leitura corresponde ao cartão certo. */
export type AIActionCard =
  | {
      type: 'show_alerts';
      title: string;
      data: { highlights: string[] };
      status?: AIActionStatus;
    }
  | {
      type: 'create_transaction';
      title: string;
      /** `transaction_id` existe quando o cartão confirma o pagamento de um
       *  documento já lançado; sem ele, o cartão propõe um lançamento novo. */
      data: { supplier: string; description: string; amount: number; due_date: string; transaction_id?: string };
      status?: AIActionStatus;
    }
  | {
      type: 'show_chart' | 'show_transactions';
      title: string;
      data: Record<string, unknown>;
      status?: AIActionStatus;
    };

export type AIActionStatus = 'pending' | 'confirmed' | 'cancelled';


/** A saudação inicial.
 *
 *  Não traz números: os destaques que aqui estavam ("Fatura EDP pendente há
 *  5 dias", "8 meses de runway") eram fixos e apareciam a qualquer empresa —
 *  um valor financeiro inventado é pior do que nenhum. Os alertas verdadeiros
 *  estão em /alerts e o assistente responde com os dados da empresa activa.
 *
 *  Também não tem hora: calculada no servidor e de novo no navegador, a hora
 *  diferia (outro minuto, outro fuso) e o React refazia a página inteira. */
export const INITIAL_AI_MESSAGES: AIMessage[] = [
  {
    id: 'msg-1',
    sender: 'ai',
    text: 'Olá. Sou o **Assistente**. Pergunte-me pelo saldo, pelo que está por pagar ou por receber, ou peça-me para registar um lançamento.',
    timestamp: '',
  },
];

export async function processUserMessage(
  prompt: string,
  currency: Currency = 'EUR',
  pagePath: string = '/dashboard',
  history: AIHistoryItem[] = [],
): Promise<AIMessage> {
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  try {
    const res = await apiFetch(`/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: prompt,
        prompt: prompt,
        currency,
        history,
        context: {
          page: pagePath,
          period: new Date().toISOString().slice(0, 7),
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
        actions: data.actions,
        mode: data.mode === 'ia' ? 'ia' : data.mode === 'basico' ? 'basico' : undefined,
        notice: typeof data.notice === 'string' ? data.notice : undefined,
      };
    }
  } catch {
    /* sem ligação — cai na mensagem abaixo */
  }

  // Sem resposta da API não há análise: dizer o contrário, com números
  // inventados ("+€4.500,00"), seria pior do que admitir a falha.
  return {
    id: `msg-ai-${Date.now()}`,
    sender: 'ai',
    text: 'Não consegui contactar o servidor para analisar o pedido. Verifique a ligação e tente de novo.',
    timestamp,
  };
}
