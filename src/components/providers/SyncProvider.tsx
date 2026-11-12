"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, X } from "lucide-react";
import type { AuthUser } from "@/features/auth/session";
import { detectOfflineCapabilities } from "@/features/sync/capabilities";
import {
  OFFLINE_WIPED_EVENT,
  registerOfflineLogoutCleanup,
} from "@/features/sync/cleanup";
import {
  patchUserProfileMeta,
  readFullMirror,
  suppressOfflineDbs,
  type MirrorDataState,
} from "@/features/sync/db";
import {
  discardOutboxMutation,
  flushOutbox,
  summarizeOutboxState,
} from "@/features/sync/engine";
import type {
  OutboxItemRecord,
  SyncEngineStatus,
} from "@/features/sync/types";
import { useI18n } from "@/lib/i18n/context";

export const SYNC_MIRROR_UPDATED_EVENT = "noka:sync-mirror-updated";

export interface SyncContextValue {
  userId: string;
  userProfile: AuthUser;
  status: SyncEngineStatus;
  isOnline: boolean;
  storageAvailable: boolean;
  swAvailable: boolean;
  pendingCount: number;
  failedItems: OutboxItemRecord[];
  lastSyncedAt: string | null;
  mirror: MirrorDataState | null;
  mirrorVersion: number;
  syncNow: () => Promise<void>;
  discardFailedMutation: (mutationId: string) => Promise<void>;
  reloadMirror: () => Promise<MirrorDataState | null>;
  updateUserMeta: (patch: Partial<AuthUser>) => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export interface SyncProviderProps {
  user: AuthUser;
  children: ReactNode;
}

/**
 * Provides PWA Service Worker registration, private-mode capability fallback,
 * IndexedDB offline mirror hydration, iOS-safe multi-trigger outbox flush, and
 * full offline cleanup on logout or 401 (`RFC-009`, `OFFLINE-1`–`OFFLINE-5`).
 */
export function SyncProvider({ user, children }: SyncProviderProps) {
  const { t } = useI18n();
  // Keep initial state identical to SSR so React hydration never drops DOM attribute updates on offline boot.
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [status, setStatus] = useState<SyncEngineStatus>("synced");
  const [storageAvailable, setStorageAvailable] = useState<boolean>(true);
  const [swAvailable, setSwAvailable] = useState<boolean>(true);
  const [bannerDismissed, setBannerDismissed] = useState<boolean>(false);
  const [mirror, setMirror] = useState<MirrorDataState | null>(null);
  const [mirrorVersion, setMirrorVersion] = useState<number>(0);
  const [userProfile, setUserProfile] = useState<AuthUser>(user);

  const storageAvailableRef = useRef<boolean>(true);
  const unmountedRef = useRef<boolean>(false);

  const applyMirrorState = useCallback(
    (nextMirror: MirrorDataState | null, emitEvent = true) => {
      if (unmountedRef.current) return;
      setMirror(nextMirror);
      if (nextMirror?.userProfile) {
        setUserProfile(nextMirror.userProfile);
      }
      setMirrorVersion((prev) => prev + 1);
      if (emitEvent && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(SYNC_MIRROR_UPDATED_EVENT));
      }
    },
    [],
  );

  const handleUnauthorized = useCallback(() => {
    if (typeof window !== "undefined") {
      const loginUrl = new URL("/login", window.location.origin).toString();
      window.location.assign(loginUrl);
    }
  }, []);

  const reloadMirror = useCallback(async (): Promise<MirrorDataState | null> => {
    if (!storageAvailableRef.current) {
      return null;
    }
    try {
      const loaded = await readFullMirror(user.id);
      applyMirrorState(loaded);
      return loaded;
    } catch {
      return null;
    }
  }, [applyMirrorState, user.id]);

  const syncNow = useCallback(async () => {
    if (!storageAvailableRef.current) {
      const onlineNow =
        typeof navigator === "undefined" || navigator.onLine !== false;
      if (!unmountedRef.current) {
        setIsOnline(onlineNow);
        setStatus(onlineNow ? "synced" : "offline");
      }
      return;
    }

    try {
      const result = await flushOutbox(user.id, {
        onUnauthorized: handleUnauthorized,
        onStatusChange: (nextStatus) => {
          if (!unmountedRef.current) {
            setStatus(nextStatus);
          }
        },
      });

      if (!unmountedRef.current) {
        setStatus(result.status);
        if (result.mirror) {
          applyMirrorState(result.mirror);
        }
      }
    } catch {
      // Graceful fallback during logout suppression or connection teardown.
    }
  }, [applyMirrorState, handleUnauthorized, user.id]);

  const discardFailedMutation = useCallback(
    async (mutationId: string) => {
      if (!storageAvailableRef.current) {
        return;
      }
      const result = await discardOutboxMutation(user.id, mutationId, {
        onUnauthorized: handleUnauthorized,
        onStatusChange: (nextStatus) => {
          if (!unmountedRef.current) {
            setStatus(nextStatus);
          }
        },
      });
      if (!unmountedRef.current) {
        setStatus(result.status);
        if (result.mirror) {
          applyMirrorState(result.mirror);
        } else {
          await reloadMirror();
        }
      }
    },
    [applyMirrorState, handleUnauthorized, reloadMirror, user.id],
  );

  const updateUserMeta = useCallback(
    async (patch: Partial<AuthUser>) => {
      setUserProfile((prev) => ({ ...prev, ...patch, id: prev.id }));
      if (!storageAvailableRef.current) {
        return;
      }
      try {
        const updated = await patchUserProfileMeta(user.id, patch);
        if (updated && !unmountedRef.current) {
          setUserProfile(updated);
          setMirror((prev) =>
            prev ? { ...prev, userProfile: updated } : prev,
          );
        }
      } catch {
        // Non-fatal in private/restricted storage mode.
      }
    },
    [user.id],
  );

  useEffect(() => {
    unmountedRef.current = false;
    suppressOfflineDbs(false);
    const unregisterCleanup = registerOfflineLogoutCleanup(user.id);

    const onOfflineWiped = () => {
      if (!unmountedRef.current) {
        setMirror(null);
      }
    };
    window.addEventListener(OFFLINE_WIPED_EVENT, onOfflineWiped);

    let cancelled = false;
    const bootstrap = async () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setIsOnline(false);
        setStatus("offline");
      }

      const caps = await detectOfflineCapabilities();
      if (cancelled || unmountedRef.current) return;

      storageAvailableRef.current = caps.indexedDbAvailable;
      setStorageAvailable(caps.indexedDbAvailable);

      let resolvedSw = caps.serviceWorkerAvailable;
      setSwAvailable(resolvedSw);
      if (caps.serviceWorkerAvailable) {
        void navigator.serviceWorker.register("/sw.js").catch(() => {
          if (!cancelled && !unmountedRef.current) {
            resolvedSw = false;
            setSwAvailable(false);
          }
        });
      }

      if (!caps.indexedDbAvailable) {
        const onlineNow =
          typeof navigator === "undefined" || navigator.onLine !== false;
        setStatus(onlineNow ? "synced" : "offline");
        return;
      }

      // Hydrate UI immediately from existing mirror before hitting network.
      try {
        const initialMirror = await readFullMirror(user.id);
        if (!cancelled && !unmountedRef.current) {
          setMirror(initialMirror);
          setMirrorVersion((v) => v + 1);
        }
      } catch {
        storageAvailableRef.current = false;
        setStorageAvailable(false);
        return;
      }

      // Trigger #1: App open when online.
      if (typeof navigator === "undefined" || navigator.onLine !== false) {
        await syncNow();
      } else {
        setIsOnline(false);
        setStatus("offline");
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
      unmountedRef.current = true;
      window.removeEventListener(OFFLINE_WIPED_EVENT, onOfflineWiped);
      unregisterCleanup();
    };
  }, [syncNow, user.id]);

  // Triggers #2 & #3: iOS-safe network/visibility/focus triggers (zero Background Sync API).
  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      void syncNow();
    };

    const onOffline = () => {
      setIsOnline(false);
      setStatus("offline");
    };

    const onVisibilityOrFocus = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return;
      }
      setIsOnline(true);
      void syncNow();
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibilityOrFocus);
    window.addEventListener("focus", onVisibilityOrFocus);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
      window.removeEventListener("focus", onVisibilityOrFocus);
    };
  }, [syncNow]);

  const { pendingCount, failedItems } = useMemo(
    () => summarizeOutboxState(mirror?.outbox ?? []),
    [mirror?.outbox],
  );

  const showRestrictedBanner =
    (!storageAvailable || !swAvailable) && !bannerDismissed;

  const value = useMemo<SyncContextValue>(
    () => ({
      userId: user.id,
      userProfile,
      status,
      isOnline,
      storageAvailable,
      swAvailable,
      pendingCount,
      failedItems,
      lastSyncedAt: mirror?.lastSyncedAt ?? null,
      mirror,
      mirrorVersion,
      syncNow,
      discardFailedMutation,
      reloadMirror,
      updateUserMeta,
    }),
    [
      user.id,
      userProfile,
      status,
      isOnline,
      storageAvailable,
      swAvailable,
      pendingCount,
      failedItems,
      mirror,
      mirrorVersion,
      syncNow,
      discardFailedMutation,
      reloadMirror,
      updateUserMeta,
    ],
  );

  return (
    <SyncContext.Provider value={value}>
      {showRestrictedBanner ? (
        <div
          role="status"
          data-testid="offline-capability-banner"
          className="border-b border-[var(--border-default)] bg-[var(--status-warning)]/12 px-4 py-2 text-xs text-[var(--text-primary)]"
        >
          <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle
                className="h-4 w-4 shrink-0 text-[var(--status-warning)]"
                aria-hidden="true"
              />
              <span>
                <strong className="font-semibold">
                  {t.sync.privateModeBannerTitle}:
                </strong>{" "}
                {t.sync.privateModeBannerBody}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setBannerDismissed(true)}
              aria-label={t.sync.dismissBannerButton}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
      {children}
    </SyncContext.Provider>
  );
}

/**
 * Strict consumer hook requiring an ancestor `<SyncProvider>`.
 */
export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) {
    throw new Error("useSync must be used inside SyncProvider");
  }
  return ctx;
}

/**
 * Optional consumer hook allowing components to degrade cleanly inside isolated unit tests
 * rendered outside `<SyncProvider>`.
 */
export function useOptionalSync(): SyncContextValue | null {
  return useContext(SyncContext);
}
