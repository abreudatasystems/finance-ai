import { describe, it, expect, vi, beforeEach } from 'vitest';

type Mod = typeof import('@/components/approvals/DocumentViewer');

async function load(apiUrl: string): Promise<Mod> {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_API_URL', apiUrl);
  return import('@/components/approvals/DocumentViewer');
}

interface FakeTab {
  location: { href: string };
  close: ReturnType<typeof vi.fn>;
}

let tab: FakeTab;
let openMock: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  tab = { location: { href: '' }, close: vi.fn() };
  openMock = vi.fn(() => tab);
  vi.spyOn(window, 'open').mockImplementation(openMock as unknown as typeof window.open);
  fetchMock = vi.fn().mockResolvedValue(new Response(new Blob(['%PDF-1.4']), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  URL.createObjectURL = vi.fn(() => 'blob:http://localhost/abc');
  URL.revokeObjectURL = vi.fn();
  localStorage.setItem('finance_ai_token', 'tok');
});

describe('openDocument', () => {
  it('opens an external URL directly, without fetch', async () => {
    const { openDocument } = await load('http://127.0.0.1:8000/api/v1');
    await expect(openDocument('https://cdn.example.com/f.pdf')).resolves.toBe(true);
    expect(openMock).toHaveBeenCalledWith('https://cdn.example.com/f.pdf', '_blank', 'noopener,noreferrer');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches an absolute API URL with the token and shows the blob', async () => {
    const { openDocument } = await load('http://127.0.0.1:8000/api/v1');
    await expect(openDocument('http://127.0.0.1:8000/api/v1/documents/7/file?v=2')).resolves.toBe(true);
    // The tab opens before the await so the popup blocker lets it through.
    expect(openMock).toHaveBeenCalledWith('', '_blank');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8000/api/v1/documents/7/file?v=2');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(tab.location.href).toBe('blob:http://localhost/abc');
  });

  it('treats a path relative to the API as an API file', async () => {
    const { openDocument } = await load('http://127.0.0.1:8000/api/v1');
    await openDocument('/documents/7/file');
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:8000/api/v1/documents/7/file');
  });

  it('works with a relative API_BASE (production behind the proxy)', async () => {
    const { openDocument } = await load('/api/v1');
    await openDocument('/api/v1/documents/3/file');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/documents/3/file');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
  });

  it('opens a URL on another origin directly even with a relative API_BASE', async () => {
    const { openDocument } = await load('/api/v1');
    await openDocument('https://other.example.com/api/v1/documents/3/file');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(openMock).toHaveBeenCalledWith(
      'https://other.example.com/api/v1/documents/3/file',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('falls back to window.open(blob) when the tab was blocked', async () => {
    openMock.mockReturnValueOnce(null);
    const { openDocument } = await load('http://127.0.0.1:8000/api/v1');
    await expect(openDocument('/documents/1/file')).resolves.toBe(true);
    expect(openMock).toHaveBeenLastCalledWith('blob:http://localhost/abc', '_blank');
  });

  it('closes the tab and returns false when the download fails', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 404 }));
    const { openDocument } = await load('http://127.0.0.1:8000/api/v1');
    await expect(openDocument('/documents/1/file')).resolves.toBe(false);
    expect(tab.close).toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('returns false on a network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'));
    const { openDocument } = await load('http://127.0.0.1:8000/api/v1');
    await expect(openDocument('/documents/1/file')).resolves.toBe(false);
    expect(tab.close).toHaveBeenCalled();
  });
});
