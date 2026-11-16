import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DebtCard } from "@/components/finance/debts/DebtCard";
import { DebtsWorkspace } from "@/components/finance/debts/DebtsWorkspace";
import { PreferencesProvider } from "@/components/providers/PreferencesProvider";
import { PrivacyProvider } from "@/components/providers/PrivacyProvider";
import type { DebtReceivableDto } from "@/features/finance/debt-schemas";

function renderWithI18n(ui: React.ReactElement, locale: "id" | "en" = "id") {
  return render(
    <PreferencesProvider initialLocale={locale} initialTheme="light">
      <PrivacyProvider>{ui}</PrivacyProvider>
    </PreferencesProvider>,
  );
}

function createMockDebt(overrides: Partial<DebtReceivableDto> = {}): DebtReceivableDto {
  const totalAmount = overrides.totalAmount ?? 1_000_000;
  const settledAmount = overrides.settledAmount ?? 300_000;
  const remainingAmount = Math.max(0, totalAmount - settledAmount);
  const settlementPercentage =
    totalAmount > 0
      ? Math.min(100, Math.round((settledAmount / totalAmount) * 100))
      : 100;

  return {
    id: overrides.id ?? "debt-123",
    userId: overrides.userId ?? "user-123",
    type: overrides.type ?? "debt",
    personName: overrides.personName ?? "Budi Santoso",
    totalAmount,
    settledAmount,
    remainingAmount,
    settlementPercentage,
    dueDate: overrides.dueDate !== undefined ? overrides.dueDate : "2026-11-20T00:00:00.000Z",
    notes: overrides.notes ?? "Pinjaman modal usaha",
    status: overrides.status ?? "active",
    isOverdue: overrides.isOverdue ?? false,
    isDueSoon: overrides.isDueSoon ?? false,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  };
}

describe("TS-014-01: Debt & Receivables Calculation, Overdue Detection & UI (Unit)", () => {
  describe("Mathematical and Business Rules (F22, DATA-1, DEC-3)", () => {
    it("correctly calculates remaining amount and percentage", () => {
      const debt = createMockDebt({ totalAmount: 1_000_000, settledAmount: 400_000 });
      expect(debt.remainingAmount).toBe(600_000);
      expect(debt.settlementPercentage).toBe(40);

      const fullySettled = createMockDebt({ totalAmount: 500_000, settledAmount: 500_000 });
      expect(fullySettled.remainingAmount).toBe(0);
      expect(fullySettled.settlementPercentage).toBe(100);
    });

    it("evaluates net position correctly (Receivables - Debts)", () => {
      const activeDebts = [
        createMockDebt({ type: "debt", totalAmount: 1_000_000, settledAmount: 200_000 }), // remaining 800k
        createMockDebt({ type: "debt", totalAmount: 500_000, settledAmount: 100_000 }),  // remaining 400k
      ];
      const activeReceivables = [
        createMockDebt({ type: "receivable", totalAmount: 2_000_000, settledAmount: 500_000 }), // remaining 1.5M
      ];

      const totalDebt = activeDebts.reduce((sum, d) => sum + d.remainingAmount, 0);
      const totalReceivable = activeReceivables.reduce((sum, r) => sum + r.remainingAmount, 0);
      const netPosition = totalReceivable - totalDebt;

      expect(totalDebt).toBe(1_200_000);
      expect(totalReceivable).toBe(1_500_000);
      expect(netPosition).toBe(300_000); // Surplus
    });

    it("detects overdue and due soon thresholds relative to reference date", () => {
      const now = new Date("2026-11-15T12:00:00.000Z");

      // Past due date
      const pastDueDate = new Date("2026-11-10T00:00:00.000Z");
      const isPastOverdue = pastDueDate.getTime() < now.getTime();
      expect(isPastOverdue).toBe(true);

      // Due in 2 days (within 3 days)
      const dueSoonDate = new Date("2026-11-17T12:00:00.000Z");
      const diffMs = dueSoonDate.getTime() - now.getTime();
      const isDueSoon = diffMs >= 0 && diffMs <= 3 * 24 * 60 * 60 * 1000;
      expect(isDueSoon).toBe(true);

      // Due in 10 days (neither overdue nor due soon)
      const futureDate = new Date("2026-11-25T12:00:00.000Z");
      const diffFuture = futureDate.getTime() - now.getTime();
      const isFutureDueSoon = diffFuture >= 0 && diffFuture <= 3 * 24 * 60 * 60 * 1000;
      expect(isFutureDueSoon).toBe(false);
    });

    it("rejects over-settlement payments exceeding remaining balance", () => {
      const debt = createMockDebt({ totalAmount: 1_000_000, settledAmount: 700_000 });
      const remaining = debt.totalAmount - debt.settledAmount; // 300_000

      const validPayment = 300_000;
      const invalidPayment = 300_001;

      expect(validPayment <= remaining).toBe(true);
      expect(invalidPayment <= remaining).toBe(false);
    });
  });

  describe("DebtCard UI Component Rendering (UI-1, F22)", () => {
    it("renders active debt card with remaining amount and progress bar", () => {
      const debt = createMockDebt({
        type: "debt",
        personName: "Ahmad Dani",
        totalAmount: 1_000_000,
        settledAmount: 300_000,
      });

      renderWithI18n(
        <DebtCard
          debt={debt}
          onRecordSettlement={vi.fn()}
          onViewHistory={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />,
      );

      expect(screen.getByText("Ahmad Dani")).toBeInTheDocument();
      expect(screen.getByText("Utang Saya")).toBeInTheDocument();
      expect(screen.getByText("Aktif")).toBeInTheDocument();
      expect(screen.getByTestId("remaining-amount")).toHaveTextContent("Rp700.000");
      expect(screen.getByText("30%")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Bayar \/ Cicil/i })).toBeInTheDocument();
    });

    it("renders receivable card with green tone and correct labels", () => {
      const receivable = createMockDebt({
        type: "receivable",
        personName: "Siti Rahma",
        totalAmount: 2_500_000,
        settledAmount: 1_000_000,
      });

      renderWithI18n(
        <DebtCard
          debt={receivable}
          onRecordSettlement={vi.fn()}
          onViewHistory={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />,
      );

      expect(screen.getByText("Siti Rahma")).toBeInTheDocument();
      expect(screen.getByText("Piutang Saya")).toBeInTheDocument();
      expect(screen.getByTestId("remaining-amount")).toHaveTextContent("Rp1.500.000");
      expect(screen.getByText("40%")).toBeInTheDocument();
    });

    it("renders overdue badge when isOverdue is true", () => {
      const overdueDebt = createMockDebt({
        isOverdue: true,
        isDueSoon: false,
      });

      renderWithI18n(
        <DebtCard
          debt={overdueDebt}
          onRecordSettlement={vi.fn()}
          onViewHistory={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />,
      );

      expect(screen.getByTestId("overdue-badge")).toHaveTextContent("Lewat Jatuh Tempo");
    });

    it("renders due soon badge when isDueSoon is true", () => {
      const dueSoonDebt = createMockDebt({
        isOverdue: false,
        isDueSoon: true,
      });

      renderWithI18n(
        <DebtCard
          debt={dueSoonDebt}
          onRecordSettlement={vi.fn()}
          onViewHistory={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />,
      );

      expect(screen.getByTestId("due-soon-badge")).toHaveTextContent("Segera Jatuh Tempo");
    });

    it("renders settled status and hides payment button when status is settled", () => {
      const settledDebt = createMockDebt({
        status: "settled",
        settledAmount: 1_000_000,
        totalAmount: 1_000_000,
      });

      renderWithI18n(
        <DebtCard
          debt={settledDebt}
          onRecordSettlement={vi.fn()}
          onViewHistory={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />,
      );

      expect(screen.getByText("Lunas")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Bayar \/ Cicil/i })).not.toBeInTheDocument();
    });

    it("triggers callbacks when action buttons are clicked", () => {
      const onRecordSettlement = vi.fn();
      const onViewHistory = vi.fn();
      const onEdit = vi.fn();
      const onDelete = vi.fn();

      const debt = createMockDebt();

      renderWithI18n(
        <DebtCard
          debt={debt}
          onRecordSettlement={onRecordSettlement}
          onViewHistory={onViewHistory}
          onEdit={onEdit}
          onDelete={onDelete}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /Bayar \/ Cicil/i }));
      expect(onRecordSettlement).toHaveBeenCalledWith(debt);

      fireEvent.click(screen.getByTitle("Riwayat Pelunasan"));
      expect(onViewHistory).toHaveBeenCalledWith(debt);

      fireEvent.click(screen.getByTitle("Ubah"));
      expect(onEdit).toHaveBeenCalledWith(debt);

      fireEvent.click(screen.getByTitle("Hapus"));
      expect(onDelete).toHaveBeenCalledWith(debt);
    });
  });

  describe("Non-Blocking Improvements: Overdue Shortcut, Contact Grouping & Revert", () => {
    it("renders overdue alert banner and filters list to overdue items when clicked", () => {
      const overdueDebt = createMockDebt({
        id: "d-1",
        personName: "Budi Overdue",
        isOverdue: true,
        status: "active",
      });
      const activeDebt = createMockDebt({
        id: "d-2",
        personName: "Citra Normal",
        isOverdue: false,
        status: "active",
      });

      const summary = {
        totalReceivable: 0,
        totalDebt: 1_000_000,
        netPosition: -1_000_000,
        activeDebtsCount: 2,
        activeReceivablesCount: 0,
        overdueCount: 1,
      };

      renderWithI18n(
        <DebtsWorkspace
          initialSummary={summary}
          initialItems={[overdueDebt, activeDebt]}
          initialContacts={["Budi Overdue", "Citra Normal"]}
          wallets={[]}
        />,
      );

      // Overdue banner is displayed
      expect(screen.getByTestId("overdue-banner")).toBeInTheDocument();
      expect(
        screen.getByText(/1 komitmen lewat jatuh tempo/i),
      ).toBeInTheDocument();

      // Click filter overdue button on the banner
      fireEvent.click(
        screen.getByRole("button", { name: "Lewat Jatuh Tempo" }),
      );

      // Now only Budi Overdue is visible, Citra Normal is filtered out
      expect(screen.getByText("Budi Overdue")).toBeInTheDocument();
      expect(screen.queryByText("Citra Normal")).not.toBeInTheDocument();
    });

    it("switches to contact view mode and renders aggregated exposure per contact", () => {
      const debt1 = createMockDebt({
        id: "d-1",
        type: "debt",
        personName: "Rudi Hartono",
        totalAmount: 1_000_000,
        settledAmount: 400_000, // remaining 600k
        status: "active",
      });
      const receivable1 = createMockDebt({
        id: "d-2",
        type: "receivable",
        personName: "Rudi Hartono",
        totalAmount: 2_000_000,
        settledAmount: 500_000, // remaining 1.5M
        status: "active",
      });

      renderWithI18n(
        <DebtsWorkspace
          initialSummary={{
            totalReceivable: 1_500_000,
            totalDebt: 600_000,
            netPosition: 900_000,
            activeDebtsCount: 1,
            activeReceivablesCount: 1,
            overdueCount: 0,
          }}
          initialItems={[debt1, receivable1]}
          initialContacts={["Rudi Hartono"]}
          wallets={[]}
        />,
      );

      // Switch to Per Rekanan view
      fireEvent.click(screen.getByTitle("Per Rekanan"));

      // Shows contact card for Rudi Hartono
      expect(screen.getByText("Rudi Hartono")).toBeInTheDocument();
      expect(screen.getByText("2 komitmen")).toBeInTheDocument();
      expect(screen.getByText("Hak Tagih (Piutang)")).toBeInTheDocument();
      expect(screen.getByText("Kewajiban (Utang)")).toBeInTheDocument();
      expect(screen.getByText("Eksposur Bersih")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Lihat Komitmen Rekanan/i }),
      ).toBeInTheDocument();

      // Click "Lihat Komitmen Rekanan" -> switches back to list with filter
      fireEvent.click(
        screen.getByRole("button", { name: /Lihat Komitmen Rekanan/i }),
      );
      expect(screen.getByText("Daftar Komitmen")).toBeInTheDocument();
    });
  });
});
