'use client';

import React, { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { INITIAL_AI_MESSAGES, AIMessage, processUserMessage } from '@/services/ai-assistant';
import {
  Sparkles,
  X,
  Send,
  Bot,
  User,
  Check,
  AlertTriangle,
  BarChart2,
  FileText,
  DollarSign,
  Search,
  CheckCircle2,
  XCircle,
  PanelRightClose,
  ArrowRight
} from 'lucide-react';

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
      id: `msg-user-${Date.now()}`,
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

  const handleActionClick = (actionLabel: string, actionName: string) => {
    if (actionName === 'create_category') {
      setMessages(prev => [
        ...prev,
        {
          id: `msg-action-${Date.now()}`,
          sender: 'ai',
          text: '✅ **Categoria "🤖 Inteligência Artificial" criada com sucesso!** Foram associadas as palavras-chave `openai`, `chatgpt`, `claude`, `anthropic`, `api`.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } else if (actionName === 'confirm_payment') {
      setMessages(prev => [
        ...prev,
        {
          id: `msg-action-${Date.now()}`,
          sender: 'ai',
          text: '✅ **Pagamento de €4.500,00 para Microsoft Ireland registado!** O valor foi liquidado nas Contas a Pagar.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } else {
      handleSend(actionLabel);
    }
  };

  const handleConfirmActionCard = (msgId: string) => {
    setMessages(prev =>
      prev.map(m => {
        if (m.id === msgId && m.actionCard) {
          return {
            ...m,
            actionCard: { ...m.actionCard, status: 'confirmed' }
          };
        }
        return m;
      })
    );

    setMessages(prev => [
      ...prev,
      {
        id: `msg-confirm-${Date.now()}`,
        sender: 'ai',
        text: '✅ **Lançamento criado com sucesso!** O valor foi registado na API e refletido no Fluxo de Caixa.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
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
    <aside className={`fixed top-0 right-0 h-screen z-40 w-[420px] md:w-[360px] lg:w-[420px] bg-white border-l border-slate-200 flex flex-col shadow-none select-none transition-all duration-300 ease-in-out ${
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
              Finance Copilot
              <span className="text-[10px] bg-neutral-800 text-emerald-300 px-1.5 py-0.5 rounded font-mono uppercase border border-neutral-700">Transversal</span>
            </h2>
            <p className="text-[11px] text-neutral-400">Camada de Inteligência Financeira</p>
          </div>
        </div>

        <button
          onClick={closeAiDrawer}
          className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-1 text-xs"
          title="Recolher Painel IA"
        >
          <PanelRightClose className="w-5 h-5" />
        </button>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
              msg.sender === 'ai' 
                ? 'bg-indigo-600 text-white shadow-xs' 
                : 'bg-slate-700 text-white'
            }`}>
              {msg.sender === 'ai' ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
            </div>

            <div className={`max-w-[85%] space-y-2 ${msg.sender === 'user' ? 'items-end' : ''}`}>
              <div className={`p-3 rounded-2xl text-xs leading-relaxed shadow-2xs ${
                msg.sender === 'ai'
                  ? 'bg-white text-slate-800 border border-slate-200/80 rounded-tl-xs'
                  : 'bg-indigo-600 text-white rounded-tr-xs font-medium'
              }`}>
                <div className="whitespace-pre-wrap">{msg.text}</div>
              </div>

              {/* Dynamic Action Buttons Rendering */}
              {msg.actions && msg.actions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {msg.actions.map((act, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleActionClick(act.label, act.action)}
                      className="px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-[11px] rounded-lg shadow-2xs transition-all flex items-center gap-1 active:scale-95"
                    >
                      <span>{act.label}</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  ))}
                </div>
              )}

              {/* Action Card Rendering */}
              {msg.actionCard && (
                <div className="p-3.5 bg-white rounded-xl border border-indigo-100 shadow-sm space-y-2.5">
                  <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    {msg.actionCard.title}
                  </div>

                  {/* Card Type: Show Alerts */}
                  {msg.actionCard.type === 'show_alerts' && (
                    <div className="space-y-1.5 text-xs text-slate-600">
                      {msg.actionCard.data.highlights.map((h: string, idx: number) => (
                        <div key={idx} className="p-2 bg-slate-50 rounded-lg border border-slate-100 font-medium">
                          {h}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Card Type: Create Transaction Confirmation */}
                  {msg.actionCard.type === 'create_transaction' && (
                    <div className="space-y-2 text-xs">
                      <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80 space-y-1 text-slate-700">
                        <div><span className="font-semibold">Fornecedor:</span> {msg.actionCard.data.supplier}</div>
                        <div><span className="font-semibold">Descrição:</span> {msg.actionCard.data.description}</div>
                        <div><span className="font-semibold">Valor:</span> {formatMoney(msg.actionCard.data.amount)}</div>
                        <div><span className="font-semibold">Vencimento:</span> {msg.actionCard.data.due_date}</div>
                      </div>

                      {msg.actionCard.status === 'confirmed' ? (
                        <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold p-1.5 bg-emerald-50 rounded-lg">
                          <CheckCircle2 className="w-4 h-4" />
                          Pagamento Confirmado!
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleConfirmActionCard(msg.id)}
                            className="flex-1 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors shadow-xs"
                          >
                            ✅ Confirmar Pagamento
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="text-[10px] text-slate-400 text-right">{msg.timestamp}</div>
                </div>
              )}
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-white p-3 rounded-2xl border border-slate-200 text-xs text-slate-400 animate-pulse flex items-center gap-1">
              <span>Finance Copilot a analisar contexto...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Action Chips */}
      <div className="p-3 bg-white border-t border-slate-100 space-y-2">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ações Rápidas Copilot</div>
        <div className="flex flex-wrap gap-1.5">
          {quickActions.map((qa, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(qa.prompt)}
              className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 text-[11px] font-medium transition-colors border border-slate-200/60"
            >
              {qa.label}
            </button>
          ))}
        </div>
      </div>

      {/* Input Footer */}
      <div className="p-3 bg-white border-t border-slate-200">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Pergunte ou solicite uma ação..."
            className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs bg-slate-50"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="p-2.5 rounded-xl bg-black hover:bg-neutral-800 disabled:opacity-40 text-white transition-colors border border-neutral-800 cursor-pointer"
          >
            <Send className="w-4 h-4 text-emerald-400" />
          </button>
        </form>
      </div>

    </aside>
  );
};
