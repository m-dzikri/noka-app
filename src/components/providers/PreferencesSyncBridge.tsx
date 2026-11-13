"use client";

import { useEffect, useRef } from "react";
import { useOptionalSync } from "@/components/providers/SyncProvider";
import { usePreferences } from "@/lib/i18n/context";

/**
 * Bridges root PreferencesProvider clicks (ThemeToggle / LocaleToggle) to the account profile
 * API without infinite loops, RSC-to-client function prop passing, or nested providers (RFC-010, I18N-2).
 */
export function PreferencesSyncBridge() {
  const { registerPersistHandler } = usePreferences();
  const sync = useOptionalSync();
  const syncRef = useRef(sync);

  useEffect(() => {
    syncRef.current = sync;
  }, [sync]);

  useEffect(() => {
    const unregister = registerPersistHandler(async (patch) => {
      const currentSync = syncRef.current;
      // Best-effort skip if offline to ensure toggle UI remains instant offline
      if (
        (currentSync && !currentSync.isOnline) ||
        (typeof navigator !== "undefined" && navigator.onLine === false)
      ) {
        return;
      }

      try {
        const response = await fetch("/api/account/profile", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "same-origin",
          body: JSON.stringify(patch),
        });

        if (response.ok) {
          void currentSync?.updateUserMeta(patch);
        }
      } catch {
        // Best-effort network persistence: ignore transient network errors to keep UI toggles instant.
      }
    });

    return () => {
      // Cleanup ONLY unregisters the listener; it never triggers PATCH calls.
      unregister();
    };
  }, [registerPersistHandler]);

  return null;
}

