import { inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { POST as registerPost } from "@/app/api/auth/register/route";
import {
  DELETE as categoryDelete,
} from "@/app/api/categories/[id]/route";
import {
  GET as categoriesGet,
  POST as categoriesPost,
} from "@/app/api/categories/route";
import {
  DELETE as budgetDelete,
} from "@/app/api/finance/budgets/[id]/route";
import {
  GET as budgetsGet,
  POST as budgetsPost,
} from "@/app/api/finance/budgets/route";
import { POST as transactionsPost } from "@/app/api/transactions/route";
import { POST as walletsPost } from "@/app/api/wallets/route";
import { getDb } from "@/db";
import { users } from "@/db/schema/auth";
import {
  categories,
  categoryBudgets,
  transactions,
  transfers,
  wallets,
} from "@/db/schema/finance";

const createdUserIds: string[] = [];

afterEach(async () => {
  if (createdUserIds.length === 0) return;
  const db = getDb();
  const ids = [...createdUserIds];
  createdUserIds.length = 0;

  await db.delete(categoryBudgets).where(inArray(categoryBudgets.userId, ids));
  await db.delete(transactions).where(inArray(transactions.userId, ids));
  await db.delete(transfers).where(inArray(transfers.userId, ids));
  await db.delete(wallets).where(inArray(wallets.userId, ids));
  await db.delete(categories).where(inArray(categories.userId, ids));
  await db.delete(users).where(inArray(users.id, ids));
});

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
  customHeaders: Record<string, string> = {},
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: {
      origin: "http://localhost:3000",
      cookie,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...customHeaders,
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
        name: "Budget User",
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
  const catList = catJson.data.categories as Array<{
    id: string;
    name: string;
    type: string;
  }>;
  const foodCat = catList.find((c) => c.type === "expense")!;
  const incomeCat = catList.find((c) => c.type === "income")!;

  // Create a default wallet for transactions
  const walletRes = await walletsPost(
    makeAuthedRequest("http://localhost:3000/api/wallets", "POST", cookie, {
      name: "Dompet Utama",
      type: "cash",
      initialBalance: 5_000_000,
      includeInSafeToSpend: true,
      isDefault: true,
    }),
  );
  const walletJson = await walletRes.json();
  const wallet = walletJson.data.wallet as { id: string; name: string };

  return { userId, cookie, foodCat, incomeCat, wallet };
}

describe("TS-012-02: Category Budgets API Integration & Integrity (Integration)", () => {
  it("enforces authentication (401) on GET, POST, and DELETE", async () => {
    // Unauth GET
    const getRes = await budgetsGet(
      new NextRequest("http://localhost:3000/api/finance/budgets", {
        method: "GET",
      }),
    );
    expect(getRes.status).toBe(401);

    // Unauth POST
    const postRes = await budgetsPost(
      new NextRequest("http://localhost:3000/api/finance/budgets", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          categoryId: crypto.randomUUID(),
          amount: 1_000_000,
          period: "2026-11",
        }),
      }),
    );
    expect(postRes.status).toBe(401);

    // Unauth DELETE
    const deleteRes = await budgetDelete(
      new NextRequest(
        `http://localhost:3000/api/finance/budgets/${crypto.randomUUID()}`,
        {
          method: "DELETE",
          headers: { origin: "http://localhost:3000" },
        },
      ),
      { params: Promise.resolve({ id: crypto.randomUUID() }) },
    );
    expect(deleteRes.status).toBe(401);
  });

  it("enforces CSRF protection (403) on mutation endpoints", async () => {
    const user = await createRegisteredUser("bgt-csrf");

    const noCsrfReq = new NextRequest(
      "http://localhost:3000/api/finance/budgets",
      {
        method: "POST",
        headers: {
          cookie: user.cookie,
          "content-type": "application/json",
          origin: "http://malicious-site.com",
        },
        body: JSON.stringify({
          categoryId: user.foodCat.id,
          amount: 1_000_000,
          period: "2026-11",
        }),
      },
    );

    const postRes = await budgetsPost(noCsrfReq);
    expect(postRes.status).toBe(403);
  });

  it("validates input: rejects invalid amounts and non-expense categories (422)", async () => {
    const user = await createRegisteredUser("bgt-val");

    // Negative / 0 amount
    const invalidAmountReq = makeAuthedRequest(
      "http://localhost:3000/api/finance/budgets",
      "POST",
      user.cookie,
      {
        categoryId: user.foodCat.id,
        amount: -50_000,
        period: "2026-11",
      },
    );
    const amountRes = await budgetsPost(invalidAmountReq);
    expect(amountRes.status).toBe(422);

    // Income category rejection
    const incomeCatReq = makeAuthedRequest(
      "http://localhost:3000/api/finance/budgets",
      "POST",
      user.cookie,
      {
        categoryId: user.incomeCat.id,
        amount: 2_000_000,
        period: "2026-11",
      },
    );
    const incomeRes = await budgetsPost(incomeCatReq);
    expect(incomeRes.status).toBe(422);
    const incomeJson = await incomeRes.json();
    expect(incomeJson.error.code).toBe("INVALID_CATEGORY_TYPE");
  });

  it("creates, upserts atomik, and supports idempotency keys without duplicate records", async () => {
    const user = await createRegisteredUser("bgt-upsert");
    const idempotencyKey = crypto.randomUUID();

    // 1. Initial creation
    const createReq = makeAuthedRequest(
      "http://localhost:3000/api/finance/budgets",
      "POST",
      user.cookie,
      {
        categoryId: user.foodCat.id,
        amount: 1_000_000,
        period: "2026-11",
        idempotencyKey,
      },
      { "Idempotency-Key": idempotencyKey },
    );
    const createRes = await budgetsPost(createReq);
    expect(createRes.status).toBe(200);
    const createJson = await createRes.json();
    expect(createJson.ok).toBe(true);
    expect(createJson.data.budget.amount).toBe(1_000_000);
    expect(createJson.data.budget.status).toBe("normal");
    const budgetId = createJson.data.budget.id;

    // 2. Exact idempotency replay returns same budget
    const replayReq = makeAuthedRequest(
      "http://localhost:3000/api/finance/budgets",
      "POST",
      user.cookie,
      {
        categoryId: user.foodCat.id,
        amount: 1_000_000,
        period: "2026-11",
        idempotencyKey,
      },
      { "Idempotency-Key": idempotencyKey },
    );
    const replayRes = await budgetsPost(replayReq);
    expect(replayRes.status).toBe(200);
    const replayJson = await replayRes.json();
    expect(replayJson.data.budget.id).toBe(budgetId);

    // 3. Upsert update (new amount, same category & period)
    const updateReq = makeAuthedRequest(
      "http://localhost:3000/api/finance/budgets",
      "POST",
      user.cookie,
      {
        categoryId: user.foodCat.id,
        amount: 1_500_000,
        period: "2026-11",
      },
    );
    const updateRes = await budgetsPost(updateReq);
    expect(updateRes.status).toBe(200);
    const updateJson = await updateRes.json();
    expect(updateJson.data.budget.id).toBe(budgetId);
    expect(updateJson.data.budget.amount).toBe(1_500_000);

    // 4. Verify GET list contains exactly 1 item
    const listRes = await budgetsGet(
      makeAuthedRequest(
        "http://localhost:3000/api/finance/budgets?period=2026-11",
        "GET",
        user.cookie,
      ),
    );
    const listJson = await listRes.json();
    expect(listJson.data.items).toHaveLength(1);
    expect(listJson.data.items[0].amount).toBe(1_500_000);
  });

  it("calculates real-time spending, status transitions (normal -> warning -> exceeded) against ledger transactions", async () => {
    const user = await createRegisteredUser("bgt-spend");

    // 1. Create budget of Rp1.000.000 for period 2026-11
    await budgetsPost(
      makeAuthedRequest(
        "http://localhost:3000/api/finance/budgets",
        "POST",
        user.cookie,
        {
          categoryId: user.foodCat.id,
          amount: 1_000_000,
          period: "2026-11",
        },
      ),
    );

    // 2. Add an expense of Rp500.000 -> 50% (normal)
    await transactionsPost(
      makeAuthedRequest(
        "http://localhost:3000/api/transactions",
        "POST",
        user.cookie,
        {
          walletId: user.wallet.id,
          categoryId: user.foodCat.id,
          type: "expense",
          amount: 500_000,
          occurredAt: "2026-11-05T12:00:00.000Z",
        },
      ),
    );

    const getRes1 = await budgetsGet(
      makeAuthedRequest(
        "http://localhost:3000/api/finance/budgets?period=2026-11",
        "GET",
        user.cookie,
      ),
    );
    const json1 = await getRes1.json();
    expect(json1.data.items[0].spentAmount).toBe(500_000);
    expect(json1.data.items[0].percentage).toBe(50);
    expect(json1.data.items[0].status).toBe("normal");

    // 3. Add Rp350.000 -> total Rp850.000 (85%, warning)
    await transactionsPost(
      makeAuthedRequest(
        "http://localhost:3000/api/transactions",
        "POST",
        user.cookie,
        {
          walletId: user.wallet.id,
          categoryId: user.foodCat.id,
          type: "expense",
          amount: 350_000,
          occurredAt: "2026-11-10T12:00:00.000Z",
        },
      ),
    );

    const getRes2 = await budgetsGet(
      makeAuthedRequest(
        "http://localhost:3000/api/finance/budgets?period=2026-11",
        "GET",
        user.cookie,
      ),
    );
    const json2 = await getRes2.json();
    expect(json2.data.items[0].spentAmount).toBe(850_000);
    expect(json2.data.items[0].percentage).toBe(85);
    expect(json2.data.items[0].status).toBe("warning");

    // 4. Add Rp250.000 -> total Rp1.100.000 (110%, exceeded, remaining -100.000)
    await transactionsPost(
      makeAuthedRequest(
        "http://localhost:3000/api/transactions",
        "POST",
        user.cookie,
        {
          walletId: user.wallet.id,
          categoryId: user.foodCat.id,
          type: "expense",
          amount: 250_000,
          occurredAt: "2026-11-15T12:00:00.000Z",
        },
      ),
    );

    const getRes3 = await budgetsGet(
      makeAuthedRequest(
        "http://localhost:3000/api/finance/budgets?period=2026-11",
        "GET",
        user.cookie,
      ),
    );
    const json3 = await getRes3.json();
    expect(json3.data.items[0].spentAmount).toBe(1_100_000);
    expect(json3.data.items[0].remainingAmount).toBe(-100_000);
    expect(json3.data.items[0].percentage).toBe(110);
    expect(json3.data.items[0].status).toBe("exceeded");
  });

  it("deletes a budget limit with DELETE /api/finance/budgets/[id]", async () => {
    const user = await createRegisteredUser("bgt-del");

    const createRes = await budgetsPost(
      makeAuthedRequest(
        "http://localhost:3000/api/finance/budgets",
        "POST",
        user.cookie,
        {
          categoryId: user.foodCat.id,
          amount: 800_000,
          period: "2026-11",
        },
      ),
    );
    const createJson = await createRes.json();
    const budgetId = createJson.data.budget.id;

    // Delete
    const deleteRes = await budgetDelete(
      makeAuthedRequest(
        `http://localhost:3000/api/finance/budgets/${budgetId}`,
        "DELETE",
        user.cookie,
      ),
      { params: Promise.resolve({ id: budgetId }) },
    );
    expect(deleteRes.status).toBe(200);

    // Verify GET list is empty
    const listRes = await budgetsGet(
      makeAuthedRequest(
        "http://localhost:3000/api/finance/budgets?period=2026-11",
        "GET",
        user.cookie,
      ),
    );
    const listJson = await listRes.json();
    expect(listJson.data.items).toHaveLength(0);
  });

  it("cascades deletion: deleting a custom category removes its budgets (DATA-4)", async () => {
    const user = await createRegisteredUser("bgt-cascade");

    // 1. Create custom expense category
    const customCatRes = await categoriesPost(
      makeAuthedRequest(
        "http://localhost:3000/api/categories",
        "POST",
        user.cookie,
        {
          name: "Langganan SaaS",
          type: "expense",
        },
      ),
    );
    const customCatJson = await customCatRes.json();
    const customCatId = customCatJson.data.category.id;

    // 2. Set budget on custom category
    const bgtRes = await budgetsPost(
      makeAuthedRequest(
        "http://localhost:3000/api/finance/budgets",
        "POST",
        user.cookie,
        {
          categoryId: customCatId,
          amount: 500_000,
          period: "2026-11",
        },
      ),
    );
    expect(bgtRes.status).toBe(200);

    // Verify budget exists
    const listBefore = await budgetsGet(
      makeAuthedRequest(
        "http://localhost:3000/api/finance/budgets?period=2026-11",
        "GET",
        user.cookie,
      ),
    );
    const beforeJson = await listBefore.json();
    expect(beforeJson.data.items.some((b: { categoryId: string }) => b.categoryId === customCatId)).toBe(true);

    // 3. Delete custom category
    const delCatRes = await categoryDelete(
      makeAuthedRequest(
        `http://localhost:3000/api/categories/${customCatId}`,
        "DELETE",
        user.cookie,
      ),
      { params: Promise.resolve({ id: customCatId }) },
    );
    expect(delCatRes.status).toBe(200);

    // 4. Verify budget for custom category is gone
    const listAfter = await budgetsGet(
      makeAuthedRequest(
        "http://localhost:3000/api/finance/budgets?period=2026-11",
        "GET",
        user.cookie,
      ),
    );
    const afterJson = await listAfter.json();
    expect(afterJson.data.items.some((b: { categoryId: string }) => b.categoryId === customCatId)).toBe(false);
  });

  it("enforces multi-tenant isolation: User A cannot read, mutate or delete User B's budgets (SEC-1)", async () => {
    const userA = await createRegisteredUser("bgt-tenant-a");
    const userB = await createRegisteredUser("bgt-tenant-b");

    // User A creates budget
    const budgetARes = await budgetsPost(
      makeAuthedRequest(
        "http://localhost:3000/api/finance/budgets",
        "POST",
        userA.cookie,
        {
          categoryId: userA.foodCat.id,
          amount: 750_000,
          period: "2026-11",
        },
      ),
    );
    const budgetAJson = await budgetARes.json();
    const budgetAId = budgetAJson.data.budget.id;

    // User B attempts to delete User A's budget -> 404
    const deleteByBRes = await budgetDelete(
      makeAuthedRequest(
        `http://localhost:3000/api/finance/budgets/${budgetAId}`,
        "DELETE",
        userB.cookie,
      ),
      { params: Promise.resolve({ id: budgetAId }) },
    );
    expect(deleteByBRes.status).toBe(404);

    // User B attempts to set budget using User A's categoryId -> 404
    const hijackRes = await budgetsPost(
      makeAuthedRequest(
        "http://localhost:3000/api/finance/budgets",
        "POST",
        userB.cookie,
        {
          categoryId: userA.foodCat.id,
          amount: 999_000,
          period: "2026-11",
        },
      ),
    );
    expect(hijackRes.status).toBe(404);

    // User B's list does not contain User A's budget
    const listBRes = await budgetsGet(
      makeAuthedRequest(
        "http://localhost:3000/api/finance/budgets?period=2026-11",
        "GET",
        userB.cookie,
      ),
    );
    const listBJson = await listBRes.json();
    expect(listBJson.data.items).toHaveLength(0);
  });
});
