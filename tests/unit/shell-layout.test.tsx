import { fireEvent, render, screen } from "@testing-library/react";
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
});

