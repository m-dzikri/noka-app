import { eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { POST as registerPost } from "@/app/api/auth/register/route";
import {
  GET as debtsGet,
  POST as debtsPost,
} from "@/app/api/finance/debts/route";
import {
  GET as debtDetailGet,
  PATCH as debtDetailPatch,
  DELETE as debtDetailDelete,
} from "@/app/api/finance/debts/[id]/route";
import { POST as settlementsPost } from "@/app/api/finance/debts/[id]/settlements/route";
import { DELETE as settlementDelete } from "@/app/api/finance/debts/[id]/settlements/[settlementId]/route";
import { POST as walletsPost } from "@/app/api/wallets/route";
import { getDb } from "@/db";
import { users } from "@/db/schema/auth";
import {
  categories,
  debtSettlements,
  debtsReceivables,
  transactions,
  wallets,
} from "@/db/schema/finance";
import { deleteAccount } from "@/features/account/service";
import { loadWalletsWithBalances } from "@/features/finance/wallets-service";

const createdUserIds: string[] = [];

afterEach(async () => {
  if (createdUserIds.length === 0) return;
  const db = getDb();
  const ids = [...createdUserIds];
  createdUserIds.length = 0;

  await db.delete(debtsReceivables).where(inArray(debtsReceivables.userId, ids));
  await db.delete(transactions).where(inArray(transactions.userId, ids));
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
        name: "Debts User",
        email,
        password: "Password123!",
      }),
    }),
  );

  const json = await res.json();
  const userId = json.data.user.id as string;
  createdUserIds.push(userId);
  const cookie = extractSessionCookie(res);

  return { userId, cookie, email };
}

describe("TS-014-02: Debts & Receivables API Integration Tests", () => {
  describe("Authentication & CSRF Protection", () => {
    it("rejects unauthenticated requests with 401 UNAUTHORIZED", async () => {
      const unauthReq = new NextRequest("http://localhost:3000/api/finance/debts", {
        method: "GET",
      });
      const res = await debtsGet(unauthReq);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe("UNAUTHORIZED");
    });

    it("rejects POST requests without CSRF origin with 403 CSRF_FORBIDDEN", async () => {
      const user = await createRegisteredUser("csrf-test");
      const noOriginReq = new NextRequest("http://localhost:3000/api/finance/debts", {
        method: "POST",
        headers: {
          cookie: user.cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          type: "debt",
          personName: "Budi",
          totalAmount: 500_000,
        }),
      });

      const res = await debtsPost(noOriginReq);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe("CSRF_ORIGIN_MISMATCH");
    });
  });

  describe("Multi-Tenant Isolation (SEC-1)", () => {
    it("prevents User B from accessing, modifying, settling, or deleting User A debts", async () => {
      const userA = await createRegisteredUser("user-a");
      const userB = await createRegisteredUser("user-b");

      // User A creates a debt
      const createReq = makeAuthedRequest(
        "http://localhost:3000/api/finance/debts",
        "POST",
        userA.cookie,
        {
          type: "debt",
          personName: "Rudi",
          totalAmount: 1_000_000,
        },
      );
      const createRes = await debtsPost(createReq);
      expect(createRes.status).toBe(201);
      const createJson = await createRes.json();
      const debtId = createJson.data.item.id;

      // User B attempts GET
      const getReq = makeAuthedRequest(
        `http://localhost:3000/api/finance/debts/${debtId}`,
        "GET",
        userB.cookie,
      );
      const getRes = await debtDetailGet(getReq, { params: Promise.resolve({ id: debtId }) });
      expect(getRes.status).toBe(404);

      // User B attempts PATCH
      const patchReq = makeAuthedRequest(
        `http://localhost:3000/api/finance/debts/${debtId}`,
        "PATCH",
        userB.cookie,
        { personName: "Hacked" },
      );
      const patchRes = await debtDetailPatch(patchReq, { params: Promise.resolve({ id: debtId }) });
      expect(patchRes.status).toBe(404);

      // User B attempts settlement
      const settleReq = makeAuthedRequest(
        `http://localhost:3000/api/finance/debts/${debtId}/settlements`,
        "POST",
        userB.cookie,
        { amount: 100_000 },
      );
      const settleRes = await settlementsPost(settleReq, { params: Promise.resolve({ id: debtId }) });
      expect(settleRes.status).toBe(404);

      // User B attempts DELETE
      const deleteReq = makeAuthedRequest(
        `http://localhost:3000/api/finance/debts/${debtId}`,
        "DELETE",
        userB.cookie,
      );
      const deleteRes = await debtDetailDelete(deleteReq, { params: Promise.resolve({ id: debtId }) });
      expect(deleteRes.status).toBe(404);
    });
  });

  describe("CRUD Flow, Settlements & Ledger Integration (F22, DATA-1, DATA-2, AC-14.1, AC-14.2)", () => {
    it("creates debts and receivables, calculates global summary, and updates metadata", async () => {
      const user = await createRegisteredUser("crud-test");

      // 1. Create receivable
      const recRes = await debtsPost(
        makeAuthedRequest("http://localhost:3000/api/finance/debts", "POST", user.cookie, {
          type: "receivable",
          personName: "Budi Santoso",
          totalAmount: 1_200_000,
          dueDate: "2026-12-01T00:00:00.000Z",
          notes: "Pinjaman modal",
        }),
      );
      expect(recRes.status).toBe(201);
      const recJson = await recRes.json();
      expect(recJson.data.item.remainingAmount).toBe(1_200_000);
      expect(recJson.data.item.type).toBe("receivable");

      // 2. Create debt
      const debtRes = await debtsPost(
        makeAuthedRequest("http://localhost:3000/api/finance/debts", "POST", user.cookie, {
          type: "debt",
          personName: "Siti Rahma",
          totalAmount: 500_000,
        }),
      );
      expect(debtRes.status).toBe(201);

      // 3. List debts and verify summary & autocomplete contacts
      const listRes = await debtsGet(
        makeAuthedRequest("http://localhost:3000/api/finance/debts", "GET", user.cookie),
      );
      expect(listRes.status).toBe(200);
      const listJson = await listRes.json();
      expect(listJson.data.summary.totalReceivable).toBe(1_200_000);
      expect(listJson.data.summary.totalDebt).toBe(500_000);
      expect(listJson.data.summary.netPosition).toBe(700_000);
      expect(listJson.data.items).toHaveLength(2);
      expect(listJson.data.contacts).toContain("Budi Santoso");
      expect(listJson.data.contacts).toContain("Siti Rahma");

      // 4. Update debt notes and personName
      const patchRes = await debtDetailPatch(
        makeAuthedRequest(
          `http://localhost:3000/api/finance/debts/${recJson.data.item.id}`,
          "PATCH",
          user.cookie,
          {
            personName: "Budi S. (Updated)",
            notes: "Updated note",
          },
        ),
        { params: Promise.resolve({ id: recJson.data.item.id }) },
      );
      expect(patchRes.status).toBe(200);
      const patchJson = await patchRes.json();
      expect(patchJson.data.item.personName).toBe("Budi S. (Updated)");
      expect(patchJson.data.item.notes).toBe("Updated note");
    });

    it("records settlement with real wallet creating atomic ledger transaction and updating balance (AC-14.2)", async () => {
      const user = await createRegisteredUser("settle-wallet");

      // Create a wallet with 1,000,000 initial balance
      const walletRes = await walletsPost(
        makeAuthedRequest("http://localhost:3000/api/wallets", "POST", user.cookie, {
          name: "Dompet Utama",
          type: "bank",
          initialBalance: 1_000_000,
        }),
      );
      const walletJson = await walletRes.json();
      const walletId = walletJson.data.wallet.id;

      // Create a debt of 600,000
      const debtRes = await debtsPost(
        makeAuthedRequest("http://localhost:3000/api/finance/debts", "POST", user.cookie, {
          type: "debt",
          personName: "Vendor Laptop",
          totalAmount: 600_000,
        }),
      );
      const debtJson = await debtRes.json();
      const debtId = debtJson.data.item.id;

      // Settle 400,000 using the wallet
      const settleRes = await settlementsPost(
        makeAuthedRequest(
          `http://localhost:3000/api/finance/debts/${debtId}/settlements`,
          "POST",
          user.cookie,
          {
            amount: 400_000,
            walletId,
            notes: "Cicilan 1 transfer BCA",
          },
        ),
        { params: Promise.resolve({ id: debtId }) },
      );
      expect(settleRes.status).toBe(201);
      const settleJson = await settleRes.json();
      expect(settleJson.data.settlement.amount).toBe(400_000);
      expect(settleJson.data.settlement.transactionId).toBeTruthy();
      expect(settleJson.data.debt.settledAmount).toBe(400_000);
      expect(settleJson.data.debt.remainingAmount).toBe(200_000);
      expect(settleJson.data.debt.status).toBe("active");

      // Verify wallet balance is reduced to 600,000
      const db = getDb();
      const balances = await loadWalletsWithBalances(db, user.userId);
      const targetWallet = balances.find((w) => w.id === walletId);
      expect(targetWallet?.currentBalance).toBe(600_000);

      // Verify ledger transaction was created as EXPENSE
      const [tx] = await db
        .select()
        .from(transactions)
        .where(eq(transactions.id, settleJson.data.settlement.transactionId));
      expect(tx).toBeTruthy();
      expect(tx.type).toBe("expense");
      expect(tx.amount).toBe(400_000);
      expect(tx.walletId).toBe(walletId);
    });

    it("records settlement without wallet (non-cash/barter) without mutating wallet balance (AC-14.2)", async () => {
      const user = await createRegisteredUser("settle-nowallet");

      // Create wallet with 1,000,000
      const walletRes = await walletsPost(
        makeAuthedRequest("http://localhost:3000/api/wallets", "POST", user.cookie, {
          name: "Kas Pribadi",
          type: "cash",
          initialBalance: 1_000_000,
        }),
      );
      const walletJson = await walletRes.json();
      const walletId = walletJson.data.wallet.id;

      // Create receivable of 500,000
      const recRes = await debtsPost(
        makeAuthedRequest("http://localhost:3000/api/finance/debts", "POST", user.cookie, {
          type: "receivable",
          personName: "Teman Kantor",
          totalAmount: 500_000,
        }),
      );
      const recJson = await recRes.json();
      const debtId = recJson.data.item.id;

      // Record offline/barter settlement of 200,000 without wallet
      const settleRes = await settlementsPost(
        makeAuthedRequest(
          `http://localhost:3000/api/finance/debts/${debtId}/settlements`,
          "POST",
          user.cookie,
          {
            amount: 200_000,
            walletId: null,
            notes: "Dipotong traktir makan bersama",
          },
        ),
        { params: Promise.resolve({ id: debtId }) },
      );
      expect(settleRes.status).toBe(201);
      const settleJson = await settleRes.json();
      expect(settleJson.data.settlement.walletId).toBeNull();
      expect(settleJson.data.settlement.transactionId).toBeNull();
      expect(settleJson.data.debt.settledAmount).toBe(200_000);
      expect(settleJson.data.debt.remainingAmount).toBe(300_000);

      // Verify wallet balance remains untouched at 1,000,000
      const db = getDb();
      const balances = await loadWalletsWithBalances(db, user.userId);
      const targetWallet = balances.find((w) => w.id === walletId);
      expect(targetWallet?.currentBalance).toBe(1_000_000);
    });

    it("automatically sets status to settled when fully paid and rejects over-settlement (AC-14.3)", async () => {
      const user = await createRegisteredUser("auto-settled");

      const debtRes = await debtsPost(
        makeAuthedRequest("http://localhost:3000/api/finance/debts", "POST", user.cookie, {
          type: "debt",
          personName: "Koperasi",
          totalAmount: 300_000,
        }),
      );
      const debtJson = await debtRes.json();
      const debtId = debtJson.data.item.id;

      // Attempt over-settlement: 350,000 > 300,000 -> 422 OVER_SETTLEMENT
      const overRes = await settlementsPost(
        makeAuthedRequest(
          `http://localhost:3000/api/finance/debts/${debtId}/settlements`,
          "POST",
          user.cookie,
          { amount: 350_000 },
        ),
        { params: Promise.resolve({ id: debtId }) },
      );
      expect(overRes.status).toBe(422);
      const overJson = await overRes.json();
      expect(overJson.error.code).toBe("OVER_SETTLEMENT");

      // Pay exact remaining: 300,000 -> status transitions to settled
      const fullRes = await settlementsPost(
        makeAuthedRequest(
          `http://localhost:3000/api/finance/debts/${debtId}/settlements`,
          "POST",
          user.cookie,
          { amount: 300_000 },
        ),
        { params: Promise.resolve({ id: debtId }) },
      );
      expect(fullRes.status).toBe(201);
      const fullJson = await fullRes.json();
      expect(fullJson.data.debt.status).toBe("settled");
      expect(fullJson.data.debt.remainingAmount).toBe(0);

      // Attempt payment on already settled debt -> 422 DEBT_ALREADY_SETTLED
      const repeatRes = await settlementsPost(
        makeAuthedRequest(
          `http://localhost:3000/api/finance/debts/${debtId}/settlements`,
          "POST",
          user.cookie,
          { amount: 10_000 },
        ),
        { params: Promise.resolve({ id: debtId }) },
      );
      expect(repeatRes.status).toBe(422);
      const repeatJson = await repeatRes.json();
      expect(repeatJson.error.code).toBe("DEBT_ALREADY_SETTLED");
    });

    it("preserves past ledger cash transactions when deleting debt (AC-14.6, DATA-4)", async () => {
      const user = await createRegisteredUser("delete-safety");

      const walletRes = await walletsPost(
        makeAuthedRequest("http://localhost:3000/api/wallets", "POST", user.cookie, {
          name: "Dompet Operasional",
          type: "bank",
          initialBalance: 2_000_000,
        }),
      );
      const walletId = (await walletRes.json()).data.wallet.id;

      // Create debt of 500,000
      const debtRes = await debtsPost(
        makeAuthedRequest("http://localhost:3000/api/finance/debts", "POST", user.cookie, {
          type: "debt",
          personName: "Rekanan Bisnis",
          totalAmount: 500_000,
        }),
      );
      const debtId = (await debtRes.json()).data.item.id;

      // Settle 300,000 with wallet
      const settleRes = await settlementsPost(
        makeAuthedRequest(
          `http://localhost:3000/api/finance/debts/${debtId}/settlements`,
          "POST",
          user.cookie,
          { amount: 300_000, walletId },
        ),
        { params: Promise.resolve({ id: debtId }) },
      );
      const transactionId = (await settleRes.json()).data.settlement.transactionId;

      // Delete the debt record
      const delRes = await debtDetailDelete(
        makeAuthedRequest(
          `http://localhost:3000/api/finance/debts/${debtId}`,
          "DELETE",
          user.cookie,
        ),
        { params: Promise.resolve({ id: debtId }) },
      );
      expect(delRes.status).toBe(200);

      // Verify the cash transaction still exists in transactions table
      const db = getDb();
      const [tx] = await db
        .select()
        .from(transactions)
        .where(eq(transactions.id, transactionId));
      expect(tx).toBeTruthy();
      expect(tx.amount).toBe(300_000);

      // Verify wallet balance is still 1,700,000 (undisturbed by debt deletion)
      const balances = await loadWalletsWithBalances(db, user.userId);
      const targetWallet = balances.find((w) => w.id === walletId);
      expect(targetWallet?.currentBalance).toBe(1_700_000);
    });

    it("cascades and cleans all debts and settlements upon account deletion (RFC-010, AC-14.6)", async () => {
      const user = await createRegisteredUser("account-delete");

      // Create a debt and a settlement
      const debtRes = await debtsPost(
        makeAuthedRequest("http://localhost:3000/api/finance/debts", "POST", user.cookie, {
          type: "debt",
          personName: "Pinjaman Teman",
          totalAmount: 400_000,
        }),
      );
      const debtId = (await debtRes.json()).data.item.id;

      await settlementsPost(
        makeAuthedRequest(
          `http://localhost:3000/api/finance/debts/${debtId}/settlements`,
          "POST",
          user.cookie,
          { amount: 100_000 },
        ),
        { params: Promise.resolve({ id: debtId }) },
      );

      // Perform account deletion
      await deleteAccount(user.userId, "Password123!");

      // Verify database has 0 debts and 0 settlements for this user
      const db = getDb();
      const userDebts = await db
        .select()
        .from(debtsReceivables)
        .where(eq(debtsReceivables.userId, user.userId));
      expect(userDebts).toHaveLength(0);

      const userSettlements = await db
        .select()
        .from(debtSettlements)
        .where(eq(debtSettlements.debtId, debtId));
      expect(userSettlements).toHaveLength(0);
    });

    it("reverts settlement payment atomically: deletes linked cash transaction, restores wallet balance, and restores debt status (Non-blocking improvement)", async () => {
      const user = await createRegisteredUser("revert-settle");
      const userB = await createRegisteredUser("revert-intruder");

      // 1. Create wallet with 1,500,000 IDR
      const walletRes = await walletsPost(
        makeAuthedRequest("http://localhost:3000/api/wallets", "POST", user.cookie, {
          name: "Dompet Reversal",
          type: "bank",
          initialBalance: 1_500_000,
        }),
      );
      const walletId = (await walletRes.json()).data.wallet.id;

      // 2. Create debt of 500,000 IDR
      const debtRes = await debtsPost(
        makeAuthedRequest("http://localhost:3000/api/finance/debts", "POST", user.cookie, {
          type: "debt",
          personName: "Mitra Bisnis",
          totalAmount: 500_000,
        }),
      );
      const debtId = (await debtRes.json()).data.item.id;

      // 3. Fully settle debt with wallet
      const settleRes = await settlementsPost(
        makeAuthedRequest(
          `http://localhost:3000/api/finance/debts/${debtId}/settlements`,
          "POST",
          user.cookie,
          { amount: 500_000, walletId, notes: "Pelunasan penuh" },
        ),
        { params: Promise.resolve({ id: debtId }) },
      );
      expect(settleRes.status).toBe(201);
      const settleJson = await settleRes.json();
      const settlementId = settleJson.data.settlement.id;
      const transactionId = settleJson.data.settlement.transactionId;
      expect(settleJson.data.debt.status).toBe("settled");
      expect(settleJson.data.debt.settledAmount).toBe(500_000);

      // Verify wallet balance is 1,000,000
      const db = getDb();
      let balances = await loadWalletsWithBalances(db, user.userId);
      let targetWallet = balances.find((w) => w.id === walletId);
      expect(targetWallet?.currentBalance).toBe(1_000_000);

      // 4. Multi-tenant rejection: User B cannot delete User A's settlement
      const intruderDelRes = await settlementDelete(
        makeAuthedRequest(
          `http://localhost:3000/api/finance/debts/${debtId}/settlements/${settlementId}`,
          "DELETE",
          userB.cookie,
        ),
        { params: Promise.resolve({ id: debtId, settlementId }) },
      );
      expect(intruderDelRes.status).toBe(404);

      // 5. User A deletes/reverts the settlement
      const delRes = await settlementDelete(
        makeAuthedRequest(
          `http://localhost:3000/api/finance/debts/${debtId}/settlements/${settlementId}`,
          "DELETE",
          user.cookie,
        ),
        { params: Promise.resolve({ id: debtId, settlementId }) },
      );
      expect(delRes.status).toBe(200);
      const delJson = await delRes.json();
      expect(delJson.data.deleted).toBe(true);
      expect(delJson.data.debt.settledAmount).toBe(0);
      expect(delJson.data.debt.status).toBe("active");

      // Verify the cash transaction was deleted
      const [tx] = await db
        .select()
        .from(transactions)
        .where(eq(transactions.id, transactionId));
      expect(tx).toBeUndefined();

      // Verify wallet balance is restored to 1,500,000!
      balances = await loadWalletsWithBalances(db, user.userId);
      targetWallet = balances.find((w) => w.id === walletId);
      expect(targetWallet?.currentBalance).toBe(1_500_000);
    });
  });
});
