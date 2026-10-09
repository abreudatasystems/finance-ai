import { describe, it, expect, vi, beforeEach } from 'vitest';

type Api = typeof import('@/services/api');

/** api.ts reads NEXT_PUBLIC_API_URL once, at import time. */
async function loadApi(apiUrl?: string): Promise<Api> {
  vi.resetModules();
  if (apiUrl === undefined) vi.stubEnv('NEXT_PUBLIC_API_URL', '');
  else vi.stubEnv('NEXT_PUBLIC_API_URL', apiUrl);
  return import('@/services/api');
}

/** window.location cannot be spied on in jsdom (its members are unforgeable),
 *  so the tests swap `window` for a stand-in that shares the real storage. */
function stubLocation(pathname: string) {
  const assign = vi.fn();
  vi.stubGlobal('window', {
    localStorage: globalThis.localStorage,
    location: { pathname, origin: 'http://localhost:3000', assign },
  });
  return assign;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('API_BASE', () => {
  it('defaults to the local dev backend', async () => {
    const api = await loadApi();
    expect(api.API_BASE).toBe('http://127.0.0.1:8000/api/v1');
  });

  it('keeps an absolute URL and strips trailing slashes', async () => {
    const api = await loadApi('https://api.example.pt/api/v1///');
    expect(api.API_BASE).toBe('https://api.example.pt/api/v1');
  });

  it('keeps a relative base (same origin behind the proxy)', async () => {
    const api = await loadApi('/api/v1/');
    expect(api.API_BASE).toBe('/api/v1');
  });

  it('is the prefix used by apiFetch', async () => {
    const api = await loadApi('/api/v1');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
    await api.apiFetch('/suppliers');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/suppliers');
  });
});

describe('token and company storage', () => {
  let api: Api;
  beforeEach(async () => {
    api = await loadApi();
  });

  it('stores, reads and clears the token', () => {
    expect(api.getToken()).toBeNull();
    expect(api.isAuthenticated()).toBe(false);
    api.setToken('abc');
    expect(api.getToken()).toBe('abc');
    expect(api.isAuthenticated()).toBe(true);
    api.clearToken();
    expect(api.getToken()).toBeNull();
    expect(api.isAuthenticated()).toBe(false);
  });

  it('clearToken also forgets the active company', () => {
    api.setToken('abc');
    api.setActiveCompany('c-1');
    api.clearToken();
    expect(api.getActiveCompany()).toBeNull();
  });

  it('stores and clears the active company on its own', () => {
    api.setToken('abc');
    api.setActiveCompany('c-2');
    expect(api.getActiveCompany()).toBe('c-2');
    api.clearActiveCompany();
    expect(api.getActiveCompany()).toBeNull();
    expect(api.getToken()).toBe('abc');
  });

  it('survives storage that throws (private mode)', () => {
    const boom = () => {
      throw new Error('denied');
    };
    vi.stubGlobal('window', {
      localStorage: { getItem: boom, setItem: boom, removeItem: boom },
      location: { pathname: '/', assign: vi.fn() },
    });
    expect(() => api.setToken('x')).not.toThrow();
    expect(api.getToken()).toBeNull();
    expect(() => api.clearToken()).not.toThrow();
    expect(() => api.setActiveCompany('c')).not.toThrow();
    expect(api.getActiveCompany()).toBeNull();
  });
});

describe('apiFetch', () => {
  let api: Api;
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    api = await loadApi('http://127.0.0.1:8000/api/v1');
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
  });

  it('sends Authorization and X-Company-Id when known', async () => {
    api.setToken('tok-1');
    api.setActiveCompany('comp-9');
    await api.apiFetch('/dashboard', { method: 'GET', headers: { 'Content-Type': 'application/json' } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8000/api/v1/dashboard');
    expect(init.method).toBe('GET');
    expect(init.headers).toEqual({
      Authorization: 'Bearer tok-1',
      'X-Company-Id': 'comp-9',
      'Content-Type': 'application/json',
    });
  });

  it('sends no auth headers without a session', async () => {
    await api.apiFetch('/auth/login');
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers).not.toHaveProperty('Authorization');
    expect(headers).not.toHaveProperty('X-Company-Id');
  });

  it('on 401 with a session clears it and redirects to /login', async () => {
    const assign = stubLocation('/dashboard');
    api.setToken('expired');
    api.setActiveCompany('c-1');
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'expired' }, 401));
    const res = await api.apiFetch('/dashboard');
    expect(res.status).toBe(401);
    expect(assign).toHaveBeenCalledWith('/login');
    expect(api.getToken()).toBeNull();
    expect(api.getActiveCompany()).toBeNull();
  });

  it('on 401 without a session (wrong password) does not redirect', async () => {
    const assign = stubLocation('/dashboard');
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'bad' }, 401));
    await api.apiFetch('/auth/login');
    expect(assign).not.toHaveBeenCalled();
  });

  it.each(['/login', '/register', '/invite/abc'])('does not redirect from the public page %s', async (path) => {
    const assign = stubLocation(path);
    api.setToken('expired');
    fetchMock.mockResolvedValue(jsonResponse({}, 401));
    await api.apiFetch('/auth/me');
    expect(assign).not.toHaveBeenCalled();
    expect(api.getToken()).toBe('expired');
  });

  it('does not redirect on other errors', async () => {
    const assign = stubLocation('/dashboard');
    api.setToken('ok');
    fetchMock.mockResolvedValue(jsonResponse({}, 403));
    await api.apiFetch('/x');
    expect(assign).not.toHaveBeenCalled();
    expect(api.getToken()).toBe('ok');
  });
});

describe('helpers built on apiFetch', () => {
  let api: Api;
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    api = await loadApi();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('apiGet returns the JSON, or null on error / network failure', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ a: 1 }));
    expect(await api.apiGet('/a')).toEqual({ a: 1 });
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));
    expect(await api.apiGet('/a')).toBeNull();
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    expect(await api.apiGet('/a')).toBeNull();
  });

  it('apiError reads a string detail, a 422 list, or falls back', async () => {
    expect(await api.apiError(jsonResponse({}))).toBeNull();
    expect(await api.apiError(jsonResponse({ detail: 'NIF duplicado' }, 400))).toBe('NIF duplicado');
    expect(
      await api.apiError(
        jsonResponse({ detail: [{ loc: ['body', 'nif'], msg: 'invalid' }, { msg: 'other' }] }, 422),
      ),
    ).toBe('Dados inválidos — nif: invalid; other');
    expect(await api.apiError(new Response('not json', { status: 500 }))).toBe('Ocorreu um erro.');
  });

  it('apiPostOrError sends JSON and surfaces the error message', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1 }));
    expect(await api.apiPostOrError('/s', { name: 'X' })).toEqual({ data: { id: 1 } });
    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"name":"X"}');
    expect(init.headers['Content-Type']).toBe('application/json');

    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'Já existe' }, 409));
    expect(await api.apiPostOrError('/s', {})).toEqual({ error: 'Já existe' });

    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    expect(await api.apiPostOrError('/s', {})).toEqual({ error: 'Não foi possível contactar o servidor.' });
  });

  it('login stores the token and drops a stale company', async () => {
    api.setActiveCompany('someone-elses');
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 'new-token' }));
    expect(await api.login('a@b.pt', 'pw')).toEqual({ ok: true });
    expect(api.getToken()).toBe('new-token');
    expect(api.getActiveCompany()).toBeNull();
  });

  it('login reports the API error and network failures', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'Credenciais erradas' }, 401));
    expect(await api.login('a@b.pt', 'x')).toEqual({ ok: false, error: 'Credenciais erradas' });
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    expect(await api.login('a@b.pt', 'x')).toEqual({ ok: false, error: 'network' });
  });

  it('register posts the expected body and stores the token', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 't' }));
    expect(await api.register('Ana', 'ACME Lda', 'ana@acme.pt', 'pw-long-enough')).toEqual({ ok: true });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      name: 'Ana',
      company_name: 'ACME Lda',
      email: 'ana@acme.pt',
      password: 'pw-long-enough',
    });
    expect(api.getToken()).toBe('t');
  });
});
