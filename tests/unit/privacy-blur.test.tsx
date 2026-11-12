import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PrivacyBlurToggle } from "@/components/finance/PrivacyBlurToggle";
import { SafeToSpendCard } from "@/components/finance/SafeToSpendCard";
import { PreferencesProvider } from "@/components/providers/PreferencesProvider";
import { PrivacyProvider } from "@/components/providers/PrivacyProvider";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import type { CycleWindowInfo } from "@/features/finance/safe-to-spend";

const sampleCycle: CycleWindowInfo = {
  startDate: "2026-11-01",
  endDate: "2026-11-30",
  startUtcIso: "2026-10-31T17:00:00.000Z",
  endExclusiveUtcIso: "2026-11-30T17:00:00.000Z",
  remainingDays: 10,
  cycleStartDay: "1",
};

describe("PrivacyProvider, PrivacyBlurToggle, PrivacyAmount & SafeToSpendCard (TS-007-02)", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-privacy-blur");
    document.cookie = "noka_privacy_blur=; Path=/; Max-Age=0";
    window.localStorage.clear();
  });

  it("renders initial blurred state immediately without unblurred flash when SSR cookie is true", () => {
    render(
      <PreferencesProvider initialLocale="id" initialTheme="light">
        <PrivacyProvider initialCookieBlurred={true}>
          <PrivacyBlurToggle />
          <div data-testid="amounts">
            <PrivacyAmount amount={50_000} type="income" />
            <PrivacyAmount amount={50_000} type="expense" />
            <PrivacyAmount amount={50_000} type="transfer" />
            <PrivacyAmount amount={0} signMode="signed" />
            <PrivacyAmount amount={-125_000} signMode="plain" />
          </div>
        </PrivacyProvider>
      </PreferencesProvider>,
    );

    expect(document.documentElement.dataset.privacyBlur).toBe("true");
    const toggle = screen.getByTestId("privacy-blur-toggle");
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    const spans = screen.getByTestId("amounts").querySelectorAll("span");
    expect(Array.from(spans).map((el) => el.textContent)).toEqual([
      "+Rp •••••",
      "-Rp •••••",
      "Rp •••••",
      "Rp •••••",
      "-Rp •••••",
    ]);
    expect(spans[0]).toHaveAttribute("data-privacy-blurred", "true");
  });

  it("ignores stale localStorage when SSR cookie explicitly sets false, and restores localStorage only when SSR cookie is null", () => {
    window.localStorage.setItem("noka_privacy_blur", "true");

    const { unmount } = render(
      <PreferencesProvider initialLocale="id" initialTheme="light">
        <PrivacyProvider initialCookieBlurred={false}>
          <PrivacyAmount amount={285_000} signMode="plain" />
        </PrivacyProvider>
      </PreferencesProvider>,
    );

    expect(screen.getByText("Rp285.000")).toHaveAttribute(
      "data-privacy-blurred",
      "false",
    );
    unmount();

    // When SSR cookie is absent (null), falls back to localStorage ("true")
    render(
      <PreferencesProvider initialLocale="id" initialTheme="light">
        <PrivacyProvider initialCookieBlurred={null}>
          <PrivacyAmount amount={285_000} signMode="plain" />
        </PrivacyProvider>
      </PreferencesProvider>,
    );

    expect(screen.getByText("Rp •••••")).toHaveAttribute(
      "data-privacy-blurred",
      "true",
    );
  });

  it("toggles Privacy Blur live across amounts and SafeToSpendCard statuses without reload, updating cookie & localStorage", () => {
    render(
      <PreferencesProvider initialLocale="id" initialTheme="light">
        <PrivacyProvider initialCookieBlurred={false}>
          <PrivacyBlurToggle />
          <div data-testid="matrix">
            <PrivacyAmount amount={285_000} signMode="plain" />
            <PrivacyAmount amount={50_000} type="income" />
            <PrivacyAmount amount={-50_000} type="expense" />
            <PrivacyAmount amount={0} type="income" />
            <PrivacyAmount amount={-125_000} signMode="plain" />
          </div>
          <SafeToSpendCard
            cycle={sampleCycle}
            safeToSpend={{
              safeToSpend: 100_000,
              totalIncludedBalance: 1_000_000,
              remainingDays: 10,
              includedWalletCount: 2,
              status: "ok",
            }}
          />
        </PrivacyProvider>
      </PreferencesProvider>,
    );

    const matrixSpans = screen.getByTestId("matrix").querySelectorAll("span");
    expect(Array.from(matrixSpans).map((el) => el.textContent)).toEqual([
      "Rp285.000",
      "+Rp50.000",
      "-Rp50.000",
      "Rp0",
      "-Rp125.000",
    ]);
    expect(screen.getByTestId("safe-to-spend-amount").textContent).toBe("Rp100.000");

    // Click PrivacyBlurToggle -> all amounts mask immediately without reload
    const toggle = screen.getByTestId("privacy-blur-toggle");
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(window.localStorage.getItem("noka_privacy_blur")).toBe("true");
    expect(document.cookie).toContain("noka_privacy_blur=1");
    expect(Array.from(matrixSpans).map((el) => el.textContent)).toEqual([
      "Rp •••••",
      "+Rp •••••",
      "-Rp •••••",
      "Rp •••••",
      "-Rp •••••",
    ]);
    expect(screen.getByTestId("safe-to-spend-amount").textContent).toBe("Rp •••••");

    // Click again -> unmasks immediately
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(window.localStorage.getItem("noka_privacy_blur")).toBe("false");
    expect(document.cookie).toContain("noka_privacy_blur=0");
    expect(screen.getByTestId("safe-to-spend-amount").textContent).toBe("Rp100.000");
  });

  it("renders SafeToSpendCard fallback guidance for no_included_wallets and non_positive_balance", () => {
    const { rerender } = render(
      <PreferencesProvider initialLocale="en" initialTheme="light">
        <PrivacyProvider initialCookieBlurred={false}>
          <SafeToSpendCard
            cycle={sampleCycle}
            safeToSpend={{
              safeToSpend: 0,
              totalIncludedBalance: 0,
              remainingDays: 10,
              includedWalletCount: 0,
              status: "no_included_wallets",
            }}
          />
        </PrivacyProvider>
      </PreferencesProvider>,
    );

    expect(screen.getByTestId("safe-to-spend-amount").textContent).toBe("Rp0");
    expect(screen.getByTestId("safe-to-spend-hint")).toHaveTextContent(
      "Enable Safe-to-Spend on at least one active wallet",
    );

    rerender(
      <PreferencesProvider initialLocale="en" initialTheme="light">
        <PrivacyProvider initialCookieBlurred={false}>
          <SafeToSpendCard
            cycle={sampleCycle}
            safeToSpend={{
              safeToSpend: 0,
              totalIncludedBalance: -50_000,
              remainingDays: 10,
              includedWalletCount: 1,
              status: "non_positive_balance",
            }}
          />
        </PrivacyProvider>
      </PreferencesProvider>,
    );

    expect(screen.getByTestId("safe-to-spend-amount").textContent).toBe("Rp0");
    expect(screen.getByTestId("safe-to-spend-hint")).toHaveTextContent(
      "Rp0 or negative",
    );
  });
});

