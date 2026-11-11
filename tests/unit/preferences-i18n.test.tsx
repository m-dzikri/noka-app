import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const cookieMap = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieMap.get(name);
      return value !== undefined ? { value } : undefined;
    },
  }),
}));

import { useEffect } from "react";
import { PreferencesProvider } from "@/components/providers/PreferencesProvider";
import { LocaleToggle } from "@/components/ui/LocaleToggle";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useI18n, usePreferences } from "@/lib/i18n/context";
import { getServerPreferences } from "@/lib/i18n/server";

function PreferencesHarness({
  onPersist,
}: {
  onPersist?: (patch: { locale?: string; theme?: string }) => void;
}) {
  const { t, locale } = useI18n();
  const { updatePreferences, registerPersistHandler } = usePreferences();

  useEffect(() => {
    if (!onPersist) {
      return;
    }
    return registerPersistHandler(onPersist);
  }, [onPersist, registerPersistHandler]);

  return (
    <div>
      <h1>{t.common.overviewHeading}</h1>
      <p data-testid="active-locale">{locale}</p>
      <ThemeToggle />
      <LocaleToggle />
      <button
        type="button"
        onClick={() => updatePreferences({ theme: "dark" })}
      >
        Force Dark
      </button>
      <input aria-label="Draft editor input" defaultValue="" />
    </div>
  );
}

describe("PreferencesProvider and instant ID/EN + Light/Dark switching (TS-001-06)", () => {
  it("resolves server preferences cookies with safe defaults", async () => {
    cookieMap.clear();
    expect(await getServerPreferences()).toEqual({
      locale: "id",
      theme: "light",
      hasCookieLocale: false,
      hasCookieTheme: false,
    });

    cookieMap.set("noka_locale", "en");
    cookieMap.set("noka_theme", "dark");
    expect(await getServerPreferences()).toEqual({
      locale: "en",
      theme: "dark",
      hasCookieLocale: true,
      hasCookieTheme: true,
    });
  });

  it("falls back to localStorage ONLY when SSR cookies are absent", () => {
    window.localStorage.setItem("noka_locale", "en");
    window.localStorage.setItem("noka_theme", "dark");

    const { rerender } = render(
      <PreferencesProvider
        initialLocale="id"
        initialTheme="light"
        hasCookieLocale={false}
        hasCookieTheme={false}
      >
        <PreferencesHarness />
      </PreferencesProvider>,
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Welcome to Noka",
    );
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.lang).toBe("en");

    rerender(
      <PreferencesProvider
        key="ssr-cookie-present"
        initialLocale="id"
        initialTheme="light"
        hasCookieLocale={true}
        hasCookieTheme={true}
      >
        <PreferencesHarness />
      </PreferencesProvider>,
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Selamat datang di Noka",
    );
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.lang).toBe("id");
  });

  it("switches theme and locale instantly without losing typed input text", () => {
    const persistSpy = vi.fn();

    render(
      <PreferencesProvider
        initialLocale="id"
        initialTheme="light"
        hasCookieLocale={true}
        hasCookieTheme={true}
      >
        <PreferencesHarness onPersist={persistSpy} />
      </PreferencesProvider>,
    );

    const input = screen.getByLabelText("Draft editor input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "kopi pagi Rp 25000" } });
    expect(input.value).toBe("kopi pagi Rp 25000");

    const themeButton = screen.getByRole("button", {
      name: /mode gelap/i,
    });
    expect(themeButton).toHaveAttribute("aria-pressed", "false");
    expect(themeButton.textContent?.trim()).toBe("");
    fireEvent.click(themeButton);

    expect(themeButton).toHaveAttribute("aria-pressed", "true");
    expect(themeButton.textContent?.trim()).toBe("");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("noka_theme")).toBe("dark");
    expect(document.cookie).toContain("noka_theme=dark");
    expect(persistSpy).toHaveBeenCalledWith({ theme: "dark" });

    const enButton = screen.getByRole("button", { name: "EN" });
    expect(enButton).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(enButton);

    expect(enButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Welcome to Noka",
    );
    expect(document.documentElement.lang).toBe("en");
    expect(window.localStorage.getItem("noka_locale")).toBe("en");
    expect(document.cookie).toContain("noka_locale=en");
    expect(persistSpy).toHaveBeenCalledWith({ locale: "en" });

    // Re-selecting already-active preferences is a no-op and does not fire onPersist again.
    const callsBeforeNoop = persistSpy.mock.calls.length;
    fireEvent.click(enButton);
    fireEvent.click(screen.getByRole("button", { name: "Force Dark" }));
    expect(persistSpy).toHaveBeenCalledTimes(callsBeforeNoop);

    expect(input.value).toBe("kopi pagi Rp 25000");
  });
});

