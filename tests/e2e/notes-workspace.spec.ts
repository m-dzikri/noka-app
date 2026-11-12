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
    await client.query("DELETE FROM users WHERE email = $1", [email]);
  } finally {
    await client.end();
  }
}

async function assertNoHorizontalOverflow(page: Page, contextLabel: string): Promise<void> {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    overflow.scrollWidth,
    `Horizontal overflow at ${contextLabel}: ${overflow.scrollWidth} > ${overflow.clientWidth}`,
  ).toBeLessThanOrEqual(overflow.clientWidth);
}

test.describe("RFC-004: Notes Workspace E2E (TS-004-04)", () => {
  test("verifies auth redirect -> /app/notes, folder & note lifecycle, checklist reload persistence, pagination, and zero overflow across viewports", async ({
    page,
    baseURL,
  }, testInfo) => {
    const isMobileProject = testInfo.project.name === "mobile";
    const resolvedBaseUrl = (baseURL ?? "http://localhost:3000").replace(/\/+$/, "");
    const email = `e2e-notes-${testInfo.project.name}-${crypto.randomUUID()}@example.test`;
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedResponses: Array<{ status: number; url: string }> = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });
    page.on("response", (res) => {
      if (res.status() >= 400) {
        failedResponses.push({ status: res.status(), url: res.url() });
      }
    });

    try {
      // 1. Register via real UI form -> client redirect lands on /app/notes.
      await page.goto("/register");
      await page.getByLabel("Nama Lengkap").fill("E2E Notes User");
      await page.getByLabel("Alamat Email").fill(email);
      await page.getByLabel("Kata Sandi", { exact: true }).fill("SecretPassword99");
      await page.getByLabel("Konfirmasi Kata Sandi").fill("SecretPassword99");
      await page.getByRole("button", { name: "Daftar & Masuk" }).click();
      await page.waitForURL("**/app/notes");
      await expect(page.getByRole("heading", { level: 1, name: "Catatan" })).toBeVisible();

      // 2. Verify /app and /login redirect authenticated users to /app/notes.
      await page.goto("/app");
      await page.waitForURL("**/app/notes");
      await page.goto("/login");
      await page.waitForURL("**/app/notes");

      if (isMobileProject) {
        // Mobile 375x812 & 360x800 zero-overflow check on list view.
        await page.setViewportSize({ width: 375, height: 812 });
        await assertNoHorizontalOverflow(page, "mobile-notes-375");
        await page.setViewportSize({ width: 360, height: 800 });
        await assertNoHorizontalOverflow(page, "mobile-notes-360");

        // Creating a note on mobile navigates to /app/notes/[id].
        await page.getByRole("button", { name: "Catatan Baru" }).first().click();
        await page.waitForURL("**/app/notes/*");
        await assertNoHorizontalOverflow(page, "mobile-detail-360");
        await page.setViewportSize({ width: 375, height: 812 });
        await assertNoHorizontalOverflow(page, "mobile-detail-375");

        await page.getByLabel("Judul catatan").fill("Catatan Mobile");
        await page
          .getByLabel("Isi Markdown catatan")
          .fill("- [ ] Checklist mobile");
        await expect(page.getByTestId("note-save-status")).toHaveText(
          "Tersimpan",
          { timeout: 5_000 },
        );

        const mobileCheckbox = page.locator('input[data-checklist-index="0"]');
        await expect(mobileCheckbox).not.toBeChecked();
        await mobileCheckbox.click();
        await expect(mobileCheckbox).toBeChecked();
        await expect(page.getByTestId("note-save-status")).toHaveText(
          "Tersimpan",
          { timeout: 5_000 },
        );

        // Reload detail route and confirm DB persistence.
        await page.reload();
        await expect(page.getByLabel("Judul catatan")).toHaveValue("Catatan Mobile");
        await expect(page.locator('input[data-checklist-index="0"]')).toBeChecked();

        // Edit inside 600ms debounce window and tap Back immediately -> flushes before navigating back to /app/notes.
        await page.getByLabel("Judul catatan").fill("Catatan Mobile Cepat");
        await page.getByRole("button", { name: "Kembali ke Catatan" }).click();
        await page.waitForURL("**/app/notes");
        await expect(page.getByText("Catatan Mobile Cepat")).toBeVisible();
      } else {
        // Desktop 1280x800 & tablet 768x1024 overflow checks.
        await page.setViewportSize({ width: 1280, height: 800 });
        await assertNoHorizontalOverflow(page, "desktop-notes-1280");
        await page.setViewportSize({ width: 768, height: 1024 });
        await assertNoHorizontalOverflow(page, "tablet-notes-768");
        await page.setViewportSize({ width: 1280, height: 800 });

        // Open FolderManagerModal and create folder "Skripsi".
        await page.getByRole("button", { name: "Kelola Folder" }).first().click();
        const modal = page.getByRole("dialog");
        await expect(modal).toBeVisible();
        await modal.getByLabel("Nama folder baru").fill("Skripsi");
        await modal.getByRole("button", { name: "Buat Folder" }).click();
        await expect(modal.getByText("Skripsi", { exact: true })).toBeVisible();
        await modal.getByRole("button", { name: "Tutup" }).click();

        // Create note directly in desktop split view.
        await page.getByRole("button", { name: "Catatan Baru" }).first().click();
        const titleInput = page.getByLabel("Judul catatan");
        const contentInput = page.getByLabel("Isi Markdown catatan");
        await expect(titleInput).toBeVisible();

        await titleInput.fill("Rencana Bab 3");
        await contentInput.fill("- [ ] Tulis metode\n- [ ] Cek referensi");
        await expect(page.getByTestId("note-save-status")).toHaveText(
          "Tersimpan",
          { timeout: 5_000 },
        );

        // Toggle pin, select folder, add tag, and toggle first GFM checklist item.
        await page.getByRole("button", { name: "Sematkan catatan" }).click();
        await expect(page.getByTestId("note-save-status")).toHaveText(
          "Tersimpan",
          { timeout: 5_000 },
        );

        const folderSelect = page.getByLabel("Folder");
        const optionValue = await folderSelect
          .locator("option", { hasText: "Skripsi" })
          .getAttribute("value");
        expect(optionValue).toBeTruthy();
        await folderSelect.selectOption(optionValue!);
        await expect(page.getByTestId("note-save-status")).toHaveText(
          "Tersimpan",
          { timeout: 5_000 },
        );

        await page.getByRole("textbox", { name: "Tag" }).fill("riset");
        await page.getByRole("button", { name: "Tambah" }).click();
        await expect(page.getByText("#riset", { exact: true })).toBeVisible();
        await expect(page.getByTestId("note-save-status")).toHaveText(
          "Tersimpan",
          { timeout: 5_000 },
        );

        const desktopCheckbox = page.locator('input[data-checklist-index="0"]');
        await expect(desktopCheckbox).not.toBeChecked();
        await desktopCheckbox.click();
        await expect(desktopCheckbox).toBeChecked();
        await expect(page.getByTestId("note-save-status")).toHaveText(
          "Tersimpan",
          { timeout: 5_000 },
        );

        // Reload page -> verify full persistence in split editor.
        await page.reload();
        await expect(page.getByLabel("Judul catatan")).toHaveValue("Rencana Bab 3");
        await expect(
          page.getByRole("button", { name: "Sematkan catatan" }),
        ).toHaveAttribute("aria-pressed", "true");
        await expect(page.locator('input[data-checklist-index="0"]')).toBeChecked();

        // Seed 50 extra notes via API to verify Load More cursor pagination (limit=50).
        const baseTimestamps = Date.now() - 120_000;
        for (let batch = 0; batch < 2; batch += 1) {
          await Promise.all(
            Array.from({ length: 25 }, (_, offset) => {
              const num = batch * 25 + offset + 1;
              return page.request.post("/api/notes", {
                headers: { origin: resolvedBaseUrl },
                data: {
                  title: `Catatan Arsip ${String(num).padStart(2, "0")}`,
                  content: `Konten arsip ke-${num}`,
                  updatedAt: new Date(baseTimestamps - num * 1_000).toISOString(),
                },
              });
            }),
          );
        }

        await page.reload();
        const loadMoreButton = page.getByRole("button", {
          name: "Muat Lebih Banyak",
        });
        await expect(loadMoreButton).toBeVisible();
        await loadMoreButton.click();
        await expect(page.getByText("Catatan Arsip 50")).toBeVisible();

        // Instant search across notes & clean clear.
        await page.getByLabel("Cari catatan").fill("Tulis metode");
        await expect(page.getByRole("link", { name: /Rencana Bab 3/ })).toBeVisible();
        await expect(page.getByText("Catatan Arsip 50")).toHaveCount(0);
        await page.getByRole("button", { name: "Bersihkan pencarian" }).click();

        // Check EN locale switch keeps workspace functional without overflow.
        await page.getByRole("button", { name: "EN" }).first().click();
        await expect(page.getByRole("heading", { level: 1, name: "Notes" })).toBeVisible();
        await assertNoHorizontalOverflow(page, "desktop-notes-en-1280");
      }

      // Only background Next.js <Link> prefetches to future RFC-006/RFC-008 sibling routes may return 404 at RFC-004 stage.
      const unexpectedFailures = failedResponses.filter((entry) => {
        const pathname = new URL(entry.url).pathname;
        const isDeferredWorkspacePrefetch =
          entry.status === 404 &&
          (pathname === "/app/finance" || pathname === "/app/settings");
        return !isDeferredWorkspacePrefetch;
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
