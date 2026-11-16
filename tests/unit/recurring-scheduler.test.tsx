import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { RecurringPendingBanner } from "@/components/finance/RecurringPendingBanner";
import { RecurringTemplateModal } from "@/components/finance/RecurringTemplateModal";
import { PreferencesProvider } from "@/components/providers/PreferencesProvider";
import { PrivacyProvider } from "@/components/providers/PrivacyProvider";
import type {
  PendingRecurringDto,
  RecurringTemplateDto,
} from "@/features/finance/recurring-schemas";
import {
  calculateInitialRunAt,
  calculateNextRunAt,
} from "@/features/finance/recurring-service";
import type { CategoryDto } from "@/features/finance/categories-service";
import type { WalletWithBalanceDto } from "@/features/finance/wallets-service";

function renderWithProviders(ui: React.ReactElement, locale: "id" | "en" = "id") {
  return render(
    <PreferencesProvider initialLocale={locale} initialTheme="light">
      <PrivacyProvider initialCookieBlurred={false}>{ui}</PrivacyProvider>
    </PreferencesProvider>,
  );
}

const sampleWallets: WalletWithBalanceDto[] = [
  {
    id: "w-cash",
    name: "Dompet Tunai",
    type: "cash",
    initialBalance: 100_000,
    currentBalance: 100_000,
    includeInSafeToSpend: true,
    isDefault: true,
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "w-bank",
    name: "Rekening BCA",
    type: "bank",
    initialBalance: 500_000,
    currentBalance: 500_000,
    includeInSafeToSpend: true,
    isDefault: false,
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

const sampleCategories: CategoryDto[] = [
  {
    id: "c-sub",
    name: "Langganan & Tagihan",
    type: "expense",
    isSystem: false,
    systemKey: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "c-salary",
    name: "Gaji & Upah",
    type: "income",
    isSystem: false,
    systemKey: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

const sampleTemplate: RecurringTemplateDto = {
  id: "t-1",
  userId: "u-1",
  walletId: "w-cash",
  walletName: "Dompet Tunai",
  categoryId: "c-sub",
  categoryName: "Langganan & Tagihan",
  type: "expense",
  amount: 150_000,
  description: "Spotify Premium",
  frequency: "monthly",
  intervalStep: 1,
  dayOfMonth: 25,
  dayOfWeek: null,
  startDate: "2026-01-01T00:00:00.000Z",
  endDate: null,
  autoApply: true,
  nextRunAt: "2026-02-25T00:00:00.000Z",
  lastRunAt: "2026-01-25T00:00:00.000Z",
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const samplePendingItem: PendingRecurringDto = {
  templateId: "t-1",
  description: "Spotify Premium",
  type: "expense",
  amount: 150_000,
  walletId: "w-cash",
  walletName: "Dompet Tunai",
  categoryId: "c-sub",
  categoryName: "Langganan & Tagihan",
  dueDate: "2026-02-25T00:00:00.000Z",
  frequency: "monthly",
};

describe("TS-013-01: Recurring Transactions Scheduler Unit Suite", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Scheduling Algorithm: calculateNextRunAt (Pure Unit)", () => {
    it("handles daily intervals (step = 1 and step = 3)", () => {
      const from = new Date("2026-03-01T10:00:00.000Z");
      const next1 = calculateNextRunAt(from, "daily", 1);
      expect(next1.toISOString()).toBe("2026-03-02T10:00:00.000Z");

      const next3 = calculateNextRunAt(from, "daily", 3);
      expect(next3.toISOString()).toBe("2026-03-04T10:00:00.000Z");
    });

    it("handles leap year day progression in daily frequency", () => {
      const feb28 = new Date("2024-02-28T12:00:00.000Z");
      const nextLeap = calculateNextRunAt(feb28, "daily", 1);
      expect(nextLeap.toISOString()).toBe("2024-02-29T12:00:00.000Z");

      const nextMar = calculateNextRunAt(nextLeap, "daily", 1);
      expect(nextMar.toISOString()).toBe("2024-03-01T12:00:00.000Z");
    });

    it("handles weekly intervals (step = 1 and step = 2)", () => {
      const from = new Date("2026-03-01T08:00:00.000Z");
      const nextWeek = calculateNextRunAt(from, "weekly", 1);
      expect(nextWeek.toISOString()).toBe("2026-03-08T08:00:00.000Z");

      const biWeekly = calculateNextRunAt(from, "weekly", 2);
      expect(biWeekly.toISOString()).toBe("2026-03-15T08:00:00.000Z");
    });

    it("handles normal monthly interval without clamping", () => {
      const jan15 = new Date("2026-01-15T00:00:00.000Z");
      const feb15 = calculateNextRunAt(jan15, "monthly", 1, 15);
      expect(feb15.getUTCFullYear()).toBe(2026);
      expect(feb15.getUTCMonth()).toBe(1); // February
      expect(feb15.getUTCDate()).toBe(15);
    });

    it("handles month-end clamping for day 31 across all months without permanent drift", () => {
      // Start Jan 31, 2026 (non-leap year)
      const jan31 = new Date("2026-01-31T00:00:00.000Z");

      // Jan 31 -> Feb clamps to Feb 28
      const febClamped = calculateNextRunAt(jan31, "monthly", 1, 31);
      expect(febClamped.getUTCFullYear()).toBe(2026);
      expect(febClamped.getUTCMonth()).toBe(1); // Feb
      expect(febClamped.getUTCDate()).toBe(28);

      // Feb 28 with targetDayOfMonth = 31 -> March unclamps to Mar 31! (No permanent drift to 28)
      const marRestored = calculateNextRunAt(febClamped, "monthly", 1, 31);
      expect(marRestored.getUTCFullYear()).toBe(2026);
      expect(marRestored.getUTCMonth()).toBe(2); // Mar
      expect(marRestored.getUTCDate()).toBe(31);

      // Mar 31 -> April clamps to Apr 30
      const aprClamped = calculateNextRunAt(marRestored, "monthly", 1, 31);
      expect(aprClamped.getUTCMonth()).toBe(3); // Apr
      expect(aprClamped.getUTCDate()).toBe(30);

      // Apr 30 -> May unclamps to May 31
      const mayRestored = calculateNextRunAt(aprClamped, "monthly", 1, 31);
      expect(mayRestored.getUTCMonth()).toBe(4); // May
      expect(mayRestored.getUTCDate()).toBe(31);

      // May 31 -> Jun 30
      const junClamped = calculateNextRunAt(mayRestored, "monthly", 1, 31);
      expect(junClamped.getUTCMonth()).toBe(5); // Jun
      expect(junClamped.getUTCDate()).toBe(30);

      // Jun 30 -> Jul 31
      const julRestored = calculateNextRunAt(junClamped, "monthly", 1, 31);
      expect(julRestored.getUTCMonth()).toBe(6); // Jul
      expect(julRestored.getUTCDate()).toBe(31);

      // Jul 31 -> Aug 31
      const aug31 = calculateNextRunAt(julRestored, "monthly", 1, 31);
      expect(aug31.getUTCMonth()).toBe(7); // Aug
      expect(aug31.getUTCDate()).toBe(31);

      // Aug 31 -> Sep 30
      const sep30 = calculateNextRunAt(aug31, "monthly", 1, 31);
      expect(sep30.getUTCMonth()).toBe(8); // Sep
      expect(sep30.getUTCDate()).toBe(30);

      // Sep 30 -> Oct 31
      const oct31 = calculateNextRunAt(sep30, "monthly", 1, 31);
      expect(oct31.getUTCMonth()).toBe(9); // Oct
      expect(oct31.getUTCDate()).toBe(31);

      // Oct 31 -> Nov 30
      const nov30 = calculateNextRunAt(oct31, "monthly", 1, 31);
      expect(nov30.getUTCMonth()).toBe(10); // Nov
      expect(nov30.getUTCDate()).toBe(30);

      // Nov 30 -> Dec 31
      const dec31 = calculateNextRunAt(nov30, "monthly", 1, 31);
      expect(dec31.getUTCMonth()).toBe(11); // Dec
      expect(dec31.getUTCDate()).toBe(31);
    });

    it("handles leap year February clamping for day 31 (Feb 29)", () => {
      const jan31Leap = new Date("2024-01-31T00:00:00.000Z");
      const febLeap = calculateNextRunAt(jan31Leap, "monthly", 1, 31);
      expect(febLeap.getUTCFullYear()).toBe(2024);
      expect(febLeap.getUTCMonth()).toBe(1); // Feb
      expect(febLeap.getUTCDate()).toBe(29);

      const marLeap = calculateNextRunAt(febLeap, "monthly", 1, 31);
      expect(marLeap.getUTCMonth()).toBe(2); // Mar
      expect(marLeap.getUTCDate()).toBe(31);
    });
  });

  describe("Scheduling Algorithm: calculateInitialRunAt", () => {
    it("aligns monthly initial run to requested dayOfMonth", () => {
      const startDate = new Date("2026-03-10T00:00:00.000Z");
      // Target is day 25 -> same month Mar 25
      const initial = calculateInitialRunAt(startDate, "monthly", 25, null);
      expect(initial.getUTCMonth()).toBe(2);
      expect(initial.getUTCDate()).toBe(25);

      // Target was day 5 (already passed in March) -> moves to Apr 5
      const nextMonthInitial = calculateInitialRunAt(startDate, "monthly", 5, null);
      expect(nextMonthInitial.getUTCMonth()).toBe(3);
      expect(nextMonthInitial.getUTCDate()).toBe(5);
    });

    it("aligns weekly initial run to requested dayOfWeek", () => {
      // 2026-03-01 is Sunday (dayOfWeek 0)
      const startDate = new Date("2026-03-01T00:00:00.000Z");
      // Target is Wednesday (dayOfWeek 3)
      const initialWed = calculateInitialRunAt(startDate, "weekly", null, 3);
      expect(initialWed.getUTCDay()).toBe(3);
      expect(initialWed.getUTCDate()).toBe(4);
    });
  });

  describe("UI Component: RecurringPendingBanner", () => {
    it("renders nothing when pendingItems is empty", () => {
      const { container } = renderWithProviders(
        <RecurringPendingBanner
          pendingItems={[]}
          wallets={sampleWallets}
          onItemsMutated={() => {}}
        />,
      );
      expect(container.firstChild).toBeNull();
    });

    it("renders banner with pending count and action buttons", () => {
      renderWithProviders(
        <RecurringPendingBanner
          pendingItems={[samplePendingItem]}
          wallets={sampleWallets}
          onItemsMutated={() => {}}
        />,
      );

      expect(screen.getByTestId("recurring-pending-banner")).toBeDefined();
      expect(screen.getByTestId("recurring-apply-all-button")).toBeDefined();
      expect(screen.getByTestId("recurring-review-button")).toBeDefined();
    });

    it("opens review modal and handles single item apply with custom amount/wallet override", async () => {
      const fetchMock = vi.fn(async () => {
        return new Response(JSON.stringify({ ok: true, data: { status: "applied" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });
      vi.stubGlobal("fetch", fetchMock);

      const mutatedMock = vi.fn();
      renderWithProviders(
        <RecurringPendingBanner
          pendingItems={[samplePendingItem]}
          wallets={sampleWallets}
          onItemsMutated={mutatedMock}
        />,
      );

      // Open review modal
      fireEvent.click(screen.getByTestId("recurring-review-button"));
      expect(screen.getByTestId("recurring-review-modal")).toBeDefined();

      // Override amount
      const amountInput = screen.getByTestId("custom-amount-t-1");
      fireEvent.change(amountInput, { target: { value: "175000" } });

      // Override wallet
      const walletSelect = screen.getByTestId("custom-wallet-t-1");
      fireEvent.change(walletSelect, { target: { value: "w-bank" } });

      // Click apply
      const applyBtn = screen.getByTestId("apply-item-t-1");
      fireEvent.click(applyBtn);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalled();
      });

      const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      const calledBody = JSON.parse(firstCall[1].body as string);
      expect(calledBody.templateId).toBe("t-1");
      expect(calledBody.action).toBe("apply");
      expect(calledBody.customAmount).toBe(175000);
      expect(calledBody.customWalletId).toBe("w-bank");
      expect(mutatedMock).toHaveBeenCalled();
    });

    it("handles single item skip in review modal", async () => {
      const fetchMock = vi.fn(async () => {
        return new Response(JSON.stringify({ ok: true, data: { status: "skipped" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });
      vi.stubGlobal("fetch", fetchMock);

      const mutatedMock = vi.fn();
      renderWithProviders(
        <RecurringPendingBanner
          pendingItems={[samplePendingItem]}
          wallets={sampleWallets}
          onItemsMutated={mutatedMock}
        />,
      );

      fireEvent.click(screen.getByTestId("recurring-review-button"));
      const skipBtn = screen.getByTestId("skip-item-t-1");
      fireEvent.click(skipBtn);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalled();
      });

      const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      const calledBody = JSON.parse(firstCall[1].body as string);
      expect(calledBody.templateId).toBe("t-1");
      expect(calledBody.action).toBe("skip");
      expect(mutatedMock).toHaveBeenCalled();
    });
  });

  describe("UI Component: RecurringTemplateModal", () => {
    it("renders modal with template list and toggle button", () => {
      renderWithProviders(
        <RecurringTemplateModal
          open={true}
          onClose={() => {}}
          templates={[sampleTemplate]}
          wallets={sampleWallets}
          categories={sampleCategories}
          onMutated={() => {}}
        />,
      );

      expect(screen.getByText("Spotify Premium")).toBeDefined();
      expect(screen.getByTestId("toggle-active-t-1")).toBeDefined();
    });

    it("handles toggle active/pause status", async () => {
      const fetchMock = vi.fn(async () => {
        return new Response(JSON.stringify({ ok: true, data: { template: { ...sampleTemplate, isActive: false } } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });
      vi.stubGlobal("fetch", fetchMock);

      const mutatedMock = vi.fn();
      renderWithProviders(
        <RecurringTemplateModal
          open={true}
          onClose={() => {}}
          templates={[sampleTemplate]}
          wallets={sampleWallets}
          categories={sampleCategories}
          onMutated={mutatedMock}
        />,
      );

      const toggleBtn = screen.getByTestId("toggle-active-t-1");
      fireEvent.click(toggleBtn);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalled();
      });

      const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(firstCall[0]).toContain("/api/finance/recurring/t-1");
      expect(mutatedMock).toHaveBeenCalled();
    });

    it("handles delete template with confirmation", async () => {
      const fetchMock = vi.fn(async () => {
        return new Response(JSON.stringify({ ok: true, data: { success: true } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });
      vi.stubGlobal("fetch", fetchMock);

      const mutatedMock = vi.fn();
      renderWithProviders(
        <RecurringTemplateModal
          open={true}
          onClose={() => {}}
          templates={[sampleTemplate]}
          wallets={sampleWallets}
          categories={sampleCategories}
          onMutated={mutatedMock}
        />,
      );

      // Click delete button
      const deleteBtn = screen.getByTestId("delete-template-t-1");
      fireEvent.click(deleteBtn);

      // Confirm delete in prompt modal
      const confirmDeleteBtn = screen.getByTestId("confirm-delete-template-btn");
      fireEvent.click(confirmDeleteBtn);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalled();
      });

      const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(firstCall[1]?.method).toBe("DELETE");
      expect(mutatedMock).toHaveBeenCalled();
    });
  });
});
