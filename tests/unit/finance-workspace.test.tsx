import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

  it("resets incompatible filterCategoryId when filterType changes to another entry type", async () => {
    const requestedTxUrls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("/api/transactions")) {
        requestedTxUrls.push(url);
        return new Response(
          JSON.stringify({ ok: true, data: { items: [], nextCursor: null } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.startsWith("/api/wallets")) {
        return new Response(
          JSON.stringify({ ok: true, data: { wallets: sampleWallets } }),
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
          initialCategories={[
            ...sampleCategories,
            {
              id: "22222222-2222-4222-8222-222222222223",
              name: "Gaji",
              type: "income",
              isSystem: true,
              systemKey: "salary",
              createdAt: "2026-11-12T00:00:00.000Z",
              updatedAt: "2026-11-12T00:00:00.000Z",
            },
          ]}
          initialTransactions={sampleTransactions}
          initialTransactionsNextCursor={null}
          initialTransfers={sampleTransfers}
          initialTransfersNextCursor={null}
        />
      </PreferencesProvider>,
    );

    const categorySelect = screen.getByLabelText("Kategori") as HTMLSelectElement;
    const typeSelect = screen.getByLabelText("Tipe transaksi") as HTMLSelectElement;

    fireEvent.change(categorySelect, {
      target: { value: sampleCategories[0]!.id },
    });
    await waitFor(() => {
      expect(requestedTxUrls.at(-1)).toContain(
        `categoryId=${sampleCategories[0]!.id}`,
      );
    });

    fireEvent.change(typeSelect, { target: { value: "income" } });
    await waitFor(() => {
      expect(categorySelect.value).toBe("");
      const lastUrl = requestedTxUrls.at(-1) ?? "";
      expect(lastUrl).toContain("type=income");
      expect(lastUrl).not.toContain("categoryId=");
    });
  });

  it("requires confirmation modal before deleting a ledger transaction", async () => {
    const deleteCalls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (init?.method === "DELETE") {
        deleteCalls.push(url);
        return new Response(JSON.stringify({ ok: true, data: { deleted: true } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.startsWith("/api/wallets")) {
        return new Response(
          JSON.stringify({ ok: true, data: { wallets: sampleWallets } }),
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

    fireEvent.click(screen.getByRole("button", { name: "Hapus Makan & Minum" }));
    expect(deleteCalls).toHaveLength(0);

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(
        "Hapus transaksi ini? Saldo dompet akan dihitung ulang.",
      ),
    ).toBeInTheDocument();

    // Cancel closes confirmation without deleting
    fireEvent.click(within(dialog).getByRole("button", { name: "Batal" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deleteCalls).toHaveLength(0);

    // Re-open and confirm triggers DELETE
    fireEvent.click(screen.getByRole("button", { name: "Hapus Makan & Minum" }));
    const confirmDialog = screen.getByRole("dialog");
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "Hapus" }));

    await waitFor(() => {
      expect(deleteCalls).toEqual([
        `/api/transactions/${sampleTransactions[0]!.id}`,
      ]);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("surfaces errors when Load More or secondary finance requests return non-2xx", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("/api/transactions") && url.includes("cursor=")) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: { code: "INTERNAL_ERROR", message: "Load more failed" },
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.startsWith("/api/wallets")) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: { code: "UNKNOWN_WALLET_ERR", message: "Wallets unavailable" },
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
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
          initialTransactionsNextCursor="next-cursor-1"
          initialTransfers={sampleTransfers}
          initialTransfersNextCursor={null}
        />
      </PreferencesProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Muat Lebih Banyak" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Terjadi kesalahan internal server. Silakan coba lagi.",
      );
    });

    fireEvent.change(screen.getByLabelText("Tipe transaksi"), {
      target: { value: "expense" },
    });
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Permintaan tidak dapat diproses.",
      );
    });
  });
});

