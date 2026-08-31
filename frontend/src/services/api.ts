// Centralised API client: base URL, token storage and authenticated fetch.
// The app stays "demo-first" — when the backend is unreachable or the user is
// not authenticated, callers fall back to the bundled mock data.

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api/v1';

const TOKEN_KEY = 'finance_ai_token';

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
  } catch {
    /* noop */
  }
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

function authHeaders(extra: HeadersInit = {}): HeadersInit {
  const token = getToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
      return { ok: true };
    }
    const detail = await res.json().catch(() => ({}));
    return { ok: false, error: detail.detail || 'Não foi possível criar a conta' };
  } catch {
    return { ok: false, error: 'network' };
  }
}
