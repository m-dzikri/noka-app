"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { runClientLogoutCleanup } from "@/features/auth/client-cleanup";
import { wipeAllOfflineData } from "@/features/sync/cleanup";
import { useI18n } from "@/lib/i18n/context";

/**
 * Header logout button that revokes server session, wipes private client storage, and redirects to /login (OFFLINE-5).
 */
export function LogoutButton() {
  const router = useRouter();
  const { t } = useI18n();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (loggingOut) {
      return;
    }
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      }).catch(() => undefined);
    } finally {
      await runClientLogoutCleanup();
      await wipeAllOfflineData();
      router.push("/login");
      if (typeof window !== "undefined" && typeof window.location?.assign === "function") {
        try {
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Full document navigation ensures complete teardown of React tree & private in-memory state on logout
          window.location.assign("/login");
        } catch {
          // jsdom throws "Not implemented: navigation to another Document"
        }
      }
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="md"
      shape="pill"
      disabled={loggingOut}
      onClick={handleLogout}
      aria-label={t.auth.logoutButton}
      className="w-full justify-between gap-2 border border-[var(--border-default)] md:w-auto md:justify-center md:border-transparent"
    >
      <LogOut className="h-4 w-4" aria-hidden="true" />
      <span>{loggingOut ? t.auth.loggingOutButton : t.auth.logoutButton}</span>
    </Button>
  );
}

