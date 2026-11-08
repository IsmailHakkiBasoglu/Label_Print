export type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void };

/** Browser storage can be blocked or full; callers treat every failure as "nothing stored". */
export function safeRead(storage: StorageLike, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function safeWrite(storage: StorageLike, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // The app keeps working from memory.
  }
}

export function browserStorage(): StorageLike {
  return {
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
  };
}
