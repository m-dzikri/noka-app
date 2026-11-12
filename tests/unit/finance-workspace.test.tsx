import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinanceWorkspace } from "@/components/finance/FinanceWorkspace";
import { PreferencesProvider } from "@/components/providers/PreferencesProvider";
import { PrivacyProvider } from "@/components/providers/PrivacyProvider";
import type { CategoryDto } from "@/features/finance/categories-service";
import type {
  FinanceSummaryDto,
  SummaryLedgerItem,
} from "@/features/finance/summary-service";
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

const sampleLedgerItems: SummaryLedgerItem[] = [
  {
    kind: "transaction",
    id: "33333333-3333-4333-8333-333333333331",
    walletId: sampleWallets[0]!.id,
    walletName: "Kas Tunai",
    categoryId: sampleCategories[0]!.id,
    categoryName: "Makan & Minum",
    noteId: null,
    noteTitle: null,
    type: "expense",
    amount: 25_000,
    description: "Bakso",
    occurredAt: "2026-11-12T06:00:00.000Z",
    createdAt: "2026-11-12T06:00:00.000Z",
    updatedAt: "2026-11-12T06:00:00.000Z",
  },
];

function createSummaryFixture(
  overrides: Partial<FinanceSummaryDto> = {},
): FinanceSummaryDto {
  const wallets = overrides.wallets ?? sampleWallets;
  const totalBalance =
    overrides.totalBalance ??
    wallets
      .filter((w) => w.archivedAt === null)
      .reduce((acc, w) => acc + w.currentBalance, 0);

  return {
    wallets,
    totalBalance,
    cycle: overrides.cycle ?? {
      cycleStartDay: "1",
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      startUtcIso: "2026-10-31T17:00:00.000Z",
      endExclusiveUtcIso: "2026-11-30T17:00:00.000Z",
      remainingDays: 19,
    },
    safeToSpend: overrides.safeToSpend ?? {
      totalIncludedBalance: totalBalance,
      remainingDays: 19,
      safeToSpend: Math.floor(totalBalance / 19),
      status: "ok",
      includedWalletCount: wallets.filter(
        (w) => w.archivedAt === null && w.includeInSafeToSpend,
      ).length,
    },
    cashflow: overrides.cashflow ?? {
      totalIncome: 0,
      totalExpense: 25_000,
      net: -25_000,
    },
    categoryBreakdown: overrides.categoryBreakdown ?? [
      {
        categoryId: sampleCategories[0]!.id,
        categoryName: "Makan & Minum",
        type: "expense",
        total: 25_000,
        percentage: 100,
      },
    ],
    ledger: overrides.ledger ?? {
      items: sampleLedgerItems,
      nextCursor: null,
    },
  };
}

function renderWorkspace(
  summary: FinanceSummaryDto = createSummaryFixture(),
  cats: CategoryDto[] = sampleCategories,
) {
  return render(
    <PreferencesProvider initialLocale="id" initialTheme="light">
      <PrivacyProvider initialCookieBlurred={false}>
        <FinanceWorkspace initialSummary={summary} initialCategories={cats} />
      </PrivacyProvider>
    </PreferencesProvider>,
  );
}

describe("FinanceWorkspace Component & noka:finance-updated Sync", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders initial balances, safe-to-spend, cashflow, offers one-click archive on 409 WALLET_HAS_HISTORY, and refreshes on external noka:finance-updated", async () => {
    const updatedSummary = createSummaryFixture({
      wallets: [
        {
          ...sampleWallets[0]!,
          currentBalance: 300_000,
        },
      ],
      totalBalance: 300_000,
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (
        url.startsWith(`/api/wallets/${sampleWallets[0]!.id}`) &&
        init?.method === "DELETE"
      ) {
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

      if (url.startsWith("/api/finance/summary")) {
        return new Response(
          JSON.stringify({
            ok: true,
            data: updatedSummary,
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

      return new Response(JSON.stringify({ ok: true, data: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    renderWorkspace();

    expect(screen.getByTestId("finance-total-balance").textContent).toBe(
      "Rp150.000",
    );
    expect(screen.getByTestId("safe-to-spend-amount").textContent).toBe(
      "Rp7.894",
    );
    expect(screen.getByTestId("cashflow-total-expense").textContent).toBe(
      "-Rp25.000",
    );

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
      new CustomEvent("noka:finance-updated", {
        detail: { source: "quick-capture" },
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("finance-total-balance").textContent).toBe(
        "Rp300.000",
      );
      expect(screen.getByTestId("safe-to-spend-amount").textContent).toBe(
        "Rp15.789",
      );
    });
  });

  it("resets incompatible filterCategoryId when filterType changes to another entry type or transfer", async () => {
    const requestedSummaryUrls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("/api/finance/summary")) {
        requestedSummaryUrls.push(url);
        return new Response(
          JSON.stringify({ ok: true, data: createSummaryFixture() }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.startsWith("/api/categories")) {
        return new Response(
          JSON.stringify({ ok: true, data: { categories: sampleCategories } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ ok: true, data: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWorkspace(createSummaryFixture(), [
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
    ]);

    const categorySelect = screen.getByLabelText("Kategori") as HTMLSelectElement;
    const typeSelect = screen.getByLabelText("Tipe transaksi") as HTMLSelectElement;

    fireEvent.change(categorySelect, {
      target: { value: sampleCategories[0]!.id },
    });
    await waitFor(() => {
      expect(requestedSummaryUrls.at(-1)).toContain(
        `categoryId=${sampleCategories[0]!.id}`,
      );
    });

    fireEvent.change(typeSelect, { target: { value: "income" } });
    await waitFor(() => {
      expect(categorySelect.value).toBe("");
      const lastUrl = requestedSummaryUrls.at(-1) ?? "";
      expect(lastUrl).toContain("type=income");
      expect(lastUrl).not.toContain("categoryId=");
    });

    fireEvent.change(typeSelect, { target: { value: "transfer" } });
    await waitFor(() => {
      expect(categorySelect.disabled).toBe(true);
      const lastUrl = requestedSummaryUrls.at(-1) ?? "";
      expect(lastUrl).toContain("type=transfer");
      expect(lastUrl).not.toContain("categoryId=");
    });
  });

  it("requires confirmation modal before deleting a ledger transaction", async () => {
    const deleteCalls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (init?.method === "DELETE") {
        deleteCalls.push(url);
        return new Response(
          JSON.stringify({ ok: true, data: { deleted: true } }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      if (url.startsWith("/api/finance/summary")) {
        return new Response(
          JSON.stringify({
            ok: true,
            data: createSummaryFixture({
              ledger: { items: [], nextCursor: null },
            }),
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
      return new Response(JSON.stringify({ ok: true, data: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWorkspace();

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
        `/api/transactions/${sampleLedgerItems[0]!.id}`,
      ]);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("surfaces errors when Load More or summary refresh requests return non-2xx", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("/api/finance/summary") && url.includes("cursor=")) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: { code: "INTERNAL_ERROR", message: "Load more failed" },
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.startsWith("/api/finance/summary")) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: { code: "UNKNOWN_SUMMARY_ERR", message: "Summary unavailable" },
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
      return new Response(JSON.stringify({ ok: true, data: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWorkspace(
      createSummaryFixture({
        ledger: {
          items: sampleLedgerItems,
          nextCursor: "next-cursor-1",
        },
      }),
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

  it("displays active cycle hint and auto-syncs paired date bound when single-sided from/to crosses cycle bounds", async () => {
    const requestedSummaryUrls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("/api/finance/summary")) {
        requestedSummaryUrls.push(url);
        return new Response(
          JSON.stringify({ ok: true, data: createSummaryFixture() }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.startsWith("/api/categories")) {
        return new Response(
          JSON.stringify({ ok: true, data: { categories: sampleCategories } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ ok: true, data: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWorkspace();

    expect(screen.getByTestId("ledger-filter-cycle-hint")).toHaveTextContent(
      "2026-11-01",
    );
    expect(screen.getByTestId("ledger-filter-cycle-hint")).toHaveTextContent(
      "2026-11-30",
    );

    const fromInput = screen.getByLabelText("Dari") as HTMLInputElement;
    const toInput = screen.getByLabelText("Sampai") as HTMLInputElement;

    // Choosing `from` after `cycle.endDate` auto-syncs blank `to` to avoid 422 `from > to`
    fireEvent.change(fromInput, { target: { value: "2026-12-05" } });
    await waitFor(() => {
      expect(toInput.value).toBe("2026-12-05");
      const lastUrl = requestedSummaryUrls.at(-1) ?? "";
      expect(lastUrl).toContain("from=2026-12-05");
      expect(lastUrl).toContain("to=2026-12-05");
    });
    expect(
      screen.queryByTestId("ledger-filter-cycle-hint"),
    ).not.toBeInTheDocument();

    // Resetting clears both dates and choosing `to` before `cycle.startDate` auto-syncs blank `from`
    fireEvent.click(screen.getByRole("button", { name: "Reset Filter" }));
    await waitFor(() => {
      expect(fromInput.value).toBe("");
      expect(toInput.value).toBe("");
    });

    fireEvent.change(toInput, { target: { value: "2026-10-15" } });
    await waitFor(() => {
      expect(fromInput.value).toBe("2026-10-15");
      const lastUrl = requestedSummaryUrls.at(-1) ?? "";
      expect(lastUrl).toContain("from=2026-10-15");
      expect(lastUrl).toContain("to=2026-10-15");
    });

    // Choosing within-cycle `from` leaves `to` blank for API cycle.endDate fallback
    fireEvent.click(screen.getByRole("button", { name: "Reset Filter" }));
    fireEvent.change(fromInput, { target: { value: "2026-11-10" } });
    await waitFor(() => {
      expect(fromInput.value).toBe("2026-11-10");
      expect(toInput.value).toBe("");
      const lastUrl = requestedSummaryUrls.at(-1) ?? "";
      expect(lastUrl).toContain("from=2026-11-10");
      expect(lastUrl).not.toContain("to=");
    });
  });
});
