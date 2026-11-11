const PRESERVED_LOCAL_KEYS = new Set([
  "noka_theme",
  "noka_locale",
  "noka_privacy_blur",
]);

const PRIVATE_LOCAL_STORAGE_PREFIX = "noka_private_";

export type ClientLogoutCleanupHandler = () => Promise<void> | void;

const cleanupHandlers = new Set<ClientLogoutCleanupHandler>();

/**
 * Registers an async cleanup callback invoked during logout or 401 UNAUTHORIZED handling.
 */
export function registerClientLogoutCleanup(
  fn: ClientLogoutCleanupHandler,
): () => void {
  cleanupHandlers.add(fn);
  return () => {
    cleanupHandlers.delete(fn);
  };
}

/**
 * Clears private client storage while preserving non-sensitive UI preferences (OFFLINE-5, DEC-16).
 */
export async function runClientLogoutCleanup(): Promise<void> {
  if (typeof window !== "undefined") {
    try {
      const storage = window.localStorage;
      const keysToRemove: string[] = [];
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (
          key &&
          key.startsWith(PRIVATE_LOCAL_STORAGE_PREFIX) &&
          !PRESERVED_LOCAL_KEYS.has(key)
        ) {
          keysToRemove.push(key);
        }
      }
      for (const key of keysToRemove) {
        storage.removeItem(key);
      }
    } catch {
      // Ignore restricted browser storage access in private modes.
    }
  }

  const tasks = Array.from(cleanupHandlers).map((handler) =>
    Promise.resolve().then(() => handler()),
  );
  await Promise.allSettled(tasks);
}

