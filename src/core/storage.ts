export type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void };

/** Browser storage can be blocked or full; callers treat every failure as "nothing stored". */
export function safeRead(storage: StorageLike, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** Returns false when nothing was stored; the app keeps working from memory. */
export function safeWrite(storage: StorageLike, key: string, value: string): boolean {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function browserStorage(): StorageLike {
  return {
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
  };
}
