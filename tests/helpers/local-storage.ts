/*
 * A tiny in-memory localStorage for jsdom tests. Node's own experimental
 * `localStorage` global shadows jsdom's in this Vitest setup (window.localStorage
 * is undefined), so the persisted-language tests install a real one.
 */
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

export function installLocalStorage(): Storage {
  const storage = new MemoryStorage();
  Object.defineProperty(window, "localStorage", { value: storage, configurable: true, writable: true });
  return storage;
}
