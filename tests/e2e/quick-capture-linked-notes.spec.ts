import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

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

async function deleteSyntheticE2eUser(email: string): Promise<void> {
  const databaseUrl = readDatabaseUrlFromEnv();
  if (!databaseUrl) {
    return;
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const userRes = await client.query<{ id: string }>(
      "SELECT id FROM users WHERE email = $1",
      [email],
    );
    const userId = userRes.rows[0]?.id;
    if (!userId) {
      return;
    }
    await client.query("DELETE FROM transactions WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM transfers WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM notes WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM wallets WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM categories WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM users WHERE id = $1", [userId]);
  } finally {
    await client.end();
  }
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

test.describe("RFC-008: Quick Capture & Linked Notes <-> Transactions E2E", () => {
  test("verifies dual-intent Quick Capture, live workspace updates without losing unsaved draft, Privacy Blur, Linked Notes CRUD/summary, ledger backlinks, and unlink/delete safety", async ({
    page,
  }, testInfo) => {
    const isMobileProject = testInfo.project.name === "mobile";
    const email = `e2e-synergy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@noka.test`;
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const serverErrors: Array<{ url: string; status: number }> = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });
    page.on("response", (res) => {
      if (res.status() >= 500) {
        serverErrors.push({ url: res.url(), status: res.status() });
      }
    });

    try {
      // 1. Register user via UI
      await page.goto("/register");
      await page.getByLabel("Nama Lengkap").fill("E2E Synergy User");
      await page.getByLabel("Alamat Email").fill(email);
      await page.getByLabel("Kata Sandi", { exact: true }).fill("SecretPassword99");
      await page.getByLabel("Konfirmasi Kata Sandi").fill("SecretPassword99");
      await page.getByRole("button", { name: "Daftar" }).click();
      await page.waitForURL(/\/app\/notes/);
      await assertNoHorizontalOverflow(page, "initial /app/notes");

      // 2. Verify 0-wallet guard cleanly blocks transaction mode without throwing
      const qcInput = page.getByTestId("quick-capture-input");
      await qcInput.fill("Beli kopi 25rb");
      await expect(page.getByTestId("quick-capture-zero-wallet-guard")).toBeVisible();
      await expect(page.getByTestId("quick-capture-submit")).toBeDisabled();

      // 3. Go to /app/finance and create Bank BCA (Rp 500.000)
      await page.goto("/app/finance");
      await assertNoHorizontalOverflow(page, "/app/finance");
      await page.getByRole("button", { name: "Kelola Dompet" }).click();
      await page.getByLabel("Nama dompet").fill("Bank BCA");
      await page.getByLabel("Saldo awal (IDR)").fill("500000");
      await page.getByRole("button", { name: "Tambah Dompet" }).click();
      await expect(page.getByText("Bank BCA").first()).toBeVisible();
      await page.getByRole("button", { name: "Tutup" }).click();

      // 4. Reload cleanly on /app/notes so QuickCaptureBar has Bank BCA, create an initial note & draft unsaved content (desktop split-view)
      await page.goto("/app/notes");
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("button", { name: "Catatan Baru" }).first()).toBeVisible();
      if (!isMobileProject) {
        await page.getByRole("button", { name: "Catatan Baru" }).first().click();
        const titleInput = page.getByLabel("Judul catatan");
        await titleInput.fill("Catatan Proyek Aktif");
        const contentInput = page.getByLabel("Isi Markdown catatan");
        await contentInput.fill("Draft belum tersimpan di editor");
      }

      // 5. Capture Quick Note via Ctrl+K shortcut without losing unsaved editor draft
      await qcInput.waitFor({ state: "visible" });
      await expect(page.getByTestId("quick-capture-mode-note")).toBeEnabled();
      await page.keyboard.press("Control+k");
      if (!(await qcInput.evaluate((el) => document.activeElement === el))) {
        await page.keyboard.press("Control+k");
      }
      await expect(qcInput).toBeFocused();
      await qcInput.fill("Meeting proyek besok jam 10");
      await expect(page.getByTestId("quick-capture-intent-badge")).toContainText(
        "Otomatis: Catatan",
      );
      await qcInput.press("Enter");
      await expect(page.getByTestId("quick-capture-feedback")).toBeVisible();

      if (!isMobileProject) {
        await expect(
          page.getByLabel("Isi Markdown catatan"),
        ).toHaveValue("Draft belum tersimpan di editor");
        await expect(page.getByTestId("note-save-status")).toHaveText(
          "Tersimpan",
          { timeout: 5_000 },
        );
      }

      // 6. Capture Quick Transaction + verify Privacy Blur masks preview
      await qcInput.fill("Beli kopi 25rb lewat Bank BCA");
      await expect(page.getByTestId("quick-capture-intent-badge")).toContainText(
        "Otomatis: Transaksi",
      );
      await expect(page.getByTestId("quick-capture-amount-preview")).toContainText(
        /Rp\s*25\.000/,
      );

      // Toggle Privacy Blur ON -> masked
      await page.getByRole("button", { name: /Sembunyikan Nominal|Privacy Blur/i }).click();
      await expect(page.getByTestId("quick-capture-amount-preview")).toContainText(
        "Rp •••••",
      );
      // Toggle Privacy Blur OFF -> visible again
      await page.getByRole("button", { name: /Tampilkan Nominal|Privacy Blur/i }).click();
      await expect(page.getByTestId("quick-capture-amount-preview")).toContainText(
        /Rp\s*25\.000/,
      );

      await qcInput.press("Enter");
      await expect(page.getByTestId("quick-capture-feedback")).toContainText(
        "Transaksi berhasil dicatat.",
      );

      // 7. Create a dedicated Trip note to test Linked Transactions UI end-to-end
      await page.goto("/app/notes");
      await page.getByRole("button", { name: "Catatan Baru" }).first().click();
      if (isMobileProject) {
        await page.waitForURL(/\/app\/notes\/[0-9a-f-]+/);
      }
      const patchTitlePromise = page.waitForResponse(
        (res) =>
          res.url().includes("/api/notes/") &&
          !res.url().includes("/transactions") &&
          res.request().method() === "PATCH" &&
          res.ok(),
      );
      await page.getByLabel("Judul catatan").fill("Anggaran Trip Bandung");
      await patchTitlePromise;
      await expect(page.getByTestId("note-save-status")).toHaveText(
        "Tersimpan",
        { timeout: 5_000 },
      );

      // Link existing transaction ("Beli kopi")
      await page.getByTestId("linked-tx-open-picker").click();
      await expect(page.getByText(/Beli kopi/).first()).toBeVisible();
      await page.locator("[data-testid^='linked-tx-pick-']").first().click();
      await expect(page.getByTestId("linked-tx-list")).toContainText("Beli kopi");
      await expect(page.getByTestId("linked-tx-summary")).toContainText(/25\.000/);

      // Create & link an Income transaction
      await page.getByTestId("linked-tx-open-create").click();
      const createDialog = page.getByRole("dialog");
      await createDialog.getByLabel("Jenis").selectOption("income");
      await createDialog.getByTestId("linked-tx-create-amount").fill("100000");
      await createDialog
        .getByTestId("linked-tx-create-description")
        .fill("Reimburse kopi");
      await createDialog.getByTestId("linked-tx-create-submit").click();

      await expect(page.getByTestId("linked-tx-list")).toContainText("Reimburse kopi");
      await expect(page.getByTestId("linked-tx-summary")).toContainText(/100\.000/);
      await expect(page.getByTestId("linked-tx-summary")).toContainText(/75\.000/);
      await assertNoHorizontalOverflow(page, "linked transactions panel");

      // 8. Verify Finance ledger shows clickable backlink pill -> opens linked note
      await page.goto("/app/finance");
      const linkedNoteLink = page
        .locator("[data-testid^='ledger-linked-note-']")
        .filter({ hasText: "Anggaran Trip Bandung" })
        .first();
      await expect(linkedNoteLink).toBeVisible();
      await linkedNoteLink.click();
      await page.waitForURL(/\/app\/notes\/[0-9a-f-]+/);
      await expect(page.getByTestId("note-linked-transactions-panel")).toBeVisible();

      // 9. Unlink first transaction, then delete the note -> both txs stay intact in Finance!
      await page.locator("[data-testid^='linked-tx-unlink-']").first().click();
      await expect(page.locator("[data-testid^='linked-tx-row-']")).toHaveCount(1);

      await page.getByRole("button", { name: "Hapus" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Hapus" }).click();
      await page.waitForURL(/\/app\/notes$/);

      await page.goto("/app/finance");
      await expect(page.getByText("Reimburse kopi")).toBeVisible();
      await expect(page.getByText(/Beli kopi/).first()).toBeVisible();
      await expect(page.locator("[data-testid^='ledger-linked-note-']")).toHaveCount(0);
      await assertNoHorizontalOverflow(page, "final /app/finance");

      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
      expect(serverErrors).toEqual([]);
    } finally {
      await deleteSyntheticE2eUser(email);
    }
  });
});
