import type { OfflineCapabilities } from "@/features/sync/types";

const PROBE_DB_NAME = "__noka_capability_probe__";

/**
 * Probes whether IndexedDB is permitted and writable (e.g. rejects Firefox/Safari Private Mode blocks).
 */
export async function probeIndexedDbAvailability(): Promise<{
  available: boolean;
  reason?: string;
}> {
  if (typeof globalThis === "undefined" || !("indexedDB" in globalThis)) {
    return { available: false, reason: "IndexedDB unavailable" };
  }

  const idbFactory = globalThis.indexedDB;
  if (!idbFactory || typeof idbFactory.open !== "function") {
    return { available: false, reason: "IndexedDB factory missing" };
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (available: boolean, reason?: string) => {
      if (settled) return;
      settled = true;
      resolve({ available, reason });
    };

    try {
      const request = idbFactory.open(PROBE_DB_NAME, 1);

      request.onupgradeneeded = () => {
        try {
          const db = request.result;
          if (!db.objectStoreNames.contains("probe")) {
            db.createObjectStore("probe");
          }
        } catch (err) {
          finish(false, err instanceof Error ? err.message : "Upgrade blocked");
        }
      };

      request.onsuccess = () => {
        try {
          request.result.close();
          if (typeof idbFactory.deleteDatabase === "function") {
            const delReq = idbFactory.deleteDatabase(PROBE_DB_NAME);
            delReq.onsuccess = () => finish(true);
            delReq.onerror = () => finish(true);
            delReq.onblocked = () => finish(true);
          } else {
            finish(true);
          }
        } catch (err) {
          finish(false, err instanceof Error ? err.message : "Close failed");
        }
      };

      request.onerror = () => {
        const message = request.error?.message || "IndexedDB blocked";
        finish(false, message);
      };

      request.onblocked = () => {
        finish(false, "IndexedDB probe blocked");
      };
    } catch (error) {
      finish(
        false,
        error instanceof Error ? error.message : "IndexedDB open threw",
      );
    }
  });
}

/**
 * Checks whether Service Worker API is supported and accessible in the current browsing context.
 */
export function probeServiceWorkerAvailability(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  try {
    return (
      "serviceWorker" in navigator &&
      navigator.serviceWorker !== null &&
      typeof navigator.serviceWorker.register === "function"
    );
  } catch {
    return false;
  }
}

/**
 * Tests both IndexedDB and Service Worker availability so restricted private modes
 * fall back cleanly to online-only mode with a non-blocking banner (OFFLINE-1).
 */
export async function detectOfflineCapabilities(): Promise<OfflineCapabilities> {
  const swAvailable = probeServiceWorkerAvailability();
  const idbResult = await probeIndexedDbAvailability();

  return {
    indexedDbAvailable: idbResult.available,
    serviceWorkerAvailable: swAvailable,
    storageBlockedReason: !idbResult.available
      ? idbResult.reason
      : !swAvailable
        ? "Service Worker unsupported or restricted"
        : undefined,
  };
}

