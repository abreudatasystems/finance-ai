// Avisa o servidor quando uma página rebenta no navegador, para os erros não
// ficarem só na consola de quem os viu. Nunca lança e nunca espera: se o envio
// falhar, paciência — a página de erro tem de aparecer na mesma.

import { API_BASE } from '@/services/api';

const MAX_STACK = 4000;
const DEDUPE_MS = 60_000;
const MAX_PER_PAGE = 10;

const recent = new Map<string, number>();
let sent = 0;

export function reportError(error: unknown, context?: string): void {
  try {
    if (typeof window === 'undefined') return;
    const err = error as (Error & { digest?: string }) | undefined;
    const message = String(err?.message ?? error ?? '').slice(0, 500);
    const digest = err?.digest ? String(err.digest).slice(0, 100) : undefined;

    // A mesma falha em rajada (re-renderizações, "tentar novamente") conta uma vez.
    const key = `${context ?? ''}|${digest ?? ''}|${message}`;
    const now = Date.now();
    const last = recent.get(key);
    if (last !== undefined && now - last < DEDUPE_MS) return;
    if (sent >= MAX_PER_PAGE) return;
    recent.set(key, now);
    sent += 1;

    const body = JSON.stringify({
      message,
      stack: typeof err?.stack === 'string' ? err.stack.slice(0, MAX_STACK) : undefined,
      // Só o caminho: a query string pode trazer filtros com dados.
      url: window.location.pathname,
      digest,
      userAgent: navigator.userAgent.slice(0, 300),
      context,
    });

    void fetch(`${API_BASE}/client-errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'omit',
    }).catch(() => {});
  } catch {
    // nunca deixar o relatório estragar a página de erro
  }
}
