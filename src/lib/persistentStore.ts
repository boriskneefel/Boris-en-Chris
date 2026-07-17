import { useSyncExternalStore } from "react";

/**
 * A small reactive store backed by localStorage. Values hydrate synchronously
 * on first access (no loading flicker) and every subscribed component updates
 * when the value changes — including across browser tabs via the `storage`
 * event.
 */
export interface PersistentStore<T> {
  useValue: () => T;
  get: () => T;
  set: (next: T | ((prev: T) => T)) => void;
  reset: () => void;
}

export function createPersistentStore<T>(
  key: string,
  defaultValue: T,
): PersistentStore<T> {
  const listeners = new Set<() => void>();
  let cache: T | undefined;
  let hydrated = false;

  function read(): T {
    if (typeof window === "undefined") return defaultValue;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw == null) return defaultValue;
      return JSON.parse(raw) as T;
    } catch {
      return defaultValue;
    }
  }

  function ensure(): T {
    if (!hydrated) {
      cache = read();
      hydrated = true;
    }
    return cache as T;
  }

  function get(): T {
    return ensure();
  }

  function getServer(): T {
    return defaultValue;
  }

  function emit() {
    for (const l of listeners) l();
  }

  function set(next: T | ((prev: T) => T)) {
    const prev = ensure();
    const value =
      typeof next === "function" ? (next as (p: T) => T)(prev) : next;
    cache = value;
    hydrated = true;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* ignore quota */
      }
    }
    emit();
  }

  function reset() {
    set(defaultValue);
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) {
        cache = read();
        hydrated = true;
        emit();
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("storage", onStorage);
    }
    return () => {
      listeners.delete(listener);
      if (typeof window !== "undefined") {
        window.removeEventListener("storage", onStorage);
      }
    };
  }

  function useValue(): T {
    return useSyncExternalStore(subscribe, get, getServer);
  }

  return { useValue, get, set, reset };
}
