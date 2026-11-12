import { eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { POST as registerPost } from "@/app/api/auth/register/route";
import { GET as categoriesGet } from "@/app/api/categories/route";
import { GET as financeSummaryGet } from "@/app/api/finance/summary/route";
import { POST as transactionsPost } from "@/app/api/transactions/route";
import { POST as transfersPost } from "@/app/api/transfers/route";
import { PATCH as walletPatch } from "@/app/api/wallets/[id]/route";
import { POST as walletsPost } from "@/app/api/wallets/route";
import { getDb } from "@/db";
import { users } from "@/db/schema/auth";
import { categories, transactions, transfers, wallets } from "@/db/schema/finance";
import { getFinanceSummary } from "@/features/finance/summary-service";

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
  cookie: string,
  body?: unknown,
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: {
      origin: "http://localhost:3000",
      cookie,
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
        name: "Summary User",
        email,
        password: "password1234",
      }),
    }),
  );

  expect(res.status).toBe(201);
  const json = (await res.json()) as {
    ok: true;
    data: { user: { id: string } };
  };
  createdUserIds.push(json.data.user.id);
  return {
    userId: json.data.user.id,
    cookie: extractSessionCookie(res),
  };
}

describe("Finance Cycle Summary API Integration (TS-007-03)", () => {
  afterEach(async () => {
    if (createdUserIds.length > 0) {
      const db = getDb();
      const ids = [...createdUserIds];
      createdUserIds.length = 0;
      await db.delete(transfers).where(inArray(transfers.userId, ids));
      await db.delete(transactions).where(inArray(transactions.userId, ids));
      await db.delete(wallets).where(inArray(wallets.userId, ids));
      await db.delete(categories).where(inArray(categories.userId, ids));
      await db.delete(users).where(inArray(users.id, ids));
    }
  });

  it("enforces auth, cursor & date validation, tenant isolation, Safe-to-Spend cycle calculation, cashflow/breakdown type rules, and combined keyset pagination", async () => {
    // 1. Unauthenticated access rejected with 401
    const unauthRes = await financeSummaryGet(
      new NextRequest("http://localhost:3000/api/finance/summary", { method: "GET" }),
    );
    expect(unauthRes.status).toBe(401);

    const alice = await createRegisteredUser("sum-alice");
    const bob = await createRegisteredUser("sum-bob");

    // Set Alice's cycleStartDay to "25" in DB and verify summary reflects user.cycleStartDay
    await getDb()
      .update(users)
      .set({ cycleStartDay: "25" })
      .where(eq(users.id, alice.userId));

    // 2. Malformed cursor -> 400 INVALID_CURSOR
    const badCursorRes = await financeSummaryGet(
      makeAuthedRequest(
        "http://localhost:3000/api/finance/summary?cursor=not-a-valid-cursor",
        "GET",
        alice.cookie,
      ),
    );
    expect(badCursorRes.status).toBe(400);
    expect(((await badCursorRes.json()) as { error: { code: string } }).error.code).toBe(
      "INVALID_CURSOR",
    );

    // 3. Invalid range from > to -> 422 VALIDATION_ERROR
    const badRangeRes = await financeSummaryGet(
      makeAuthedRequest(
        "http://localhost:3000/api/finance/summary?from=2026-11-20&to=2026-11-10",
        "GET",
        alice.cookie,
      ),
    );
    expect(badRangeRes.status).toBe(422);

    // 4. Create wallets: Cash (500k, included=true), Bank (2M, included=false), Archived (300k, later archived)
    const cashJson = (await (
      await walletsPost(
        makeAuthedRequest(
          "http://localhost:3000/api/wallets",
          "POST",
          alice.cookie,
          { name: "Dompet Harian", type: "cash", initialBalance: 500_000 },
        ),
      )
    ).json()) as { data: { wallet: { id: string } } };
    const cashId = cashJson.data.wallet.id;

    const bankJson = (await (
      await walletsPost(
        makeAuthedRequest(
          "http://localhost:3000/api/wallets",
          "POST",
          alice.cookie,
          { name: "Tabungan BCA", type: "bank", initialBalance: 2_000_000 },
        ),
      )
    ).json()) as { data: { wallet: { id: string } } };
    const bankId = bankJson.data.wallet.id;

    const archivedWalletJson = (await (
      await walletsPost(
        makeAuthedRequest(
          "http://localhost:3000/api/wallets",
          "POST",
          alice.cookie,
          { name: "Dompet Lama", type: "ewallet", initialBalance: 300_000 },
        ),
      )
    ).json()) as { data: { wallet: { id: string } } };
    const archivedWalletId = archivedWalletJson.data.wallet.id;
    await walletPatch(
      makeAuthedRequest(
        `http://localhost:3000/api/wallets/${archivedWalletId}`,
        "PATCH",
        alice.cookie,
        { archived: true },
      ),
      { params: Promise.resolve({ id: archivedWalletId }) },
    );

    const catsJson = (await (
      await categoriesGet(
        makeAuthedRequest(
          "http://localhost:3000/api/categories",
          "GET",
          alice.cookie,
        ),
      )
    ).json()) as {
      data: {
        categories: Array<{ id: string; systemKey: string | null; type: string }>;
      };
    };
    const foodCat = catsJson.data.categories.find((c) => c.systemKey === "food_drink")!;
    const salaryCat = catsJson.data.categories.find((c) => c.systemKey === "salary")!;

    // Seed mixed entries inside cycle [2026-10-25..2026-11-24]:
    // Income: +1,000,000 into Cash (Nov 02)
    // Expense: -200,000 from Cash (Nov 05)
    // Transfer: 400,000 from Bank -> Cash (Nov 05 - same occurredAt timestamp to verify kind tie-break & pagination!)
    const sharedTs = "2026-11-05T10:00:00.000Z";
    await transactionsPost(
      makeAuthedRequest(
        "http://localhost:3000/api/transactions",
        "POST",
        alice.cookie,
        {
          walletId: cashId,
          categoryId: salaryCat.id,
          type: "income",
          amount: 1_000_000,
          description: "Bonus Proyek",
          occurredAt: "2026-11-02T08:00:00.000Z",
        },
      ),
    );
    await transactionsPost(
      makeAuthedRequest(
        "http://localhost:3000/api/transactions",
        "POST",
        alice.cookie,
        {
          walletId: cashId,
          categoryId: foodCat.id,
          type: "expense",
          amount: 200_000,
          description: "Makan Tim",
          occurredAt: sharedTs,
        },
      ),
    );
    await transfersPost(
      makeAuthedRequest(
        "http://localhost:3000/api/transfers",
        "POST",
        alice.cookie,
        {
          fromWalletId: bankId,
          toWalletId: cashId,
          amount: 400_000,
          note: "Topup Dompet",
          occurredAt: sharedTs,
        },
      ),
    );

    // Cash balance = 500k + 1M - 200k + 400k = 1,700,000
    // Bank balance = 2M - 400k = 1,600,000
    // Active totalBalance = 3,300,000 (excludes 300k archived wallet!)
    // Use fixed nowDate 2026-11-15T05:00:00Z (12:00 WIB) -> cycleStartDay=25 -> [2026-10-25..2026-11-24], remainingDays = 10
    // Safe-to-Spend = floor(1,700,000 / 10) = 170,000
    const fixedNow = new Date("2026-11-15T05:00:00.000Z");

    const defaultSummary = await getFinanceSummary(
      alice.userId,
      { includeArchived: false, limit: 50 },
      { nowDate: fixedNow },
    );
    expect(defaultSummary.cycle.cycleStartDay).toBe("25");
    expect(defaultSummary.cycle.startDate).toBe("2026-10-25");
    expect(defaultSummary.cycle.endDate).toBe("2026-11-24");
    expect(defaultSummary.wallets.map((w) => w.name).sort()).toEqual([
      "Dompet Harian",
      "Tabungan BCA",
    ]);
    expect(defaultSummary.totalBalance).toBe(3_300_000);
    expect(defaultSummary.safeToSpend).toEqual({
      safeToSpend: 170_000,
      totalIncludedBalance: 1_700_000,
      remainingDays: 10,
      includedWalletCount: 1,
      status: "ok",
    });
    // Transfer MUST NOT contaminate cashflow or categoryBreakdown!
    expect(defaultSummary.cashflow).toEqual({
      totalIncome: 1_000_000,
      totalExpense: 200_000,
      net: 800_000,
    });
    expect(defaultSummary.categoryBreakdown).toHaveLength(2);
    expect(defaultSummary.ledger.items).toHaveLength(3);

    // includeArchived=true exposes archived wallet in `wallets` while `totalBalance` STILL excludes it
    const withArchived = await getFinanceSummary(
      alice.userId,
      { includeArchived: true },
      { nowDate: fixedNow },
    );
    expect(withArchived.wallets).toHaveLength(3);
    expect(withArchived.totalBalance).toBe(3_300_000);

    // type=transfer -> cashflow all 0, categoryBreakdown [], ledger includes transfer
    const transferOnly = await getFinanceSummary(
      alice.userId,
      { type: "transfer" },
      { nowDate: fixedNow },
    );
    expect(transferOnly.cashflow).toEqual({
      totalIncome: 0,
      totalExpense: 0,
      net: 0,
    });
    expect(transferOnly.categoryBreakdown).toEqual([]);
    expect(transferOnly.ledger.items).toHaveLength(1);
    expect(transferOnly.ledger.items[0]?.kind).toBe("transfer");

    // type=transfer & categoryId -> ledger.items: []
    const transferWithCat = await getFinanceSummary(
      alice.userId,
      { type: "transfer", categoryId: foodCat.id },
      { nowDate: fixedNow },
    );
    expect(transferWithCat.ledger.items).toEqual([]);

    // type=income -> totalExpense=0; type=expense -> totalIncome=0
    const incomeOnly = await getFinanceSummary(
      alice.userId,
      { type: "income" },
      { nowDate: fixedNow },
    );
    expect(incomeOnly.cashflow).toEqual({
      totalIncome: 1_000_000,
      totalExpense: 0,
      net: 1_000_000,
    });
    const expenseOnly = await getFinanceSummary(
      alice.userId,
      { type: "expense" },
      { nowDate: fixedNow },
    );
    expect(expenseOnly.cashflow).toEqual({
      totalIncome: 0,
      totalExpense: 200_000,
      net: -200_000,
    });

    // Combined keyset pagination (limit=1 across all 3 items with 0 duplicates/gaps)
    const p1 = await getFinanceSummary(
      alice.userId,
      { limit: 1 },
      { nowDate: fixedNow },
    );
    expect(p1.ledger.items).toHaveLength(1);
    expect(p1.ledger.nextCursor).not.toBeNull();

    const p2 = await getFinanceSummary(
      alice.userId,
      { limit: 1, cursor: p1.ledger.nextCursor ?? undefined },
      { nowDate: fixedNow },
    );
    expect(p2.ledger.items).toHaveLength(1);
    expect(p2.ledger.nextCursor).not.toBeNull();

    const p3 = await getFinanceSummary(
      alice.userId,
      { limit: 1, cursor: p2.ledger.nextCursor ?? undefined },
      { nowDate: fixedNow },
    );
    expect(p3.ledger.items).toHaveLength(1);
    expect(p3.ledger.nextCursor).toBeNull();

    const seenKeys = [
      ...p1.ledger.items,
      ...p2.ledger.items,
      ...p3.ledger.items,
    ].map((item) => `${item.kind}:${item.id}`);
    expect(new Set(seenKeys).size).toBe(3);

    // Live Route Handler check + latency budget PERF-2 (< 300ms) & Bob tenant isolation
    const startMs = performance.now();
    const routeRes = await financeSummaryGet(
      makeAuthedRequest(
        "http://localhost:3000/api/finance/summary?limit=10",
        "GET",
        alice.cookie,
      ),
    );
    const elapsedMs = performance.now() - startMs;
    expect(routeRes.status).toBe(200);
    expect(elapsedMs).toBeLessThan(300);

    const bobRes = await financeSummaryGet(
      makeAuthedRequest(
        "http://localhost:3000/api/finance/summary",
        "GET",
        bob.cookie,
      ),
    );
    const bobJson = (await bobRes.json()) as {
      data: {
        wallets: unknown[];
        totalBalance: number;
        ledger: { items: unknown[] };
      };
    };
    expect(bobRes.status).toBe(200);
    expect(bobJson.data.wallets).toEqual([]);
    expect(bobJson.data.totalBalance).toBe(0);
    expect(bobJson.data.ledger.items).toEqual([]);
  });
});

