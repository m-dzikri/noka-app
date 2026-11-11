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
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });

    // 1. Verify SSR HTML without client JS dependency (ID default & EN cookie).
    const ssrIdRes = await request.get("/");
    expect(ssrIdRes.status()).toBe(200);
    const ssrIdHtml = await ssrIdRes.text();
    expect(ssrIdHtml).toContain("<title>Noka — Seringan Notepad, Serapi Buku Kas</title>");
    expect(ssrIdHtml).toContain(
      '<meta name="description" content="Catatan Markdown, checklist GFM interaktif, Quick Capture offline, Safe-to-Spend harian, dan Privacy Blur dalam satu workspace ringan."',
    );
    expect(ssrIdHtml).toContain('property="og:locale" content="id_ID"');
    expect(ssrIdHtml).toContain('property="og:image"');
    expect(ssrIdHtml).toContain("/opengraph-image");
    expect(ssrIdHtml).toContain('name="twitter:card" content="summary_large_image"');
    expect(ssrIdHtml).toContain('<link rel="canonical"');
    expect(ssrIdHtml).toContain('<link rel="icon"');
    expect(ssrIdHtml).toContain("/icon.svg");
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
    expect(ssrEnHtml).toContain(
      '<meta name="description" content="Markdown notes, interactive GFM checklists, offline Smart Quick Capture, daily Safe-to-Spend, and one-click Privacy Blur in one lightweight workspace."',
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
    expect(sitemapBody).toContain("<changefreq>weekly</changefreq>");
    expect(sitemapBody).toContain("<changefreq>monthly</changefreq>");
    expect(sitemapBody).toMatch(/<priority>1(\.0)?<\/priority>/);
    expect(sitemapBody).toContain("<priority>0.6</priority>");
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

    // 3b. Verify lightweight SVG tab icon renders without 404 fallback.
    const iconRes = await request.get("/icon.svg");
    expect(iconRes.status()).toBe(200);
    expect(iconRes.headers()["content-type"]).toContain("image/svg+xml");

    // 4. Verify rendered anonymous hierarchy, centered hero + fading grid, floating pill header, and guest CTAs.
    await page.goto("/");
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h2")).toHaveCount(2);
    await expect(page.locator("h3")).toHaveCount(5);
    await expect(
      page.getByTestId("landing-privacy-points").locator("li"),
    ).toHaveCount(3);

    const visualDesign = await page.evaluate(() => {
      const heroSection = document.querySelector('[data-testid="landing-hero"]');
      const previewHeading = document.getElementById("landing-preview-heading");
      const heroGrid = document.querySelector(
        '[data-testid="landing-hero-grid"]',
      );
      const pillBar = document.querySelector("header > div > div");
      if (!heroSection || !previewHeading || !heroGrid || !pillBar) {
        return null;
      }
      const gridStyle = window.getComputedStyle(heroGrid);
      const gridRect = heroGrid.getBoundingClientRect();
      const heroRect = heroSection.getBoundingClientRect();
      const previewRect = previewHeading.getBoundingClientRect();
      const pillRadius = Number.parseFloat(
        window.getComputedStyle(pillBar).borderTopLeftRadius || "0",
      );
      return {
        viewportHeight: window.innerHeight,
        heroAlign: window.getComputedStyle(heroSection).textAlign,
        heroBottom: heroRect.bottom,
        previewHeadingTop: previewRect.top,
        gridPointerEvents: gridStyle.pointerEvents,
        gridHeight: gridRect.height,
        gridMask:
          gridStyle.maskImage ||
          gridStyle.getPropertyValue("-webkit-mask-image"),
        pillRadius,
      };
    });
    expect(visualDesign).not.toBeNull();
    expect(visualDesign!.heroAlign).toBe("center");
    expect(visualDesign!.heroBottom).toBeGreaterThanOrEqual(
      visualDesign!.viewportHeight - 8,
    );
    expect(visualDesign!.previewHeadingTop).toBeGreaterThanOrEqual(
      visualDesign!.viewportHeight - 1,
    );
    expect(visualDesign!.gridPointerEvents).toBe("none");
    expect(visualDesign!.gridHeight).toBeGreaterThan(
      visualDesign!.viewportHeight,
    );
    expect(visualDesign!.gridMask).toContain("linear-gradient");
    expect(visualDesign!.pillRadius).toBeGreaterThanOrEqual(999);

    const header = page.locator("header");
    const isMobileViewport = (page.viewportSize()?.width ?? 1280) < 640;

    if (isMobileViewport) {
      const closedHeaderBox = await header.boundingBox();
      expect(closedHeaderBox).not.toBeNull();
      expect(closedHeaderBox!.height).toBeLessThanOrEqual(72);

      const menuToggle = header.locator("button[aria-controls]");
      await expect(menuToggle).toHaveAttribute("aria-expanded", "false");
      await menuToggle.click();
      await expect(menuToggle).toHaveAttribute("aria-expanded", "true");

      const mobileMenu = page.getByTestId("landing-mobile-menu");
      await expect(mobileMenu.getByRole("link", { name: "Masuk" })).toHaveAttribute(
        "href",
        "/login",
      );
      await expect(mobileMenu.getByRole("link", { name: "Daftar" })).toHaveAttribute(
        "href",
        "/register",
      );
      await expect(
        mobileMenu.getByRole("link", { name: "Buka Workspace" }),
      ).toHaveCount(0);
      await menuToggle.click();
      await expect(mobileMenu).toHaveCount(0);

      // Re-open and verify clicking brand logo also closes mobile menu cleanly.
      await menuToggle.click();
      await expect(mobileMenu).toBeVisible();
      await header.getByRole("link", { name: "Noka" }).click();
      await expect(mobileMenu).toHaveCount(0);
    } else {
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
    }

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
      if (isMobileViewport) {
        const closedAuthHeaderBox = await header.boundingBox();
        expect(closedAuthHeaderBox).not.toBeNull();
        expect(closedAuthHeaderBox!.height).toBeLessThanOrEqual(72);

        const menuToggle = header.locator("button[aria-controls]");
        await menuToggle.click();
        const mobileMenu = page.getByTestId("landing-mobile-menu");
        await expect(
          mobileMenu.getByRole("link", { name: "Buka Workspace" }),
        ).toHaveAttribute("href", "/app");
        await expect(
          mobileMenu.getByRole("link", { name: "Masuk" }),
        ).toHaveCount(0);
        await expect(
          mobileMenu.getByRole("link", { name: "Daftar" }),
        ).toHaveCount(0);
        await menuToggle.click();
      } else {
        await expect(
          header.getByRole("link", { name: "Buka Workspace" }),
        ).toHaveAttribute("href", "/app");
        await expect(header.getByRole("link", { name: "Masuk" })).toHaveCount(0);
        await expect(header.getByRole("link", { name: "Daftar" })).toHaveCount(
          0,
        );
      }

      await expect(
        mainHero.getByRole("link", { name: "Buka Workspace" }),
      ).toHaveAttribute("href", "/app");
      const previewCta = mainHero.getByRole("link", {
        name: "Lihat Pratinjau",
      });
      await expect(previewCta).toHaveAttribute("href", "#preview");
      await previewCta.click();
      await expect(page).toHaveURL(/#preview$/);

      const anchorMetrics = await page.evaluate(() => {
        const headerEl = document.querySelector("header");
        const headingEl = document.getElementById("landing-preview-heading");
        if (!headerEl || !headingEl) {
          return null;
        }
        return {
          headerBottom: headerEl.getBoundingClientRect().bottom,
          headingTop: headingEl.getBoundingClientRect().top,
        };
      });
      expect(anchorMetrics).not.toBeNull();
      expect(anchorMetrics!.headingTop).toBeGreaterThanOrEqual(
        anchorMetrics!.headerBottom - 1,
      );
      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
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
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("request", (req) => {
      if (new URL(req.url()).pathname.startsWith("/api/")) {
        apiRequests.push(req.url());
      }
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
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
    await expect
      .poll(() =>
        page.evaluate(() => window.localStorage.getItem("noka_privacy_blur")),
      )
      .toBeNull();

    // Switch EN + Dark mode simultaneously via UI toggles without page reload.
    const isMobileViewport = (page.viewportSize()?.width ?? 1280) < 640;
    const controlsContainer = isMobileViewport
      ? page.getByTestId("landing-mobile-menu")
      : page.locator("header");
    const menuToggle = page.locator("header button[aria-controls]");

    if (isMobileViewport) {
      await menuToggle.click();
      await expect(controlsContainer).toBeVisible();
    }

    await controlsContainer.getByRole("button", { name: "EN", exact: true }).click();
    const toDarkToggle = controlsContainer.getByRole("button", {
      name: /dark mode|mode gelap/i,
    });
    expect((await toDarkToggle.textContent())?.trim() ?? "").toBe("");
    await toDarkToggle.click();
    const toLightToggle = controlsContainer.getByRole("button", {
      name: /light mode|mode terang/i,
    });
    expect((await toLightToggle.textContent())?.trim() ?? "").toBe("");

    if (isMobileViewport) {
      await menuToggle.click();
      await expect(controlsContainer).toHaveCount(0);
    }

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
        window.scrollTo(0, 0);
        const overflow =
          document.documentElement.scrollWidth > window.innerWidth;
        const headerEl = document.querySelector("header");
        const headerHeight = headerEl?.getBoundingClientRect().height ?? 0;
        const heroBottom =
          document
            .querySelector('[data-testid="landing-hero"]')
            ?.getBoundingClientRect().bottom ?? 0;
        const previewHeadingTop =
          document
            .getElementById("landing-preview-heading")
            ?.getBoundingClientRect().top ?? 0;
        const gridHeight =
          document
            .querySelector('[data-testid="landing-hero-grid"]')
            ?.getBoundingClientRect().height ?? 0;
        const visibleHeaderInteractive = Array.from(
          document.querySelectorAll("header a, header button"),
        ).filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
        const minHeight = Math.min(
          ...visibleHeaderInteractive.map(
            (el) => el.getBoundingClientRect().height,
          ),
        );
        const minWidth = Math.min(
          ...visibleHeaderInteractive.map(
            (el) => el.getBoundingClientRect().width,
          ),
        );
        return {
          overflow,
          headerHeight,
          heroBottom,
          previewHeadingTop,
          gridHeight,
          visibleCount: visibleHeaderInteractive.length,
          minHeight,
          minWidth,
        };
      });
      expect(metrics.overflow, `Horizontal overflow at ${vp.width}px`).toBe(
        false,
      );
      expect(
        metrics.heroBottom,
        `Hero did not fill first viewport at ${vp.width}x${vp.height}`,
      ).toBeGreaterThanOrEqual(vp.height - 8);
      expect(
        metrics.previewHeadingTop,
        `Preview heading peeked into first viewport at ${vp.width}x${vp.height}`,
      ).toBeGreaterThanOrEqual(vp.height - 1);
      expect(
        metrics.gridHeight,
        `Grid height did not exceed first viewport at ${vp.width}x${vp.height}`,
      ).toBeGreaterThan(vp.height);
      expect(
        metrics.headerHeight,
        `Header height exceeded single-row 72px bound at ${vp.width}px`,
      ).toBeLessThanOrEqual(72);
      expect(
        metrics.visibleCount,
        `Expected visible header controls at ${vp.width}px`,
      ).toBeGreaterThanOrEqual(2);
      expect(
        metrics.minHeight,
        `Header control height < 40px at ${vp.width}px`,
      ).toBeGreaterThanOrEqual(40);
      expect(
        metrics.minWidth,
        `Header control width < 40px at ${vp.width}px`,
      ).toBeGreaterThanOrEqual(40);

      if (vp.width < 640) {
        const vpMenuToggle = page.locator("header button[aria-controls]");
        await vpMenuToggle.click();
        const openDrawer = page.getByTestId("landing-mobile-menu");
        await expect(openDrawer).toBeVisible();

        const drawerMetrics = await page.evaluate(() => {
          const overflow =
            document.documentElement.scrollWidth > window.innerWidth;
          const visibleDrawerControls = Array.from(
            document.querySelectorAll(
              '[data-testid="landing-mobile-menu"] a, [data-testid="landing-mobile-menu"] button',
            ),
          ).filter((el) => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          });
          const drawerNavRows = Array.from(
            document.querySelectorAll(
              '[data-testid="landing-mobile-menu"] nav > *, [data-testid="landing-mobile-menu"] nav > div > div > a',
            ),
          ).map((el) => el.getBoundingClientRect());
          const minHeight = Math.min(
            ...visibleDrawerControls.map(
              (el) => el.getBoundingClientRect().height,
            ),
          );
          const minWidth = Math.min(
            ...visibleDrawerControls.map(
              (el) => el.getBoundingClientRect().width,
            ),
          );
          // Every drawer item row (language row, theme row, anchors, and stacked CTA buttons) must flow top-to-bottom.
          const topRows = Array.from(
            document.querySelectorAll(
              '[data-testid="landing-mobile-menu"] nav > *',
            ),
          ).map((el) => el.getBoundingClientRect());
          const isTopRowsVertical = topRows.every(
            (rect, idx) => idx === 0 || rect.top >= topRows[idx - 1].bottom - 1,
          );
          const ctaLinks = Array.from(
            document.querySelectorAll(
              '[data-testid="landing-mobile-menu"] nav > div > div > a',
            ),
          ).map((el) => el.getBoundingClientRect());
          const isCtaLinksVertical = ctaLinks.every(
            (rect, idx) => idx === 0 || rect.top >= ctaLinks[idx - 1].bottom - 1,
          );
          return {
            overflow,
            controlCount: visibleDrawerControls.length,
            minHeight,
            minWidth,
            drawerRowCount: drawerNavRows.length,
            isTopRowsVertical,
            isCtaLinksVertical,
          };
        });

        expect(
          drawerMetrics.overflow,
          `Horizontal overflow with open drawer at ${vp.width}px`,
        ).toBe(false);
        expect(
          drawerMetrics.controlCount,
          `Expected visible controls inside mobile drawer at ${vp.width}px`,
        ).toBeGreaterThanOrEqual(5);
        expect(drawerMetrics.isTopRowsVertical).toBe(true);
        expect(drawerMetrics.isCtaLinksVertical).toBe(true);
        expect(
          drawerMetrics.minHeight,
          `Mobile drawer control height < 40px at ${vp.width}px`,
        ).toBeGreaterThanOrEqual(40);
        expect(
          drawerMetrics.minWidth,
          `Mobile drawer control width < 40px at ${vp.width}px`,
        ).toBeGreaterThanOrEqual(40);

        await vpMenuToggle.click();
        await expect(openDrawer).toHaveCount(0);
      }
    }

    // Verify /login at mobile uses single-row floating pill header WITHOUT hamburger menu.
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/login");
    const loginMetrics = await page.evaluate(() => {
      const headerEl = document.querySelector("header");
      const pillBar = document.querySelector("header > div > div");
      return {
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        headerHeight: headerEl?.getBoundingClientRect().height ?? 0,
        hamburgerCount: document.querySelectorAll("header button[aria-controls]")
          .length,
        pillRadius: pillBar
          ? Number.parseFloat(
              window.getComputedStyle(pillBar).borderTopLeftRadius || "0",
            )
          : 0,
      };
    });
    expect(loginMetrics.overflow).toBe(false);
    expect(loginMetrics.headerHeight).toBeLessThanOrEqual(72);
    expect(loginMetrics.hamburgerCount).toBe(0);
    expect(loginMetrics.pillRadius).toBeGreaterThanOrEqual(999);

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});

