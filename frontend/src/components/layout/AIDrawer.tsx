'use client';

import React, { useState, useRef, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { INITIAL_AI_MESSAGES, AIMessage, AIActionItem, buildHistory, processUserMessage } from '@/services/ai-assistant';
import { apiPostOrError } from '@/services/api';
import { formatDate } from '@/lib/format';
import { Button, IconButton, Input } from '@/components/ui';
import {Sparkles, Send, Bot, User, CheckCircle2, PanelRightClose, ArrowRight, Info, Loader2} from 'lucide-react';

/** **negrito** dentro de uma linha. */
function renderInline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4
      ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
      : <React.Fragment key={i}>{part}</React.Fragment>,
  );
}

/**
 * Markdown mínimo das respostas: parágrafos, **negrito** e listas
 * ("- ", "• ", "* " ou "1. "). Sem HTML vindo do servidor — só texto.
 */
function MessageText({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flush = () => {
    if (!list) return;
    const items = list.items.map((item, i) => <li key={i}>{renderInline(item)}</li>);
    blocks.push(list.ordered
      ? <ol key={blocks.length} className="list-decimal pl-4 space-y-0.5">{items}</ol>
      : <ul key={blocks.length} className="list-disc pl-4 space-y-0.5 marker:text-emerald-600">{items}</ul>);
    list = null;
  };

  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const bullet = /^\s*(?:[-•*])\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = !bullet;
      if (list && list.ordered !== ordered) flush();
      if (!list) list = { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    flush();
    if (line.trim()) blocks.push(<p key={blocks.length}>{renderInline(line)}</p>);
  }
  flush();
  return <div className="space-y-1.5 break-words">{blocks}</div>;
}

/**
 * Ids das mensagens.
 *
 * Bastava serem únicos dentro da conversa, e vinham de `Date.now()` — o que
 * torna o resultado dependente do relógio e impossível de reproduzir. Um
 * contador do módulo dá o mesmo com menos.
 */
let messageSequence = 0;
const nextMessageId = (who: 'user' | 'ai') => `msg-${who}-${++messageSequence}`;

export const AIDrawer: React.FC = () => {
  const { isAiDrawerOpen, closeAiDrawer, currency, formatMoney } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const [messages, setMessages] = useState<AIMessage[]>(INITIAL_AI_MESSAGES);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isAiDrawerOpen) {
      scrollToBottom();
    }
  }, [messages, isAiDrawerOpen]);

  // Keep component mounted for smooth slide transition

  const handleSend = async (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim() || isTyping) return;
    // O histórico é o que já está no ecrã, antes desta pergunta.
    const history = buildHistory(messages);

    const userMsg: AIMessage = {
      id: nextMessageId('user'),
      sender: 'user',
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    if (!textToSend) setInputText('');
    setIsTyping(true);

    try {
      const response = await processUserMessage(text, currency, pathname, history);
      setMessages(prev => [...prev, response]);
    } finally {
      setIsTyping(false);
    }
  };

  const say = (text: string) => {
    setMessages(prev => [
      ...prev,
      {
        id: nextMessageId('ai'),
        sender: 'ai',
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  };

  /** Regista o pagamento de um documento através da API.
   *
   *  Antes, os botões respondiam com um texto fixo ("Pagamento de €4.500,00
   *  para Microsoft Ireland registado!") sem chamar nada. Só se diz que foi
   *  registado depois de a API o confirmar. */
  const registerPayment = async (transactionId: string, amount?: number): Promise<boolean> => {
    const { error } = await apiPostOrError(`/transactions/${encodeURIComponent(transactionId)}/payments`, {
      ...(typeof amount === 'number' ? { amount } : {}),
    });
    if (error) {
      say(`**Não foi possível registar o pagamento.** ${error}`);
      return false;
    }
    say(`**Pagamento registado${typeof amount === 'number' ? ` (${formatMoney(amount)})` : ''}.** O documento foi liquidado e já aparece no Fluxo de Caixa.`);
    return true;
  };

  const handleActionClick = async (act: AIActionItem) => {
    const payload = (act.payload ?? {}) as { transaction_id?: string; amount?: number; path?: string };
    if (act.action === 'navigate') {
      // Só caminhos internos da aplicação.
      if (typeof payload.path === 'string' && payload.path.startsWith('/') && !payload.path.startsWith('//')) {
        router.push(payload.path);
      }
    } else if (act.action === 'confirm_payment') {
      if (payload.transaction_id) {
        await registerPayment(payload.transaction_id, payload.amount);
      } else {
        say('Não sei a que documento se refere este pagamento. Registe-o a partir do Fluxo de Caixa.');
      }
    } else if (act.action === 'create_category') {
      // O assistente não envia o nome nem as palavras-chave da categoria,
      // por isso não a cria às cegas: indica onde se faz.
      say('Para criar a categoria, abra **Configurações → Plano de contas** e acrescente-a ao grupo certo.');
    } else {
      handleSend(act.label);
    }
  };

  const handleConfirmActionCard = async (msg: AIMessage) => {
    const card = msg.actionCard;
    if (!card || card.type !== 'create_transaction') return;
    const { transaction_id, amount } = card.data;
    if (!transaction_id) {
      // Um cartão sem documento é uma proposta de lançamento novo; criá-lo
      // exige categoria e entidade, que o cartão não traz.
      say('Para criar este lançamento, use **Fluxo de Caixa → Novo lançamento**, com os valores acima.');
      return;
    }
    const ok = await registerPayment(transaction_id, amount);
    if (!ok) return;
    setMessages(prev =>
      prev.map(m => (m.id === msg.id && m.actionCard
        ? { ...m, actionCard: { ...m.actionCard, status: 'confirmed' } }
        : m)),
    );
  };

  const quickActions = [
    { label: 'Analisar fluxo', prompt: 'Analise o meu fluxo de caixa deste mês' },
    { label: 'Criar lançamento', prompt: 'Cria uma despesa de 500€ para Google Ads' },
    { label: 'Categoria IA', prompt: 'Cria uma categoria para despesas de IA' },
    { label: 'Pagar Microsoft', prompt: 'Paga a fatura da Microsoft' },
    { label: 'Encontrar despesa', prompt: 'Quanto gastei em software?' },
    { label: 'Alertas', prompt: 'Quais são os principais problemas financeiros?' }
  ];

  return (
    <aside className={`fixed top-0 right-0 h-screen z-40 w-[420px] md:w-[360px] lg:w-[420px] bg-white border-l border-neutral-200 flex flex-col shadow-none select-none transition-all duration-300 ease-in-out ${
      isAiDrawerOpen ? 'translate-x-0 opacity-100 pointer-events-auto' : 'translate-x-full opacity-0 pointer-events-none'
    }`}>
      
      {/* Header */}
      <div className="h-14 px-4 bg-white flex items-center justify-between border-b border-neutral-200">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-lg bg-neutral-900 flex items-center justify-center">
            <Sparkles className="size-4 text-emerald-400" />
          </div>
          <div>
            <h2 className="font-semibold text-13 text-neutral-900 flex items-center gap-1.5">
              Assistente
              <span className="text-2xs bg-emerald-50 text-emerald-700 px-1.5 h-4 leading-4 rounded border border-emerald-200 font-medium">Transversal</span>
            </h2>
            <p className="text-2xs text-neutral-500">Camada de Inteligência Financeira</p>
          </div>
        </div>

        <IconButton
          label="Recolher painel do assistente"
          onClick={closeAiDrawer}
          size="md"
        >
          <PanelRightClose />
        </IconButton>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-neutral-50">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-2.5 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div className={`size-7 rounded-md flex items-center justify-center shrink-0 ${
              msg.sender === 'ai'
                ? 'bg-emerald-600 text-white'
                : 'bg-neutral-700 text-white'
            }`}>
              {msg.sender === 'ai' ? <Bot className="size-3.5" /> : <User className="size-3.5" />}
            </div>

            <div className={`max-w-[85%] space-y-2 ${msg.sender === 'user' ? 'items-end' : ''}`}>
              <div className={`px-3 py-2 rounded-xl text-xs leading-relaxed ${
                msg.sender === 'ai'
                  ? 'bg-white text-neutral-800 border border-neutral-200 rounded-tl-sm'
                  : 'bg-neutral-900 text-white rounded-tr-sm'
              }`}>
                {msg.sender === 'ai'
                  ? <MessageText text={msg.text} />
                  : <div className="whitespace-pre-wrap">{msg.text}</div>}
              </div>

              {/* Modo básico: a resposta veio do motor de palavras-chave. */}
              {msg.sender === 'ai' && msg.mode === 'basico' && (
                <div className="flex items-start gap-1.5 text-2xs text-neutral-500 px-1">
                  <Info className="w-3 h-3 mt-px shrink-0 text-neutral-400" />
                  <span>{msg.notice || 'Modo básico — configure a IA nas definições.'}</span>
                </div>
              )}

              {/* Dynamic Action Buttons Rendering */}
              {msg.actions && msg.actions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {msg.actions.map((act, idx) => (
                    <Button
                      key={idx}
                      size="sm"
                      onClick={() => handleActionClick(act)}
                    >
                      {act.label}
                      <ArrowRight className="text-emerald-400" />
                    </Button>
                  ))}
                </div>
              )}

              {/* Action Card Rendering */}
              {msg.actionCard && (
                <div className="p-3 bg-white rounded-lg border border-neutral-200 space-y-2">
                  <div className="text-xs font-semibold text-neutral-800 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    {msg.actionCard.title}
                  </div>

                  {/* Card Type: Show Alerts */}
                  {msg.actionCard.type === 'show_alerts' && (
                    <div className="space-y-1.5 text-xs text-neutral-600">
                      {msg.actionCard.data.highlights.map((h: string, idx: number) => (
                        <div key={idx} className="p-2 bg-neutral-50 rounded-lg border border-neutral-100 font-medium">
                          {h}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Card Type: Create Transaction Confirmation */}
                  {msg.actionCard.type === 'create_transaction' && (
                    <div className="space-y-2 text-xs">
                      <div className="p-2.5 bg-neutral-50 rounded-lg border border-neutral-200/80 space-y-1 text-neutral-700">
                        <div><span className="font-semibold">Fornecedor:</span> {msg.actionCard.data.supplier}</div>
                        <div><span className="font-semibold">Descrição:</span> {msg.actionCard.data.description}</div>
                        <div><span className="font-semibold">Valor:</span> {formatMoney(msg.actionCard.data.amount)}</div>
                        <div><span className="font-semibold">Vencimento:</span> {formatDate(msg.actionCard.data.due_date)}</div>
                      </div>

                      {msg.actionCard.status === 'confirmed' ? (
                        <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium px-2 py-1.5 bg-emerald-50 rounded-md">
                          <CheckCircle2 className="size-3.5" />
                          Pagamento confirmado
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Button
                            variant="accent"
                            size="sm"
                            className="flex-1"
                            onClick={() => handleConfirmActionCard(msg)}
                            icon={<CheckCircle2 />}
                          >
                            Confirmar pagamento
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {msg.timestamp && <div className="text-2xs text-neutral-400 text-right">{msg.timestamp}</div>}
                </div>
              )}
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex gap-2.5">
            <div className="size-7 rounded-md bg-emerald-600 text-white flex items-center justify-center">
              <Bot className="size-3.5" />
            </div>
            <div role="status" aria-live="polite" className="bg-white px-3 py-2 rounded-xl border border-neutral-200 text-xs text-neutral-500 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
              <span>A consultar os dados da empresa…</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Action Chips */}
      <div className="p-3 bg-white border-t border-neutral-100 space-y-2">
        <div className="text-xs font-medium text-neutral-500">Acções rápidas</div>
        <div className="flex flex-wrap gap-1.5">
          {quickActions.map((qa, idx) => (
            <Button
              key={idx}
              variant="secondary"
              size="sm"
              onClick={() => handleSend(qa.prompt)}
              disabled={isTyping}
            >
              {qa.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Input Footer */}
      <div className="p-3 bg-white border-t border-neutral-200">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <Input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Pergunte ou peça uma acção…"
            aria-label="Mensagem para o assistente"
            className="flex-1"
          />
          <Button
            type="submit"
            disabled={!inputText.trim() || isTyping}
            aria-label="Enviar mensagem"
            title="Enviar mensagem"
            className="px-0 w-8 shrink-0"
            icon={<Send className="text-emerald-400" />}
          />
        </form>
      </div>

    </aside>
  );
};
