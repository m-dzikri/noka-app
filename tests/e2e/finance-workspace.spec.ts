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
    `Horizontal overflow detected at ${label}: scrollWidth=${dims.scrollWidth} > innerWidth=${dims.innerWidth}`,
  ).toBeLessThanOrEqual(dims.innerWidth);
}

test.describe("Finance Workspace Core Ledger E2E (RFC-006)", () => {
  test("manages wallets, transactions, transfers, custom category delete migration, and archive flow cleanly on desktop and mobile", async ({
    page,
  }, testInfo) => {
    const email = `e2e-finance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@noka.test`;
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedResponses: Array<{ url: string; status: number }> = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("pageerror", (err) => {
      pageErrors.push(String(err));
    });
    page.on("response", (res) => {
      if (res.status() >= 400 && res.url().startsWith("http://")) {
        failedResponses.push({ url: res.url(), status: res.status() });
      }
    });

    try {
      await page.goto("/register");
      await page.getByLabel("Nama Lengkap").fill("E2E Finance");
      await page.getByLabel("Alamat Email").fill(email);
      await page.getByLabel("Kata Sandi", { exact: true }).fill("password1234");
      await page.getByLabel("Konfirmasi Kata Sandi").fill("password1234");
      await page.getByRole("button", { name: "Daftar & Masuk" }).click();
      await page.waitForURL("**/app/notes");

      await page.goto("/app/finance");
      await expect(
        page.getByRole("heading", { level: 1, name: "Keuangan" }),
      ).toBeVisible();
      await assertNoHorizontalOverflow(page, `${testInfo.project.name}-initial`);

      // Create 2 wallets: Tunai (500.000) & BCA (1.000.000)
      await page.getByRole("button", { name: "Kelola Dompet" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      await dialog.getByLabel("Nama dompet").fill("Kas Tunai");
      await dialog.getByLabel("Saldo awal (IDR)").fill("500000");
      await dialog.getByRole("button", { name: "Tambah Dompet" }).click();
      await expect(dialog.getByText("Kas Tunai")).toBeVisible();

      await dialog.getByLabel("Nama dompet").fill("Bank BCA");
      await dialog.getByLabel("Tipe dompet").selectOption("bank");
      await dialog.getByLabel("Saldo awal (IDR)").fill("1000000");
      await dialog.getByRole("button", { name: "Tambah Dompet" }).click();
      await expect(dialog.getByText("Bank BCA")).toBeVisible();

      await dialog.getByRole("button", { name: "Tutup" }).click();
      await expect(page.getByTestId("finance-total-balance")).toHaveText(
        "Rp1.500.000",
      );

      // Record Expense 50.000 on Kas Tunai
      await page.getByRole("button", { name: "Catat Transaksi" }).click();
      const txDialog = page.getByRole("dialog");
      await txDialog.getByLabel("Nominal (IDR)").fill("50000");
      await txDialog.getByLabel("Deskripsi (opsional)").fill("Sarapan E2E");
      await txDialog.getByRole("button", { name: "Simpan Transaksi" }).click();

      await expect(page.getByText("Sarapan E2E")).toBeVisible();
      await expect(page.getByTestId("finance-total-balance")).toHaveText(
        "Rp1.450.000",
      );

      // Transfer 200.000 from Bank BCA to Kas Tunai -> total stays Rp1.450.000
      await page.getByRole("button", { name: "Transfer Dompet" }).click();
      const transferDialog = page.getByRole("dialog");
      await transferDialog
        .getByLabel("Dari dompet")
        .selectOption({ label: "Bank BCA" });
      await transferDialog
        .getByLabel("Ke dompet")
        .selectOption({ label: "Kas Tunai" });
      await transferDialog.getByLabel("Nominal transfer (IDR)").fill("200000");
      await transferDialog.getByLabel("Catatan (opsional)").fill("Topup Tunai");
      await transferDialog.getByRole("button", { name: "Kirim Transfer" }).click();

      await page.getByRole("tab", { name: "Transfer Antar-Dompet" }).click();
      await expect(page.getByText("Topup Tunai")).toBeVisible();
      await expect(page.getByTestId("finance-total-balance")).toHaveText(
        "Rp1.450.000",
      );

      // Custom Category Create & Delete
      await page.getByRole("button", { name: "Kelola Kategori" }).click();
      const catDialog = page.getByRole("dialog");
      await catDialog.getByLabel("Nama kategori").fill("Hobi E2E");
      await catDialog.getByRole("button", { name: "Buat Kategori" }).click();
      await expect(catDialog.getByText("Hobi E2E")).toBeVisible();
      await catDialog
        .locator("li", { hasText: "Hobi E2E" })
        .getByRole("button", { name: "Hapus" })
        .click();
      await expect(catDialog.getByText("Hobi E2E")).toHaveCount(0);
      await catDialog.getByRole("button", { name: "Tutup" }).first().click();

      // Locale toggle ID -> EN without losing state
      if (testInfo.project.name === "desktop") {
        await page.getByRole("button", { name: "EN" }).first().click();
        await expect(
          page.getByRole("heading", { level: 1, name: "Finance" }),
        ).toBeVisible();
      }
      await assertNoHorizontalOverflow(page, `${testInfo.project.name}-after`);

      // Only /app/settings background <Link> prefetch (RFC-008/RFC-010) may 404 right now.
      const unexpectedFailures = failedResponses.filter((entry) => {
        const pathname = new URL(entry.url).pathname;
        return !(entry.status === 404 && pathname === "/app/settings");
      });
      expect(unexpectedFailures).toEqual([]);

      const unexpectedConsoleErrors = consoleErrors.filter(
        (msg) =>
          !(
            msg ===
              "Failed to load resource: the server responded with a status of 404 (Not Found)" &&
            unexpectedFailures.length === 0
          ),
      );
      expect(unexpectedConsoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
    } finally {
      await deleteSyntheticE2eUser(email);
    }
  });
});

