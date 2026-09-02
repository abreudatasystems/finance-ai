// Centralised API client: base URL, token storage and authenticated fetch.
// The app stays "demo-first" — when the backend is unreachable or the user is
// not authenticated, callers fall back to the bundled mock data.

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api/v1';

const TOKEN_KEY = 'finance_ai_token';
const COMPANY_KEY = 'finance_ai_company';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage unavailable — session stays in-memory only */
  }
}

export function clearToken(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(COMPANY_KEY);
  } catch {
    /* noop */
  }
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

/* ------------------------------------------------------------------ tenant */
/* The active company travels in a header on every request. The backend only
 * accepts it after checking the membership, so a login with several companies
 * gets several isolated data sets and never a mixture of them.            */

export function getActiveCompany(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(COMPANY_KEY);
  } catch {
    return null;
  }
}

export function setActiveCompany(companyId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(COMPANY_KEY, companyId);
  } catch {
    /* storage unavailable — the backend falls back to the first company */
  }
}

export function clearActiveCompany(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(COMPANY_KEY);
  } catch {
    /* noop */
  }
}

function authHeaders(extra: HeadersInit = {}): HeadersInit {
  const token = getToken();
  const company = getActiveCompany();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(company ? { 'X-Company-Id': company } : {}),
    ...extra,
  };
}

/** Authenticated fetch against the API. `path` is relative to API_BASE. */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = authHeaders(options.headers as HeadersInit);
  return fetch(`${API_BASE}${path}`, { ...options, headers });
}

/** Convenience JSON GET. Returns null on any non-2xx or network error. */
export async function apiGet<T>(path: string): Promise<T | null> {
  try {
    const res = await apiFetch(path);
    if (res.ok) return (await res.json()) as T;
  } catch {
    /* fall through */
  }
  return null;
}

/** The API's error message for a failed call, or null when it succeeded. */
export async function apiError(res: Response): Promise<string | null> {
  if (res.ok) return null;
  try {
    const data = await res.json();
    return typeof data.detail === 'string' ? data.detail : 'Ocorreu um erro.';
  } catch {
    return 'Ocorreu um erro.';
  }
}

/** POST that surfaces the API's message instead of swallowing it. */
export async function apiPostOrError<T>(
  path: string,
  body: unknown,
): Promise<{ data?: T; error?: string }> {
  try {
    const res = await apiFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return { data: (await res.json()) as T };
    return { error: (await apiError(res)) || 'Ocorreu um erro.' };
  } catch {
    return { error: 'Não foi possível contactar o servidor.' };
  }
}

/** PATCH that surfaces the API's message instead of swallowing it. */
export async function apiPatchOrError<T>(
  path: string,
  body: unknown,
): Promise<{ data?: T; error?: string }> {
  try {
    const res = await apiFetch(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return { data: (await res.json()) as T };
    return { error: (await apiError(res)) || 'Ocorreu um erro.' };
  } catch {
    return { error: 'Não foi possível contactar o servidor.' };
  }
}

/** DELETE that surfaces the API's message instead of swallowing it. */
export async function apiDeleteOrError<T>(path: string): Promise<{ data?: T; error?: string }> {
  try {
    const res = await apiFetch(path, { method: 'DELETE' });
    if (res.ok) return { data: (await res.json()) as T };
    return { error: (await apiError(res)) || 'Ocorreu um erro.' };
  } catch {
    return { error: 'Não foi possível contactar o servidor.' };
  }
}

/** Convenience JSON POST. */
export async function apiPost<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const res = await apiFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return (await res.json()) as T;
  } catch {
    /* fall through */
  }
  return null;
}

/** Convenience JSON PATCH. */
export async function apiPatch<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const res = await apiFetch(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return (await res.json()) as T;
  } catch {
    /* fall through */
  }
  return null;
}

/** Convenience DELETE. */
export async function apiDelete<T>(path: string): Promise<T | null> {
  try {
    const res = await apiFetch(path, {
      method: 'DELETE',
    });
    if (res.ok) return (await res.json()) as T;
  } catch {
    /* fall through */
  }
  return null;
}


export interface AuthResult {
  ok: boolean;
  error?: string;
}

export async function login(email: string, password: string): Promise<AuthResult> {
  try {
    const res = await apiFetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      const data = await res.json();
      setToken(data.access_token);
      // A company remembered from whoever used this browser before is not this
      // user's; drop it so the backend picks their own first company.
      clearActiveCompany();
      return { ok: true };
    }
    const detail = await res.json().catch(() => ({}));
    return { ok: false, error: detail.detail || 'Credenciais inválidas' };
  } catch {
    return { ok: false, error: 'network' };
  }
}

export async function register(
  name: string,
  companyName: string,
  email: string,
  password: string,
): Promise<AuthResult> {
  try {
    const res = await apiFetch('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, company_name: companyName, email, password }),
    });
    if (res.ok) {
      const data = await res.json();
      setToken(data.access_token);
      clearActiveCompany();
      return { ok: true };
    }
    const detail = await res.json().catch(() => ({}));
    return { ok: false, error: detail.detail || 'Não foi possível criar a conta' };
  } catch {
    return { ok: false, error: 'network' };
  }
}


/** Change your own password, proving you know the current one. */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<AuthResult> {
  try {
    const res = await apiFetch('/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
    if (res.ok) return { ok: true };
    const detail = await res.json().catch(() => ({}));
    return { ok: false, error: detail.detail || 'Não foi possível alterar a palavra-passe.' };
  } catch {
    return { ok: false, error: 'Não foi possível contactar o servidor.' };
  }
}
