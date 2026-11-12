import {
  closeAllOfflineDbs,
  deleteUserOfflineDb,
  suppressOfflineDbs,
  OFFLINE_DB_PREFIX,
} from "@/features/sync/db";
import { registerClientLogoutCleanup } from "@/features/auth/client-cleanup";

export const PRIVATE_CACHE_PREFIX = "noka-private-";
export const OFFLINE_WIPED_EVENT = "noka:offline-wiped";

async function postClearCacheToSwWorker(worker: ServiceWorker): Promise<void> {
  await new Promise<void>((resolve) => {
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      resolve();
    };

    const timer = setTimeout(done, 800);
    try {
      if (typeof MessageChannel !== "undefined") {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => {
          clearTimeout(timer);
          done();
        };
        worker.postMessage({ type: "CLEAR_PRIVATE_CACHE" }, [channel.port2]);
      } else {
        worker.postMessage({ type: "CLEAR_PRIVATE_CACHE" });
        clearTimeout(timer);
        done();
      }
    } catch {
      clearTimeout(timer);
      done();
    }
  });
}

async function clearServiceWorkerPrivateCaches(): Promise<void> {
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    try {
      const controller = navigator.serviceWorker?.controller;
      if (controller) {
        await postClearCacheToSwWorker(controller);
      } else if (typeof navigator.serviceWorker?.getRegistration === "function") {
        const reg = await navigator.serviceWorker.getRegistration();
        const active = reg?.active;
        if (active) {
          await postClearCacheToSwWorker(active);
        }
      }
    } catch {
      // Fall back cleanly to direct CacheStorage deletion below.
    }
  }

  if (typeof globalThis !== "undefined" && "caches" in globalThis && globalThis.caches) {
    try {
      const cacheKeys = await globalThis.caches.keys();
      await Promise.allSettled(
        cacheKeys
          .filter((key) => key.startsWith(PRIVATE_CACHE_PREFIX))
          .map((key) => globalThis.caches.delete(key)),
      );
    } catch {
      // Ignore CacheStorage restrictions in private browser contexts.
    }
  }
}

async function clearAllOfflineIndexedDbs(userId?: string): Promise<void> {
  suppressOfflineDbs(true);
  await closeAllOfflineDbs();

  if (typeof globalThis === "undefined" || !("indexedDB" in globalThis)) {
    return;
  }

  const dbNames = new Set<string>();
  if (userId) {
    dbNames.add(`${OFFLINE_DB_PREFIX}${userId}`);
  }

  const factory = globalThis.indexedDB;
  if (factory && typeof factory.databases === "function") {
    try {
      const dbs = await factory.databases();
      for (const info of dbs) {
        if (info.name && info.name.startsWith(OFFLINE_DB_PREFIX)) {
          dbNames.add(info.name);
        }
      }
    } catch {
      // Ignore if indexedDB.databases() is restricted.
    }
  }

  await Promise.allSettled(
    Array.from(dbNames).map(async (name) => {
      const id = name.startsWith(OFFLINE_DB_PREFIX)
        ? name.slice(OFFLINE_DB_PREFIX.length)
        : name;
      await deleteUserOfflineDb(id);
    }),
  );
}

let activeWipePromise: Promise<void> | null = null;

/**
 * Completely wipes all `noka-offline-*` IndexedDB mirrors/outboxes and all `noka-private-*`
 * Service Worker / CacheStorage entries while leaving `noka-shell-*` and UI preferences untouched (OFFLINE-5, DEC-16, HIGH-4).
 */
export async function wipeAllOfflineData(userId?: string): Promise<void> {
  if (activeWipePromise) {
    return activeWipePromise;
  }

  activeWipePromise = (async () => {
    await Promise.allSettled([
      clearAllOfflineIndexedDbs(userId),
      clearServiceWorkerPrivateCaches(),
    ]);

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(OFFLINE_WIPED_EVENT));
    }
  })().finally(() => {
    activeWipePromise = null;
  });

  return activeWipePromise;
}

/**
 * Registers logout/401-UNAUTHORIZED cleanup callback for an active authenticated session.
 */
export function registerOfflineLogoutCleanup(userId: string): () => void {
  return registerClientLogoutCleanup(() => wipeAllOfflineData(userId));
}

