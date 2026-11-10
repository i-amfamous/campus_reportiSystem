import '@testing-library/jest-dom';

/*
 * Node 25 exposes a global `localStorage` / `sessionStorage` stub (backed by
 * `--localstorage-file`) that has no `getItem`/`setItem`/`clear` methods and
 * shadows jsdom's implementation. Components and tests expect the Web Storage
 * API, so install a small in-memory implementation when the built-in one is
 * unusable.
 */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

if (typeof window !== 'undefined') {
  for (const key of ['localStorage', 'sessionStorage'] as const) {
    if (typeof window[key]?.getItem !== 'function') {
      const storage = new MemoryStorage();
      Object.defineProperty(window, key, { configurable: true, value: storage });
      Object.defineProperty(globalThis, key, { configurable: true, value: storage });
    }
  }
}
