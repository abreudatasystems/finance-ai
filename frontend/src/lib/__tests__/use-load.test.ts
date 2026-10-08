import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useLoad } from '../use-load';

/** A promise the test resolves or rejects by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('useLoad', () => {
  it('starts loading, then exposes the data', async () => {
    const fetcher = vi.fn().mockResolvedValue([1, 2, 3]);
    const { result } = renderHook(() => useLoad(fetcher, []));

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeUndefined();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([1, 2, 3]);
    expect(result.current.error).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('uses initialData before the first response', () => {
    const { result } = renderHook(() =>
      useLoad(() => new Promise<number[]>(() => {}), [], { initialData: [] as number[] }),
    );
    expect(result.current.data).toEqual([]);
    expect(result.current.loading).toBe(true);
  });

  it('records a rejected fetch as an error and stops loading', async () => {
    const boom = new Error('boom');
    const { result } = renderHook(() => useLoad(() => Promise.reject(boom), []));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(boom);
    expect(result.current.data).toBeUndefined();
  });

  it('refetches when deps change and ignores the stale response', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const fetcher = vi.fn((key: string) => (key === 'a' ? first.promise : second.promise));

    const { result, rerender } = renderHook(({ k }) => useLoad(() => fetcher(k), [k]), {
      initialProps: { k: 'a' },
    });
    rerender({ k: 'b' });
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith('b'));

    // The newer request answers first; the older one arrives late.
    await act(async () => { second.resolve('B'); });
    expect(result.current.data).toBe('B');
    expect(result.current.loading).toBe(false);

    await act(async () => { first.resolve('A'); });
    expect(result.current.data).toBe('B');
  });

  it('turns loading back on during render when deps change', async () => {
    const { result, rerender } = renderHook(({ k }) => useLoad(async () => k, [k]), {
      initialProps: { k: 1 },
    });
    await waitFor(() => expect(result.current.data).toBe(1));
    rerender({ k: 2 });
    // No effect has run yet for the new deps, and loading is already true.
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBe(1);
    await waitFor(() => expect(result.current.data).toBe(2));
    expect(result.current.loading).toBe(false);
  });

  it('reload() fetches again, shows loading and resolves when done', async () => {
    let n = 0;
    const fetcher = vi.fn(async () => ++n);
    const { result } = renderHook(() => useLoad(fetcher, []));
    await waitFor(() => expect(result.current.data).toBe(1));

    let reloaded: Promise<void>;
    act(() => { reloaded = result.current.reload(); });
    expect(result.current.loading).toBe(true);
    await act(async () => { await reloaded; });
    expect(result.current.data).toBe(2);
    expect(result.current.loading).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('reload() recovers from an error ("Tentar novamente")', async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('ok');
    const { result } = renderHook(() => useLoad(fetcher, []));
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));

    let retried: Promise<void>;
    act(() => { retried = result.current.reload(); });
    await act(async () => { await retried; });
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBe('ok');
  });

  it('refresh() fetches again without turning loading on', async () => {
    let n = 0;
    const gate = deferred<void>();
    const fetcher = vi.fn(async () => { if (n > 0) await gate.promise; return ++n; });
    const { result } = renderHook(() => useLoad(fetcher, []));
    await waitFor(() => expect(result.current.data).toBe(1));

    let refreshed: Promise<void>;
    act(() => { refreshed = result.current.refresh(); });
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBe(1);
    await act(async () => { gate.resolve(); await refreshed; });
    expect(result.current.data).toBe(2);
  });

  it('calls onSuccess with fresh data only', async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useLoad(async () => 'x', [], { onSuccess }));
    await waitFor(() => expect(result.current.data).toBe('x'));
    expect(onSuccess).toHaveBeenCalledWith('x');
  });

  it('ignores a response that arrives after unmount', async () => {
    const pending = deferred<string>();
    const onSuccess = vi.fn();
    const { result, unmount } = renderHook(() => useLoad(() => pending.promise, [], { onSuccess }));
    const before = result.current;
    unmount();
    await act(async () => { pending.resolve('late'); });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(before.data).toBeUndefined();
  });

  it('does not fetch while disabled, and fetches once enabled', async () => {
    const fetcher = vi.fn(async () => 'data');
    const { result, rerender } = renderHook(({ on }) => useLoad(fetcher, [], { enabled: on }), {
      initialProps: { on: false },
    });
    await act(async () => {});
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(true);

    rerender({ on: true });
    await waitFor(() => expect(result.current.data).toBe('data'));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('setData changes the data locally without refetching', async () => {
    const fetcher = vi.fn(async () => [1]);
    const { result } = renderHook(() => useLoad(fetcher, [], { initialData: [] as number[] }));
    await waitFor(() => expect(result.current.data).toEqual([1]));
    act(() => result.current.setData((prev) => [...prev, 2]));
    expect(result.current.data).toEqual([1, 2]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
