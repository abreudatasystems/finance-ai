import { Currency } from '@/types';
import { apiFetch } from './api';
import { fetchAlerts } from '@/components/alerts/api';

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
      data: { supplier: string; description: string; amount: number; due_date: string };
      status?: AIActionStatus;
    }
  | {
      type: 'show_chart' | 'show_transactions';
      title: string;
      data: Record<string, unknown>;
      status?: AIActionStatus;
    };

export type AIActionStatus = 'pending' | 'confirmed' | 'cancelled';


/** A primeira mensagem, construída a partir do que a empresa tem mesmo.
 *
 * O que estava aqui era uma constante: cumprimentava sempre um "João", dizia
 * sempre que monitorizava a "TechStart Lda", e anunciava sempre oito meses de
 * autonomia com 45.230,00 € em caixa — a quem tivesse acabado de abrir conta
 * e não tivesse um único lançamento. Um assistente financeiro que abre com um
 * número inventado não é um assistente com um defeito: é um a dizer coisas que
 * não sabe, e a primeira frase é onde isso custa mais caro.
 *
 * Os destaques passam a ser os alertas verdadeiros da empresa activa. Quando
 * não há dados, diz que não há; quando está tudo em dia, diz isso; e quando o
 * servidor não responde, diz que não conseguiu ler — nunca um valor.
 */
export async function buildOpeningMessage(
  { userName, companyName }: { userName?: string | null; companyName?: string | null } = {},
): Promise<AIMessage> {
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const greeting = userName ? `Olá ${userName}.` : 'Olá.';
  const scope = companyName
    ? `Estou a acompanhar a **${companyName}**.`
    : 'Estou a acompanhar a empresa activa.';

  const payload = await fetchAlerts();

  if (!payload) {
    return {
      id: 'msg-abertura',
      sender: 'ai',
      text: `${greeting} ${scope} Não consegui ler os alertas agora — tente outra vez daqui a pouco.`,
      timestamp,
    };
  }

  const { alertas, resumo } = payload;

  if (resumo.sem_dados) {
    return {
      id: 'msg-abertura',
      sender: 'ai',
      text: `${greeting} ${scope} Ainda não há lançamentos suficientes para dizer alguma coisa sobre as contas. Carregue uma fatura ou registe um movimento e passo a acompanhar.`,
      timestamp,
      actions: [{ label: 'Carregar documento', action: 'open_documents' }],
    };
  }

  if (resumo.tudo_em_dia) {
    return {
      id: 'msg-abertura',
      sender: 'ai',
      text: `${greeting} ${scope} Não há nada em atraso nem nada fora do normal neste momento.`,
      timestamp,
    };
  }

  return {
    id: 'msg-abertura',
    sender: 'ai',
    text: `${greeting} ${scope} ${resumo.total === 1 ? 'Há uma coisa' : `Há ${resumo.total} coisas`} a precisar de atenção.`,
    timestamp,
    actionCard: {
      type: 'show_alerts',
      title: resumo.criticos ? 'A tratar primeiro' : 'A precisar de atenção',
      // Os três primeiros: a lista vem ordenada do mais grave para o menos.
      data: { highlights: alertas.slice(0, 3).map((a) => `${a.title} — ${a.description}`) },
    },
    actions: [{ label: 'Ver todos os alertas', action: 'open_alerts' }],
  };
}

export async function processUserMessage(prompt: string, currency: Currency = 'EUR', pagePath: string = '/dashboard'): Promise<AIMessage> {
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  try {
    const res = await apiFetch(`/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // A empresa não vai no corpo: o backend impõe a da sessão autenticada,
      // e mandá-la daqui só criava a ilusão de que o cliente a escolhe. O
      // período era a constante '2026-08' — dizia ao assistente que estávamos
      // sempre em Agosto de 2026.
      body: JSON.stringify({
        message: prompt,
        prompt,
        currency,
        context: {
          page: pagePath,
          period: new Date().toISOString().slice(0, 7),
        },
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
  } catch {
    // API fallback
  }

  // Sem servidor não há resposta possível.
  //
  // Aqui dizia-se, sem falar com nada: "o seu Fluxo de Caixa Operacional
  // apresenta um saldo líquido positivo de +4.500,00 €". O número era fixo, e
  // aparecia justamente quando a aplicação não conseguia ler coisa nenhuma —
  // o pior momento possível para afirmar um valor. Quem lê isto está offline,
  // e o que precisa de saber é isso.
  return {
    id: `msg-ai-${Date.now()}`,
    sender: 'ai',
    text: 'Não consegui chegar ao servidor, por isso não tenho como responder a isto sem inventar. Verifique a ligação e tente outra vez.',
    timestamp,
    actions: [{ label: 'Tentar novamente', action: 'retry_last' }],
  };
}
