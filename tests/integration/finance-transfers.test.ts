import { inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db";
import { users } from "@/db/schema/auth";
import { categories, transactions, transfers, wallets } from "@/db/schema/finance";
import { notes } from "@/db/schema/notes";
import { POST as registerPost } from "@/app/api/auth/register/route";
import { GET as categoriesGet } from "@/app/api/categories/route";
import { POST as notesPost } from "@/app/api/notes/route";
import {
  DELETE as transactionDelete,
  PATCH as transactionPatch,
} from "@/app/api/transactions/[id]/route";
import {
  GET as transactionsGet,
  POST as transactionsPost,
} from "@/app/api/transactions/route";
import {
  DELETE as transferDelete,
  PATCH as transferPatch,
} from "@/app/api/transfers/[id]/route";
import {
  GET as transfersGet,
  POST as transfersPost,
} from "@/app/api/transfers/route";
import {
  GET as walletsGet,
  POST as walletsPost,
} from "@/app/api/wallets/route";
import { PATCH as walletByIdPatch } from "@/app/api/wallets/[id]/route";

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

describe("TS-006-03: Transactions, Atomic Transfers, Query Filters & Keyset Pagination", () => {
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
      await db.delete(notes).where(inArray(notes.userId, targetIds));
      await db.delete(users).where(inArray(users.id, targetIds));
      createdUserIds.length = 0;
    }
  });

  it("enforces active wallet, category type alignment, atomic transfers, transfer soft-delete rollback, and archived wallet patch boundaries", async () => {
    const alice = await createRegisteredUser("TxAlice");
    const bob = await createRegisteredUser("TxBob");

    const walletARes = await walletsPost(
      makeAuthedRequest("http://localhost:3000/api/wallets", "POST", alice.cookie, {
        name: "BCA",
        type: "bank",
        initialBalance: 1_000_000,
      }),
    );
    const walletA = ((await walletARes.json()) as { data: { wallet: { id: string } } }).data
      .wallet.id;

    const walletBRes = await walletsPost(
      makeAuthedRequest("http://localhost:3000/api/wallets", "POST", alice.cookie, {
        name: "Dompet Tunai",
        type: "cash",
        initialBalance: 100_000,
      }),
    );
    const walletB = ((await walletBRes.json()) as { data: { wallet: { id: string } } }).data
      .wallet.id;

    const bobWalletRes = await walletsPost(
      makeAuthedRequest("http://localhost:3000/api/wallets", "POST", bob.cookie, {
        name: "Bob Cash",
        type: "cash",
        initialBalance: 50_000,
      }),
    );
    const bobWalletId = ((await bobWalletRes.json()) as { data: { wallet: { id: string } } })
      .data.wallet.id;

    const catsJson = (await (
      await categoriesGet(
        makeAuthedRequest("http://localhost:3000/api/categories", "GET", alice.cookie),
      )
    ).json()) as {
      data: { categories: Array<{ id: string; type: "income" | "expense" }> };
    };
    const expenseCat = catsJson.data.categories.find((c) => c.type === "expense")!;
    const incomeCat = catsJson.data.categories.find((c) => c.type === "income")!;

    // Reject category type mismatch on transaction POST -> 422 CATEGORY_TYPE_MISMATCH
    const mismatchRes = await transactionsPost(
      makeAuthedRequest("http://localhost:3000/api/transactions", "POST", alice.cookie, {
        walletId: walletA,
        categoryId: incomeCat.id,
        type: "expense",
        amount: 20_000,
        occurredAt: "2026-11-12T05:00:00.000Z",
      }),
    );
    expect(mismatchRes.status).toBe(422);
    expect(((await mismatchRes.json()) as { error: { code: string } }).error.code).toBe(
      "CATEGORY_TYPE_MISMATCH",
    );

    // Create linked note & record income/expense transactions
    const noteRes = await notesPost(
      makeAuthedRequest("http://localhost:3000/api/notes", "POST", alice.cookie, {
        title: "Nota Belanja",
        content: "Makan siang",
      }),
    );
    const noteId = ((await noteRes.json()) as { data: { note: { id: string } } }).data.note.id;

    const txLinkedRes = await transactionsPost(
      makeAuthedRequest("http://localhost:3000/api/transactions", "POST", alice.cookie, {
        walletId: walletB,
        categoryId: expenseCat.id,
        noteId,
        type: "expense",
        amount: 30_000,
        description: "Makan siang",
        occurredAt: "2026-11-12T05:00:00.000Z",
      }),
    );
    expect(txLinkedRes.status).toBe(201);
    const txLinkedId = ((await txLinkedRes.json()) as {
      data: { transaction: { id: string } };
    }).data.transaction.id;

    // Transfer rejects same wallet on POST -> 422 SAME_WALLET_TRANSFER
    const sameWalletPost = await transfersPost(
      makeAuthedRequest("http://localhost:3000/api/transfers", "POST", alice.cookie, {
        fromWalletId: walletA,
        toWalletId: walletA,
        amount: 100_000,
        occurredAt: "2026-11-12T06:00:00.000Z",
      }),
    );
    expect(sameWalletPost.status).toBe(422);
    expect(((await sameWalletPost.json()) as { error: { code: string } }).error.code).toBe(
      "SAME_WALLET_TRANSFER",
    );

    // Transfer targeting Bob's wallet rolls back -> 404 WALLET_NOT_FOUND, balances unchanged
    const crossUserTransfer = await transfersPost(
      makeAuthedRequest("http://localhost:3000/api/transfers", "POST", alice.cookie, {
        fromWalletId: walletA,
        toWalletId: bobWalletId,
        amount: 200_000,
        occurredAt: "2026-11-12T06:00:00.000Z",
      }),
    );
    expect(crossUserTransfer.status).toBe(404);

    // Valid atomic transfer A -> B 300_000
    const transferRes = await transfersPost(
      makeAuthedRequest("http://localhost:3000/api/transfers", "POST", alice.cookie, {
        fromWalletId: walletA,
        toWalletId: walletB,
        amount: 300_000,
        note: "Tarik tunai",
        occurredAt: "2026-11-12T06:00:00.000Z",
      }),
    );
    expect(transferRes.status).toBe(201);
    const transferId = ((await transferRes.json()) as { data: { transfer: { id: string } } })
      .data.transfer.id;

    // Transfer PATCH swapping one side to match the other -> 422 SAME_WALLET_TRANSFER
    const sameWalletPatch = await transferPatch(
      makeAuthedRequest(
        `http://localhost:3000/api/transfers/${transferId}`,
        "PATCH",
        alice.cookie,
        { toWalletId: walletA },
      ),
      { params: Promise.resolve({ id: transferId }) },
    );
    expect(sameWalletPatch.status).toBe(422);
    expect(((await sameWalletPatch.json()) as { error: { code: string } }).error.code).toBe(
      "SAME_WALLET_TRANSFER",
    );

    // Check balances: A = 1_000_000 - 300_000 = 700_000; B = 100_000 - 30_000 + 300_000 = 370_000
    const walletsAfterTransfer = (await (
      await walletsGet(
        makeAuthedRequest("http://localhost:3000/api/wallets", "GET", alice.cookie),
      )
    ).json()) as { data: { wallets: Array<{ id: string; currentBalance: number }> } };
    expect(walletsAfterTransfer.data.wallets.find((w) => w.id === walletA)?.currentBalance).toBe(
      700_000,
    );
    expect(walletsAfterTransfer.data.wallets.find((w) => w.id === walletB)?.currentBalance).toBe(
      370_000,
    );

    // Soft-delete transfer reverses both balances atomically
    expect(
      (
        await transferDelete(
          makeAuthedRequest(
            `http://localhost:3000/api/transfers/${transferId}`,
            "DELETE",
            alice.cookie,
          ),
          { params: Promise.resolve({ id: transferId }) },
        )
      ).status,
    ).toBe(200);

    const walletsAfterDelete = (await (
      await walletsGet(
        makeAuthedRequest("http://localhost:3000/api/wallets", "GET", alice.cookie),
      )
    ).json()) as { data: { wallets: Array<{ id: string; currentBalance: number }> } };
    expect(walletsAfterDelete.data.wallets.find((w) => w.id === walletA)?.currentBalance).toBe(
      1_000_000,
    );
    expect(walletsAfterDelete.data.wallets.find((w) => w.id === walletB)?.currentBalance).toBe(
      70_000,
    );

    // Archive wallet B: POST new tx on archived wallet -> 409 WALLET_ARCHIVED; amount change on PATCH -> 409;
    // unlinking noteId: null + editing description on historical tx in archived wallet B -> 200 OK!
    expect(
      (
        await walletByIdPatch(
          makeAuthedRequest(
            `http://localhost:3000/api/wallets/${walletB}`,
            "PATCH",
            alice.cookie,
            { archived: true },
          ),
          { params: Promise.resolve({ id: walletB }) },
        )
      ).status,
    ).toBe(200);

    expect(
      (
        await transactionsPost(
          makeAuthedRequest("http://localhost:3000/api/transactions", "POST", alice.cookie, {
            walletId: walletB,
            categoryId: expenseCat.id,
            type: "expense",
            amount: 10_000,
            occurredAt: "2026-11-12T08:00:00.000Z",
          }),
        )
      ).status,
    ).toBe(409);

    expect(
      (
        await transactionPatch(
          makeAuthedRequest(
            `http://localhost:3000/api/transactions/${txLinkedId}`,
            "PATCH",
            alice.cookie,
            { amount: 99_000 },
          ),
          { params: Promise.resolve({ id: txLinkedId }) },
        )
      ).status,
    ).toBe(409);

    const safeHistoricalEdit = await transactionPatch(
      makeAuthedRequest(
        `http://localhost:3000/api/transactions/${txLinkedId}`,
        "PATCH",
        alice.cookie,
        { noteId: null, description: "Deskripsi diperbarui" },
      ),
      { params: Promise.resolve({ id: txLinkedId }) },
    );
    expect(safeHistoricalEdit.status).toBe(200);
    const safeHistoricalJson = (await safeHistoricalEdit.json()) as {
      data: { transaction: { noteId: string | null; description: string | null } };
    };
    expect(safeHistoricalJson.data.transaction.noteId).toBeNull();
    expect(safeHistoricalJson.data.transaction.description).toBe("Deskripsi diperbarui");
  });

  it("supports unlinked=true filter, tzOffset date bounds, transfer walletId (from OR to), and keyset cursor pagination", async () => {
    const alice = await createRegisteredUser("QueryAlice");

    const w1Res = await walletsPost(
      makeAuthedRequest("http://localhost:3000/api/wallets", "POST", alice.cookie, {
        name: "W1",
        type: "cash",
      }),
    );
    const w2Res = await walletsPost(
      makeAuthedRequest("http://localhost:3000/api/wallets", "POST", alice.cookie, {
        name: "W2",
        type: "bank",
      }),
    );
    const w3Res = await walletsPost(
      makeAuthedRequest("http://localhost:3000/api/wallets", "POST", alice.cookie, {
        name: "W3",
        type: "ewallet",
      }),
    );
    const w1 = ((await w1Res.json()) as { data: { wallet: { id: string } } }).data.wallet.id;
    const w2 = ((await w2Res.json()) as { data: { wallet: { id: string } } }).data.wallet.id;
    const w3 = ((await w3Res.json()) as { data: { wallet: { id: string } } }).data.wallet.id;

    const catsJson = (await (
      await categoriesGet(
        makeAuthedRequest("http://localhost:3000/api/categories?type=expense", "GET", alice.cookie),
      )
    ).json()) as { data: { categories: Array<{ id: string }> } };
    const catId = catsJson.data.categories[0]!.id;

    const noteRes = await notesPost(
      makeAuthedRequest("http://localhost:3000/api/notes", "POST", alice.cookie, {
        title: "Linked",
      }),
    );
    const noteId = ((await noteRes.json()) as { data: { note: { id: string } } }).data.note.id;

    // 2026-11-12T18:00:00Z is 2026-11-13 01:00 in WIB (tzOffset=420)
    await transactionsPost(
      makeAuthedRequest("http://localhost:3000/api/transactions", "POST", alice.cookie, {
        walletId: w1,
        categoryId: catId,
        noteId,
        type: "expense",
        amount: 10_000,
        description: "Linked early WIB day",
        occurredAt: "2026-11-12T10:00:00+07:00",
      }),
    );
    await transactionsPost(
      makeAuthedRequest("http://localhost:3000/api/transactions", "POST", alice.cookie, {
        walletId: w1,
        categoryId: catId,
        type: "expense",
        amount: 20_000,
        description: "Unlinked midnight+1 WIB",
        occurredAt: "2026-11-13T01:00:00+07:00",
      }),
    );
    await transactionsPost(
      makeAuthedRequest("http://localhost:3000/api/transactions", "POST", alice.cookie, {
        walletId: w1,
        categoryId: catId,
        type: "expense",
        amount: 30_000,
        description: "Unlinked same day",
        occurredAt: "2026-11-12T15:00:00+07:00",
      }),
    );

    // Filter unlinked=true (2 items)
    const unlinkedRes = await transactionsGet(
      makeAuthedRequest(
        "http://localhost:3000/api/transactions?unlinked=true",
        "GET",
        alice.cookie,
      ),
    );
    expect(unlinkedRes.status).toBe(200);
    const unlinkedJson = (await unlinkedRes.json()) as {
      data: { items: Array<{ noteId: string | null; amount: number }> };
    };
    expect(unlinkedJson.data.items).toHaveLength(2);
    expect(unlinkedJson.data.items.every((i) => i.noteId === null)).toBe(true);

    // tzOffset=420 from=2026-11-13&to=2026-11-13 returns ONLY the 01:00+07:00 item
    const dateRangeRes = await transactionsGet(
      makeAuthedRequest(
        "http://localhost:3000/api/transactions?from=2026-11-13&to=2026-11-13&tzOffset=420",
        "GET",
        alice.cookie,
      ),
    );
    expect(dateRangeRes.status).toBe(200);
    const dateRangeJson = (await dateRangeRes.json()) as {
      data: { items: Array<{ amount: number }> };
    };
    expect(dateRangeJson.data.items.map((i) => i.amount)).toEqual([20_000]);

    // Invalid from > to -> 422
    expect(
      (
        await transactionsGet(
          makeAuthedRequest(
            "http://localhost:3000/api/transactions?from=2026-11-14&to=2026-11-13",
            "GET",
            alice.cookie,
          ),
        )
      ).status,
    ).toBe(422);

    // Keyset cursor pagination limit=2 then cursor page 2
    const page1Res = await transactionsGet(
      makeAuthedRequest(
        "http://localhost:3000/api/transactions?limit=2",
        "GET",
        alice.cookie,
      ),
    );
    const page1 = (await page1Res.json()) as {
      data: { items: Array<{ amount: number }>; nextCursor: string | null };
    };
    expect(page1.data.items).toHaveLength(2);
    expect(page1.data.nextCursor).not.toBeNull();

    const page2Res = await transactionsGet(
      makeAuthedRequest(
        `http://localhost:3000/api/transactions?limit=2&cursor=${page1.data.nextCursor}`,
        "GET",
        alice.cookie,
      ),
    );
    const page2 = (await page2Res.json()) as {
      data: { items: Array<{ amount: number }>; nextCursor: string | null };
    };
    expect(page2.data.items).toHaveLength(1);
    expect(page2.data.nextCursor).toBeNull();

    // Malformed cursor -> 400 INVALID_CURSOR
    const badCursorRes = await transactionsGet(
      makeAuthedRequest(
        "http://localhost:3000/api/transactions?cursor=not-base64",
        "GET",
        alice.cookie,
      ),
    );
    expect(badCursorRes.status).toBe(400);
    expect(((await badCursorRes.json()) as { error: { code: string } }).error.code).toBe(
      "INVALID_CURSOR",
    );

    // Transfers walletId matches fromWalletId OR toWalletId
    await transfersPost(
      makeAuthedRequest("http://localhost:3000/api/transfers", "POST", alice.cookie, {
        fromWalletId: w1,
        toWalletId: w2,
        amount: 50_000,
        occurredAt: "2026-11-12T11:00:00Z",
      }),
    );
    await transfersPost(
      makeAuthedRequest("http://localhost:3000/api/transfers", "POST", alice.cookie, {
        fromWalletId: w3,
        toWalletId: w2,
        amount: 75_000,
        occurredAt: "2026-11-12T12:00:00Z",
      }),
    );

    const w2Transfers = (await (
      await transfersGet(
        makeAuthedRequest(
          `http://localhost:3000/api/transfers?walletId=${w2}`,
          "GET",
          alice.cookie,
        ),
      )
    ).json()) as { data: { items: Array<{ amount: number }> } };
    expect(w2Transfers.data.items).toHaveLength(2);

    const w1Transfers = (await (
      await transfersGet(
        makeAuthedRequest(
          `http://localhost:3000/api/transfers?walletId=${w1}`,
          "GET",
          alice.cookie,
        ),
      )
    ).json()) as { data: { items: Array<{ amount: number }> } };
    expect(w1Transfers.data.items).toHaveLength(1);

    // Ensure transactions/delete was imported cleanly for a quick delete check
    const unlinkedItemsRes = await transactionsGet(
      makeAuthedRequest("http://localhost:3000/api/transactions", "GET", alice.cookie),
    );
    const firstTxId = ((await unlinkedItemsRes.json()) as {
      data: { items: Array<{ id: string }> };
    }).data.items[0]!.id;
    expect(
      (
        await transactionDelete(
          makeAuthedRequest(
            `http://localhost:3000/api/transactions/${firstTxId}`,
            "DELETE",
            alice.cookie,
          ),
          { params: Promise.resolve({ id: firstTxId }) },
        )
      ).status,
    ).toBe(200);
  });
});
