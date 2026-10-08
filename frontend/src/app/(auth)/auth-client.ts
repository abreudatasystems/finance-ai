/**
 * Chamadas das páginas públicas de autenticação (login em dois passos,
 * recuperação de palavra-passe).
 *
 * Usam `fetch` direto em vez de `apiFetch`: nestas páginas ainda não há sessão,
 * e um 401 aqui é "código errado", não "sessão expirada".
 */

import { API_BASE, apiGet, clearActiveCompany, setToken } from '@/services/api';

export type LoginStep =
  | { kind: 'done' }
  | { kind: 'two_factor'; challenge: string }
  | { kind: 'error'; error: string };

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function detail(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}));
  return typeof data?.detail === 'string' ? data.detail : fallback;
}

const NETWORK = 'Não foi possível contactar o servidor. Tente de novo dentro de momentos.';

function startSession(token: string) {
  setToken(token);
  // Uma empresa lembrada de quem usou este navegador antes não é desta pessoa.
  clearActiveCompany();
}

export async function loginWithPassword(email: string, password: string): Promise<LoginStep> {
  try {
    const res = await post('/auth/login', { email, password });
    if (!res.ok) return { kind: 'error', error: await detail(res, 'Credenciais inválidas') };
    const data = await res.json();
    if (data?.two_factor_required && data.challenge_token) {
      return { kind: 'two_factor', challenge: String(data.challenge_token) };
    }
    if (!data?.access_token) return { kind: 'error', error: 'Resposta inesperada do servidor.' };
    startSession(data.access_token);
    return { kind: 'done' };
  } catch {
    return { kind: 'error', error: NETWORK };
  }
}

export async function loginWithCode(challenge: string, code: string): Promise<LoginStep> {
  try {
    const res = await post('/auth/login/2fa', { challenge_token: challenge, code });
    if (!res.ok) return { kind: 'error', error: await detail(res, 'Código inválido.') };
    const data = await res.json();
    startSession(data.access_token);
    return { kind: 'done' };
  } catch {
    return { kind: 'error', error: NETWORK };
  }
}

/** Para onde ir depois de entrar: a configuração da 2FA, se a empresa a exigir. */
export async function landingPath(): Promise<string> {
  const me = await apiGet<{ two_factor_setup_required?: boolean }>('/auth/me');
  return me?.two_factor_setup_required ? '/setup-2fa' : '/dashboard';
}

export async function requestPasswordReset(email: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await post('/auth/forgot-password', { email });
    if (!res.ok) return { ok: false, message: await detail(res, 'Não foi possível enviar o pedido.') };
    const data = await res.json().catch(() => ({}));
    return { ok: true, message: data?.message || 'Se existir uma conta com esse email, enviámos um link.' };
  } catch {
    return { ok: false, message: NETWORK };
  }
}

export async function resetPassword(token: string, newPassword: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await post('/auth/reset-password', { token, new_password: newPassword });
    if (!res.ok) return { ok: false, message: await detail(res, 'Não foi possível alterar a palavra-passe.') };
    const data = await res.json().catch(() => ({}));
    return { ok: true, message: data?.message || 'Palavra-passe alterada.' };
  } catch {
    return { ok: false, message: NETWORK };
  }
}
