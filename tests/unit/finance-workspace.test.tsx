import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinanceWorkspace } from "@/components/finance/FinanceWorkspace";
import { PreferencesProvider } from "@/components/providers/PreferencesProvider";
import type { CategoryDto } from "@/features/finance/categories-service";
import type { TransactionDto } from "@/features/finance/transactions-service";
import type { TransferDto } from "@/features/finance/transfers-service";
import type { WalletWithBalanceDto } from "@/features/finance/wallets-service";

const sampleWallets: WalletWithBalanceDto[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Kas Tunai",
    type: "cash",
    initialBalance: 100_000,
    currentBalance: 150_000,
    includeInSafeToSpend: true,
    isDefault: true,
    archivedAt: null,
    createdAt: "2026-11-12T00:00:00.000Z",
    updatedAt: "2026-11-12T00:00:00.000Z",
  },
];

const sampleCategories: CategoryDto[] = [
  {
    id: "22222222-2222-4222-8222-222222222221",
    name: "Makan & Minum",
    type: "expense",
    isSystem: true,
    systemKey: "food_drink",
    createdAt: "2026-11-12T00:00:00.000Z",
    updatedAt: "2026-11-12T00:00:00.000Z",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Kopi",
    type: "expense",
    isSystem: false,
    systemKey: null,
    createdAt: "2026-11-12T00:00:00.000Z",
    updatedAt: "2026-11-12T00:00:00.000Z",
  },
];

const sampleTransactions: TransactionDto[] = [
  {
    id: "33333333-3333-4333-8333-333333333331",
    walletId: sampleWallets[0]!.id,
    walletName: "Kas Tunai",
    categoryId: sampleCategories[0]!.id,
    categoryName: "Makan & Minum",
    noteId: null,
    type: "expense",
    amount: 25_000,
    description: "Bakso",
    occurredAt: "2026-11-12T06:00:00.000Z",
    createdAt: "2026-11-12T06:00:00.000Z",
    updatedAt: "2026-11-12T06:00:00.000Z",
  },
];

const sampleTransfers: TransferDto[] = [];

describe("FinanceWorkspace Component & noka:finance-updated Sync", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders initial balances, offers one-click archive on 409 WALLET_HAS_HISTORY, and refreshes on external noka:finance-updated", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith(`/api/wallets/${sampleWallets[0]!.id}`) && init?.method === "DELETE") {
        return new Response(
          JSON.stringify({
            ok: false,
            error: {
              code: "WALLET_HAS_HISTORY",
              message: "Wallet has history",
            },
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.startsWith("/api/wallets")) {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              wallets: [
                {
                  ...sampleWallets[0]!,
                  currentBalance: 300_000,
                },
              ],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.startsWith("/api/categories")) {
        return new Response(
          JSON.stringify({ ok: true, data: { categories: sampleCategories } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ ok: true, data: { items: [], nextCursor: null } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    render(
      <PreferencesProvider initialLocale="id" initialTheme="light">
        <FinanceWorkspace
          initialWallets={sampleWallets}
          initialCategories={sampleCategories}
          initialTransactions={sampleTransactions}
          initialTransactionsNextCursor={null}
          initialTransfers={sampleTransfers}
          initialTransfersNextCursor={null}
        />
      </PreferencesProvider>,
    );

    expect(screen.getByTestId("finance-total-balance").textContent).toBe("Rp150.000");

    // Open Wallet Manager modal and click Delete -> 409 triggers archive offer button
    fireEvent.click(screen.getByRole("button", { name: "Kelola Dompet" }));
    fireEvent.click(screen.getByRole("button", { name: "Hapus Kas Tunai" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Arsipkan Dompet Ini" }),
      ).toBeInTheDocument();
    });

    // External noka:finance-updated triggers data reload & balance update
    window.dispatchEvent(
      new CustomEvent("noka:finance-updated", { detail: { source: "quick-capture" } }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("finance-total-balance").textContent).toBe(
        "Rp300.000",
      );
    });
  });
});

