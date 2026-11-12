import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FINANCE_UPDATED_EVENT,
  WORKSPACE_UPDATED_EVENT,
} from "@/components/finance/finance-client-helpers";
import { PreferencesProvider } from "@/components/providers/PreferencesProvider";
import { PrivacyProvider } from "@/components/providers/PrivacyProvider";
import { QuickCaptureBar } from "@/components/quick-capture/QuickCaptureBar";
import { LocaleToggle } from "@/components/ui/LocaleToggle";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import type { CategoryDto } from "@/features/finance/categories-service";
import type { WalletWithBalanceDto } from "@/features/finance/wallets-service";

const sampleWallets: WalletWithBalanceDto[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Kas Tunai",
    type: "cash",
    initialBalance: 100_000,
    currentBalance: 100_000,
    includeInSafeToSpend: true,
    isDefault: true,
    archivedAt: null,
    createdAt: "2026-11-12T00:00:00.000Z",
    updatedAt: "2026-11-12T00:00:00.000Z",
  },
  {
    id: "11111111-1111-4111-8111-111111111112",
    name: "Bank BCA",
    type: "bank",
    initialBalance: 500_000,
    currentBalance: 500_000,
    includeInSafeToSpend: true,
    isDefault: false,
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
    name: "Gaji",
    type: "income",
    isSystem: true,
    systemKey: "salary",
    createdAt: "2026-11-12T00:00:00.000Z",
    updatedAt: "2026-11-12T00:00:00.000Z",
  },
];

describe("QuickCaptureBar (TS-008-02)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("handles Ctrl+K / `/` / Escape / Shift+Enter, Privacy Blur preview, zero-wallet CTA, ID/EN + theme draft retention, and workspace events", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.endsWith("/api/transactions")) {
          return new Response(
            JSON.stringify({
              ok: true,
              data: { transaction: { id: "tx-quick-1" } },
            }),
            { status: 201, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.endsWith("/api/notes")) {
          return new Response(
            JSON.stringify({
              ok: true,
              data: { note: { id: "note-quick-1" } },
            }),
            { status: 201, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    );

    const financeEvents: string[] = [];
    const workspaceEvents: Array<{ kind: string; id?: string }> = [];
    const onFinance = () => financeEvents.push("finance");
    const onWorkspace = (e: Event) => {
      const custom = e as CustomEvent<{ kind: string; id?: string }>;
      if (custom.detail) {
        workspaceEvents.push(custom.detail);
      }
    };
    window.addEventListener(FINANCE_UPDATED_EVENT, onFinance);
    window.addEventListener(WORKSPACE_UPDATED_EVENT, onWorkspace);

    render(
      <PreferencesProvider initialLocale="id" initialTheme="light">
        <PrivacyProvider initialCookieBlurred={true}>
          <div>
            <input aria-label="External field" />
            <LocaleToggle />
            <ThemeToggle />
            <QuickCaptureBar
              wallets={sampleWallets}
              categories={sampleCategories}
            />
          </div>
        </PrivacyProvider>
      </PreferencesProvider>,
    );

    const externalInput = screen.getByLabelText("External field");
    const qcInput = screen.getByTestId(
      "quick-capture-input",
    ) as HTMLTextAreaElement;

    // `/` inside external input must NOT hijack focus
    externalInput.focus();
    fireEvent.keyDown(externalInput, { key: "/" });
    expect(document.activeElement).toBe(externalInput);

    // `/` on body DOES focus Quick Capture
    externalInput.blur();
    fireEvent.keyDown(document.body, { key: "/" });
    expect(document.activeElement).toBe(qcInput);

    // `Ctrl+K` focuses Quick Capture even from external input
    externalInput.focus();
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(document.activeElement).toBe(qcInput);

    // Type transaction -> detects transaction + Privacy Blur masks amount
    fireEvent.change(qcInput, {
      target: { value: "Beli kopi 25rb lewat Bank BCA" },
    });

    expect(screen.getByTestId("quick-capture-preview")).toBeInTheDocument();
    expect(screen.getByTestId("quick-capture-amount-preview").textContent).toContain(
      "Rp •••••",
    );
    expect(
      (screen.getByTestId("quick-capture-wallet-select") as HTMLSelectElement)
        .value,
    ).toBe(sampleWallets[1]!.id);

    // Toggle ID -> EN and Theme Light -> Dark -> draft preserved!
    fireEvent.click(screen.getByRole("button", { name: /Switch to English|EN/i }));
    expect(qcInput.value).toBe("Beli kopi 25rb lewat Bank BCA");
    expect(
      screen.getByTestId("quick-capture-intent-badge").textContent,
    ).toContain("Detected: Transaction");

    const themeButton = document.querySelector(
      "[data-testid='theme-toggle'], button[aria-label*='Dark'], button[aria-label*='Mode']",
    );
    if (themeButton) {
      fireEvent.click(themeButton);
    }
    expect(qcInput.value).toBe("Beli kopi 25rb lewat Bank BCA");

    // `Escape` collapses preview while keeping text
    fireEvent.keyDown(qcInput, { key: "Escape" });
    expect(screen.queryByTestId("quick-capture-preview")).toBeNull();
    expect(qcInput.value).toBe("Beli kopi 25rb lewat Bank BCA");

    // Re-open with Shift+Enter -> stays in draft without submitting
    fireEvent.change(qcInput, {
      target: { value: "Beli kopi 25rb lewat Bank BCA\nExtra info" },
    });
    fireEvent.keyDown(qcInput, { key: "Enter", shiftKey: true });
    expect(fetchSpy).not.toHaveBeenCalled();

    // Submit transaction via Enter
    fireEvent.keyDown(qcInput, { key: "Enter" });
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("/api/transactions");
    await waitFor(() => {
      expect(qcInput.value).toBe("");
    });
    expect(financeEvents).toHaveLength(1);
    expect(workspaceEvents).toContainEqual({
      kind: "transaction",
      id: "tx-quick-1",
      source: "quick-capture",
    });

    // Switch manually to Transaction on ambiguous note -> submit Note instead after switch back
    fireEvent.change(qcInput, {
      target: { value: "Rapat anggaran tim" },
    });
    expect(screen.getByTestId("quick-capture-note-title-preview").textContent).toBe(
      "Rapat anggaran tim",
    );
    fireEvent.keyDown(qcInput, { key: "Enter" });
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
    expect(fetchSpy.mock.calls[1]?.[0]).toBe("/api/notes");
    expect(workspaceEvents).toContainEqual({
      kind: "note",
      id: "note-quick-1",
      source: "quick-capture",
    });

    window.removeEventListener(FINANCE_UPDATED_EVENT, onFinance);
    window.removeEventListener(WORKSPACE_UPDATED_EVENT, onWorkspace);
  });

  it("shows 0-wallet guard and allows saving as Note instead without hitting POST /api/transactions", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: { note: { id: "note-fallback-1" } },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(
      <PreferencesProvider initialLocale="id" initialTheme="light">
        <PrivacyProvider initialCookieBlurred={false}>
          <QuickCaptureBar wallets={[]} categories={sampleCategories} />
        </PrivacyProvider>
      </PreferencesProvider>,
    );

    const qcInput = screen.getByTestId("quick-capture-input");
    fireEvent.change(qcInput, { target: { value: "Makan siang 35rb" } });

    const guard = screen.getByTestId("quick-capture-zero-wallet-guard");
    expect(guard).toBeInTheDocument();
    expect(
      (screen.getByTestId("quick-capture-submit") as HTMLButtonElement).disabled,
    ).toBe(true);

    // Switch to Note via fallback CTA
    fireEvent.click(screen.getByRole("button", { name: /Catatan saja|Save as Note/i }));
    fireEvent.click(screen.getByTestId("quick-capture-submit"));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("/api/notes");
  });
});
