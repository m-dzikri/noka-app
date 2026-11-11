import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
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

test.describe("RFC-003: Public SEO Landing Page (TS-003-01 & TS-003-02)", () => {
  test("serves SSR HTML, dynamic SEO metadata, robots.txt, sitemap.xml, 1200x630 OG image, and auth-aware CTAs (TS-003-01)", async ({
    page,
    request,
    baseURL,
  }) => {
    const resolvedBaseUrl = (baseURL ?? "http://localhost:3000").replace(
      /\/+$/,
      "",
    );

    // 1. Verify SSR HTML without client JS dependency (ID default & EN cookie).
    const ssrIdRes = await request.get("/");
    expect(ssrIdRes.status()).toBe(200);
    const ssrIdHtml = await ssrIdRes.text();
    expect(ssrIdHtml).toContain("<title>Noka — Seringan Notepad, Serapi Buku Kas</title>");
    expect(ssrIdHtml).toContain('property="og:locale" content="id_ID"');
    expect(ssrIdHtml).toContain('property="og:image"');
    expect(ssrIdHtml).toContain("/opengraph-image");
    expect(ssrIdHtml).toContain('name="twitter:card" content="summary_large_image"');
    expect(ssrIdHtml).toContain('<link rel="canonical"');
    expect(ssrIdHtml).toContain("<h1");
    expect(ssrIdHtml).toContain("<h2");
    expect(ssrIdHtml).toContain("<h3");

    const ssrEnRes = await request.get("/", {
      headers: { Cookie: "noka_locale=en" },
    });
    expect(ssrEnRes.status()).toBe(200);
    const ssrEnHtml = await ssrEnRes.text();
    expect(ssrEnHtml).toContain(
      "<title>Noka — Light as a Notepad, Tidy as a Ledger</title>",
    );
    expect(ssrEnHtml).toContain('property="og:locale" content="en_US"');

    // 2. Verify dynamic robots.txt & sitemap.xml built from APP_URL.
    const robotsRes = await request.get("/robots.txt");
    expect(robotsRes.status()).toBe(200);
    const robotsBody = await robotsRes.text();
    expect(robotsBody).toContain("Allow: /");
    expect(robotsBody).toContain("Disallow: /app/");
    expect(robotsBody).toContain("Disallow: /api/");
    expect(robotsBody).toContain(`Sitemap: ${resolvedBaseUrl}/sitemap.xml`);

    const sitemapRes = await request.get("/sitemap.xml");
    expect(sitemapRes.status()).toBe(200);
    const sitemapBody = await sitemapRes.text();
    expect(sitemapBody).toContain(`${resolvedBaseUrl}/</loc>`);
    expect(sitemapBody).toContain(`${resolvedBaseUrl}/login</loc>`);
    expect(sitemapBody).toContain(`${resolvedBaseUrl}/register</loc>`);
    expect(sitemapBody).not.toContain("/forgot-password");
    expect(sitemapBody).not.toContain("/reset-password");

    // 3. Verify generated PNG Open Graph image dimensions (1200x630).
    const ogRes = await request.get("/opengraph-image");
    expect(ogRes.status()).toBe(200);
    expect(ogRes.headers()["content-type"]).toContain("image/png");
    const ogBuffer = await ogRes.body();
    expect(ogBuffer.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(ogBuffer.readUInt32BE(16)).toBe(1200);
    expect(ogBuffer.readUInt32BE(20)).toBe(630);

    // 4. Verify rendered anonymous hierarchy, 3 footer privacy points, and guest CTAs.
    await page.goto("/");
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h2")).toHaveCount(2);
    await expect(page.locator("h3")).toHaveCount(5);
    await expect(
      page.getByTestId("landing-privacy-points").locator("li"),
    ).toHaveCount(3);

    const header = page.locator("header");
    await expect(header.getByRole("link", { name: "Masuk" })).toHaveAttribute(
      "href",
      "/login",
    );
    await expect(header.getByRole("link", { name: "Daftar" })).toHaveAttribute(
      "href",
      "/register",
    );
    await expect(
      header.getByRole("link", { name: "Buka Workspace" }),
    ).toHaveCount(0);

    const mainHero = page.locator("main section").first();
    await expect(
      mainHero.getByRole("link", { name: "Mulai Gratis" }),
    ).toHaveAttribute("href", "/register");
    await expect(
      mainHero.getByRole("link", { name: "Masuk" }),
    ).toHaveAttribute("href", "/login");

    // 5. Authenticate synthetic test user and verify CTA switches cleanly to /app & #preview.
    const uniqueEmail = `e2e-landing-${crypto.randomUUID()}@example.test`;
    try {
      const regRes = await page.request.post("/api/auth/register", {
        headers: { origin: resolvedBaseUrl },
        data: {
          name: "E2E Landing User",
          email: uniqueEmail,
          password: "SecretPassword99",
          locale: "id",
          theme: "light",
        },
      });
      expect(regRes.status()).toBe(201);

      await page.goto("/");
      await expect(
        header.getByRole("link", { name: "Buka Workspace" }),
      ).toHaveAttribute("href", "/app");
      await expect(header.getByRole("link", { name: "Masuk" })).toHaveCount(0);
      await expect(header.getByRole("link", { name: "Daftar" })).toHaveCount(0);

      await expect(
        mainHero.getByRole("link", { name: "Buka Workspace" }),
      ).toHaveAttribute("href", "/app");
      await expect(
        mainHero.getByRole("link", { name: "Lihat Pratinjau" }),
      ).toHaveAttribute("href", "#preview");
    } finally {
      await page.request
        .post("/api/auth/logout", { headers: { origin: resolvedBaseUrl } })
        .catch(() => undefined);
      await deleteSyntheticE2eUser(uniqueEmail);
    }
  });

  test("preserves interactive FeaturePreviewCard state across zero-reload ID/EN + theme toggles, keyboard navigation, and mobile/tablet/desktop viewports (TS-003-02)", async ({
    page,
  }) => {
    const apiRequests: string[] = [];
    page.on("request", (req) => {
      if (new URL(req.url()).pathname.startsWith("/api/")) {
        apiRequests.push(req.url());
      }
    });

    await page.goto("/");

    // Inject non-reload sentinel onto window.
    await page.evaluate(() => {
      (window as unknown as { __nokaLandingSentinel?: string }).__nokaLandingSentinel =
        "no-reload";
    });

    // (a) Exercise all 3 Quick Capture presets.
    const chipNote = page.getByRole("button", { name: "bab 3 skripsi" });
    await chipNote.click();
    await expect(chipNote).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("quick-capture-result")).toContainText(
      "bab 3 skripsi",
    );

    const chipExpense = page.getByRole("button", {
      name: "kopi kenangan 24rb gopay",
    });
    await chipExpense.click();
    await expect(page.getByTestId("quick-capture-amount")).toHaveText(
      "Rp24.000",
    );

    const chipIncome = page.getByRole("button", { name: "+gaji 5jt bca" });
    await chipIncome.click();
    await expect(chipIncome).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("quick-capture-amount")).toHaveText(
      "+Rp5.000.000",
    );

    // (b) Toggle local GFM checklist item.
    const secondCheckbox = page.getByRole("checkbox", {
      name: "Catat pengeluaran kopi & transportasi hari ini",
    });
    await expect(secondCheckbox).not.toBeChecked();
    await secondCheckbox.click();
    await expect(secondCheckbox).toBeChecked();

    // (c) Verify visible Safe-to-Spend & Linked Notes cards before blur.
    await expect(page.getByTestId("safe-to-spend-amount")).toHaveText("Rp85.000");
    await expect(page.getByTestId("linked-notes-amount")).toHaveText(
      "-Rp125.000",
    );

    // (d) Activate Demo Privacy Blur via keyboard and check masked currency amounts.
    const blurButtonShow = page.getByRole("button", {
      name: "Aktifkan Demo Privacy Blur",
    });
    await blurButtonShow.focus();
    await page.keyboard.press("Enter");
    const blurButtonHide = page.getByRole("button", {
      name: "Matikan Demo Privacy Blur",
    });
    await expect(blurButtonHide).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("quick-capture-amount")).toHaveText(
      "+Rp •••••",
    );
    await expect(page.getByTestId("safe-to-spend-amount")).toHaveText(
      "Rp •••••",
    );
    await expect(page.getByTestId("linked-notes-amount")).toHaveText(
      "-Rp •••••",
    );

    // Switch EN + Dark mode simultaneously via UI toggles without page reload.
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await page
      .locator("header")
      .getByRole("button", { name: /dark mode|mode gelap/i })
      .click();

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("h1")).toHaveText(
      "Light as a Notepad, Tidy as a Ledger.",
    );

    // Assert zero reload and full preservation of FeaturePreviewCard interactive state.
    const sentinel = await page.evaluate(
      () =>
        (window as unknown as { __nokaLandingSentinel?: string })
          .__nokaLandingSentinel,
    );
    expect(sentinel).toBe("no-reload");
    await expect(chipIncome).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("quick-capture-result")).toContainText(
      "Salary",
    );
    await expect(
      page.getByRole("checkbox", {
        name: "Log today's coffee and commute expenses",
      }),
    ).toBeChecked();
    await expect(
      page.getByRole("button", { name: "Disable Demo Privacy Blur" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("quick-capture-amount")).toHaveText(
      "+Rp •••••",
    );
    await expect(page.getByTestId("safe-to-spend-amount")).toHaveText(
      "Rp •••••",
    );
    await expect(page.getByTestId("linked-notes-amount")).toHaveText(
      "-Rp •••••",
    );

    // Verify no /api/ requests were sent by preview toggles or locale/theme toggles.
    expect(apiRequests).toEqual([]);

    // Keyboard Tab reachability check across header controls.
    await page.keyboard.press("Tab");
    const activeTag = await page.evaluate(
      () => document.activeElement?.tagName ?? "",
    );
    expect(["A", "BUTTON", "INPUT"]).toContain(activeTag);

    // Check touch targets (>= 40px) & zero horizontal overflow across 360, 375x812, 768, 1280x800.
    const viewports = [
      { width: 360, height: 800 },
      { width: 375, height: 812 },
      { width: 768, height: 1024 },
      { width: 1280, height: 800 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize(vp);
      const metrics = await page.evaluate(() => {
        const overflow =
          document.documentElement.scrollWidth > window.innerWidth;
        const headerInteractive = Array.from(
          document.querySelectorAll("header a, header button"),
        );
        const minHeight = Math.min(
          ...headerInteractive.map((el) => el.getBoundingClientRect().height),
        );
        return { overflow, minHeight };
      });
      expect(metrics.overflow, `Horizontal overflow at ${vp.width}px`).toBe(
        false,
      );
      expect(
        metrics.minHeight,
        `Header control height < 40px at ${vp.width}px`,
      ).toBeGreaterThanOrEqual(40);
    }
  });
});

