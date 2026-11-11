import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routerPushMock = vi.fn();
const routerRefreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPushMock,
    replace: vi.fn(),
    refresh: routerRefreshMock,
  }),
}));

import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { LoginForm } from "@/components/auth/LoginForm";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { PreferencesProvider } from "@/components/providers/PreferencesProvider";
import { LocaleToggle } from "@/components/ui/LocaleToggle";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { registerClientLogoutCleanup } from "@/features/auth/client-cleanup";

describe("auth forms, instant ID/EN + theme switching & logout wipe (AC-2.5)", () => {
  beforeEach(() => {
    routerPushMock.mockClear();
    routerRefreshMock.mockClear();
  });

  it("retains typed LoginForm values when toggling ID/EN and Dark mode, and maps rate-limit errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: false,
            error: { code: "RATE_LIMITED", message: "Too many attempts" },
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": "42",
            },
          },
        ),
      ),
    );

    try {
      render(
        <PreferencesProvider
          initialLocale="id"
          initialTheme="light"
          hasCookieLocale={true}
          hasCookieTheme={true}
        >
          <LocaleToggle />
          <ThemeToggle />
          <LoginForm />
        </PreferencesProvider>,
      );

      const emailInput = screen.getByLabelText("Alamat Email") as HTMLInputElement;
      const passwordInput = screen.getByLabelText("Kata Sandi") as HTMLInputElement;

      fireEvent.change(emailInput, { target: { value: "dinda@noka.test" } });
      fireEvent.change(passwordInput, { target: { value: "rahasia123" } });

      // Instant switch to EN and Dark mode preserves active input text.
      fireEvent.click(screen.getByRole("button", { name: "EN" }));
      fireEvent.click(screen.getByRole("button", { name: /dark/i }));

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        "Sign in to Noka",
      );
      expect(emailInput.value).toBe("dinda@noka.test");
      expect(passwordInput.value).toBe("rahasia123");

      fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("42 seconds");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("validates RegisterForm password match/length and submits active locale/theme before redirecting to /app", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            user: {
              id: "u-1",
              name: "Raka",
              email: "raka@noka.test",
              locale: "en",
              theme: "dark",
              cycleStartDay: "1",
            },
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      render(
        <PreferencesProvider
          initialLocale="en"
          initialTheme="dark"
          hasCookieLocale={true}
          hasCookieTheme={true}
        >
          <RegisterForm />
        </PreferencesProvider>,
      );

      fireEvent.change(screen.getByLabelText("Full Name"), {
        target: { value: "Raka Pratama" },
      });
      fireEvent.change(screen.getByLabelText("Email Address"), {
        target: { value: "raka@noka.test" },
      });
      fireEvent.change(screen.getByLabelText("Password"), {
        target: { value: "short" },
      });
      fireEvent.change(screen.getByLabelText("Confirm Password"), {
        target: { value: "mismatch" },
      });

      fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
      expect(fetchMock).not.toHaveBeenCalled();

      fireEvent.change(screen.getByLabelText("Password"), {
        target: { value: "strongpass123" },
      });
      fireEvent.change(screen.getByLabelText("Confirm Password"), {
        target: { value: "strongpass123" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Create Account" }));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(routerPushMock).toHaveBeenCalledWith("/app");
      });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(String(init.body))).toEqual({
        name: "Raka Pratama",
        email: "raka@noka.test",
        password: "strongpass123",
        locale: "en",
        theme: "dark",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("renders ForgotPasswordForm neutral confirmation and ResetPasswordForm missing-token/success states", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true, data: { message: "sent" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    try {
      const { rerender } = render(
        <PreferencesProvider
          initialLocale="id"
          initialTheme="light"
          hasCookieLocale={true}
          hasCookieTheme={true}
        >
          <ForgotPasswordForm />
        </PreferencesProvider>,
      );

      fireEvent.change(screen.getByLabelText("Alamat Email"), {
        target: { value: "unknown@noka.test" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Kirim Tautan Reset" }));
      expect(await screen.findByRole("status")).toHaveTextContent("30 menit");

      rerender(
        <PreferencesProvider
          initialLocale="id"
          initialTheme="light"
          hasCookieLocale={true}
          hasCookieTheme={true}
        >
          <ResetPasswordForm />
        </PreferencesProvider>,
      );
      expect(screen.getByRole("alert")).toHaveTextContent("Token reset");
      expect(
        screen.getByRole("link", { name: "Minta tautan reset baru" }),
      ).toHaveAttribute("href", "/forgot-password");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("wipes private localStorage & cleanup callbacks on LogoutButton click while keeping preferences", async () => {
    window.localStorage.setItem("noka_theme", "dark");
    window.localStorage.setItem("noka_locale", "en");
    window.localStorage.setItem("noka_privacy_blur", "true");
    window.localStorage.setItem("noka_private_outbox", "pending");

    const wipeSpy = vi.fn().mockResolvedValue(undefined);
    const unregister = registerClientLogoutCleanup(wipeSpy);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: { loggedOut: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      render(
        <PreferencesProvider
          initialLocale="en"
          initialTheme="dark"
          hasCookieLocale={true}
          hasCookieTheme={true}
        >
          <LogoutButton />
        </PreferencesProvider>,
      );

      fireEvent.click(screen.getByRole("button", { name: "Log out" }));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/auth/logout",
          expect.objectContaining({ method: "POST" }),
        );
        expect(wipeSpy).toHaveBeenCalledTimes(1);
        expect(routerPushMock).toHaveBeenCalledWith("/login");
      });

      expect(window.localStorage.getItem("noka_private_outbox")).toBeNull();
      expect(window.localStorage.getItem("noka_theme")).toBe("dark");
      expect(window.localStorage.getItem("noka_locale")).toBe("en");
      expect(window.localStorage.getItem("noka_privacy_blur")).toBe("true");
    } finally {
      unregister();
      vi.unstubAllGlobals();
    }
  });
});

