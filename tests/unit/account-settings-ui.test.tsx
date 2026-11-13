import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChangePasswordForm } from "@/components/settings/ChangePasswordForm";
import { DeleteAccountSection } from "@/components/settings/DeleteAccountSection";
import { ProfileSettingsForm } from "@/components/settings/ProfileSettingsForm";
import { SettingsWorkspace } from "@/components/settings/SettingsWorkspace";
import { PreferencesProvider } from "@/components/providers/PreferencesProvider";
import type { AuthUser } from "@/features/auth/session";

const { routerPushMock } = vi.hoisted(() => ({
  routerPushMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/app/settings",
}));

const mockUser: AuthUser = {
  id: "test-user-uuid",
  name: "Budi Santoso",
  email: "budi@example.com",
  locale: "id",
  theme: "light",
  cycleStartDay: "1",
};

describe("Account Settings UI Components (TS-010)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function renderWithProviders(ui: React.ReactElement, initialLocale: "id" | "en" = "id") {
    return render(
      <PreferencesProvider initialLocale={initialLocale} initialTheme="light">
        {ui}
      </PreferencesProvider>,
    );
  }

  it("renders SettingsWorkspace with all cards, headings, and privacy policy points", () => {
    renderWithProviders(<SettingsWorkspace initialUser={mockUser} />);

    expect(screen.getByRole("heading", { level: 1, name: "Pengaturan Akun" })).toBeInTheDocument();
    expect(screen.getByText("Profil & Preferensi")).toBeInTheDocument();
    expect(screen.getByText("Ubah Kata Sandi")).toBeInTheDocument();
    expect(screen.getByText("Kebijakan Privasi & Kedaulatan Data Anda")).toBeInTheDocument();
    expect(screen.getByText("Hapus Akun Mandiri")).toBeInTheDocument();

    // Verify 4 privacy summary points
    expect(screen.getByText("Nol Catatan Plaintext & Bebas Pelacak")).toBeInTheDocument();
    expect(screen.getByText("Isolasi Data Antar-Pengguna yang Ketat")).toBeInTheDocument();
    expect(screen.getByText("Pembersihan Data Lokal Otomatis")).toBeInTheDocument();
    expect(screen.getByText("Penyimpanan Lampiran Aman & Mandiri")).toBeInTheDocument();
  });

  it("renders ProfileSettingsForm with read-only email, prefilled values, and handles profile submit", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            user: {
              ...mockUser,
              name: "Budi Santoso Baru",
              cycleStartDay: "15",
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    renderWithProviders(<ProfileSettingsForm initialUser={mockUser} />);

    const emailInput = screen.getByLabelText("Alamat Email");
    expect(emailInput).toHaveValue("budi@example.com");
    expect(emailInput).toBeDisabled();

    const nameInput = screen.getByLabelText("Nama Lengkap");
    expect(nameInput).toHaveValue("Budi Santoso");

    fireEvent.change(nameInput, { target: { value: "Budi Santoso Baru" } });
    const cycleSelect = screen.getByLabelText("Awal Siklus Anggaran");
    fireEvent.change(cycleSelect, { target: { value: "15" } });

    const submitBtn = screen.getByRole("button", { name: "Simpan Profil" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/account/profile",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            name: "Budi Santoso Baru",
            locale: "id",
            theme: "light",
            cycleStartDay: "15",
          }),
        }),
      );
    });

    expect(await screen.findByText("Profil dan preferensi berhasil disimpan.")).toBeInTheDocument();
  });

  it("handles ChangePasswordForm client-side mismatch check and server 401 INVALID_CURRENT_PASSWORD", async () => {
    renderWithProviders(<ChangePasswordForm />);

    const currentPass = screen.getByLabelText("Kata Sandi Saat Ini");
    const newPass = screen.getByLabelText("Kata Sandi Baru");
    const confirmPass = screen.getByLabelText("Konfirmasi Kata Sandi Baru");

    fireEvent.change(currentPass, { target: { value: "oldpass123" } });
    fireEvent.change(newPass, { target: { value: "newpassword123" } });
    fireEvent.change(confirmPass, { target: { value: "different123" } });

    const submitBtn = screen.getByRole("button", { name: "Perbarui Kata Sandi" });
    fireEvent.click(submitBtn);

    // Client-side mismatch error
    expect(await screen.findByText("Konfirmasi kata sandi baru tidak cocok.")).toBeInTheDocument();

    // Match passwords but simulate server error 401 INVALID_CURRENT_PASSWORD
    fireEvent.change(confirmPass, { target: { value: "newpassword123" } });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: "INVALID_CURRENT_PASSWORD",
            message: "Kata sandi saat ini tidak sesuai.",
          },
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      ),
    );

    fireEvent.click(submitBtn);

    expect(await screen.findByText("Kata sandi saat ini tidak sesuai.")).toBeInTheDocument();
  });

  it("handles DeleteAccountSection double confirmation modal and word matching", async () => {
    renderWithProviders(<DeleteAccountSection />);

    const openModalBtn = screen.getByRole("button", { name: "Hapus Akun Saya" });
    fireEvent.click(openModalBtn);

    expect(screen.getByRole("heading", { name: "Konfirmasi Penghapusan Akun" })).toBeInTheDocument();

    const deleteBtn = screen.getByRole("button", { name: "Hapus Akun Permanen" });
    // Button is disabled until word is typed AND password is typed
    expect(deleteBtn).toBeDisabled();

    const confirmWordInput = screen.getByLabelText("Ketik HAPUS untuk mengonfirmasi:");
    const passwordInput = screen.getByLabelText("Kata Sandi Akun");

    fireEvent.change(confirmWordInput, { target: { value: "HAPUS" } });
    expect(deleteBtn).toBeDisabled(); // still need password

    fireEvent.change(passwordInput, { target: { value: "mypassword" } });
    expect(deleteBtn).toBeEnabled();

    // Cancel closes modal
    const cancelBtn = screen.getByRole("button", { name: "Batal, Pertahankan Akun" });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Konfirmasi Penghapusan Akun" })).not.toBeInTheDocument();
    });
  });

  it("renders in English when initialLocale is 'en'", () => {
    renderWithProviders(<SettingsWorkspace initialUser={{ ...mockUser, locale: "en" }} />, "en");

    expect(screen.getByRole("heading", { level: 1, name: "Account Settings" })).toBeInTheDocument();
    expect(screen.getByText("Profile & Preferences")).toBeInTheDocument();
    expect(screen.getByText("Change Password")).toBeInTheDocument();
    expect(screen.getByText("Self-Service Account Deletion")).toBeInTheDocument();
  });
});
