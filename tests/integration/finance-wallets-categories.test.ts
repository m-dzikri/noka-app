import { inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db";
import { users } from "@/db/schema/auth";
import { categories, transactions, transfers, wallets } from "@/db/schema/finance";
import { POST as registerPost } from "@/app/api/auth/register/route";
import {
  DELETE as categoryDelete,
  PATCH as categoryPatch,
} from "@/app/api/categories/[id]/route";
import {
  GET as categoriesGet,
  POST as categoriesPost,
} from "@/app/api/categories/route";
import {
  DELETE as transactionDelete,
  PATCH as transactionPatch,
} from "@/app/api/transactions/[id]/route";
import {
  GET as transactionsGet,
  POST as transactionsPost,
} from "@/app/api/transactions/route";
import {
  DELETE as walletDelete,
  PATCH as walletPatch,
} from "@/app/api/wallets/[id]/route";
import {
  GET as walletsGet,
  POST as walletsPost,
} from "@/app/api/wallets/route";

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
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: {
      origin: "http://localhost:3000",
      cookie,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    ...(body !== undefined
      ? { body: typeof body === "string" ? body : JSON.stringify(body) }
      : {}),
  });
}

function makePlainRequest(
  url: string,
  method: string,
  headers: Record<string, string> = {},
  body?: unknown,
): NextRequest {
  return new NextRequest(url, {
    method,
    headers,
    ...(body !== undefined
      ? { body: typeof body === "string" ? body : JSON.stringify(body) }
      : {}),
  });
}

async function createRegisteredUser(label: string) {
  const req = new NextRequest("http://localhost:3000/api/auth/register", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      name: label,
      email: `${label.toLowerCase()}-${crypto.randomUUID()}@noka.test`,
      password: "password1234",
      locale: "id",
      theme: "light",
    }),
  });

  const res = await registerPost(req);
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

describe("TS-006-02: Wallets & Categories API Lifecycle, Integrity, Idempotency & LWW", () => {
  afterEach(async () => {
    const { clearRateLimitsForTest } = await import("@/lib/rate-limit");
    clearRateLimitsForTest();
    vi.restoreAllMocks();

    if (createdUserIds.length > 0) {
      const db = getDb();
      const targetIds = [...createdUserIds];
      await db.delete(transactions).where(inArray(transactions.userId, targetIds));
      await db.delete(transfers).where(inArray(transfers.userId, targetIds));
      await db.delete(wallets).where(inArray(wallets.userId, targetIds));
      await db.delete(categories).where(inArray(categories.userId, targetIds));
      await db.delete(users).where(inArray(users.id, targetIds));
      createdUserIds.length = 0;
    }
  });

  it("handles wallet defaults, Safe-to-Spend defaults, archive/unarchive promotion, 0-history hard delete vs WALLET_HAS_HISTORY after LWW, and idempotency", async () => {
    const alice = await createRegisteredUser("Alice");
    const bob = await createRegisteredUser("Bob");

    // Unauthenticated & CSRF checks
    expect(
      (await walletsGet(makePlainRequest("http://localhost:3000/api/wallets", "GET"))).status,
    ).toBe(401);
    expect(
      (
        await walletsPost(
          makePlainRequest(
            "http://localhost:3000/api/wallets",
            "POST",
            {
              origin: "https://evil.example",
              cookie: alice.cookie,
              "content-type": "application/json",
            },
            { name: "Kas", type: "cash" },
          ),
        )
      ).status,
    ).toBe(403);

    // 1. Create first wallet (bank): forced isDefault = true, includeInSafeToSpend defaults false for bank
    const bankRes = await walletsPost(
      makeAuthedRequest("http://localhost:3000/api/wallets", "POST", alice.cookie, {
        name: "Bank Utama",
        type: "bank",
        initialBalance: 1_000_000,
      }),
    );
    expect(bankRes.status).toBe(201);
    const bankJson = (await bankRes.json()) as {
      ok: true;
      data: {
        wallet: {
          id: string;
          isDefault: boolean;
          includeInSafeToSpend: boolean;
          currentBalance: number;
          updatedAt: string;
        };
      };
    };
    const bankId = bankJson.data.wallet.id;
    expect(bankJson.data.wallet.isDefault).toBe(true);
    expect(bankJson.data.wallet.includeInSafeToSpend).toBe(false);
    expect(bankJson.data.wallet.currentBalance).toBe(1_000_000);

    // 2. Create second wallet (ewallet): includeInSafeToSpend defaults true, isDefault = false
    const ewalletRes = await walletsPost(
      makeAuthedRequest("http://localhost:3000/api/wallets", "POST", alice.cookie, {
        name: "GoPay",
        type: "ewallet",
        initialBalance: 250_000,
      }),
    );
    expect(ewalletRes.status).toBe(201);
    const ewalletJson = (await ewalletRes.json()) as {
      ok: true;
      data: { wallet: { id: string; isDefault: boolean; includeInSafeToSpend: boolean } };
    };
    const ewalletId = ewalletJson.data.wallet.id;
    expect(ewalletJson.data.wallet.isDefault).toBe(false);
    expect(ewalletJson.data.wallet.includeInSafeToSpend).toBe(true);

    // Changing type does NOT implicitly flip includeInSafeToSpend
    const typeChangeRes = await walletPatch(
      makeAuthedRequest(
        `http://localhost:3000/api/wallets/${bankId}`,
        "PATCH",
        alice.cookie,
        { type: "cash" },
      ),
      { params: Promise.resolve({ id: bankId }) },
    );
    expect(typeChangeRes.status).toBe(200);
    const typeChangeJson = (await typeChangeRes.json()) as {
      data: { wallet: { includeInSafeToSpend: boolean } };
    };
    expect(typeChangeJson.data.wallet.includeInSafeToSpend).toBe(false);

    // Reject { isDefault: true, archived: true } with 422
    const invalidComboRes = await walletPatch(
      makeAuthedRequest(
        `http://localhost:3000/api/wallets/${bankId}`,
        "PATCH",
        alice.cookie,
        { isDefault: true, archived: true },
      ),
      { params: Promise.resolve({ id: bankId }) },
    );
    expect(invalidComboRes.status).toBe(422);

    // Archiving default wallet promotes remaining oldest active wallet (ewallet) to default
    const archiveRes = await walletPatch(
      makeAuthedRequest(
        `http://localhost:3000/api/wallets/${bankId}`,
        "PATCH",
        alice.cookie,
        { archived: true },
      ),
      { params: Promise.resolve({ id: bankId }) },
    );
    expect(archiveRes.status).toBe(200);
    const archiveJson = (await archiveRes.json()) as {
      data: { wallet: { archivedAt: string | null; isDefault: boolean; updatedAt: string } };
    };
    expect(archiveJson.data.wallet.archivedAt).not.toBeNull();
    expect(archiveJson.data.wallet.isDefault).toBe(false);

    // Setting isDefault: true on archived wallet without archived: false -> 409 WALLET_ARCHIVED
    const archivedDefaultRes = await walletPatch(
      makeAuthedRequest(
        `http://localhost:3000/api/wallets/${bankId}`,
        "PATCH",
        alice.cookie,
        { isDefault: true },
      ),
      { params: Promise.resolve({ id: bankId }) },
    );
    expect(archivedDefaultRes.status).toBe(409);
    expect(((await archivedDefaultRes.json()) as { error: { code: string } }).error.code).toBe(
      "WALLET_ARCHIVED",
    );

    // GET /api/wallets excludes archived by default, includes with includeArchived=true
    const activeOnlyList = (await (
      await walletsGet(
        makeAuthedRequest("http://localhost:3000/api/wallets", "GET", alice.cookie),
      )
    ).json()) as { data: { wallets: Array<{ id: string; isDefault: boolean }> } };
    expect(activeOnlyList.data.wallets.map((w) => w.id)).toEqual([ewalletId]);
    expect(activeOnlyList.data.wallets[0]?.isDefault).toBe(true);

    // Unarchive bank wallet
    const unarchiveRes = await walletPatch(
      makeAuthedRequest(
        `http://localhost:3000/api/wallets/${bankId}`,
        "PATCH",
        alice.cookie,
        { archived: false },
      ),
      { params: Promise.resolve({ id: bankId }) },
    );
    expect(unarchiveRes.status).toBe(200);

    // Unsetting isDefault: false on an active default wallet promotes another active wallet
    const unsetDefaultRes = await walletPatch(
      makeAuthedRequest(
        `http://localhost:3000/api/wallets/${ewalletId}`,
        "PATCH",
        alice.cookie,
        { isDefault: false },
      ),
      { params: Promise.resolve({ id: ewalletId }) },
    );
    expect(unsetDefaultRes.status).toBe(200);
    const unsetDefaultJson = (await unsetDefaultRes.json()) as {
      data: { wallet: { isDefault: boolean } };
    };
    expect(unsetDefaultJson.data.wallet.isDefault).toBe(false);

    const afterUnsetList = (await (
      await walletsGet(
        makeAuthedRequest("http://localhost:3000/api/wallets", "GET", alice.cookie),
      )
    ).json()) as { data: { wallets: Array<{ id: string; isDefault: boolean }> } };
    expect(
      afterUnsetList.data.wallets.find((w) => w.id === bankId)?.isDefault,
    ).toBe(true);

    // Restore ewalletId as default so zero-history delete test below exercises promotion on delete
    const restoreDefaultRes = await walletPatch(
      makeAuthedRequest(
        `http://localhost:3000/api/wallets/${ewalletId}`,
        "PATCH",
        alice.cookie,
        { isDefault: true },
      ),
      { params: Promise.resolve({ id: ewalletId }) },
    );
    expect(restoreDefaultRes.status).toBe(200);

    // Cross-user isolation: Bob gets 404 on Alice's wallet
    expect(
      (
        await walletPatch(
          makeAuthedRequest(
            `http://localhost:3000/api/wallets/${bankId}`,
            "PATCH",
            bob.cookie,
            { name: "Stolen" },
          ),
          { params: Promise.resolve({ id: bankId }) },
        )
      ).status,
    ).toBe(404);

    // Hard-delete 0-history wallet succeeds and promotes remaining wallet if deleted was default
    const zeroHistoryDelete = await walletDelete(
      makeAuthedRequest(
        `http://localhost:3000/api/wallets/${ewalletId}`,
        "DELETE",
        alice.cookie,
      ),
      { params: Promise.resolve({ id: ewalletId }) },
    );
    expect(zeroHistoryDelete.status).toBe(200);
    expect(
      ((await zeroHistoryDelete.json()) as { data: { deleted: boolean } }).data.deleted,
    ).toBe(true);

    // Attempting isDefault: false on the sole remaining active wallet keeps it default
    const soleUnsetRes = await walletPatch(
      makeAuthedRequest(
        `http://localhost:3000/api/wallets/${bankId}`,
        "PATCH",
        alice.cookie,
        { isDefault: false },
      ),
      { params: Promise.resolve({ id: bankId }) },
    );
    expect(soleUnsetRes.status).toBe(200);
    expect(
      ((await soleUnsetRes.json()) as { data: { wallet: { isDefault: boolean } } }).data
        .wallet.isDefault,
    ).toBe(true);

    // Record transaction & soft-delete it (creating a tombstone history!) on bankId
    const catsJson = (await (
      await categoriesGet(
        makeAuthedRequest("http://localhost:3000/api/categories?type=expense", "GET", alice.cookie),
      )
    ).json()) as { data: { categories: Array<{ id: string }> } };
    const expenseCatId = catsJson.data.categories[0]!.id;

    const txCreateRes = await transactionsPost(
      makeAuthedRequest("http://localhost:3000/api/transactions", "POST", alice.cookie, {
        walletId: bankId,
        categoryId: expenseCatId,
        type: "expense",
        amount: 25_000,
        occurredAt: "2026-11-12T10:00:00.000Z",
      }),
    );
    expect(txCreateRes.status).toBe(201);
    const txId = ((await txCreateRes.json()) as { data: { transaction: { id: string } } }).data
      .transaction.id;

    expect(
      (
        await transactionDelete(
          makeAuthedRequest(
            `http://localhost:3000/api/transactions/${txId}`,
            "DELETE",
            alice.cookie,
          ),
          { params: Promise.resolve({ id: txId }) },
        )
      ).status,
    ).toBe(200);

    // Stale LWW DELETE returns 200 deleted: false BEFORE WALLET_HAS_HISTORY check!
    const staleDeleteRes = await walletDelete(
      makeAuthedRequest(
        `http://localhost:3000/api/wallets/${bankId}`,
        "DELETE",
        alice.cookie,
        { updatedAt: "2020-01-01T00:00:00.000Z" },
      ),
      { params: Promise.resolve({ id: bankId }) },
    );
    expect(staleDeleteRes.status).toBe(200);
    const staleDeleteJson = (await staleDeleteRes.json()) as {
      data: { deleted: boolean; conflictResolved: string };
    };
    expect(staleDeleteJson.data.deleted).toBe(false);
    expect(staleDeleteJson.data.conflictResolved).toBe("server_newer");

    // Fresh DELETE with empty body hits 409 WALLET_HAS_HISTORY (even though tx was soft-deleted tombstone!)
    // And with Idempotency-Key replays identical 409 response!
    const idemKey = crypto.randomUUID();
    const historyDelete1 = await walletDelete(
      makeAuthedRequest(
        `http://localhost:3000/api/wallets/${bankId}`,
        "DELETE",
        alice.cookie,
        undefined,
        { "Idempotency-Key": idemKey },
      ),
      { params: Promise.resolve({ id: bankId }) },
    );
    expect(historyDelete1.status).toBe(409);
    const historyBody1 = (await historyDelete1.json()) as { error: { code: string } };
    expect(historyBody1.error.code).toBe("WALLET_HAS_HISTORY");

    const historyDelete2 = await walletDelete(
      makeAuthedRequest(
        `http://localhost:3000/api/wallets/${bankId}`,
        "DELETE",
        alice.cookie,
        undefined,
        { "Idempotency-Key": idemKey },
      ),
      { params: Promise.resolve({ id: bankId }) },
    );
    expect(historyDelete2.status).toBe(409);
    const historyBody2 = (await historyDelete2.json()) as { error: { code: string } };
    expect(historyBody2).toEqual(historyBody1);
  });

  it("protects system categories before LWW, rejects duplicate names case-insensitively, and reassigns transactions on custom category delete", async () => {
    const alice = await createRegisteredUser("CatAlice");
    const bob = await createRegisteredUser("CatBob");

    const catsRes = await categoriesGet(
      makeAuthedRequest("http://localhost:3000/api/categories", "GET", alice.cookie),
    );
    expect(catsRes.status).toBe(200);
    const catsJson = (await catsRes.json()) as {
      data: {
        categories: Array<{
          id: string;
          name: string;
          type: "income" | "expense";
          isSystem: boolean;
          systemKey: string | null;
        }>;
      };
    };

    const foodSystem = catsJson.data.categories.find(
      (c) => c.systemKey === "food_drink",
    )!;
    const otherExpense = catsJson.data.categories.find(
      (c) => c.systemKey === "other_expense",
    )!;

    // System category rejects PATCH & DELETE with 403 even with stale updatedAt (checked before LWW!)
    const sysPatchRes = await categoryPatch(
      makeAuthedRequest(
        `http://localhost:3000/api/categories/${foodSystem.id}`,
        "PATCH",
        alice.cookie,
        { name: "Hacked", updatedAt: "2020-01-01T00:00:00.000Z" },
      ),
      { params: Promise.resolve({ id: foodSystem.id }) },
    );
    expect(sysPatchRes.status).toBe(403);
    expect(((await sysPatchRes.json()) as { error: { code: string } }).error.code).toBe(
      "CANNOT_MODIFY_SYSTEM_CATEGORY",
    );

    const sysDeleteRes = await categoryDelete(
      makeAuthedRequest(
        `http://localhost:3000/api/categories/${foodSystem.id}`,
        "DELETE",
        alice.cookie,
        { updatedAt: "2020-01-01T00:00:00.000Z" },
      ),
      { params: Promise.resolve({ id: foodSystem.id }) },
    );
    expect(sysDeleteRes.status).toBe(403);
    expect(((await sysDeleteRes.json()) as { error: { code: string } }).error.code).toBe(
      "CANNOT_DELETE_SYSTEM_CATEGORY",
    );

    // Reject duplicate against system category (case-insensitive)
    const dupSysRes = await categoriesPost(
      makeAuthedRequest("http://localhost:3000/api/categories", "POST", alice.cookie, {
        name: foodSystem.name.toUpperCase(),
        type: "expense",
      }),
    );
    expect(dupSysRes.status).toBe(409);
    expect(((await dupSysRes.json()) as { error: { code: string } }).error.code).toBe(
      "CATEGORY_ALREADY_EXISTS",
    );

    // Create custom category with Idempotency-Key + test duplicate 409 persistence
    const customCatRes = await categoriesPost(
      makeAuthedRequest("http://localhost:3000/api/categories", "POST", alice.cookie, {
        name: "Langganan SaaS",
        type: "expense",
      }),
    );
    expect(customCatRes.status).toBe(201);
    const customCat = ((await customCatRes.json()) as {
      data: { category: { id: string; name: string } };
    }).data.category;

    const dupCustomKey = crypto.randomUUID();
    const dupCustom1 = await categoriesPost(
      makeAuthedRequest(
        "http://localhost:3000/api/categories",
        "POST",
        alice.cookie,
        { name: "langganan saas", type: "expense" },
        { "Idempotency-Key": dupCustomKey },
      ),
    );
    expect(dupCustom1.status).toBe(409);

    const dupCustom2 = await categoriesPost(
      makeAuthedRequest(
        "http://localhost:3000/api/categories",
        "POST",
        alice.cookie,
        { name: "langganan saas", type: "expense" },
        { "Idempotency-Key": dupCustomKey },
      ),
    );
    expect(dupCustom2.status).toBe(409);

    // Self-rename changing casing -> 200
    const selfRenameRes = await categoryPatch(
      makeAuthedRequest(
        `http://localhost:3000/api/categories/${customCat.id}`,
        "PATCH",
        alice.cookie,
        { name: "LANGGANAN SAAS" },
      ),
      { params: Promise.resolve({ id: customCat.id }) },
    );
    expect(selfRenameRes.status).toBe(200);

    // Reject trying to change category type on PATCH -> 422
    const changeTypeRes = await categoryPatch(
      makeAuthedRequest(
        `http://localhost:3000/api/categories/${customCat.id}`,
        "PATCH",
        alice.cookie,
        { name: "Lain", type: "income" },
      ),
      { params: Promise.resolve({ id: customCat.id }) },
    );
    expect(changeTypeRes.status).toBe(422);

    // Bob cannot delete Alice's category -> 404
    expect(
      (
        await categoryDelete(
          makeAuthedRequest(
            `http://localhost:3000/api/categories/${customCat.id}`,
            "DELETE",
            bob.cookie,
          ),
          { params: Promise.resolve({ id: customCat.id }) },
        )
      ).status,
    ).toBe(404);

    // Create wallet & transaction on customCat, then delete customCat -> migrates to other_expense!
    const walletRes = await walletsPost(
      makeAuthedRequest("http://localhost:3000/api/wallets", "POST", alice.cookie, {
        name: "Dompet Utama",
        type: "cash",
      }),
    );
    const walletId = ((await walletRes.json()) as { data: { wallet: { id: string } } }).data
      .wallet.id;

    const txRes = await transactionsPost(
      makeAuthedRequest("http://localhost:3000/api/transactions", "POST", alice.cookie, {
        walletId,
        categoryId: customCat.id,
        type: "expense",
        amount: 75_000,
        occurredAt: "2026-11-12T10:00:00.000Z",
      }),
    );
    expect(txRes.status).toBe(201);
    const txId = ((await txRes.json()) as { data: { transaction: { id: string } } }).data
      .transaction.id;

    const delCatRes = await categoryDelete(
      makeAuthedRequest(
        `http://localhost:3000/api/categories/${customCat.id}`,
        "DELETE",
        alice.cookie,
      ),
      { params: Promise.resolve({ id: customCat.id }) },
    );
    expect(delCatRes.status).toBe(200);
    const delCatJson = (await delCatRes.json()) as {
      data: { deleted: boolean; reassignedCount: number };
    };
    expect(delCatJson.data.deleted).toBe(true);
    expect(delCatJson.data.reassignedCount).toBe(1);

    const listTxRes = await transactionsGet(
      makeAuthedRequest("http://localhost:3000/api/transactions", "GET", alice.cookie),
    );
    const listTxJson = (await listTxRes.json()) as {
      data: { items: Array<{ id: string; categoryId: string }> };
    };
    const migratedTx = listTxJson.data.items.find((t) => t.id === txId);
    expect(migratedTx?.categoryId).toBe(otherExpense.id);

    // Also verify transaction PATCH LWW or noteId error sanity doesn't collide
    const patchDesc = await transactionPatch(
      makeAuthedRequest(
        `http://localhost:3000/api/transactions/${txId}`,
        "PATCH",
        alice.cookie,
        { description: "Migrated note" },
      ),
      { params: Promise.resolve({ id: txId }) },
    );
    expect(patchDesc.status).toBe(200);
  });
});
