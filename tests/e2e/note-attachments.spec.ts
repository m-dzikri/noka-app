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

async function cleanupSyntheticE2eUserAndUploads(email: string): Promise<void> {
  const databaseUrl = readDatabaseUrlFromEnv();
  if (!databaseUrl) {
    return;
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const res = await client.query<{ id: string }>(
      "SELECT id FROM users WHERE email = $1",
      [email],
    );
    const userId = res.rows[0]?.id;
    await client.query("DELETE FROM users WHERE email = $1", [email]);
    if (userId) {
      const userUploadDir = path.resolve(process.cwd(), ".data", "uploads", "users", userId);
      fs.rmSync(userUploadDir, { recursive: true, force: true });
    }
  } finally {
    await client.end();
  }
}

async function assertNoHorizontalOverflow(
  page: Page,
  contextLabel: string,
): Promise<void> {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    overflow.scrollWidth,
    `Horizontal overflow at ${contextLabel}: ${overflow.scrollWidth} > ${overflow.clientWidth}`,
  ).toBeLessThanOrEqual(overflow.clientWidth);
}

test.describe("RFC-005: Note Image Attachments E2E", () => {
  test("uploads image, serves privately after reload, toggles lightbox, enforces offline lock, checks zero overflow, and deletes via modal", async ({
    page,
    context,
  }, testInfo) => {
    const isMobileProject = testInfo.project.name === "mobile";
    const email = `e2e-attach-${testInfo.project.name}-${crypto.randomUUID()}@example.test`;
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
      await page.goto("/register");
      await page.getByLabel("Nama Lengkap").fill("E2E Attachment User");
      await page.getByLabel("Alamat Email").fill(email);
      await page.getByLabel("Kata Sandi", { exact: true }).fill("SecretPassword99");
      await page.getByLabel("Konfirmasi Kata Sandi").fill("SecretPassword99");
      await page.getByRole("button", { name: "Daftar & Masuk" }).click();
      await page.waitForURL("**/app/notes");

      await page.getByRole("button", { name: "Catatan Baru" }).first().click();
      if (isMobileProject) {
        await page.waitForURL("**/app/notes/*", { timeout: 15_000 });
      }

      await expect(
        page.getByRole("heading", { level: 3, name: "Lampiran Gambar" }),
      ).toBeVisible();

      const fileInput = page.getByLabel(
        "Pilih file gambar lampiran (JPEG, PNG, atau WebP)",
      );
      await fileInput.setInputFiles({
        name: "nota.png",
        mimeType: "image/png",
        buffer: VALID_PNG,
      });

      const thumbImg = page.getByAltText("Lampiran gambar catatan").first();
      await expect(thumbImg).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText("1/5")).toBeVisible();

      if (!isMobileProject) {
        // Blocking #1 regression check: reload so Note A is the SSR initialNotes[0], upload a 2nd photo,
        // create/switch to Note B, switch back to Note A without reload, and confirm live 2/5 persists.
        const patchNotePromise = page.waitForResponse(
          (res) =>
            res.request().method() === "PATCH" &&
            new URL(res.url()).pathname.startsWith("/api/notes/") &&
            res.ok(),
        );
        await page.getByLabel("Judul catatan").fill("Catatan Gambar Utama");
        await patchNotePromise;
        await expect(page.getByText("Tersimpan")).toBeVisible({
          timeout: 10_000,
        });
        await page.reload();
        await expect(page.getByText("1/5")).toBeVisible();

        await fileInput.setInputFiles({
          name: "nota-kedua.png",
          mimeType: "image/png",
          buffer: VALID_PNG,
        });
        await expect(page.getByText("2/5")).toBeVisible({ timeout: 10_000 });

        await page.getByRole("button", { name: "Catatan Baru" }).first().click();
        await expect(page.getByText("0/5")).toBeVisible({ timeout: 10_000 });

        await page
          .getByRole("link", { name: /Catatan Gambar Utama/ })
          .first()
          .click();
        await expect(page.getByText("2/5")).toBeVisible({ timeout: 10_000 });
        await expect(page.getByAltText("Lampiran gambar catatan")).toHaveCount(2);

        // Delete the extra 2nd image so remaining assertions stay 1/5 on both desktop and mobile.
        await page
          .getByRole("button", { name: "Hapus lampiran gambar (2)" })
          .click();
        await page.getByRole("button", { name: "Ya, Hapus Gambar" }).click();
        await expect(page.getByText("1/5")).toBeVisible({ timeout: 10_000 });
      }

      // Reload & verify SSR + private endpoint persistence
      await page.reload();
      const reloadedThumb = page.getByAltText("Lampiran gambar catatan").first();
      await expect(reloadedThumb).toBeVisible();
      await expect(reloadedThumb).toHaveJSProperty("complete", true);
      expect(
        await reloadedThumb.evaluate((el) => (el as HTMLImageElement).naturalWidth),
      ).toBeGreaterThan(0);
      await expect(page.getByText("1/5")).toBeVisible();

      // Verify zero horizontal overflow across 360px / 768px / 1280px
      if (isMobileProject) {
        await page.setViewportSize({ width: 360, height: 800 });
        await assertNoHorizontalOverflow(page, "mobile-360-attachments");
        await page.setViewportSize({ width: 768, height: 1024 });
        await assertNoHorizontalOverflow(page, "tablet-768-attachments");
      } else {
        await assertNoHorizontalOverflow(page, "desktop-1280-attachments");
      }

      // Open & Escape-close lightbox
      await page
        .getByRole("button", { name: "Perbesar lampiran gambar (1)" })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);

      // Simulate an uncached image failing while offline -> offlinePlaceholder renders, then online recovers.
      let failUncachedOfflineImage = true;
      await context.route("**/api/attachments/**", async (route) => {
        if (failUncachedOfflineImage && route.request().method() === "GET") {
          await route.abort("failed");
          return;
        }
        await route.continue();
      });

      await fileInput.setInputFiles({
        name: "nota-offline-check.png",
        mimeType: "image/png",
        buffer: VALID_PNG,
      });
      await expect(page.getByText("2/5")).toBeVisible({ timeout: 10_000 });

      // Go offline -> upload & delete disabled + offlinePlaceholder appears on uncached image failure
      await context.setOffline(true);
      await page.evaluate(() => {
        window.dispatchEvent(new Event("offline"));
      });
      await expect(
        page.getByRole("button", { name: "Unggah Gambar" }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "Hapus lampiran gambar (1)" }),
      ).toBeDisabled();
      await expect(
        page.getByText(
          "Mode offline: unggah & hapus lampiran dinonaktifkan sampai kembali online.",
        ),
      ).toBeVisible();
      await expect(
        page.getByText(
          "Gambar belum tersedia saat offline. Coba lagi ketika online.",
        ),
      ).toBeVisible();

      // Reconnect -> uncached image auto-retries -> clean up both attachments via modal
      failUncachedOfflineImage = false;
      await context.unroute("**/api/attachments/**");
      await context.setOffline(false);
      await page.evaluate(() => {
        window.dispatchEvent(new Event("online"));
      });
      await expect(page.getByAltText("Lampiran gambar catatan")).toHaveCount(2, {
        timeout: 10_000,
      });
      await expect(
        page.getByRole("button", { name: "Hapus lampiran gambar (2)" }),
      ).toBeEnabled();
      await page
        .getByRole("button", { name: "Hapus lampiran gambar (2)" })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.getByRole("button", { name: "Ya, Hapus Gambar" }).click();
      await expect(page.getByText("1/5")).toBeVisible({ timeout: 10_000 });

      await page
        .getByRole("button", { name: "Hapus lampiran gambar (1)" })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.getByRole("button", { name: "Ya, Hapus Gambar" }).click();
      await expect(page.getByAltText("Lampiran gambar catatan")).toHaveCount(0);
      await expect(page.getByText("0/5")).toBeVisible();

      await page.reload();
      await expect(page.getByAltText("Lampiran gambar catatan")).toHaveCount(0);

      // Ignore Next.js <Link> background prefetches to unbuilt future RFC-006/RFC-010 sibling routes in production mode,
      // plus the single intentional route.abort("failed") used above to exercise offlinePlaceholder.
      const unexpectedFailures = failedResponses.filter((entry) => {
        const pathname = new URL(entry.url).pathname;
        const isDeferredWorkspacePrefetch =
          entry.status === 404 &&
          (pathname === "/app/finance" || pathname === "/app/settings");
        const isIntentionalOfflineAttachment503 =
          entry.status === 503 && pathname.startsWith("/api/attachments/");
        return !isDeferredWorkspacePrefetch && !isIntentionalOfflineAttachment503;
      });
      expect(unexpectedFailures).toEqual([]);

      const unexpectedConsoleErrors = consoleErrors.filter(
        (msg) =>
          !(
            (msg ===
              "Failed to load resource: the server responded with a status of 404 (Not Found)" ||
              msg ===
                "Failed to load resource: the server responded with a status of 503 (Service Unavailable)" ||
              msg === "Failed to load resource: net::ERR_FAILED") &&
            unexpectedFailures.length === 0
          ),
      );
      expect(unexpectedConsoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
    } finally {
      await cleanupSyntheticE2eUserAndUploads(email);
    }
  });
});

