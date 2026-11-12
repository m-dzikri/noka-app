"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  FINANCE_UPDATED_EVENT,
  WORKSPACE_UPDATED_EVENT,
  readJsonSafe,
  type WorkspaceUpdatedDetail,
} from "@/components/finance/finance-client-helpers";
import { AppShell, type AppShellUser } from "@/components/layout/AppShell";
import { QuickCaptureBar } from "@/components/quick-capture/QuickCaptureBar";
import type { CategoryDto } from "@/features/finance/categories-service";
import type { WalletWithBalanceDto } from "@/features/finance/wallets-service";
import { apiFetch } from "@/lib/http-client";

export interface WorkspaceChromeProps {
  user: AppShellUser;
  initialWallets: WalletWithBalanceDto[];
  initialCategories: CategoryDto[];
  privacyBlurSlot?: ReactNode;
  syncStatusSlot?: ReactNode;
  logoutSlot?: ReactNode;
  children: ReactNode;
}

/**
 * Authenticated shell chrome uniting `AppShell` and `QuickCaptureBar` with live
 * wallet/category synchronization across workspaces (`RFC-008`, `AC-8.2`).
 */
export function WorkspaceChrome({
  user,
  initialWallets,
  initialCategories,
  privacyBlurSlot,
  syncStatusSlot,
  logoutSlot,
  children,
}: WorkspaceChromeProps) {
  const quickCaptureInputRef = useRef<HTMLTextAreaElement>(null);
  const [liveWallets, setLiveWallets] = useState<WalletWithBalanceDto[] | null>(
    null,
  );
  const [liveCategories, setLiveCategories] = useState<CategoryDto[] | null>(
    null,
  );

  const wallets = liveWallets ?? initialWallets;
  const categories = liveCategories ?? initialCategories;

  const refreshContexts = useCallback(async () => {
    try {
      const [walletsRes, categoriesRes] = await Promise.all([
        apiFetch("/api/wallets"),
        apiFetch("/api/categories"),
      ]);

      if (walletsRes.ok) {
        const walletsPayload = await readJsonSafe<{
          ok?: boolean;
          data?: { wallets?: WalletWithBalanceDto[] };
        }>(walletsRes);
        if (walletsPayload?.ok && walletsPayload.data?.wallets) {
          setLiveWallets(walletsPayload.data.wallets);
        }
      }

      if (categoriesRes.ok) {
        const categoriesPayload = await readJsonSafe<{
          ok?: boolean;
          data?: { categories?: CategoryDto[] };
        }>(categoriesRes);
        if (categoriesPayload?.ok && categoriesPayload.data?.categories) {
          setLiveCategories(categoriesPayload.data.categories);
        }
      }
    } catch {
      // Keep current cached Quick Capture context gracefully when offline.
    }
  }, []);

  useEffect(() => {
    const onFinanceUpdated = () => {
      void refreshContexts();
    };
    const onWorkspaceUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<WorkspaceUpdatedDetail | undefined>;
      if (
        customEvent.detail?.kind === "transaction" &&
        customEvent.detail?.source !== "quick-capture"
      ) {
        void refreshContexts();
      }
    };

    window.addEventListener(FINANCE_UPDATED_EVENT, onFinanceUpdated);
    window.addEventListener(WORKSPACE_UPDATED_EVENT, onWorkspaceUpdated);
    return () => {
      window.removeEventListener(FINANCE_UPDATED_EVENT, onFinanceUpdated);
      window.removeEventListener(WORKSPACE_UPDATED_EVENT, onWorkspaceUpdated);
    };
  }, [refreshContexts]);

  const handleMobileQuickAction = useCallback(() => {
    const input = quickCaptureInputRef.current;
    if (!input) {
      return;
    }
    input.focus();
    input.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  return (
    <AppShell
      user={user}
      privacyBlurSlot={privacyBlurSlot}
      syncStatusSlot={syncStatusSlot}
      logoutSlot={logoutSlot}
      onMobileQuickAction={handleMobileQuickAction}
      quickCaptureSlot={
        <QuickCaptureBar
          wallets={wallets}
          categories={categories}
          onRefreshContexts={refreshContexts}
          inputRef={quickCaptureInputRef}
        />
      }
    >
      {children}
    </AppShell>
  );
}
