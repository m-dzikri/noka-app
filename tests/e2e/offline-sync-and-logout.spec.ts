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

async function revokeUserSessionsInDb(email: string): Promise<void> {
  await withPgClient(async (client) => {
    const res = await client.query<{ id: string }>(
      "SELECT id FROM users WHERE email = $1",
      [email],
    );
    const userId = res.rows[0]?.id;
    if (!userId) {
      throw new Error(`Synthetic user not found for session revocation: ${email}`);
    }
    await client.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
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

async function clickHeaderLogout(page: Page, isMobileProject: boolean): Promise<void> {
  if (isMobileProject) {
    const mobileMenu = page.getByTestId("app-shell-mobile-menu");
    if (!(await mobileMenu.isVisible())) {
      await page.getByRole("button", { name: /menu/i }).click();
      await expect(mobileMenu).toBeVisible();
    }
    await mobileMenu.getByRole("button", { name: "Keluar" }).click();
    return;
  }
  await page.getByRole("button", { name: "Keluar" }).click();
}

test.describe("RFC-009: PWA Installability, Offline Sync & Logout/401 Purge (TS-009-02)", () => {
  test("verifies manifest & split caches, full offline notes/quick-capture/transfer parity & online-only guards, zero-duplicate sync, and 100% wipe on Logout and 401", async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(120_000);
    const isMobileProject = testInfo.project.name === "mobile";
    const email = `e2e-offline-${testInfo.project.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@noka.test`;
    const password = "SecretPassword99";

    const onlineConsoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const serverErrors: Array<{ url: string; status: number }> = [];
    let ignoreNetworkConsoleErrors = false;

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        if (
          ignoreNetworkConsoleErrors &&
          /ERR_INTERNET_DISCONNECTED|ERR_FAILED|Failed to load resource|network/i.test(text)
        ) {
          return;
        }
        if (/status of 401|status of 404/i.test(text)) {
          return;
        }
        onlineConsoleErrors.push(text);
      }
    });
    page.on("pageerror", (err) => {
      if (/database connection is closing|IndexedDB is suppressed/i.test(err.message)) {
        return;
      }
      pageErrors.push(err.message);
    });
    page.on("response", (res) => {
      if (res.status() >= 500 && !res.url().includes("/attachments/")) {
        serverErrors.push({ url: res.url(), status: res.status() });
      }
    });

    try {
      // 1. Verify PWA manifest, offline fallback page, icons, and unauth snapshot 401
      const manifestRes = await page.request.get("/manifest.webmanifest");
      expect(manifestRes.status()).toBe(200);
      const manifestJson = (await manifestRes.json()) as {
        start_url?: string;
        display?: string;
        icons?: Array<{ src: string; sizes: string; type: string }>;
      };
      expect(manifestJson.start_url).toBe("/app/notes");
      expect(manifestJson.display).toBe("standalone");
      expect(manifestJson.icons?.some((i) => i.src === "/icons/icon-192.png")).toBe(true);
      expect(manifestJson.icons?.some((i) => i.src === "/icons/icon-512.png")).toBe(true);

      const icon192 = await page.request.get("/icons/icon-192.png");
      expect(icon192.status()).toBe(200);
      expect(icon192.headers()["content-type"]).toContain("image/png");

      const offlineHtml = await page.request.get("/offline.html");
      expect(offlineHtml.status()).toBe(200);

      const unauthSnapshot = await page.request.get("/api/sync/snapshot");
      expect(unauthSnapshot.status()).toBe(401);

      console.log(`[E2E-STEP ${testInfo.project.name}] 1. Verified manifest & icons`);

      // 2. Register user & wait for active Service Worker + initial sync
      await page.goto("/register");
      await page.getByLabel("Nama Lengkap").fill("E2E Offline User");
      await page.getByLabel("Alamat Email").fill(email);
      await page.getByLabel("Kata Sandi", { exact: true }).fill(password);
      await page.getByLabel("Konfirmasi Kata Sandi").fill(password);
      await page.getByRole("button", { name: /^Daftar/ }).click();
      await page.waitForURL(/\/app\/notes/);
      await assertNoHorizontalOverflow(page, "online /app/notes initial");

      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
      });
      console.log(`[E2E-STEP ${testInfo.project.name}] 2. Registered and SW ready`);
      // Navigate once through finance & notes with active SW so split caches hold both SSR shells & chunks
      await page.goto("/app/finance");
      await expect(page.getByRole("heading", { level: 1, name: "Keuangan" })).toBeVisible();
      await assertNoHorizontalOverflow(page, "online /app/finance initial");

      // Create two wallets online (Kas Tunai 500k + Bank BCA 1M)
      await page.getByRole("button", { name: "Kelola Dompet" }).click();
      const walletModal = page.getByRole("dialog");
      await expect(walletModal).toBeVisible();

      await walletModal.getByLabel("Nama dompet").fill("Kas Tunai");
      await walletModal.getByLabel("Saldo awal (IDR)").fill("500000");
      await walletModal.getByRole("button", { name: "Tambah Dompet" }).click();
      await expect(walletModal.getByText("Kas Tunai")).toBeVisible();

      await walletModal.getByLabel("Nama dompet").fill("Bank BCA");
      await walletModal.getByLabel("Tipe dompet").selectOption("bank");
      await walletModal.getByLabel("Saldo awal (IDR)").fill("1000000");
      await walletModal.getByRole("button", { name: "Tambah Dompet" }).click();
      await expect(walletModal.getByText("Bank BCA")).toBeVisible();

      await walletModal.getByRole("button", { name: "Tutup" }).click();
      await expect(page.getByTestId("finance-total-balance")).toHaveText("Rp1.500.000");

      // Go to /app/notes, create Note 1 online with 1 cached attachment + 1 uncached attachment (uploaded via API while on finance)
      await page.goto("/app/notes");
      await expect(page.getByRole("heading", { level: 1, name: "Catatan" })).toBeVisible();
      await expect(page.getByTestId("sync-status-badge")).toHaveAttribute(
        "data-sync-status",
        "synced",
        { timeout: 10_000 },
      );

      const createNoteResPromise = page.waitForResponse(
        (res) =>
          new URL(res.url()).pathname === "/api/notes" &&
          res.request().method() === "POST" &&
          res.ok(),
      );
      await page.getByRole("button", { name: "Catatan Baru" }).first().click();
      const createdNotePayload = (await (await createNoteResPromise).json()) as {
        data: { note: { id: string } };
      };
      const firstNoteId = createdNotePayload.data.note.id;

      if (isMobileProject) {
        await page.waitForURL(`**/app/notes/${firstNoteId}`);
      }

      await page.getByLabel("Judul catatan").fill("Catatan Lampiran");
      await expect(page.getByTestId("note-save-status")).toHaveText("Tersimpan", {
        timeout: 5_000,
      });

      const fileInput = page.getByLabel(
        "Pilih file gambar lampiran (JPEG, PNG, atau WebP)",
      );
      await fileInput.setInputFiles({
        name: "cached.png",
        mimeType: "image/png",
        buffer: VALID_PNG,
      });
      const cachedThumb = page.getByAltText("Lampiran gambar catatan").first();
      await cachedThumb.scrollIntoViewIfNeeded();
      await expect(cachedThumb).toBeVisible({ timeout: 10_000 });
      await expect
        .poll(async () =>
          cachedThumb.evaluate((el) => {
            const img = el as HTMLImageElement;
            return img.complete && img.naturalWidth > 0;
          }),
        )
        .toBe(true);
      await expect(page.getByText("1/5")).toBeVisible();

      // Navigate back to /app/finance, upload a 2nd attachment directly via API (never rendered while online -> uncached binary!),
      // then click Sync Sekarang so snapshot includes att2 metadata while image binary stays absent from noka-private-v1.
      await page.goto("/app/finance");
      await expect(page.getByRole("heading", { level: 1, name: "Keuangan" })).toBeVisible();
      await expect(page.getByTestId("sync-status-badge")).toHaveAttribute(
        "data-sync-status",
        "synced",
        { timeout: 10_000 },
      );
      const baseOrigin = new URL(page.url()).origin;
      const uploadRes = await page.request.post(`/api/notes/${firstNoteId}/attachments`, {
        headers: { Origin: baseOrigin },
        multipart: {
          file: {
            name: "uncached.png",
            mimeType: "image/png",
            buffer: VALID_PNG,
          },
        },
      });
      expect(uploadRes.status()).toBe(201);

      await page.getByTestId("sync-status-badge").click();
      const syncDialog = page.getByRole("dialog");
      await expect(syncDialog).toBeVisible();
      const snapPromise = page.waitForResponse(
        (res) => res.url().includes("/api/sync/snapshot") && res.ok(),
      );
      await syncDialog.getByRole("button", { name: "Sync Sekarang" }).click();
      await snapPromise;
      await syncDialog.getByRole("button", { name: "Tutup" }).last().click();

      // Verify Cache Storage separation BEFORE going offline while still on /app/finance so uncached.png (att2) stays absent from noka-private-v1
      const cacheAudit = await page.evaluate(async () => {
        const shellCache = await caches.open("noka-shell-v1");
        const shellUrls = (await shellCache.keys()).map((r) => new URL(r.url).pathname);
        const privateCache = await caches.open("noka-private-v1");
        const privateUrls = (await privateCache.keys()).map((r) => new URL(r.url).pathname);
        const dbs = (await indexedDB.databases()).map((d) => d.name ?? "");
        return { shellUrls, privateUrls, dbs };
      });
      expect(cacheAudit.shellUrls.some((p) => p.startsWith("/app/"))).toBe(false);
      expect(cacheAudit.privateUrls.includes("/app/notes")).toBe(true);
      expect(cacheAudit.privateUrls.includes("/app/finance")).toBe(true);
      expect(cacheAudit.dbs.some((name) => name.startsWith("noka-offline-"))).toBe(true);
      const cachedAttachmentUrls = cacheAudit.privateUrls.filter((u) =>
        u.includes("attachments"),
      );
      expect(
        cachedAttachmentUrls,
        `Unexpected cached attachments before offline: ${JSON.stringify(cacheAudit.privateUrls)}`,
      ).toHaveLength(1);

      // Verify cached HTML responses in noka-private-v1 directly (noka-shell-v1 stays private-route free)
      const htmlCacheCheck = await page.evaluate(async () => {
        const privateCache = await caches.open("noka-private-v1");
        const notesRes = await privateCache.match("/app/notes");
        const financeRes = await privateCache.match("/app/finance");
        return {
          notesStatus: notesRes?.status ?? 0,
          notesType: notesRes?.headers.get("content-type") ?? "",
          financeStatus: financeRes?.status ?? 0,
          financeType: financeRes?.headers.get("content-type") ?? "",
        };
      });
      expect(htmlCacheCheck.notesStatus).toBe(200);
      expect(htmlCacheCheck.notesType).toContain("text/html");
      expect(htmlCacheCheck.financeStatus).toBe(200);
      expect(htmlCacheCheck.financeType).toContain("text/html");

      // 3A. Switch to OFFLINE mode on /app/finance (OFFLINE-2, OFFLINE-4): Quick Capture, Transfer, online-only modals, & zero-duplicate sync
      console.log(`[E2E-STEP ${testInfo.project.name}] 3A. Entering offline on finance`);
      ignoreNetworkConsoleErrors = true;
      await context.setOffline(true);

      await expect(page.getByTestId("sync-status-badge")).toHaveAttribute(
        "data-sync-status",
        "offline",
        { timeout: 10_000 },
      );

      // Use Quick Capture offline to record expense Rp 25.000 -> live balance updates to Rp1.475.000
      const qcInput = page.getByTestId("quick-capture-input");
      await qcInput.fill("Beli roti 25rb lewat Kas Tunai");
      await expect(page.getByTestId("quick-capture-submit")).toBeEnabled();
      await qcInput.press("Enter");
      await expect(page.getByTestId("quick-capture-feedback")).toBeVisible({
        timeout: 5_000,
      });
      await expect(page.getByTestId("finance-total-balance")).toHaveText(
        "Rp1.475.000",
        { timeout: 10_000 },
      );

      // Execute Transfer offline (Rp 100.000 Bank BCA -> Kas Tunai)
      await page.getByRole("button", { name: "Transfer Dompet" }).click();
      const transferDialog = page.getByRole("dialog");
      await expect(transferDialog).toBeVisible();
      await transferDialog.getByLabel("Dari dompet").selectOption({ label: "Bank BCA" });
      await transferDialog.getByLabel("Ke dompet").selectOption({ label: "Kas Tunai" });
      await transferDialog.getByLabel("Nominal transfer (IDR)").fill("100000");
      await transferDialog.getByLabel("Catatan (opsional)").fill("Topup Offline");
      await transferDialog.getByRole("button", { name: "Kirim Transfer" }).click();
      await expect(transferDialog).not.toBeVisible({ timeout: 5_000 });
      await expect(page.getByText("Topup Offline")).toBeVisible();
      await expect(page.getByTestId("finance-total-balance")).toHaveText("Rp1.475.000");

      // Online-only Wallet & Category manager modals must be disabled with offline notice (OFFLINE-4)
      await page.getByRole("button", { name: "Kelola Dompet" }).click();
      const offlineWalletModal = page.getByRole("dialog");
      await expect(offlineWalletModal.getByTestId("wallet-modal-offline-notice")).toBeVisible();
      await expect(offlineWalletModal.getByRole("button", { name: "Tambah Dompet" })).toBeDisabled();
      await offlineWalletModal.getByRole("button", { name: "Tutup" }).first().click({ timeout: 5_000 });
      await expect(offlineWalletModal).not.toBeVisible({ timeout: 5_000 });

      await page.getByRole("button", { name: "Kelola Kategori" }).click();
      const offlineCategoryModal = page.getByRole("dialog");
      await expect(offlineCategoryModal.getByTestId("category-modal-offline-notice")).toBeVisible();
      await expect(offlineCategoryModal.getByRole("button", { name: "Buat Kategori" })).toBeDisabled();
      await offlineCategoryModal.getByRole("button", { name: "Tutup" }).first().click({ timeout: 5_000 });
      await expect(offlineCategoryModal).not.toBeVisible({ timeout: 5_000 });

      // Confirm SyncStatusBadge displays non-zero pending badge count while offline
      await expect(page.getByTestId("sync-pending-badge-count")).toBeVisible();
      await assertNoHorizontalOverflow(page, "offline /app/finance");

      // Restore ONLINE -> verify auto-sync flushes Finance + Quick Capture with zero duplicates
      ignoreNetworkConsoleErrors = false;
      await context.setOffline(false);
      await expect(page.getByTestId("sync-status-badge")).toHaveAttribute(
        "data-sync-status",
        "synced",
        { timeout: 15_000 },
      );
      await expect(page.getByTestId("sync-pending-badge-count")).toHaveCount(0);

      await page.reload();
      await expect(page.getByTestId("finance-total-balance")).toHaveText("Rp1.475.000");
      await expect(page.getByText("Beli roti")).toHaveCount(1);
      await expect(page.getByText("Topup Offline")).toHaveCount(1);

      // Create a newer online note while on /app/finance so /app/notes auto-selects it instead of "Catatan Lampiran" (keeping att2 uncached!)
      const bufferNotePromise = page.waitForResponse(
        (res) =>
          new URL(res.url()).pathname === "/api/notes" &&
          res.request().method() === "POST" &&
          res.ok(),
      );
      const qcOnline = page.getByTestId("quick-capture-input");
      await qcOnline.fill("Catatan Penyangga Online");
      await page
        .getByRole("group", { name: "Tangkap Cepat" })
        .getByRole("button", { name: "Catatan" })
        .click();
      await page.getByTestId("quick-capture-submit").click();
      await bufferNotePromise;

      // 3B. Offline mode on /app/notes: cached vs uncached attachments, offline Note + GFM checklist, & zero-duplicate sync
      console.log(`[E2E-STEP ${testInfo.project.name}] 3B. Going to notes`);
      await page.goto("/app/notes");
      await expect(page.getByRole("heading", { level: 1, name: "Catatan" })).toBeVisible();
      await expect(page.getByTestId("sync-status-badge")).toHaveAttribute(
        "data-sync-status",
        "synced",
        { timeout: 10_000 },
      );
      const preOfflineNotesAttachments = await page.evaluate(async () => {
        const privateCache = await caches.open("noka-private-v1");
        return (await privateCache.keys())
          .map((r) => new URL(r.url).pathname)
          .filter((u) => u.includes("attachments"));
      });
      expect(preOfflineNotesAttachments).toHaveLength(1);

      ignoreNetworkConsoleErrors = true;
      await context.setOffline(true);
      await page.evaluate(() => window.dispatchEvent(new Event("offline")));
      await expect(page.getByTestId("sync-status-badge")).toHaveAttribute(
        "data-sync-status",
        "offline",
        { timeout: 10_000 },
      );

      // Check existing note attachments offline: upload/delete buttons disabled, cached image renders, uncached image shows offline placeholder
      await page.getByText("Catatan Lampiran").first().evaluate((el) => {
        const link = el.closest("a");
        if (link) {
          const event = new MouseEvent("click", { bubbles: true, cancelable: true });
          link.dispatchEvent(event);
        } else {
          (el as HTMLElement).click();
        }
      });
      await expect(
        page.getByText(
          "Mode offline: unggah & hapus lampiran dinonaktifkan sampai kembali online.",
        ),
      ).toBeVisible({ timeout: 5_000 });
      await expect(page.getByRole("button", { name: "Unggah Gambar" })).toBeDisabled();
      const offlineCachedThumb = page.getByAltText("Lampiran gambar catatan").first();
      await expect(offlineCachedThumb).toBeVisible({ timeout: 10_000 });
      await offlineCachedThumb.scrollIntoViewIfNeeded();
      await expect
        .poll(async () =>
          offlineCachedThumb.evaluate((el) => {
            const img = el as HTMLImageElement;
            return img.complete && img.naturalWidth > 0;
          }),
        )
        .toBe(true);
      await expect(
        page.getByText("Gambar belum tersedia saat offline. Coba lagi ketika online."),
      ).toBeVisible({ timeout: 5_000 });
      if (isMobileProject) {
        await page
          .getByRole("button", { name: "Kembali ke catatan" })
          .evaluate((btn) => (btn as HTMLElement).click());
      }

      // Scroll to top to ensure sticky header does not overlap Catatan Baru button
      await page.evaluate(() => window.scrollTo(0, 0));

      // Create & edit a new Note offline with GFM checklist -> verify status "Menunggu sinkronisasi"
      await page
        .getByRole("button", { name: "Catatan Baru" })
        .first()
        .evaluate((btn) => (btn as HTMLElement).click());

      await expect(page.getByLabel("Judul catatan")).toHaveValue("");
      const titleInput = page.getByLabel("Judul catatan");
      await titleInput.evaluate((el) => {
        const input = el as HTMLInputElement;
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        )?.set;
        nativeSetter?.call(input, "Catatan Belanja Offline");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await expect(titleInput).toHaveValue("Catatan Belanja Offline");

      const contentInput = page.getByLabel("Isi Markdown catatan");
      await contentInput.evaluate((el) => {
        const textarea = el as HTMLTextAreaElement;
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          "value",
        )?.set;
        nativeSetter?.call(textarea, "- [ ] Susu Segar\n- [ ] Roti Tawar");
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await expect(contentInput).toHaveValue("- [ ] Susu Segar\n- [ ] Roti Tawar");
      await expect(page.getByTestId("note-save-status")).toHaveText(
        "Menunggu sinkronisasi",
        { timeout: 5_000 },
      );

      // Toggle checkbox while offline
      await page
        .getByRole("button", { name: /Pratinjau|Pisah/ })
        .first()
        .evaluate((btn) => (btn as HTMLElement).click());
      const firstCheckbox = page
        .getByRole("checkbox", { name: /Susu Segar/i })
        .first();
      await expect(firstCheckbox).toBeVisible();
      await firstCheckbox.evaluate((cb) => (cb as HTMLElement).click());
      await expect(firstCheckbox).toBeChecked();

      if (isMobileProject) {
        await page
          .getByRole("button", { name: "Kembali ke catatan" })
          .evaluate((btn) => (btn as HTMLElement).click());
      }
      await expect(page.getByTestId("sync-pending-badge-count")).toBeVisible();
      await assertNoHorizontalOverflow(page, "offline /app/notes");

      // 4. Restore ONLINE and verify zero-duplicate flush + Postgres persistence across full reload
      console.log(`[E2E-STEP ${testInfo.project.name}] 4. Restoring online`);
      ignoreNetworkConsoleErrors = false;
      await context.setOffline(false);

      await expect(page.getByTestId("sync-status-badge")).toHaveAttribute(
        "data-sync-status",
        "synced",
        { timeout: 15_000 },
      );
      await expect(page.getByTestId("sync-pending-badge-count")).toHaveCount(0);

      await page.reload();
      await expect(page.getByText("Catatan Belanja Offline").first()).toBeVisible();
      await expect(page.getByText("Catatan Belanja Offline")).toHaveCount(1);

      // 5. Logout full purge verification (OFFLINE-5, HIGH-4)
      console.log(`[E2E-STEP ${testInfo.project.name}] 5. Logging out`);
      await clickHeaderLogout(page, isMobileProject);
      await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
      console.log(`[E2E-STEP ${testInfo.project.name}] 5. Reached /login after logout`);

      await expect
        .poll(
          async () =>
            page.evaluate(async () => {
              const dbs = (await indexedDB.databases()).map((d) => d.name ?? "");
              const cacheKeys = await caches.keys();
              return {
                dbs,
                hasOfflineDb: dbs.some((n) => n.startsWith("noka-offline-")),
                hasPrivateCache: cacheKeys.some((k) => k.startsWith("noka-private-")),
                hasShellCache: cacheKeys.includes("noka-shell-v1"),
              };
            }),
          { timeout: 15_000 },
        )
        .toEqual(
          expect.objectContaining({
            hasOfflineDb: false,
            hasPrivateCache: false,
            hasShellCache: true,
          }),
        );
      console.log(`[E2E-STEP ${testInfo.project.name}] 5. Polled logout wipe success`);

      // 6. Revoked Session (401 UNAUTHORIZED) automatic purge verification (OFFLINE-5)
      console.log(`[E2E-STEP ${testInfo.project.name}] 6. Relogging in`);
      await page.waitForLoadState("domcontentloaded");
      const emailInput = page.getByLabel("Alamat Email");
      await expect(emailInput).toBeVisible({ timeout: 10_000 });
      await emailInput.fill(email);
      await expect(emailInput).toHaveValue(email);
      const passwordInput = page.getByLabel("Kata Sandi");
      await passwordInput.fill(password);
      await expect(passwordInput).toHaveValue(password);
      await page.getByRole("button", { name: /^Masuk/ }).click();
      await expect(page).toHaveURL(/\/app\/notes/, { timeout: 15_000 });
      console.log(`[E2E-STEP ${testInfo.project.name}] 6. Logged in, reloading notes`);
      // Reload /app/notes once so SW caches the private document into noka-private-v1
      await page.reload();
      await expect(page.getByTestId("sync-status-badge")).toHaveAttribute(
        "data-sync-status",
        "synced",
        { timeout: 10_000 },
      );
      console.log(`[E2E-STEP ${testInfo.project.name}] 6. Polling repopulation`);

      // Confirm private DB + private cache were repopulated upon fresh login
      await expect
        .poll(async () =>
          page.evaluate(async () => {
            const dbs = (await indexedDB.databases()).map((d) => d.name ?? "");
            const cacheKeys = await caches.keys();
            return (
              dbs.some((n) => n.startsWith("noka-offline-")) &&
              cacheKeys.some((k) => k.startsWith("noka-private-"))
            );
          }),
        )
        .toBe(true);
      console.log(`[E2E-STEP ${testInfo.project.name}] 6. Repopulation confirmed, revoking session`);

      // Revoke session directly in DB -> trigger 401 via background sync -> verify automatic purge & redirect to /login
      await revokeUserSessionsInDb(email);
      console.log(`[E2E-STEP ${testInfo.project.name}] 6. Revoked session in DB`);
      if (!page.url().includes("/login")) {
        await page.evaluate(() => {
          window.dispatchEvent(new Event("focus"));
        });
      }
      console.log(`[E2E-STEP ${testInfo.project.name}] 6. Waiting for redirect to /login`);

      await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });

      await expect
        .poll(
          async () =>
            page.evaluate(async () => {
              const dbs = (await indexedDB.databases()).map((d) => d.name ?? "");
              const cacheKeys = await caches.keys();
              return {
                dbs,
                hasOfflineDb: dbs.some((n) => n.startsWith("noka-offline-")),
                hasPrivateCache: cacheKeys.some((k) => k.startsWith("noka-private-")),
                hasShellCache: cacheKeys.includes("noka-shell-v1"),
              };
            }),
          { timeout: 15_000 },
        )
        .toEqual(
          expect.objectContaining({
            hasOfflineDb: false,
            hasPrivateCache: false,
            hasShellCache: true,
          }),
        );

      expect(onlineConsoleErrors, `Console errors: ${onlineConsoleErrors.join(" | ")}`).toEqual([]);
      expect(pageErrors, `Page errors: ${pageErrors.join(" | ")}`).toEqual([]);
      expect(serverErrors, `5xx errors: ${JSON.stringify(serverErrors)}`).toEqual([]);
    } finally {
      await context.setOffline(false).catch(() => undefined);
      await deleteSyntheticE2eUser(email).catch(() => undefined);
    }
  });
});

