import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CategoryBudgetSection } from "@/components/finance/CategoryBudgetSection";
import { BudgetManagerModal } from "@/components/finance/BudgetManagerModal";
import {
  calculateBudgetMetrics,
  shiftPeriodMonth,
  type CategoryBudgetDto,
  type CategoryBudgetSummaryDto,
} from "@/features/finance/budgets-schemas";
import type { CategoryDto } from "@/features/finance/categories-service";
import type { MirrorDataState } from "@/features/sync/db";
import { computeLocalCategoryBudgets } from "@/features/sync/local-queries";
import { PreferencesProvider } from "@/components/providers/PreferencesProvider";
import { PrivacyProvider } from "@/components/providers/PrivacyProvider";

function renderWithI18n(ui: React.ReactElement, locale: "id" | "en" = "id") {
  return render(
    <PreferencesProvider initialLocale={locale} initialTheme="light">
      <PrivacyProvider>{ui}</PrivacyProvider>
    </PreferencesProvider>,
  );
}

function createMockSummary(items: Partial<CategoryBudgetDto>[] = []): CategoryBudgetSummaryDto {
  const defaultItems: CategoryBudgetDto[] = items.map((item, idx) => ({
    id: item.id ?? `budget-${idx + 1}`,
    categoryId: item.categoryId ?? `cat-${idx + 1}`,
    categoryName: item.categoryName ?? `Kategori ${idx + 1}`,
    amount: item.amount ?? 1_000_000,
    periodMonth: item.periodMonth ?? "2026-11",
    spentAmount: item.spentAmount ?? 500_000,
    remainingAmount: item.remainingAmount ?? 500_000,
    percentage: item.percentage ?? 50,
    status: item.status ?? "normal",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  }));

  const totalBudgeted = defaultItems.reduce((acc, curr) => acc + curr.amount, 0);
  const totalSpent = defaultItems.reduce((acc, curr) => acc + curr.spentAmount, 0);

  return {
    period: "2026-11",
    cycle: {
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      startUtcIso: "2026-10-31T17:00:00.000Z",
      endExclusiveUtcIso: "2026-11-30T17:00:00.000Z",
      remainingDays: 15,
      cycleStartDay: "1",
    },
    totalBudgeted,
    totalSpent,
    items: defaultItems,
  };
}

describe("TS-012-01: Category Budgets Calculation, Status Thresholds & UI Progress (Unit)", () => {
  describe("Budget metrics & threshold logic (F20, DATA-1)", () => {
    it("calculates normal status when spending is strictly below 80%", () => {
      // 500.000 / 1.000.000 = 50%
      const metrics = calculateBudgetMetrics(500_000, 1_000_000);
      expect(metrics.percentage).toBe(50);
      expect(metrics.remainingAmount).toBe(500_000);
      expect(metrics.status).toBe("normal");

      // 799.000 / 1.000.000 = 79% (floor)
      const nearThreshold = calculateBudgetMetrics(799_000, 1_000_000);
      expect(nearThreshold.percentage).toBe(79);
      expect(nearThreshold.remainingAmount).toBe(201_000);
      expect(nearThreshold.status).toBe("normal");
    });

    it("triggers warning status when spending reaches or exceeds 80% but under 100%", () => {
      // Exact 80%
      const exact80 = calculateBudgetMetrics(800_000, 1_000_000);
      expect(exact80.percentage).toBe(80);
      expect(exact80.remainingAmount).toBe(200_000);
      expect(exact80.status).toBe("warning");

      // 99%
      const near100 = calculateBudgetMetrics(995_000, 1_000_000);
      expect(near100.percentage).toBe(99);
      expect(near100.remainingAmount).toBe(5_000);
      expect(near100.status).toBe("warning");
    });

    it("triggers exceeded status and negative remaining when spending reaches or passes 100%", () => {
      // Exact 100%
      const exact100 = calculateBudgetMetrics(1_000_000, 1_000_000);
      expect(exact100.percentage).toBe(100);
      expect(exact100.remainingAmount).toBe(0);
      expect(exact100.status).toBe("exceeded");

      // Overbudget: 1.250.000 / 1.000.000 = 125%
      const overbudget = calculateBudgetMetrics(1_250_000, 1_000_000);
      expect(overbudget.percentage).toBe(125);
      expect(overbudget.remainingAmount).toBe(-250_000);
      expect(overbudget.status).toBe("exceeded");
    });

    it("handles zero budget or non-positive amount gracefully", () => {
      const zeroBudget = calculateBudgetMetrics(100_000, 0);
      expect(zeroBudget.percentage).toBe(0);
      expect(zeroBudget.remainingAmount).toBe(0);
      expect(zeroBudget.status).toBe("normal");
    });

    it("shifts period month correctly with boundary wrap and invalid fallback", () => {
      // Normal shift
      expect(shiftPeriodMonth("2026-11", 1)).toBe("2026-12");
      expect(shiftPeriodMonth("2026-11", -1)).toBe("2026-10");

      // Year boundary wrap forward: Dec -> Jan
      expect(shiftPeriodMonth("2026-12", 1)).toBe("2027-01");

      // Year boundary wrap backward: Jan -> Dec
      expect(shiftPeriodMonth("2026-01", -1)).toBe("2025-12");

      // Invalid input fallback
      expect(shiftPeriodMonth("invalid", 1)).toBe("invalid");
    });
  });

  describe("CategoryBudgetSection UI rendering (F20, UI-1, UI-3, I18N-1)", () => {
    it("renders empty state with CTA button when no budgets are defined", () => {
      const onManageMock = vi.fn();
      renderWithI18n(
        <CategoryBudgetSection
          summary={createMockSummary([])}
          onManageBudgets={onManageMock}
        />,
        "id",
      );

      expect(screen.getByText("Belum Ada Anggaran Kategori")).toBeDefined();
      const ctaBtn = screen.getByTestId("create-first-budget-cta");
      expect(ctaBtn).toBeDefined();

      fireEvent.click(ctaBtn);
      expect(onManageMock).toHaveBeenCalledTimes(1);
    });

    it("renders bilingual English labels when switching language", () => {
      const onManageMock = vi.fn();
      renderWithI18n(
        <CategoryBudgetSection
          summary={createMockSummary([])}
          onManageBudgets={onManageMock}
        />,
        "en",
      );

      expect(screen.getByText("No Category Budgets Yet")).toBeDefined();
      expect(screen.getByText("Set First Budget")).toBeDefined();
    });

    it("renders progress bars, status badges, and overbudget indicators accurately", () => {
      const onManageMock = vi.fn();
      const summary = createMockSummary([
        {
          categoryId: "cat-normal",
          categoryName: "Makan & Minum",
          amount: 2_000_000,
          spentAmount: 1_000_000,
          remainingAmount: 1_000_000,
          percentage: 50,
          status: "normal",
        },
        {
          categoryId: "cat-warning",
          categoryName: "Transportasi",
          amount: 1_000_000,
          spentAmount: 850_000,
          remainingAmount: 150_000,
          percentage: 85,
          status: "warning",
        },
        {
          categoryId: "cat-exceeded",
          categoryName: "Hiburan & Hobi",
          amount: 500_000,
          spentAmount: 650_000,
          remainingAmount: -150_000,
          percentage: 130,
          status: "exceeded",
        },
      ]);

      renderWithI18n(
        <CategoryBudgetSection
          summary={summary}
          onManageBudgets={onManageMock}
        />,
        "id",
      );

      // Section title & total progress
      expect(screen.getByText("Anggaran Kategori")).toBeDefined();
      expect(screen.getByText("Makan & Minum")).toBeDefined();
      expect(screen.getByText("Transportasi")).toBeDefined();
      expect(screen.getByText("Hiburan & Hobi")).toBeDefined();

      // Badges
      expect(screen.getByTestId("budget-status-normal")).toBeDefined();
      expect(screen.getByTestId("budget-status-warning")).toBeDefined();
      expect(screen.getByTestId("budget-status-exceeded")).toBeDefined();

      // Overbudget text
      expect(screen.getByText(/Melebihi Anggaran/)).toBeDefined();

      // Manage budgets button
      const manageBtn = screen.getByTestId("manage-budgets-button");
      fireEvent.click(manageBtn);
      expect(onManageMock).toHaveBeenCalledTimes(1);
    });

    it("renders historical cycle badge and reset button when viewing a historical month", () => {
      const onSelectPeriodMock = vi.fn();
      const summary = createMockSummary([
        {
          categoryId: "cat-1",
          categoryName: "Transport",
          amount: 500_000,
          spentAmount: 200_000,
        },
      ]);

      renderWithI18n(
        <CategoryBudgetSection
          summary={summary}
          onManageBudgets={vi.fn()}
          currentPeriod="2026-10"
          activeCyclePeriod="2026-11"
          onSelectPeriod={onSelectPeriodMock}
        />,
        "id",
      );

      expect(screen.getByTestId("historical-period-badge")).toBeDefined();
      expect(screen.getByText(/Melihat riwayat anggaran/)).toBeDefined();

      const resetBtn = screen.getByTestId("reset-current-period-budget-btn");
      expect(resetBtn).toBeDefined();
      fireEvent.click(resetBtn);
      expect(onSelectPeriodMock).toHaveBeenCalledWith("2026-11");
    });

    it("triggers onSelectPeriod with shifted period when clicking previous or next period buttons", () => {
      const onSelectPeriodMock = vi.fn();
      const summary = createMockSummary([
        {
          categoryId: "cat-1",
          categoryName: "Transport",
          amount: 500_000,
        },
      ]);

      renderWithI18n(
        <CategoryBudgetSection
          summary={summary}
          onManageBudgets={vi.fn()}
          currentPeriod="2026-11"
          activeCyclePeriod="2026-11"
          onSelectPeriod={onSelectPeriodMock}
        />,
        "id",
      );

      // Previous month button
      const prevBtn = screen.getByTestId("prev-period-budget-btn");
      fireEvent.click(prevBtn);
      expect(onSelectPeriodMock).toHaveBeenCalledWith("2026-10");

      // Next month button
      const nextBtn = screen.getByTestId("next-period-budget-btn");
      fireEvent.click(nextBtn);
      expect(onSelectPeriodMock).toHaveBeenCalledWith("2026-12");
    });
  });

  describe("computeLocalCategoryBudgets (Offline-First Mirror, OFFLINE-2)", () => {
    it("computes category budget metrics locally from IndexedDB mirror state", () => {
      const mockMirror: MirrorDataState = {
        userProfile: {
          id: "user-1",
          name: "User",
          email: "user@example.com",
          locale: "id",
          theme: "light",
          cycleStartDay: "1",
        },
        lastSyncedAt: null,
        notes: [],
        folders: [],
        tags: [],
        noteAttachments: [],
        wallets: [],
        categories: [
          {
            id: "cat-food",
            name: "Makanan",
            type: "expense",
            isSystem: true,
            systemKey: "food",
            createdAt: "2026-11-01T00:00:00.000Z",
            updatedAt: "2026-11-01T00:00:00.000Z",
          },
          {
            id: "cat-income",
            name: "Gaji",
            type: "income",
            isSystem: true,
            systemKey: "salary",
            createdAt: "2026-11-01T00:00:00.000Z",
            updatedAt: "2026-11-01T00:00:00.000Z",
          },
        ],
        categoryBudgets: [
          {
            id: "budget-food-1",
            categoryId: "cat-food",
            categoryName: "Makanan",
            amount: 1_000_000,
            periodMonth: "2026-11",
            spentAmount: 0,
            remainingAmount: 1_000_000,
            percentage: 0,
            status: "normal",
            createdAt: "2026-11-01T00:00:00.000Z",
            updatedAt: "2026-11-01T00:00:00.000Z",
          },
        ],
        transactions: [
          // Expense within cycle -> counted
          {
            id: "tx-1",
            walletId: "w-1",
            walletName: "Dompet",
            categoryId: "cat-food",
            categoryName: "Makanan",
            noteId: null,
            type: "expense",
            amount: 400_000,
            description: "Belanja mingguan",
            occurredAt: "2026-11-10T12:00:00.000Z",
            createdAt: "2026-11-10T12:00:00.000Z",
            updatedAt: "2026-11-10T12:00:00.000Z",
          },
          // Another expense within cycle -> counted
          {
            id: "tx-2",
            walletId: "w-1",
            walletName: "Dompet",
            categoryId: "cat-food",
            categoryName: "Makanan",
            noteId: null,
            type: "expense",
            amount: 450_000,
            description: "Makan malam",
            occurredAt: "2026-11-12T19:00:00.000Z",
            createdAt: "2026-11-12T19:00:00.000Z",
            updatedAt: "2026-11-12T19:00:00.000Z",
          },
          // Income transaction -> ignored by budget calculation
          {
            id: "tx-3",
            walletId: "w-1",
            walletName: "Dompet",
            categoryId: "cat-income",
            categoryName: "Gaji",
            noteId: null,
            type: "income",
            amount: 5_000_000,
            description: "Gajian",
            occurredAt: "2026-11-01T08:00:00.000Z",
            createdAt: "2026-11-01T08:00:00.000Z",
            updatedAt: "2026-11-01T08:00:00.000Z",
          },
          // Expense in another month -> ignored
          {
            id: "tx-4",
            walletId: "w-1",
            walletName: "Dompet",
            categoryId: "cat-food",
            categoryName: "Makanan",
            noteId: null,
            type: "expense",
            amount: 300_000,
            description: "Bulan lalu",
            occurredAt: "2026-10-15T12:00:00.000Z",
            createdAt: "2026-10-15T12:00:00.000Z",
            updatedAt: "2026-10-15T12:00:00.000Z",
          },
        ],
        transfers: [],
        outbox: [],
      };

      const computed = computeLocalCategoryBudgets(mockMirror, {
        period: "2026-11",
        nowDate: new Date("2026-11-15T12:00:00.000Z"),
        tzOffsetMinutes: 0,
      });

      expect(computed.period).toBe("2026-11");
      expect(computed.totalBudgeted).toBe(1_000_000);
      expect(computed.totalSpent).toBe(850_000); // 400.000 + 450.000

      expect(computed.items).toHaveLength(1);
      const foodBudget = computed.items[0];
      expect(foodBudget.categoryId).toBe("cat-food");
      expect(foodBudget.spentAmount).toBe(850_000);
      expect(foodBudget.remainingAmount).toBe(150_000);
      expect(foodBudget.percentage).toBe(85);
      expect(foodBudget.status).toBe("warning");
    });
  });

  describe("BudgetManagerModal 'Salin dari bulan lalu' CTA (Non-blocking improvement)", () => {
    it("copies budgets from previous month for categories that are not yet budgeted in current period", async () => {
      const onMutatedMock = vi.fn();
      const categories: CategoryDto[] = [
        {
          id: "cat-food",
          name: "Makanan",
          type: "expense",
          isSystem: true,
          systemKey: "food",
          createdAt: "2026-11-01T00:00:00.000Z",
          updatedAt: "2026-11-01T00:00:00.000Z",
        },
        {
          id: "cat-transport",
          name: "Transportasi",
          type: "expense",
          isSystem: false,
          systemKey: null,
          createdAt: "2026-11-01T00:00:00.000Z",
          updatedAt: "2026-11-01T00:00:00.000Z",
        },
      ];

      // Existing budgets in current period: only cat-food is already budgeted
      const currentBudgets: CategoryBudgetDto[] = [
        {
          id: "b-current-food",
          categoryId: "cat-food",
          categoryName: "Makanan",
          amount: 1_000_000,
          periodMonth: "2026-11",
          spentAmount: 100_000,
          remainingAmount: 900_000,
          percentage: 10,
          status: "normal",
          createdAt: "2026-11-01T00:00:00.000Z",
          updatedAt: "2026-11-01T00:00:00.000Z",
        },
      ];

      // Mock fetch: GET previous period returns cat-food and cat-transport
      const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (url) => {
        const urlStr = String(url);
        if (urlStr.includes("/api/finance/budgets?period=2026-10")) {
          return new Response(
            JSON.stringify({
              ok: true,
              data: {
                period: "2026-10",
                items: [
                  {
                    id: "b-prev-food",
                    categoryId: "cat-food",
                    categoryName: "Makanan",
                    amount: 1_000_000,
                    periodMonth: "2026-10",
                    spentAmount: 800_000,
                    remainingAmount: 200_000,
                    percentage: 80,
                    status: "warning",
                    createdAt: "2026-10-01T00:00:00.000Z",
                    updatedAt: "2026-10-01T00:00:00.000Z",
                  },
                  {
                    id: "b-prev-transport",
                    categoryId: "cat-transport",
                    categoryName: "Transportasi",
                    amount: 500_000,
                    periodMonth: "2026-10",
                    spentAmount: 300_000,
                    remainingAmount: 200_000,
                    percentage: 60,
                    status: "normal",
                    createdAt: "2026-10-01T00:00:00.000Z",
                    updatedAt: "2026-10-01T00:00:00.000Z",
                  },
                ],
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (urlStr.includes("/api/finance/budgets") && !urlStr.includes("?")) {
          return new Response(
            JSON.stringify({
              ok: true,
              data: {
                budget: {
                  id: "b-new-transport",
                  categoryId: "cat-transport",
                  categoryName: "Transportasi",
                  amount: 500_000,
                  periodMonth: "2026-11",
                  spentAmount: 0,
                  remainingAmount: 500_000,
                  percentage: 0,
                  status: "normal",
                  createdAt: "2026-11-01T00:00:00.000Z",
                  updatedAt: "2026-11-01T00:00:00.000Z",
                },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      });

      renderWithI18n(
        <BudgetManagerModal
          open={true}
          onClose={vi.fn()}
          categories={categories}
          budgets={currentBudgets}
          currentPeriod="2026-11"
          onMutated={onMutatedMock}
        />,
        "id",
      );

      const copyBtn = screen.getByTestId("copy-previous-month-button");
      expect(copyBtn).toBeDefined();
      fireEvent.click(copyBtn);

      const successBanner = await screen.findByTestId("copy-success-banner");
      expect(successBanner).toHaveTextContent("Berhasil menyalin 1 anggaran dari bulan lalu");
      expect(onMutatedMock).toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it("displays notice when no budgets were found in the previous month", async () => {
      const categories: CategoryDto[] = [
        {
          id: "cat-food",
          name: "Makanan",
          type: "expense",
          isSystem: true,
          systemKey: "food",
          createdAt: "2026-11-01T00:00:00.000Z",
          updatedAt: "2026-11-01T00:00:00.000Z",
        },
      ];

      const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async () => {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              period: "2026-10",
              items: [],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      renderWithI18n(
        <BudgetManagerModal
          open={true}
          onClose={vi.fn()}
          categories={categories}
          budgets={[]}
          currentPeriod="2026-11"
          onMutated={vi.fn()}
        />,
        "id",
      );

      fireEvent.click(screen.getByTestId("copy-previous-month-button"));
      expect(
        await screen.findByText("Tidak ada data anggaran pada bulan sebelumnya untuk disalin"),
      ).toBeDefined();

      fetchSpy.mockRestore();
    });
  });
});
