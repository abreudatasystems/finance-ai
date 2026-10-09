'use client';

/**
 * `useLoad` — ler dados de uma API num componente cliente.
 *
 * Substitui o padrão que havia em vários componentes:
 *
 *     const load = useCallback(async () => { setLoading(true); …; setData(x); setLoading(false) }, [deps]);
 *     useEffect(() => { load(); }, [load]);
 *
 * que escrevia estado de forma síncrona dentro do efeito (regra
 * `react-hooks/set-state-in-effect`). Aqui:
 *
 *  • o efeito só arranca o pedido; o estado só muda na resposta (num callback
 *    da promessa), nunca no corpo do efeito;
 *  • quando as dependências mudam, `loading` volta a `true` durante o render
 *    (o padrão do React para "ajustar estado quando uma prop muda"), não num
 *    efeito;
 *  • respostas antigas (dependências que entretanto mudaram, ou componente
 *    desmontado) são ignoradas;
 *  • `reload()` volta a pedir — para "Tentar novamente" e depois de gravar — e
 *    devolve uma promessa que resolve quando essa leitura termina; `refresh()`
 *    faz o mesmo sem pôr `loading` a `true` (os dados actuais ficam à vista).
 */

import { useCallback, useEffect, useEffectEvent, useRef, useState, type DependencyList } from 'react';

export interface UseLoadOptions<T> {
  /** Valor de `data` antes da primeira resposta (por omissão `undefined`). */
  initialData?: T;
  /**
   * `false` não pede nada (e `loading` fica como está). Útil quando falta um
   * parâmetro obrigatório. Por omissão `true`.
   */
  enabled?: boolean;
  /** Chamado com cada resposta bem-sucedida e actual (não com as ignoradas). */
  onSuccess?: (data: T) => void;
}

export interface UseLoadResult<T> {
  data: T;
  /** `true` desde o primeiro render até à primeira resposta, e durante cada nova leitura. */
  loading: boolean;
  /** O erro da última leitura (a promessa rejeitou), ou `null`. */
  error: unknown;
  /**
   * Volta a ler, com `loading` a `true` até chegar a resposta. A promessa
   * resolve quando esta leitura (ou uma posterior) termina.
   */
  reload: () => Promise<void>;
  /** Como `reload`, mas em silêncio: `loading` não muda e os dados actuais ficam à vista. */
  refresh: () => Promise<void>;
  /** Altera os dados localmente (p. ex. depois de uma acção), sem voltar a ler. */
  setData: (next: T | ((prev: T) => T)) => void;
}

interface LoadState<T> {
  data: T;
  loading: boolean;
  error: unknown;
}

function sameDeps(a: DependencyList, b: DependencyList): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}

export function useLoad<T>(
  fetcher: () => Promise<T>,
  deps: DependencyList,
  opts: UseLoadOptions<T> & { initialData: T },
): UseLoadResult<T>;
export function useLoad<T>(
  fetcher: () => Promise<T>,
  deps: DependencyList,
  opts?: UseLoadOptions<T>,
): UseLoadResult<T | undefined>;
export function useLoad<T>(
  fetcher: () => Promise<T>,
  deps: DependencyList,
  opts: UseLoadOptions<T> = {},
): UseLoadResult<T | undefined> {
  const enabled = opts.enabled ?? true;

  const [state, setState] = useState<LoadState<T | undefined>>(() => ({
    data: opts.initialData,
    loading: true,
    error: null,
  }));

  // Cada leitura tem um número; o efeito corre quando ele muda.
  const [generation, setGeneration] = useState(0);

  // Dependências mudaram → nova leitura. Feito durante o render (e não num
  // efeito), como o React recomenda para estado que depende de props:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevDeps, setPrevDeps] = useState<DependencyList>(deps);
  const [prevEnabled, setPrevEnabled] = useState(enabled);
  if (!sameDeps(prevDeps, deps) || prevEnabled !== enabled) {
    setPrevDeps(deps);
    setPrevEnabled(enabled);
    setGeneration((g) => g + 1);
    if (enabled) setState((s) => (s.loading ? s : { ...s, loading: true }));
  }

  // Quem chamou reload() e espera pelo fim da leitura.
  const waiters = useRef<Array<() => void>>([]);

  // Sempre a versão mais recente do fetcher / onSuccess, sem os pôr nas
  // dependências do efeito.
  const fetchLatest = useEffectEvent(() => fetcher());
  const notifySuccess = useEffectEvent((data: T) => opts.onSuccess?.(data));

  useEffect(() => {
    const settle = () => {
      const done = waiters.current;
      waiters.current = [];
      done.forEach((resolve) => resolve());
    };
    // Desligado: não há leitura, e quem chamou reload() não fica à espera.
    if (!enabled) { settle(); return; }
    let active = true;
    // `new Promise` também apanha um fetcher que lance de forma síncrona.
    new Promise<T>((resolve) => resolve(fetchLatest())).then(
      (data) => {
        if (!active) return;
        setState({ data, loading: false, error: null });
        notifySuccess(data);
        settle();
      },
      (error: unknown) => {
        if (!active) return;
        setState((s) => ({ ...s, loading: false, error }));
        settle();
      },
    );
    return () => { active = false; };
  }, [generation, enabled]);

  // Desmontado: ninguém fica à espera para sempre.
  useEffect(() => () => {
    const done = waiters.current;
    waiters.current = [];
    done.forEach((resolve) => resolve());
  }, []);

  const start = useCallback((silent: boolean) => {
    const promise = new Promise<void>((resolve) => { waiters.current.push(resolve); });
    if (!silent) setState((s) => (s.loading ? s : { ...s, loading: true }));
    setGeneration((g) => g + 1);
    return promise;
  }, []);
  const reload = useCallback(() => start(false), [start]);
  const refresh = useCallback(() => start(true), [start]);

  const setData = useCallback((next: T | undefined | ((prev: T | undefined) => T | undefined)) => {
    setState((s) => ({
      ...s,
      data: typeof next === 'function'
        ? (next as (prev: T | undefined) => T | undefined)(s.data)
        : next,
    }));
  }, []);

  return { data: state.data, loading: state.loading, error: state.error, reload, refresh, setData };
}
