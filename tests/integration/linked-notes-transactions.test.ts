import { eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { POST as registerPost } from "@/app/api/auth/register/route";
import { GET as categoriesGet } from "@/app/api/categories/route";
import { GET as financeSummaryGet } from "@/app/api/finance/summary/route";
import { DELETE as noteDelete } from "@/app/api/notes/[id]/route";
import {
  GET as linkedTransactionsGet,
  POST as linkedTransactionsPost,
} from "@/app/api/notes/[id]/transactions/route";
import { DELETE as linkedTransactionDelete } from "@/app/api/notes/[id]/transactions/[txId]/route";
import { POST as notesPost } from "@/app/api/notes/route";
import {
  GET as transactionsGet,
  POST as transactionsPost,
} from "@/app/api/transactions/route";
import { POST as transfersPost } from "@/app/api/transfers/route";
import { PATCH as walletPatch } from "@/app/api/wallets/[id]/route";
import { POST as walletsPost } from "@/app/api/wallets/route";
import { getDb } from "@/db";
import { users } from "@/db/schema/auth";
import { categories, transactions, transfers, wallets } from "@/db/schema/finance";
import { notes } from "@/db/schema/notes";

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
  extraHeaders: Record<string, string> = {},
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: {
      origin: "http://localhost:3000",
      cookie,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...extraHeaders,
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
        name: "Linked Notes User",
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

describe("Linked Notes <-> Transactions API Integration (TS-008-03)", () => {
  afterEach(async () => {
    if (createdUserIds.length === 0) return;
    const db = getDb();
    await db
      .delete(transfers)
      .where(inArray(transfers.userId, createdUserIds));
    await db
      .delete(transactions)
      .where(inArray(transactions.userId, createdUserIds));
    await db.delete(notes).where(inArray(notes.userId, createdUserIds));
    await db.delete(wallets).where(inArray(wallets.userId, createdUserIds));
    await db
      .delete(categories)
      .where(inArray(categories.userId, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
    createdUserIds.length = 0;
  });

  it("enforces auth/CSRF/UUID/isolation, LWW & idempotency on link/create/unlink, summary math, and ledger noteTitle backlinks", async () => {
    const alice = await createRegisteredUser("alice-link");
    const bob = await createRegisteredUser("bob-link");

    // 1. Seed wallets, categories, and notes for Alice
    const cashWalletRes = await walletsPost(
      makeAuthedRequest("http://localhost:3000/api/wallets", "POST", alice.cookie, {
        name: "Tunai",
        type: "cash",
        initialBalance: 1_000_000,
      }),
    );
    const cashWalletId = (
      (await cashWalletRes.json()) as { data: { wallet: { id: string } } }
    ).data.wallet.id;

    const bankWalletRes = await walletsPost(
      makeAuthedRequest("http://localhost:3000/api/wallets", "POST", alice.cookie, {
        name: "Bank",
        type: "bank",
        initialBalance: 500_000,
      }),
    );
    const bankWalletId = (
      (await bankWalletRes.json()) as { data: { wallet: { id: string } } }
    ).data.wallet.id;

    const catsRes = await categoriesGet(
      makeAuthedRequest("http://localhost:3000/api/categories", "GET", alice.cookie),
    );
    const catsList = (
      (await catsRes.json()) as {
        data: { categories: Array<{ id: string; type: string; systemKey: string | null }> };
      }
    ).data.categories;
    const expenseCatId = catsList.find((c) => c.systemKey === "food_drink")!.id;
    const incomeCatId = catsList.find((c) => c.systemKey === "salary")!.id;

    const noteARes = await notesPost(
      makeAuthedRequest("http://localhost:3000/api/notes", "POST", alice.cookie, {
        title: "Catatan Belanja Harian",
        content: "- [ ] Kopi",
        tags: [],
      }),
    );
    const noteAId = (
      (await noteARes.json()) as { data: { note: { id: string } } }
    ).data.note.id;

    const noteBRes = await notesPost(
      makeAuthedRequest("http://localhost:3000/api/notes", "POST", alice.cookie, {
        title: "Catatan Lain",
        content: "Isi lain",
        tags: [],
      }),
    );
    const noteBId = (
      (await noteBRes.json()) as { data: { note: { id: string } } }
    ).data.note.id;

    // Seed an existing transaction & a transfer for Alice
    const existingTxRes = await transactionsPost(
      makeAuthedRequest("http://localhost:3000/api/transactions", "POST", alice.cookie, {
        walletId: cashWalletId,
        categoryId: expenseCatId,
        type: "expense",
        amount: 35_000,
        description: "Sarapan",
        occurredAt: new Date().toISOString(),
      }),
    );
    const existingTx = (
      (await existingTxRes.json()) as {
        data: { transaction: { id: string; updatedAt: string } };
      }
    ).data.transaction;

    const transferRes = await transfersPost(
      makeAuthedRequest("http://localhost:3000/api/transfers", "POST", alice.cookie, {
        fromWalletId: cashWalletId,
        toWalletId: bankWalletId,
        amount: 100_000,
        occurredAt: new Date().toISOString(),
      }),
    );
    const transferId = (
      (await transferRes.json()) as { data: { transfer: { id: string } } }
    ).data.transfer.id;

    // 2. Auth, CSRF, and UUID validation guards
    const unauthGet = await linkedTransactionsGet(
      new NextRequest(`http://localhost:3000/api/notes/${noteAId}/transactions`),
      { params: Promise.resolve({ id: noteAId }) },
    );
    expect(unauthGet.status).toBe(401);

    const badCsrf = await linkedTransactionsPost(
      new NextRequest(`http://localhost:3000/api/notes/${noteAId}/transactions`, {
        method: "POST",
        headers: {
          origin: "https://evil.example",
          cookie: alice.cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ existingTransactionId: existingTx.id }),
      }),
      { params: Promise.resolve({ id: noteAId }) },
    );
    expect(badCsrf.status).toBe(403);

    const invalidUuid = await linkedTransactionsGet(
      makeAuthedRequest("http://localhost:3000/api/notes/not-uuid/transactions", "GET", alice.cookie),
      { params: Promise.resolve({ id: "not-uuid" }) },
    );
    expect(invalidUuid.status).toBe(422);

    // 3. Cross-user isolation & note ownership checked on BOTH branches of POST
    const bobReadAliceNote = await linkedTransactionsGet(
      makeAuthedRequest(`http://localhost:3000/api/notes/${noteAId}/transactions`, "GET", bob.cookie),
      { params: Promise.resolve({ id: noteAId }) },
    );
    expect(bobReadAliceNote.status).toBe(404);

    const bobLinkToAliceNote = await linkedTransactionsPost(
      makeAuthedRequest(
        `http://localhost:3000/api/notes/${noteAId}/transactions`,
        "POST",
        bob.cookie,
        { existingTransactionId: existingTx.id },
      ),
      { params: Promise.resolve({ id: noteAId }) },
    );
    expect(bobLinkToAliceNote.status).toBe(404);

    const unknownNoteCreate = await linkedTransactionsPost(
      makeAuthedRequest(
        "http://localhost:3000/api/notes/99999999-9999-4999-8999-999999999999/transactions",
        "POST",
        alice.cookie,
        {
          walletId: cashWalletId,
          categoryId: expenseCatId,
          type: "expense",
          amount: 10_000,
          occurredAt: new Date().toISOString(),
        },
      ),
      { params: Promise.resolve({ id: "99999999-9999-4999-8999-999999999999" }) },
    );
    expect(unknownNoteCreate.status).toBe(404);

    // 4. Rejects linking transfer ID or other user's tx ID (404)
    const linkTransferRes = await linkedTransactionsPost(
      makeAuthedRequest(
        `http://localhost:3000/api/notes/${noteAId}/transactions`,
        "POST",
        alice.cookie,
        { existingTransactionId: transferId },
      ),
      { params: Promise.resolve({ id: noteAId }) },
    );
    expect(linkTransferRes.status).toBe(404);

    // 5. LWW checked BEFORE linking existing tx
    const staleTimestamp = new Date(
      Date.parse(existingTx.updatedAt) - 60_000,
    ).toISOString();
    const staleLinkRes = await linkedTransactionsPost(
      makeAuthedRequest(
        `http://localhost:3000/api/notes/${noteAId}/transactions`,
        "POST",
        alice.cookie,
        { existingTransactionId: existingTx.id, updatedAt: staleTimestamp },
      ),
      { params: Promise.resolve({ id: noteAId }) },
    );
    expect(staleLinkRes.status).toBe(200);
    const staleJson = (await staleLinkRes.json()) as {
      data: { conflictResolved: string; transaction: { noteId: string | null } };
    };
    expect(staleJson.data.conflictResolved).toBe("server_newer");
    expect(staleJson.data.transaction.noteId).toBeNull();

    // 6. Link existing tx with idempotency key & check 200 idempotent same-note relink vs 409 other-note
    const linkKey = crypto.randomUUID();
    const linkRes = await linkedTransactionsPost(
      makeAuthedRequest(
        `http://localhost:3000/api/notes/${noteAId}/transactions`,
        "POST",
        alice.cookie,
        { existingTransactionId: existingTx.id, idempotencyKey: linkKey },
      ),
      { params: Promise.resolve({ id: noteAId }) },
    );
    expect(linkRes.status).toBe(200);
    const linkJson = (await linkRes.json()) as {
      data: {
        conflictResolved: string;
        transaction: { noteId: string | null };
        summary: { totalIncome: number; totalExpense: number; net: number };
      };
    };
    expect(linkJson.data.conflictResolved).toBe("applied");
    expect(linkJson.data.transaction.noteId).toBe(noteAId);
    expect(linkJson.data.summary).toEqual({
      totalIncome: 0,
      totalExpense: 35_000,
      net: -35_000,
    });

    // Replay with same idempotency key -> same result
    const replayRes = await linkedTransactionsPost(
      makeAuthedRequest(
        `http://localhost:3000/api/notes/${noteAId}/transactions`,
        "POST",
        alice.cookie,
        { existingTransactionId: existingTx.id, idempotencyKey: linkKey },
      ),
      { params: Promise.resolve({ id: noteAId }) },
    );
    expect(replayRes.status).toBe(200);

    // Re-link SAME tx to SAME note without idempotency key -> idempotent 200 applied
    const relinkSameRes = await linkedTransactionsPost(
      makeAuthedRequest(
        `http://localhost:3000/api/notes/${noteAId}/transactions`,
        "POST",
        alice.cookie,
        { existingTransactionId: existingTx.id },
      ),
      { params: Promise.resolve({ id: noteAId }) },
    );
    expect(relinkSameRes.status).toBe(200);

    // Linking already-linked tx to Note B -> 409 TRANSACTION_ALREADY_LINKED
    const linkOtherRes = await linkedTransactionsPost(
      makeAuthedRequest(
        `http://localhost:3000/api/notes/${noteBId}/transactions`,
        "POST",
        alice.cookie,
        { existingTransactionId: existingTx.id },
      ),
      { params: Promise.resolve({ id: noteBId }) },
    );
    expect(linkOtherRes.status).toBe(409);
    expect(
      ((await linkOtherRes.json()) as { error: { code: string } }).error.code,
    ).toBe("TRANSACTION_ALREADY_LINKED");

    // 7. Create new income transaction directly linked -> 201 + updated summary
    const fixedTxUuid = crypto.randomUUID();
    const createLinkedRes = await linkedTransactionsPost(
      makeAuthedRequest(
        `http://localhost:3000/api/notes/${noteAId}/transactions`,
        "POST",
        alice.cookie,
        {
          id: fixedTxUuid,
          walletId: cashWalletId,
          categoryId: incomeCatId,
          type: "income",
          amount: 100_000,
          description: "Reimburse Kopi",
          occurredAt: new Date().toISOString(),
        },
      ),
      { params: Promise.resolve({ id: noteAId }) },
    );
    expect(createLinkedRes.status).toBe(201);
    const createLinkedJson = (await createLinkedRes.json()) as {
      data: {
        conflictResolved: string;
        transaction: { id: string; noteId: string | null };
        summary: { totalIncome: number; totalExpense: number; net: number };
      };
    };
    expect(createLinkedJson.data.conflictResolved).toBe("applied");
    expect(createLinkedJson.data.transaction.noteId).toBe(noteAId);
    expect(createLinkedJson.data.summary).toEqual({
      totalIncome: 100_000,
      totalExpense: 35_000,
      net: 65_000,
    });

    // Category mismatch -> 422, duplicate UUID -> 409 RESOURCE_ALREADY_EXISTS, archived wallet -> 409
    const mismatchRes = await linkedTransactionsPost(
      makeAuthedRequest(
        `http://localhost:3000/api/notes/${noteAId}/transactions`,
        "POST",
        alice.cookie,
        {
          walletId: cashWalletId,
          categoryId: incomeCatId,
          type: "expense",
          amount: 10_000,
          occurredAt: new Date().toISOString(),
        },
      ),
      { params: Promise.resolve({ id: noteAId }) },
    );
    expect(mismatchRes.status).toBe(422);

    const dupUuidRes = await linkedTransactionsPost(
      makeAuthedRequest(
        `http://localhost:3000/api/notes/${noteAId}/transactions`,
        "POST",
        alice.cookie,
        {
          id: fixedTxUuid,
          walletId: cashWalletId,
          categoryId: incomeCatId,
          type: "income",
          amount: 100_000,
          occurredAt: new Date().toISOString(),
        },
      ),
      { params: Promise.resolve({ id: noteAId }) },
    );
    expect(dupUuidRes.status).toBe(409);

    await walletPatch(
      makeAuthedRequest(
        `http://localhost:3000/api/wallets/${bankWalletId}`,
        "PATCH",
        alice.cookie,
        { archived: true },
      ),
      { params: Promise.resolve({ id: bankWalletId }) },
    );
    const archivedWalletRes = await linkedTransactionsPost(
      makeAuthedRequest(
        `http://localhost:3000/api/notes/${noteAId}/transactions`,
        "POST",
        alice.cookie,
        {
          walletId: bankWalletId,
          categoryId: expenseCatId,
          type: "expense",
          amount: 5_000,
          occurredAt: new Date().toISOString(),
        },
      ),
      { params: Promise.resolve({ id: noteAId }) },
    );
    expect(archivedWalletRes.status).toBe(409);

    // 8. GET /api/finance/summary includes `noteTitle` on linked transaction rows
    const summaryRes = await financeSummaryGet(
      makeAuthedRequest(
        "http://localhost:3000/api/finance/summary?tzOffset=420",
        "GET",
        alice.cookie,
      ),
    );
    expect(summaryRes.status).toBe(200);
    const summaryJson = (await summaryRes.json()) as {
      data: {
        ledger: {
          items: Array<{ kind: string; id: string; noteId?: string | null; noteTitle?: string | null }>;
        };
      };
    };
    const linkedSummaryRow = summaryJson.data.ledger.items.find(
      (item) => item.kind === "transaction" && item.id === fixedTxUuid,
    );
    expect(linkedSummaryRow?.noteId).toBe(noteAId);
    expect(linkedSummaryRow?.noteTitle).toBe("Catatan Belanja Harian");

    // 9. DELETE unlink: reject wrong note (404), honor LWW, and empty body unlink without deleting tx
    const wrongNoteUnlink = await linkedTransactionDelete(
      makeAuthedRequest(
        `http://localhost:3000/api/notes/${noteBId}/transactions/${existingTx.id}`,
        "DELETE",
        alice.cookie,
      ),
      { params: Promise.resolve({ id: noteBId, txId: existingTx.id }) },
    );
    expect(wrongNoteUnlink.status).toBe(404);

    const staleUnlink = await linkedTransactionDelete(
      makeAuthedRequest(
        `http://localhost:3000/api/notes/${noteAId}/transactions/${existingTx.id}`,
        "DELETE",
        alice.cookie,
        { updatedAt: "2020-01-01T00:00:00.000Z" },
      ),
      { params: Promise.resolve({ id: noteAId, txId: existingTx.id }) },
    );
    expect(staleUnlink.status).toBe(200);
    expect(
      ((await staleUnlink.json()) as { data: { unlinked: boolean; conflictResolved: string } })
        .data,
    ).toMatchObject({ unlinked: false, conflictResolved: "server_newer" });

    // Empty body unlink
    const validUnlink = await linkedTransactionDelete(
      makeAuthedRequest(
        `http://localhost:3000/api/notes/${noteAId}/transactions/${existingTx.id}`,
        "DELETE",
        alice.cookie,
      ),
      { params: Promise.resolve({ id: noteAId, txId: existingTx.id }) },
    );
    expect(validUnlink.status).toBe(200);
    const validUnlinkJson = (await validUnlink.json()) as {
      data: {
        unlinked: boolean;
        conflictResolved: string;
        summary: { totalIncome: number; totalExpense: number; net: number };
      };
    };
    expect(validUnlinkJson.data.unlinked).toBe(true);
    expect(validUnlinkJson.data.conflictResolved).toBe("applied");
    expect(validUnlinkJson.data.summary).toEqual({
      totalIncome: 100_000,
      totalExpense: 0,
      net: 100_000,
    });

    // Verify existingTx still exists and is now returned by unlinked=true
    const unlinkedPickerRes = await transactionsGet(
      makeAuthedRequest(
        "http://localhost:3000/api/transactions?unlinked=true",
        "GET",
        alice.cookie,
      ),
    );
    const unlinkedItems = (
      (await unlinkedPickerRes.json()) as {
        data: { items: Array<{ id: string }> };
      }
    ).data.items;
    expect(unlinkedItems.some((item) => item.id === existingTx.id)).toBe(true);

    // 10. Deleting noteA sets remaining linked tx `noteId = NULL` without deleting financial tx (DATA-4)
    const delNoteRes = await noteDelete(
      makeAuthedRequest(
        `http://localhost:3000/api/notes/${noteAId}`,
        "DELETE",
        alice.cookie,
      ),
      { params: Promise.resolve({ id: noteAId }) },
    );
    expect(delNoteRes.status).toBe(200);

    const db = getDb();
    const [preservedTx] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, fixedTxUuid))
      .limit(1);
    expect(preservedTx).toBeDefined();
    expect(preservedTx!.deletedAt).toBeNull();
    expect(preservedTx!.noteId).toBeNull();
  });
});

