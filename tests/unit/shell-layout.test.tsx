import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routerPushMock = vi.fn();
let mockedPathname = "/app/notes";

vi.mock("next/navigation", () => ({
  usePathname: () => mockedPathname,
  useRouter: () => ({
    push: routerPushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import AuthLayout from "@/app/(auth)/layout";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { AppOverview } from "@/components/layout/AppOverview";
import { AppShell } from "@/components/layout/AppShell";
import { PreferencesProvider } from "@/components/providers/PreferencesProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

function ModalTestHarness() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <Button onClick={() => setOpen(true)}>Buka Modal</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Judul Dialog"
        description="Deskripsi singkat dialog"
      >
        <Input label="Nama Dompet" />
        <Button onClick={() => setOpen(false)}>Simpan</Button>
      </Modal>
    </div>
  );
}

describe("UI primitives, AppShell & accessible Modal (TS-001-07)", () => {
  beforeEach(() => {
    routerPushMock.mockClear();
    mockedPathname = "/app/notes";
  });

  it("renders separate workspace routes, user badge, and AppOverview quick links", () => {
    render(
      <PreferencesProvider
        initialLocale="id"
        initialTheme="light"
        hasCookieLocale={true}
        hasCookieTheme={true}
      >
        <AppShell
          user={{ id: "u1", name: "Dzikri", email: "dzikri@example.test" }}
          quickCaptureSlot={<div>Quick Slot</div>}
        >
          <AppOverview />
        </AppShell>
      </PreferencesProvider>,
    );

    expect(screen.getByTestId("app-shell-user-badge")).toHaveTextContent(
      "Dzikri",
    );
    expect(screen.getByText("Quick Slot")).toBeInTheDocument();

    const notesLinks = screen.getAllByRole("link", { name: /Catatan/i });
    const financeLinks = screen.getAllByRole("link", { name: /Keuangan/i });
    const settingsLinks = screen.getAllByRole("link", { name: /Pengaturan/i });

    expect(notesLinks[0]).toHaveAttribute("href", "/app/notes");
    expect(notesLinks[0]).toHaveAttribute("aria-current", "page");
    expect(financeLinks[0]).toHaveAttribute("href", "/app/finance");
    expect(settingsLinks[0]).toHaveAttribute("href", "/app/settings");

    expect(screen.getByRole("link", { name: /Buka Catatan/i })).toHaveAttribute(
      "href",
      "/app/notes",
    );
    expect(screen.getByRole("link", { name: /Buka Keuangan/i })).toHaveAttribute(
      "href",
      "/app/finance",
    );
  });

  it("handles mobile quick action focus fallback and /app/notes navigation fallback", () => {
    const { rerender } = render(
      <PreferencesProvider
        initialLocale="id"
        initialTheme="light"
        hasCookieLocale={true}
        hasCookieTheme={true}
      >
        <AppShell>
          <input id="noka-quick-capture-input" aria-label="Quick capture" />
        </AppShell>
      </PreferencesProvider>,
    );

    const mobileAction = screen.getByRole("button", { name: /Catat Cepat/i });
    fireEvent.click(mobileAction);
    expect(document.activeElement).toBe(
      document.getElementById("noka-quick-capture-input"),
    );
    expect(routerPushMock).not.toHaveBeenCalled();

    rerender(
      <PreferencesProvider
        initialLocale="id"
        initialTheme="light"
        hasCookieLocale={true}
        hasCookieTheme={true}
      >
        <AppShell>
          <div>Tanpa input quick capture</div>
        </AppShell>
      </PreferencesProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Catat Cepat/i }));
    expect(routerPushMock).toHaveBeenCalledWith("/app/notes");

    const customAction = vi.fn();
    rerender(
      <PreferencesProvider
        initialLocale="id"
        initialTheme="light"
        hasCookieLocale={true}
        hasCookieTheme={true}
      >
        <AppShell onMobileQuickAction={customAction}>
          <div>Custom action</div>
        </AppShell>
      </PreferencesProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Catat Cepat/i }));
    expect(customAction).toHaveBeenCalledTimes(1);
  });

  it("enforces ARIA dialog semantics, focus trap, Escape, backdrop close, and Input/Button wiring", () => {
    render(
      <PreferencesProvider
        initialLocale="id"
        initialTheme="light"
        hasCookieLocale={true}
        hasCookieTheme={true}
      >
        <ModalTestHarness />
        <Input label="Email" error="Wajib diisi" />
      </PreferencesProvider>,
    );

    const erroredInput = screen.getByLabelText("Email");
    expect(erroredInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Wajib diisi");

    const trigger = screen.getByRole("button", { name: "Buka Modal" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveTextContent("Judul Dialog");

    const closeBtn = screen.getByRole("button", { name: "Tutup" });
    const saveBtn = screen.getByRole("button", { name: "Simpan" });

    // Forward Tab from last focusable element wraps to first (close button).
    saveBtn.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(closeBtn);

    // Reverse Tab from first focusable element wraps to last.
    closeBtn.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(saveBtn);

    // Escape closes and restores focus to trigger.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);

    // Backdrop click also closes.
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("modal-backdrop"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps focus on a controlled input in Modal across parent re-renders with inline onClose", () => {
    function ControlledModalHarness() {
      const [open, setOpen] = useState(true);
      const [walletName, setWalletName] = useState("");

      return (
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title="Tambah Dompet"
        >
          <Input
            label="Nama Dompet Controlled"
            value={walletName}
            onChange={(event) => setWalletName(event.target.value)}
          />
          <Button onClick={() => setOpen(false)}>Tutup</Button>
        </Modal>
      );
    }

    render(<ControlledModalHarness />);

    const closeTopButton = screen.getByRole("button", { name: "Close" });
    expect(document.activeElement).toBe(closeTopButton);

    const controlledInput = screen.getByLabelText(
      "Nama Dompet Controlled",
    ) as HTMLInputElement;
    controlledInput.focus();
    expect(document.activeElement).toBe(controlledInput);

    // Triggering controlled state updates creates a new inline onClose reference on every keystroke.
    fireEvent.change(controlledInput, { target: { value: "B" } });
    expect(document.activeElement).toBe(controlledInput);

    fireEvent.change(controlledInput, { target: { value: "BCA Utama" } });
    expect(controlledInput.value).toBe("BCA Utama");
    expect(document.activeElement).toBe(controlledInput);
  });

  it("renders accessible danger button tokens, AppOverview h1 heading, and boundary-safe mobile nav", () => {
    render(
      <PreferencesProvider
        initialLocale="id"
        initialTheme="light"
        hasCookieLocale={true}
        hasCookieTheme={true}
      >
        <AppShell currentPath="/app/notes-archive">
          <AppOverview />
          <Button variant="danger">Hapus Dompet</Button>
        </AppShell>
      </PreferencesProvider>,
    );

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Selamat datang di Noka");

    const dangerBtn = screen.getByRole("button", { name: "Hapus Dompet" });
    expect(dangerBtn.className).toContain("bg-[var(--danger-bg)]");
    expect(dangerBtn.className).toContain("text-[var(--danger-fg)]");
    expect(dangerBtn.className).not.toContain("bg-[var(--status-expense)]");

    // Prefix lookalike /app/notes-archive must not mark /app/notes active on desktop or mobile nav.
    const notesLinks = screen.getAllByRole("link", { name: /^Catatan$/i });
    expect(notesLinks).toHaveLength(2);
    for (const link of notesLinks) {
      expect(link).not.toHaveAttribute("aria-current", "page");
    }
  });

  it("handles AppShell mobile hamburger drawer, icon-only ThemeToggle, outside click, logo click, and Escape focus restore", () => {
    render(
      <div onClick={(event) => event.preventDefault()}>
        <PreferencesProvider
          initialLocale="id"
          initialTheme="light"
          hasCookieLocale={true}
          hasCookieTheme={true}
        >
          <AppShell
            user={{ id: "u1", name: "Dzikri", email: "dzikri@example.test" }}
            logoutSlot={<button type="button">Keluar</button>}
          >
            <div data-testid="app-outside-content">Isi workspace</div>
          </AppShell>
        </PreferencesProvider>
      </div>,
    );

    const hamburger = screen.getByRole("button", {
      name: "Buka menu navigasi",
    });
    expect(hamburger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("app-shell-mobile-menu")).toBeNull();

    // Open mobile drawer and inspect rendered controls inside the drawer only.
    fireEvent.click(hamburger);
    expect(hamburger).toHaveAttribute("aria-expanded", "true");
    const mobileMenu = screen.getByTestId("app-shell-mobile-menu");
    const drawer = within(mobileMenu);
    const drawerNav = drawer.getByRole("navigation", { name: "Menu seluler" });
    expect(drawerNav.className).toContain("flex-col");
    expect(drawerNav.children.length).toBe(4);

    expect(drawer.getByText("Bahasa")).toBeInTheDocument();
    expect(drawer.getByText("Tema")).toBeInTheDocument();
    expect(drawer.getByRole("button", { name: "ID" })).toBeInTheDocument();
    expect(drawer.getByRole("button", { name: "EN" })).toBeInTheDocument();
    const drawerThemeBtn = drawer.getByRole("button", { name: /mode gelap/i });
    expect(drawerThemeBtn).toHaveAttribute("aria-pressed", "false");
    expect(drawerThemeBtn.textContent?.trim()).toBe("");
    expect(drawer.getByText("Dzikri")).toBeInTheDocument();
    expect(drawer.getByRole("button", { name: "Keluar" })).toBeInTheDocument();

    // Escape closes mobile drawer and restores focus to hamburger trigger.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("app-shell-mobile-menu")).toBeNull();
    expect(hamburger).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(hamburger);

    // Clicking outside the header closes an open drawer.
    fireEvent.click(hamburger);
    expect(screen.getByTestId("app-shell-mobile-menu")).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByTestId("app-outside-content"));
    expect(screen.queryByTestId("app-shell-mobile-menu")).toBeNull();

    // Clicking brand logo /app closes an open drawer.
    fireEvent.click(hamburger);
    expect(screen.getByTestId("app-shell-mobile-menu")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Noka" }));
    expect(screen.queryByTestId("app-shell-mobile-menu")).toBeNull();
  });

  it("handles LandingHeader guest and authenticated mobile drawer navigation, locale switching, outside click, logo click, and Escape focus restore", () => {
    const { rerender } = render(
      <div onClick={(event) => event.preventDefault()}>
        <PreferencesProvider
          initialLocale="id"
          initialTheme="light"
          hasCookieLocale={true}
          hasCookieTheme={true}
        >
          <div>
            <LandingHeader isAuthenticated={false} />
            <div data-testid="landing-outside-content">Bagian konten publik</div>
          </div>
        </PreferencesProvider>
      </div>,
    );

    const openTrigger = screen.getByRole("button", {
      name: "Buka menu navigasi",
    });
    expect(openTrigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("landing-mobile-menu")).toBeNull();

    // Guest mode drawer checks + instant EN toggle inside drawer.
    fireEvent.click(openTrigger);
    expect(openTrigger).toHaveAttribute("aria-expanded", "true");
    const guestMenu = screen.getByTestId("landing-mobile-menu");
    const guestDrawer = within(guestMenu);
    const guestDrawerNav = guestDrawer.getByRole("navigation", {
      name: "Menu seluler",
    });
    expect(guestDrawerNav.className).toContain("flex-col");
    expect(guestMenu.innerHTML).not.toContain("grid-cols-2");

    expect(guestDrawer.getByText("Bahasa")).toBeInTheDocument();
    expect(guestDrawer.getByText("Tema")).toBeInTheDocument();
    expect(
      guestDrawer.getByRole("link", { name: "Pratinjau" }),
    ).toHaveAttribute("href", "#preview");
    expect(guestDrawer.getByRole("link", { name: "Fitur" })).toHaveAttribute(
      "href",
      "#features",
    );

    expect(guestDrawer.getByRole("link", { name: "Masuk" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(guestDrawer.getByRole("link", { name: "Daftar" })).toHaveAttribute(
      "href",
      "/register",
    );
    expect(
      guestDrawer.queryByRole("link", { name: "Buka Workspace" }),
    ).toBeNull();
    const guestThemeBtn = guestDrawer.getByRole("button", {
      name: /mode gelap/i,
    });
    expect(guestThemeBtn.textContent?.trim()).toBe("");

    fireEvent.click(guestDrawer.getByRole("button", { name: "EN" }));
    expect(guestDrawer.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(guestDrawer.getByRole("link", { name: "Sign up" })).toHaveAttribute(
      "href",
      "/register",
    );

    // Clicking an action link inside the mobile drawer closes it via onNavigate.
    fireEvent.click(guestDrawer.getByRole("link", { name: "Sign in" }));
    expect(screen.queryByTestId("landing-mobile-menu")).toBeNull();

    // Re-open and press Escape -> restores focus to hamburger trigger.
    const enTrigger = screen.getByRole("button", {
      name: "Open navigation menu",
    });
    fireEvent.click(enTrigger);
    expect(screen.getByTestId("landing-mobile-menu")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("landing-mobile-menu")).toBeNull();
    expect(document.activeElement).toBe(enTrigger);

    // Switch to authenticated state and test /app CTA, outside pointerdown dismissal, and logo close.
    rerender(
      <div onClick={(event) => event.preventDefault()}>
        <PreferencesProvider
          initialLocale="id"
          initialTheme="light"
          hasCookieLocale={true}
          hasCookieTheme={true}
        >
          <div>
            <LandingHeader isAuthenticated={true} />
            <div data-testid="landing-outside-content">Bagian konten publik</div>
          </div>
        </PreferencesProvider>
      </div>,
    );

    fireEvent.click(enTrigger);
    const authDrawer = within(screen.getByTestId("landing-mobile-menu"));
    expect(
      authDrawer.getByRole("link", { name: "Open Workspace" }),
    ).toHaveAttribute("href", "/app");
    expect(authDrawer.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(authDrawer.queryByRole("link", { name: "Sign up" })).toBeNull();

    fireEvent.pointerDown(screen.getByTestId("landing-outside-content"));
    expect(screen.queryByTestId("landing-mobile-menu")).toBeNull();

    fireEvent.click(enTrigger);
    expect(screen.getByTestId("landing-mobile-menu")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Noka" }));
    expect(screen.queryByTestId("landing-mobile-menu")).toBeNull();
  });

  it("renders AuthLayout as a floating pill header without a mobile hamburger toggle", () => {
    const { container } = render(
      <PreferencesProvider
        initialLocale="id"
        initialTheme="light"
        hasCookieLocale={true}
        hasCookieTheme={true}
      >
        <AuthLayout>
          <div>Form Auth</div>
        </AuthLayout>
      </PreferencesProvider>,
    );

    const header = container.querySelector("header");
    expect(header).not.toBeNull();
    expect(header?.querySelector(".rounded-full")).not.toBeNull();
    expect(header?.querySelector("button[aria-controls]")).toBeNull();
    expect(screen.getByRole("button", { name: "ID" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /mode gelap/i }),
    ).toBeInTheDocument();
  });
});

