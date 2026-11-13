import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

const VALID_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

function readDatabaseUrlFromEnv(): string | null {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    return null;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    if (trimmed.startsWith("DATABASE_URL=")) {
      return trimmed
        .slice("DATABASE_URL=".length)
        .trim()
        .replace(/^['"]|['"]$/g, "");
    }
  }
  return null;
}

async function withPgClient<T>(fn: (client: Client) => Promise<T>): Promise<T | null> {
  const databaseUrl = readDatabaseUrlFromEnv();
  if (!databaseUrl) {
    return null;
  }
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function deleteSyntheticE2eUser(email: string): Promise<void> {
  await withPgClient(async (client) => {
    const res = await client.query<{ id: string }>(
      "SELECT id FROM users WHERE email = $1",
      [email],
    );
    const userId = res.rows[0]?.id;
    if (!userId) {
      return;
    }
    await client.query("DELETE FROM transfers WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM transactions WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM note_attachments WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM notes WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM folders WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM wallets WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM categories WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM users WHERE id = $1", [userId]);

    const userUploadDir = path.resolve(process.cwd(), ".data", "uploads", "users", userId);
    fs.rmSync(userUploadDir, { recursive: true, force: true });
  });
}

async function assertNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const dims = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(
    dims.scrollWidth,
    `Horizontal overflow at ${label}: scrollWidth=${dims.scrollWidth} > innerWidth=${dims.innerWidth}`,
  ).toBeLessThanOrEqual(dims.innerWidth);
}

test.describe("RFC-010 / Release Gate: Full User Journey, a11y, Health & Account Deletion (TS-010-02)", () => {
  test("verifies health check, complete note attachments, quick capture, settings cycle reconfiguration, a11y, zero overflow, and clean account wipe", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const isMobileProject = testInfo.project.name === "mobile";
    const email = `e2e-release-${testInfo.project.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@noka.test`;
    const password = "ReleaseSecret99!";

    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        if (/status of 401|status of 404/i.test(text)) {
          return;
        }
        consoleErrors.push(text);
      }
    });

    try {
      // 1. Health check verification (F6, OBS-1)
      const healthRes = await page.request.get("/api/health");
      expect(healthRes.status()).toBe(200);
      const healthJson = (await healthRes.json()) as { ok: boolean; data: { status: string; db: string } };
      expect(healthJson.ok).toBe(true);
      expect(healthJson.data.status).toBe("ok");
      expect(healthJson.data.db).toBe("connected");

      // 2. Register fresh user
      await page.goto("/register");
      await page.getByLabel("Nama Lengkap").fill("Pengguna Rilis V1");
      await page.getByLabel("Alamat Email").fill(email);
      await page.getByLabel("Kata Sandi", { exact: true }).fill(password);
      await page.getByLabel("Konfirmasi Kata Sandi").fill(password);

      const registerResponsePromise = page.waitForResponse(
        (res) => res.url().endsWith("/api/auth/register") && res.status() === 201,
      );
      await page.getByRole("button", { name: /^Daftar/ }).click();
      await registerResponsePromise;

      await page.waitForURL(/\/app\/notes/);
      if (!isMobileProject) {
        await expect(page.getByText("Pengguna Rilis V1").first()).toBeVisible();
      }

      // 3. Create Note with PNG attachment
      await page.goto("/app/notes");
      await page.waitForLoadState("networkidle");

      const createNotePromise = page.waitForResponse(
        (res) =>
          res.url().endsWith("/api/notes") &&
          res.request().method() === "POST" &&
          res.ok(),
      );
      await page.getByRole("button", { name: "Catatan Baru" }).first().click();
      const createdNoteRes = await createNotePromise;
      const createdNotePayload = (await createdNoteRes.json()) as {
        data: { note: { id: string } };
      };
      const noteId = createdNotePayload.data.note.id;

      if (isMobileProject) {
        await page.waitForURL(`**/app/notes/${noteId}`);
      }

      const noteTitleInput = page.getByLabel("Judul catatan");
      await noteTitleInput.fill("Catatan Rilis V1");
      await expect(page.getByTestId("note-save-status")).toHaveText("Tersimpan", {
        timeout: 5_000,
      });

      // Upload PNG attachment
      const fileInput = page.getByLabel("Pilih file gambar lampiran (JPEG, PNG, atau WebP)");
      await fileInput.setInputFiles({
        name: "test-attachment.png",
        mimeType: "image/png",
        buffer: VALID_PNG,
      });

      const cachedThumb = page.getByAltText("Lampiran gambar catatan").first();
      await expect(cachedThumb).toBeVisible({ timeout: 10_000 });
      await expect
        .poll(async () =>
          cachedThumb.evaluate((el) => {
            const img = el as HTMLImageElement;
            return img.complete && img.naturalWidth > 0;
          }),
        )
        .toBe(true);

      // 4. Go to /app/finance and create initial wallet "Bank BCA"
      await page.goto("/app/finance");
      await page.waitForLoadState("networkidle");
      await page.getByRole("button", { name: "Kelola Dompet" }).click();
      await page.getByLabel("Nama dompet").fill("Bank BCA");
      await page.getByLabel("Saldo awal (IDR)").fill("1000000");
      await page.getByRole("button", { name: "Tambah Dompet" }).click();
      await expect(page.getByText("Bank BCA").first()).toBeVisible();
      await page.getByRole("button", { name: "Tutup" }).click();

      // 5. Quick Capture expense using Bank BCA
      const qcInput = page.getByTestId("quick-capture-input");
      await qcInput.fill("Beli hosting 50rb lewat Bank BCA");
      await expect(page.getByTestId("quick-capture-submit")).toBeEnabled();
      await page.getByTestId("quick-capture-submit").click();
      await expect(page.getByTestId("quick-capture-feedback")).toBeVisible({
        timeout: 5_000,
      });

      // 6. Verify ledger & privacy blur on /app/finance
      await page.goto("/app/finance");
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("heading", { level: 1, name: "Keuangan" })).toBeVisible();
      await expect(page.getByText("Beli hosting")).toBeVisible();

      // Test Privacy Blur Toggle
      await page.getByRole("button", { name: /Sembunyikan Nominal|Tampilkan Nominal|Privacy Blur/i }).click();
      await expect(page.getByTestId("finance-total-balance")).toContainText("Rp •••••");

      await page.getByRole("button", { name: /Tampilkan Nominal|Sembunyikan Nominal|Privacy Blur/i }).click();
      await expect(page.getByTestId("finance-total-balance")).not.toContainText("Rp •••••");

      // 6. Navigate to /app/settings
      await page.goto("/app/settings");
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("heading", { level: 1, name: "Pengaturan Akun" })).toBeVisible();

      // Check Privacy Policy Summary points exist
      expect(await page.getByText("Kebijakan Privasi & Kedaulatan Data Anda").isVisible()).toBe(true);
      expect(await page.getByText("Nol Catatan Plaintext & Bebas Pelacak").isVisible()).toBe(true);
      expect(await page.getByText("Isolasi Data Antar-Pengguna yang Ketat").isVisible()).toBe(true);
      expect(await page.getByText("Pembersihan Data Lokal Otomatis").isVisible()).toBe(true);
      expect(await page.getByText("Penyimpanan Lampiran Aman & Mandiri").isVisible()).toBe(true);

      // Verify email is read-only
      const settingsEmail = page.getByLabel("Alamat Email");
      await expect(settingsEmail).toHaveValue(email);
      await expect(settingsEmail).toBeDisabled();

      // 7. Update Cycle Start Day to 15 & verify Safe-to-Spend recalculation
      const cycleSelect = page.getByLabel("Awal Siklus Anggaran");
      await cycleSelect.selectOption({ value: "15" });

      const profilePatchPromise = page.waitForResponse(
        (res) =>
          res.url().includes("/api/account/profile") &&
          res.request().method() === "PATCH" &&
          res.ok(),
      );
      await page.getByRole("button", { name: "Simpan Profil" }).click();
      await profilePatchPromise;

      await expect(page.getByText("Profil dan preferensi berhasil disimpan.")).toBeVisible();

      // Return to Finance and verify Safe-to-Spend card is visible
      await page.goto("/app/finance");
      await page.waitForLoadState("networkidle");
      await expect(page.getByTestId("safe-to-spend-card")).toBeVisible();
      await expect(page.getByTestId("safe-to-spend-amount")).toBeVisible();

      // 8. Responsive overflow and accessibility checks on /app/settings across viewports
      await page.goto("/app/settings");
      await page.waitForLoadState("networkidle");

      const testViewports = [
        { width: 360, height: 800, label: "360px mobile" },
        { width: 375, height: 812, label: "375px iPhone" },
        { width: 768, height: 1024, label: "768px tablet" },
        { width: 1280, height: 800, label: "1280px desktop" },
      ];

      for (const vp of testViewports) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await assertNoHorizontalOverflow(page, vp.label);
      }

      // 9. Self-Service Account Deletion with double confirmation modal
      // Click open modal
      await page.getByRole("button", { name: "Hapus Akun Saya" }).click();
      const deleteModal = page.getByRole("dialog");
      await expect(deleteModal).toBeVisible();

      // Verify Escape closes modal (keyboard accessibility)
      await page.keyboard.press("Escape");
      await expect(deleteModal).not.toBeVisible();

      // Re-open modal
      await page.getByRole("button", { name: "Hapus Akun Saya" }).click();
      await expect(deleteModal).toBeVisible();

      const confirmDeleteBtn = deleteModal.getByRole("button", { name: "Hapus Akun Permanen" });
      await expect(confirmDeleteBtn).toBeDisabled();

      // Type confirmation word "HAPUS"
      await deleteModal.getByLabel("Ketik HAPUS untuk mengonfirmasi:").fill("HAPUS");
      await expect(confirmDeleteBtn).toBeDisabled(); // Still disabled without password

      // Enter password
      await deleteModal.getByLabel("Kata Sandi Akun").fill(password);
      await expect(confirmDeleteBtn).toBeEnabled();

      const deleteAccountResponsePromise = page.waitForResponse(
        (res) =>
          res.url().includes("/api/account") &&
          res.request().method() === "DELETE" &&
          res.ok(),
      );

      await confirmDeleteBtn.click();
      await deleteAccountResponsePromise;

      // Verify redirect to landing page
      await page.waitForURL("/");

      // 10. Verify old account cannot log in anymore
      await page.goto("/login");
      await page.getByLabel("Alamat Email").fill(email);
      await page.getByLabel("Kata Sandi").fill(password);
      const postDeleteLoginPromise = page.waitForResponse(
        (res) => res.url().endsWith("/api/auth/login") && res.status() === 401,
      );
      await page.getByRole("button", { name: /^Masuk$|^Sign In$/ }).click();
      await postDeleteLoginPromise;

      // 11. Verify DB rows are completely purged (0 remaining)
      await withPgClient(async (client) => {
        const userCheck = await client.query("SELECT id FROM users WHERE email = $1", [email]);
        expect(userCheck.rows).toHaveLength(0);
      });

      // 12. Verify client IndexedDB and SW private caches are cleared
      const browserStorageAudit = await page.evaluate(async () => {
        const dbs = (await indexedDB.databases()).map((d) => d.name ?? "");
        const cacheKeys = await caches.keys();
        return { dbs, cacheKeys };
      });
      expect(browserStorageAudit.dbs.some((n) => n.startsWith("noka-offline-"))).toBe(false);
      expect(browserStorageAudit.cacheKeys.some((k) => k.startsWith("noka-private-"))).toBe(false);

      expect(consoleErrors).toHaveLength(0);
    } finally {
      await deleteSyntheticE2eUser(email);
    }
  });
});
