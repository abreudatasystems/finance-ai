import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Node 25+ ships its own (experimental) `localStorage` global, which is
// `undefined` unless node runs with --localstorage-file, and it shadows the one
// jsdom provides. Put jsdom's Storage back so the app code sees a real one.
const dom = (globalThis as { jsdom?: { window: Window } }).jsdom;
if (dom) {
  for (const key of ['localStorage', 'sessionStorage'] as const) {
    if (!globalThis[key]) {
      Object.defineProperty(globalThis, key, {
        value: dom.window[key],
        configurable: true,
        writable: true,
      });
    }
  }
}

// Captured now: some tests swap `window` for a stand-in.
const storage = globalThis.localStorage;

afterEach(() => {
  cleanup();
  storage.clear();
});
