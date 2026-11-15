import { inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as registerPost } from "@/app/api/auth/register/route";
import { GET as categoriesGet } from "@/app/api/categories/route";
import { GET as exportGet } from "@/app/api/finance/export/route";
import { POST as transactionsPost } from "@/app/api/transactions/route";
import { POST as transfersPost } from "@/app/api/transfers/route";
import { POST as walletsPost } from "@/app/api/wallets/route";
import { getDb } from "@/db";
import { users } from "@/db/schema/auth";
import { clearRateLimitsForTest } from "@/lib/rate-limit";

const createdUserIds: string[] = [];

function extractSessionCookie(response: Response): string {
  const headers = response.headers as unknown as {
    getSetCookie?: () => string[];
  };
  const setCookies = headers.getSetCookie
    ? headers.getSetCookie()
    : [response.headers.get("set-cookie") ?? ""];

  for (const raw of setCookies) {
    if (raw.startsWith("noka_session=")) {
      return raw.split(";")[0] ?? "";
    }
  }
  throw new Error("Missing noka_session cookie on register response");
}

function makeAuthedRequest(
  url: string,
  method: string,
  cookie?: string,
  body?: unknown,
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: {
      origin: "http://localhost:3000",
      ...(cookie ? { cookie } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function createRegisteredUser(prefix: string) {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@noka.test`;
  const res = await registerPost(
    new NextRequest("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Export User",
        email,
        password: "Password123!",
      }),
    }),
  );

  const json = await res.json();
  const userId = json.data.user.id as string;
  createdUserIds.push(userId);
  const cookie = extractSessionCookie(res);

  // Fetch categories
  const catRes = await categoriesGet(
    makeAuthedRequest("http://localhost:3000/api/categories", "GET", cookie),
  );
  const catJson = await catRes.json();
  const catList = catJson.data.categories as Array<{ id: string; name: string; type: string }>;
  const foodCat = catList.find((c) => c.type === "expense")!;
  const salaryCat = catList.find((c) => c.type === "income")!;

  return { userId, cookie, foodCat, salaryCat };
}

describe("TS-011-02: Financial Export API Integration (CSV, XLSX, PDF, Filtering, Rate Limiting & Isolation)", () => {
  beforeEach(() => {
    clearRateLimitsForTest();
  });

  afterEach(async () => {
    clearRateLimitsForTest();
    if (createdUserIds.length > 0) {
      const db = getDb();
      await db.delete(users).where(inArray(users.id, createdUserIds));
      createdUserIds.length = 0;
    }
  });

  it("enforces authentication (401) on missing or invalid session cookie", async () => {
    const unauthReq = makeAuthedRequest("http://localhost:3000/api/finance/export?format=csv", "GET");
    const res = await exportGet(unauthReq);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("enforces format parameter validation (422) for missing or unsupported formats", async () => {
    const user = await createRegisteredUser("exp-val");

    // Missing format
    const missingReq = makeAuthedRequest("http://localhost:3000/api/finance/export", "GET", user.cookie);
    const res1 = await exportGet(missingReq);
    expect(res1.status).toBe(422);

    // Unsupported format
    const invalidReq = makeAuthedRequest(
      "http://localhost:3000/api/finance/export?format=docx",
      "GET",
      user.cookie,
    );
    const res2 = await exportGet(invalidReq);
    expect(res2.status).toBe(422);
    const json2 = await res2.json();
    expect(json2.error.code).toBe("VALIDATION_ERROR");
  });

  it("exports valid CSV stream with UTF-8 BOM, headers, and strict tenant isolation", async () => {
    const userA = await createRegisteredUser("exp-a");
    const userB = await createRegisteredUser("exp-b");

    // User A: wallet & transaction
    const wResA = await walletsPost(
      makeAuthedRequest("http://localhost:3000/api/wallets", "POST", userA.cookie, {
        name: "Dompet Kas User A",
        type: "cash",
        initialBalance: 100_000,
        includeInSafeToSpend: true,
      }),
    );
    const walletA = (await wResA.json()).data.wallet;

    await transactionsPost(
      makeAuthedRequest("http://localhost:3000/api/transactions", "POST", userA.cookie, {
        walletId: walletA.id,
        categoryId: userA.foodCat.id,
        type: "expense",
        amount: 35_000,
        description: "Makan siang User A di Warung",
        occurredAt: new Date().toISOString(),
      }),
    );

    // User B: wallet & transaction (must NOT leak to User A)
    const wResB = await walletsPost(
      makeAuthedRequest("http://localhost:3000/api/wallets", "POST", userB.cookie, {
        name: "Dompet Rahasia User B",
        type: "bank",
        initialBalance: 5_000_000,
        includeInSafeToSpend: true,
      }),
    );
    const walletB = (await wResB.json()).data.wallet;

    await transactionsPost(
      makeAuthedRequest("http://localhost:3000/api/transactions", "POST", userB.cookie, {
        walletId: walletB.id,
        categoryId: userB.foodCat.id,
        type: "expense",
        amount: 999_000,
        description: "Transaksi Rahasia User B 12345",
        occurredAt: new Date().toISOString(),
      }),
    );

    // Export User A
    const reqA = makeAuthedRequest("http://localhost:3000/api/finance/export?format=csv", "GET", userA.cookie);
    const resA = await exportGet(reqA);

    expect(resA.status).toBe(200);
    expect(resA.headers.get("content-type")).toContain("text/csv");
    expect(resA.headers.get("content-disposition")).toMatch(/attachment;\s*filename="noka-transaksi-\d+\.csv"/);

    const csvBuffer = Buffer.from(await resA.arrayBuffer());
    // Verify UTF-8 BOM byte sequence EF BB BF for Excel compatibility
    expect(csvBuffer.subarray(0, 3).toString("hex")).toBe("efbbbf");

    const csvText = csvBuffer.toString("utf8");
    expect(csvText).toContain("Makan siang User A di Warung");
    expect(csvText).toContain("35000");
    expect(csvText).toContain("Dompet Kas User A");

    // Must NOT contain User B data
    expect(csvText).not.toContain("Transaksi Rahasia User B");
    expect(csvText).not.toContain("Dompet Rahasia User B");
    expect(csvText).not.toContain("999000");
  });

  it("exports valid XLSX and PDF binaries with appropriate content types", async () => {
    const user = await createRegisteredUser("exp-bin");

    const wRes = await walletsPost(
      makeAuthedRequest("http://localhost:3000/api/wallets", "POST", user.cookie, {
        name: "Dompet Bin",
        type: "cash",
        initialBalance: 200_000,
      }),
    );
    const wallet = (await wRes.json()).data.wallet;

    await transactionsPost(
      makeAuthedRequest("http://localhost:3000/api/transactions", "POST", user.cookie, {
        walletId: wallet.id,
        categoryId: user.salaryCat.id,
        type: "income",
        amount: 500_000,
        description: "Gaji Freelance",
        occurredAt: new Date().toISOString(),
      }),
    );

    // XLSX format
    const xlsxReq = makeAuthedRequest("http://localhost:3000/api/finance/export?format=xlsx", "GET", user.cookie);
    const xlsxRes = await exportGet(xlsxReq);
    expect(xlsxRes.status).toBe(200);
    expect(xlsxRes.headers.get("content-type")).toContain("spreadsheetml.sheet");
    expect(xlsxRes.headers.get("content-disposition")).toContain(".xlsx");
    const xlsxBytes = Buffer.from(await xlsxRes.arrayBuffer());
    expect(xlsxBytes.subarray(0, 4).toString("hex")).toBe("504b0304"); // PK signature

    // PDF format
    const pdfReq = makeAuthedRequest("http://localhost:3000/api/finance/export?format=pdf", "GET", user.cookie);
    const pdfRes = await exportGet(pdfReq);
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers.get("content-type")).toBe("application/pdf");
    expect(pdfRes.headers.get("content-disposition")).toContain(".pdf");
    const pdfBytes = Buffer.from(await pdfRes.arrayBuffer());
    expect(pdfBytes.subarray(0, 8).toString("utf8")).toBe("%PDF-1.4");
  });

  it("respects filters for date range, wallet, and category (including transfers)", async () => {
    const user = await createRegisteredUser("exp-filter");

    const wRes1 = await walletsPost(
      makeAuthedRequest("http://localhost:3000/api/wallets", "POST", user.cookie, {
        name: "Dompet A",
        type: "cash",
        initialBalance: 500_000,
      }),
    );
    const wallet1 = (await wRes1.json()).data.wallet;

    const wRes2 = await walletsPost(
      makeAuthedRequest("http://localhost:3000/api/wallets", "POST", user.cookie, {
        name: "Dompet B",
        type: "bank",
        initialBalance: 1_000_000,
      }),
    );
    const wallet2 = (await wRes2.json()).data.wallet;

    // Tx 1: In Wallet A, Food Category
    await transactionsPost(
      makeAuthedRequest("http://localhost:3000/api/transactions", "POST", user.cookie, {
        walletId: wallet1.id,
        categoryId: user.foodCat.id,
        type: "expense",
        amount: 25_000,
        description: "Makan Bakso",
        occurredAt: "2026-11-10T12:00:00.000Z",
      }),
    );

    // Tx 2: In Wallet B, Salary Category
    await transactionsPost(
      makeAuthedRequest("http://localhost:3000/api/transactions", "POST", user.cookie, {
        walletId: wallet2.id,
        categoryId: user.salaryCat.id,
        type: "income",
        amount: 2_000_000,
        description: "Bonus Project",
        occurredAt: "2026-11-15T12:00:00.000Z",
      }),
    );

    // Transfer: Wallet 2 -> Wallet 1
    await transfersPost(
      makeAuthedRequest("http://localhost:3000/api/transfers", "POST", user.cookie, {
        fromWalletId: wallet2.id,
        toWalletId: wallet1.id,
        amount: 100_000,
        note: "Tarik Tunai Bank ke Dompet",
        occurredAt: "2026-11-12T12:00:00.000Z",
      }),
    );

    // Filter by wallet1: Should have Tx 1 and Transfer, but NOT Tx 2
    const w1Req = makeAuthedRequest(
      `http://localhost:3000/api/finance/export?format=csv&walletId=${wallet1.id}&startDate=2026-11-01&endDate=2026-11-30`,
      "GET",
      user.cookie,
    );
    const w1Res = await exportGet(w1Req);
    const w1Csv = await w1Res.text();
    expect(w1Csv).toContain("Makan Bakso");
    expect(w1Csv).toContain("Tarik Tunai Bank ke Dompet");
    expect(w1Csv).not.toContain("Bonus Project");

    // Filter by salary category: Should have Tx 2, but NOT Tx 1 and NOT Transfer
    const catReq = makeAuthedRequest(
      `http://localhost:3000/api/finance/export?format=csv&categoryId=${user.salaryCat.id}&startDate=2026-11-01&endDate=2026-11-30`,
      "GET",
      user.cookie,
    );
    const catRes = await exportGet(catReq);
    const catCsv = await catRes.text();
    expect(catCsv).toContain("Bonus Project");
    expect(catCsv).not.toContain("Makan Bakso");
    expect(catCsv).not.toContain("Tarik Tunai Bank ke Dompet");
  });

  it("enforces rate limit of 10 requests per minute returning 429 RATE_LIMIT_EXCEEDED", async () => {
    const user = await createRegisteredUser("exp-rate");

    // 10 allowed requests
    for (let i = 0; i < 10; i++) {
      const req = makeAuthedRequest("http://localhost:3000/api/finance/export?format=csv", "GET", user.cookie);
      const res = await exportGet(req);
      expect(res.status).toBe(200);
    }

    // 11th request must be rejected with 429
    const blockedReq = makeAuthedRequest("http://localhost:3000/api/finance/export?format=csv", "GET", user.cookie);
    const blockedRes = await exportGet(blockedReq);
    expect(blockedRes.status).toBe(429);
    expect(blockedRes.headers.get("retry-after")).toBeTruthy();
    const json = await blockedRes.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("RATE_LIMIT_EXCEEDED");
  });
});
