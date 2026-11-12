import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  routerPushMock,
  routerRefreshMock,
  redirectMock,
  getSessionUserMock,
} = vi.hoisted(() => ({
  routerPushMock: vi.fn(),
  routerRefreshMock: vi.fn(),
  redirectMock: vi.fn((target: string) => {
    throw new Error(`NEXT_REDIRECT:${target}`);
  }),
  getSessionUserMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPushMock,
    replace: vi.fn(),
    refresh: routerRefreshMock,
  }),
  usePathname: () => "/app",
  redirect: redirectMock,
}));

vi.mock("@/features/auth/session", () => ({
  getSessionUser: getSessionUserMock,
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => undefined),
  })),
}));

import AppWorkspaceLayout from "@/app/(app)/app/layout";
import AppEntryPage from "@/app/(app)/app/page";
import LoginPage from "@/app/(auth)/login/page";
import RegisterPage from "@/app/(auth)/register/page";
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
    redirectMock.mockClear();
    getSessionUserMock.mockReset();
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

  it("redirects LoginForm to /app/notes after successful 200 login", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            data: { user: { id: "u-1", name: "Dinda", email: "dinda@noka.test" } },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    try {
      render(
        <PreferencesProvider
          initialLocale="en"
          initialTheme="light"
          hasCookieLocale={true}
          hasCookieTheme={true}
        >
          <LoginForm />
        </PreferencesProvider>,
      );

      fireEvent.change(screen.getByLabelText("Email Address"), {
        target: { value: "dinda@noka.test" },
      });
      fireEvent.change(screen.getByLabelText("Password"), {
        target: { value: "rahasia123" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

      await waitFor(() => {
        expect(routerPushMock).toHaveBeenCalledWith("/app/notes");
        expect(routerRefreshMock).toHaveBeenCalledTimes(1);
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("validates RegisterForm password match/length and submits active locale/theme before redirecting to /app/notes", async () => {
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
        expect(routerPushMock).toHaveBeenCalledWith("/app/notes");
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

  it("validates active-token ResetPasswordForm, maps 400 token errors, and completes reset", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: false,
            error: {
              code: "INVALID_OR_EXPIRED_TOKEN",
              message: "Invalid token",
            },
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, data: { reset: true } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    try {
      render(
        <PreferencesProvider
          initialLocale="id"
          initialTheme="light"
          hasCookieLocale={true}
          hasCookieTheme={true}
        >
          <ResetPasswordForm initialToken="raw-reset-token-123" />
        </PreferencesProvider>,
      );

      const newPwdInput = screen.getByLabelText("Kata Sandi Baru");
      const confirmInput = screen.getByLabelText("Konfirmasi Kata Sandi Baru");

      // Local validation prevents network call for < 8 chars and password mismatch.
      fireEvent.change(newPwdInput, { target: { value: "short" } });
      fireEvent.change(confirmInput, { target: { value: "different" } });
      fireEvent.click(
        screen.getByRole("button", { name: "Simpan Kata Sandi Baru" }),
      );
      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.getByText("Kata sandi minimal 8 karakter.")).toBeVisible();
      expect(
        screen.getByText("Konfirmasi kata sandi tidak cocok."),
      ).toBeVisible();

      // Valid matching password -> API 400 maps localized token error.
      fireEvent.change(newPwdInput, { target: { value: "newstrongpass99" } });
      fireEvent.change(confirmInput, { target: { value: "newstrongpass99" } });
      fireEvent.click(
        screen.getByRole("button", { name: "Simpan Kata Sandi Baru" }),
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Tautan atur ulang kata sandi tidak valid atau sudah kedaluwarsa.",
      );

      // Retry succeeds -> shows confirmation status and /login link.
      fireEvent.click(
        screen.getByRole("button", { name: "Simpan Kata Sandi Baru" }),
      );

      const status = await screen.findByRole("status");
      expect(status).toHaveTextContent("Kata sandi berhasil diperbarui");
      expect(screen.getByRole("link", { name: "Masuk" })).toHaveAttribute(
        "href",
        "/login",
      );

      const [calledUrl, init] = fetchMock.mock.calls[1] as [
        string,
        RequestInit,
      ];
      expect(calledUrl).toBe("/api/auth/reset-password");
      expect(JSON.parse(String(init.body))).toEqual({
        token: "raw-reset-token-123",
        newPassword: "newstrongpass99",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("enforces server-side session redirects on AppWorkspaceLayout, LoginPage, and RegisterPage", async () => {
    const activeUser = {
      id: "u-1",
      name: "Raka Pratama",
      email: "raka@noka.test",
      locale: "id" as const,
      theme: "light" as const,
      cycleStartDay: "1",
    };

    // Unauthenticated /app layout redirects to /login.
    getSessionUserMock.mockResolvedValueOnce(null);
    await expect(
      AppWorkspaceLayout({ children: <div>Workspace Content</div> }),
    ).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(redirectMock).toHaveBeenCalledWith("/login");

    // Authenticated /app layout renders AppShell with user and LogoutButton.
    getSessionUserMock.mockResolvedValueOnce(activeUser);
    const workspaceTree = await AppWorkspaceLayout({
      children: <div>Protected Workspace Content</div>,
    });
    const { unmount } = render(
      <PreferencesProvider
        initialLocale="id"
        initialTheme="light"
        hasCookieLocale={true}
        hasCookieTheme={true}
      >
        {workspaceTree}
      </PreferencesProvider>,
    );
    expect(screen.getByText("Protected Workspace Content")).toBeVisible();
    expect(screen.getAllByText("Raka Pratama").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Keluar" })).toBeVisible();
    unmount();

    // Authenticated /login and /register (plus /app entry) redirect to /app/notes.
    getSessionUserMock.mockResolvedValueOnce(activeUser);
    await expect(LoginPage()).rejects.toThrow("NEXT_REDIRECT:/app/notes");

    getSessionUserMock.mockResolvedValueOnce(activeUser);
    await expect(RegisterPage()).rejects.toThrow("NEXT_REDIRECT:/app/notes");
    expect(redirectMock).toHaveBeenCalledWith("/app/notes");

    expect(() => AppEntryPage()).toThrow("NEXT_REDIRECT:/app/notes");

    // Unauthenticated /login and /register render their forms cleanly.
    getSessionUserMock.mockResolvedValueOnce(null);
    const loginTree = await LoginPage();
    const loginView = render(
      <PreferencesProvider
        initialLocale="id"
        initialTheme="light"
        hasCookieLocale={true}
        hasCookieTheme={true}
      >
        {loginTree}
      </PreferencesProvider>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Masuk ke Noka" }),
    ).toBeVisible();
    loginView.unmount();

    getSessionUserMock.mockResolvedValueOnce(null);
    const registerTree = await RegisterPage();
    render(
      <PreferencesProvider
        initialLocale="id"
        initialTheme="light"
        hasCookieLocale={true}
        hasCookieTheme={true}
      >
        {registerTree}
      </PreferencesProvider>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Buat Akun Noka" }),
    ).toBeVisible();
  });
});

