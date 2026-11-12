import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatIdr, parseIdrDigits } from "@/features/finance/format";
import {
  bigintToSafeNumber,
  computeWalletBalances,
  toBigIntAmount,
} from "@/features/finance/ledger";
import {
  createCategorySchema,
  createTransactionSchema,
  createTransferSchema,
  createWalletSchema,
  resolveDateFilterRange,
  updateCategorySchema,
  updateTransactionSchema,
  updateTransferSchema,
  updateWalletSchema,
} from "@/features/finance/schemas";

describe("TS-006-01: Pure Finance Ledger, formatIdr, and Zod Schemas", () => {
  it("contains zero database or pg imports inside pure ledger & format modules", () => {
    const ledgerSource = fs.readFileSync(
      path.resolve(process.cwd(), "src/features/finance/ledger.ts"),
      "utf8",
    );
    const formatSource = fs.readFileSync(
      path.resolve(process.cwd(), "src/features/finance/format.ts"),
      "utf8",
    );

    expect(ledgerSource).not.toMatch(/from\s+["']@\/db|from\s+["']pg["']|drizzle-orm/);
    expect(formatSource).not.toMatch(/from\s+["']@\/db|from\s+["']pg["']|drizzle-orm/);
  });

  it("derives per-wallet balances accurately from initialBalance + income - expense + transferIn - transferOut while ignoring tombstones", () => {
    const now = new Date("2026-11-12T08:00:00.000Z");

    const wallets = [
      { id: "w-cash", initialBalance: 100_000, deletedAt: null },
      { id: "w-bank", initialBalance: 2_500_000, deletedAt: null },
      { id: "w-deleted", initialBalance: 9_999_999, deletedAt: now },
    ];

    const transactions = [
      // Cash: +50.000 - 20.000 = +30.000 net
      { walletId: "w-cash", type: "income", amount: 50_000, deletedAt: null },
      { walletId: "w-cash", type: "expense", amount: 20_000, deletedAt: null },
      // Soft-deleted tombstone must NOT affect balance or totals
      { walletId: "w-cash", type: "expense", amount: 99_000, deletedAt: now },
      // Bank: +5.000.000 - 1.200.000 = +3.800.000 net
      { walletId: "w-bank", type: "income", amount: 5_000_000, deletedAt: null },
      { walletId: "w-bank", type: "expense", amount: 1_200_000, deletedAt: null },
      // Soft-deleted wallet tx should not distort cashflow if still marked active, or ignored tombstone:
      { walletId: "w-deleted", type: "income", amount: 10_000, deletedAt: now },
    ];

    const transfers = [
      // Bank -> Cash: 250.000
      { fromWalletId: "w-bank", toWalletId: "w-cash", amount: 250_000, deletedAt: null },
      // Tombstone transfer must be ignored
      { fromWalletId: "w-cash", toWalletId: "w-bank", amount: 500_000, deletedAt: now },
    ];

    const result = computeWalletBalances(wallets, transactions, transfers);

    // Cash = 100_000 + 50_000 - 20_000 + 250_000 = 380_000
    expect(result.balances["w-cash"]).toBe(380_000n);
    // Bank = 2_500_000 + 5_000_000 - 1_200_000 - 250_000 = 6_050_000
    expect(result.balances["w-bank"]).toBe(6_050_000n);
    expect(result.balances["w-deleted"]).toBeUndefined();

    expect(result.totalBalance).toBe(6_430_000n);
    // Cashflow excludes transfers strictly (DEC-6, DATA-3)
    expect(result.incomeTotal).toBe(5_050_000n);
    expect(result.expenseTotal).toBe(1_220_000n);
  });

  it("handles large BigInt IDR amounts accurately", () => {
    const big = toBigIntAmount("9007199254740991");
    expect(big).toBe(BigInt(Number.MAX_SAFE_INTEGER));
    expect(bigintToSafeNumber(big)).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => toBigIntAmount(12.5)).toThrow();
    expect(() => bigintToSafeNumber(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow();
  });

  it("formats IDR cleanly in plain and signed modes without spaces or decimals", () => {
    expect(formatIdr(285_000)).toBe("Rp285.000");
    expect(formatIdr(50_000, "signed")).toBe("+Rp50.000");
    expect(formatIdr(-50_000, "plain")).toBe("-Rp50.000");
    expect(formatIdr(-50_000, "signed")).toBe("-Rp50.000");
    expect(formatIdr(0, "plain")).toBe("Rp0");
    expect(formatIdr(0, "signed")).toBe("Rp0");
    expect(formatIdr(1_250_000n, "signed")).toBe("+Rp1.250.000");

    expect(parseIdrDigits("Rp 285.000")).toBe(285_000);
    expect(parseIdrDigits("abc")).toBeNull();
  });

  it("enforces strict Zod bounds on IDR amounts, client balance payloads, empty PATCH, and category PATCH", () => {
    const validUuid = "11111111-1111-4111-8111-111111111111";
    const validUuid2 = "22222222-2222-4222-8222-222222222222";

    // Wallet: rejects float, negative, or client-supplied balance/currentBalance
    expect(
      createWalletSchema.safeParse({
        name: "Kas Harian",
        type: "cash",
        initialBalance: 0,
      }).success,
    ).toBe(true);
    expect(
      createWalletSchema.safeParse({
        name: "Kas",
        type: "cash",
        initialBalance: -1,
      }).success,
    ).toBe(false);
    expect(
      createWalletSchema.safeParse({
        name: "Kas",
        type: "cash",
        initialBalance: 100.5,
      }).success,
    ).toBe(false);
    expect(
      createWalletSchema.safeParse({
        name: "Kas",
        type: "cash",
        balance: 50000,
      }).success,
    ).toBe(false);
    expect(
      updateWalletSchema.safeParse({}).success,
    ).toBe(false);
    expect(
      updateWalletSchema.safeParse({ isDefault: true, archived: true }).success,
    ).toBe(false);

    // Transaction: rejects 0, negative, float, client balance
    expect(
      createTransactionSchema.safeParse({
        walletId: validUuid,
        categoryId: validUuid2,
        type: "expense",
        amount: 15_000,
        occurredAt: "2026-11-12T08:00:00.000Z",
      }).success,
    ).toBe(true);
    expect(
      createTransactionSchema.safeParse({
        walletId: validUuid,
        categoryId: validUuid2,
        type: "expense",
        amount: 0,
        occurredAt: "2026-11-12",
      }).success,
    ).toBe(false);
    expect(
      createTransactionSchema.safeParse({
        walletId: validUuid,
        categoryId: validUuid2,
        type: "expense",
        amount: 10.25,
        occurredAt: "2026-11-12",
      }).success,
    ).toBe(false);
    expect(updateTransactionSchema.safeParse({}).success).toBe(false);

    // Transfer: positive safe integers, reject empty PATCH & 0 amount
    expect(
      createTransferSchema.safeParse({
        fromWalletId: validUuid,
        toWalletId: validUuid2,
        amount: 50_000,
        occurredAt: "2026-11-12T10:00:00+07:00",
      }).success,
    ).toBe(true);
    expect(
      createTransferSchema.safeParse({
        fromWalletId: validUuid,
        toWalletId: validUuid2,
        amount: 0,
        occurredAt: "2026-11-12",
      }).success,
    ).toBe(false);
    expect(updateTransferSchema.safeParse({}).success).toBe(false);

    // Category PATCH rejects changing `type`
    expect(
      createCategorySchema.safeParse({ name: "Kopi", type: "expense" }).success,
    ).toBe(true);
    expect(
      updateCategorySchema.safeParse({ name: "Kopi", type: "income" }).success,
    ).toBe(false);

    // tzOffset UTC+7 range checks
    const range = resolveDateFilterRange("2026-11-12", "2026-11-12", 420);
    expect(range.fromDate?.toISOString()).toBe("2026-11-11T17:00:00.000Z");
    expect(range.toDate?.toISOString()).toBe("2026-11-12T16:59:59.999Z");
    expect(() => resolveDateFilterRange("2026-11-13", "2026-11-12", 420)).toThrow();
  });
});

