'use client';

import React, { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { INITIAL_AI_MESSAGES, AIMessage, AIActionItem, processUserMessage } from '@/services/ai-assistant';
import { apiPostOrError } from '@/services/api';
import { formatDate } from '@/lib/format';
import { Button, IconButton, Input } from '@/components/ui';
import {Sparkles, Send, Bot, User, CheckCircle2, PanelRightClose, ArrowRight} from 'lucide-react';

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
    if (!text.trim()) return;

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
      const response = await processUserMessage(text, currency, pathname);
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
    const payload = (act.payload ?? {}) as { transaction_id?: string; amount?: number };
    if (act.action === 'confirm_payment') {
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
      <div className="p-4 bg-black text-white flex items-center justify-between shadow-md border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-neutral-900 flex items-center justify-center border border-neutral-800">
            <Sparkles className="w-5 h-5 text-emerald-400 animate-pulse" />
          </div>
          <div>
            <h2 className="font-semibold text-sm flex items-center gap-2">
              Assistente
              <span className="text-2xs bg-neutral-800 text-emerald-300 px-1.5 py-0.5 rounded font-mono uppercase border border-neutral-700">Transversal</span>
            </h2>
            <p className="text-2xs text-neutral-400">Camada de Inteligência Financeira</p>
          </div>
        </div>

        <IconButton
          label="Recolher painel do assistente"
          onClick={closeAiDrawer}
          className="text-white/80 hover:text-white hover:bg-white/10 [&_svg]:size-5"
        >
          <PanelRightClose />
        </IconButton>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-neutral-50/50">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
              msg.sender === 'ai' 
                ? 'bg-emerald-600 text-white shadow-xs' 
                : 'bg-neutral-700 text-white'
            }`}>
              {msg.sender === 'ai' ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
            </div>

            <div className={`max-w-[85%] space-y-2 ${msg.sender === 'user' ? 'items-end' : ''}`}>
              <div className={`p-3 rounded-2xl text-xs leading-relaxed shadow-2xs ${
                msg.sender === 'ai'
                  ? 'bg-white text-neutral-800 border border-neutral-200/80 rounded-tl-xs'
                  : 'bg-black text-white rounded-tr-xs font-medium'
              }`}>
                <div className="whitespace-pre-wrap">{msg.text}</div>
              </div>

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
                <div className="p-3.5 bg-white rounded-xl border border-neutral-200 shadow-xs space-y-2.5">
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
                        <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold p-1.5 bg-emerald-50 rounded-lg">
                          <CheckCircle2 className="w-4 h-4" />
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
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-white p-3 rounded-2xl border border-neutral-200 text-xs text-neutral-400 animate-pulse flex items-center gap-1">
              <span>Assistente a analisar o contexto...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Action Chips */}
      <div className="p-3 bg-white border-t border-neutral-100 space-y-2">
        <div className="text-2xs font-bold text-neutral-400 uppercase tracking-wider">Acções rápidas</div>
        <div className="flex flex-wrap gap-1.5">
          {quickActions.map((qa, idx) => (
            <button
              type="button"
              key={idx}
              onClick={() => handleSend(qa.prompt)}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 px-2.5 py-1 rounded-full bg-neutral-100 hover:bg-emerald-50 hover:text-emerald-700 text-neutral-600 text-2xs font-medium transition-colors border border-neutral-200/60"
            >
              {qa.label}
            </button>
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
            className="flex-1 text-xs"
          />
          <Button
            type="submit"
            disabled={!inputText.trim()}
            aria-label="Enviar mensagem"
            title="Enviar mensagem"
            className="px-0 w-9 shrink-0"
            icon={<Send className="text-emerald-400" />}
          />
        </form>
      </div>

    </aside>
  );
};
