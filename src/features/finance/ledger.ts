export type LedgerTransactionType = "income" | "expense" | (string & {});

export interface LedgerWalletInput {
  id: string;
  initialBalance: number | bigint | string;
  deletedAt?: Date | string | null;
}

export interface LedgerTransactionInput {
  walletId: string;
  type: LedgerTransactionType;
  amount: number | bigint | string;
  deletedAt?: Date | string | null;
}

export interface LedgerTransferInput {
  fromWalletId: string;
  toWalletId: string;
  amount: number | bigint | string;
  deletedAt?: Date | string | null;
}

export interface WalletBalancesResult {
  balances: Record<string, bigint>;
  totalBalance: bigint;
  incomeTotal: bigint;
  expenseTotal: bigint;
}

const BIGINT_INTEGER_PATTERN = /^-?\d+$/;
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);

/**
 * Converts a safe integer number, numeric string, or bigint into a strict BigInt IDR amount.
 */
export function toBigIntAmount(value: number | bigint | string): bigint {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new RangeError(`Expected integer IDR amount, received ${String(value)}`);
    }
    return BigInt(value);
  }

  const trimmed = value.trim();
  if (!BIGINT_INTEGER_PATTERN.test(trimmed)) {
    throw new RangeError(`Expected integer IDR amount string, received "${value}"`);
  }

  return BigInt(trimmed);
}

/**
 * Converts a computed BigInt ledger value into a JSON-safe JS integer when within safe bounds.
 */
export function bigintToSafeNumber(value: bigint): number {
  if (value > MAX_SAFE_BIGINT || value < MIN_SAFE_BIGINT) {
    throw new RangeError("Ledger balance exceeds JavaScript safe integer range");
  }
  return Number(value);
}

function isActiveRecord(deletedAt: Date | string | null | undefined): boolean {
  return deletedAt === null || deletedAt === undefined;
}

/**
 * Pure domain calculation deriving each wallet's balance strictly from initialBalance + ledger history (DATA-1, DATA-2, DATA-3).
 * Contains zero database or Node-only imports so it can execute cleanly inside browser/IndexedDB workers (RFC-009).
 */
export function computeWalletBalances(
  wallets: readonly LedgerWalletInput[],
  transactions: readonly LedgerTransactionInput[],
  transfers: readonly LedgerTransferInput[],
): WalletBalancesResult {
  const balances: Record<string, bigint> = {};
  const activeWalletIds = new Set<string>();

  for (const wallet of wallets) {
    if (!isActiveRecord(wallet.deletedAt)) {
      continue;
    }
    activeWalletIds.add(wallet.id);
    balances[wallet.id] = toBigIntAmount(wallet.initialBalance);
  }

  let incomeTotal = 0n;
  let expenseTotal = 0n;

  for (const tx of transactions) {
    if (!isActiveRecord(tx.deletedAt)) {
      continue;
    }

    const amount = toBigIntAmount(tx.amount);
    if (tx.type === "income") {
      incomeTotal += amount;
      if (activeWalletIds.has(tx.walletId)) {
        balances[tx.walletId] += amount;
      }
    } else if (tx.type === "expense") {
      expenseTotal += amount;
      if (activeWalletIds.has(tx.walletId)) {
        balances[tx.walletId] -= amount;
      }
    }
  }

  // Transfers adjust wallet balances atomically but are excluded from income/expense cashflow totals (DEC-6, DATA-3).
  for (const transfer of transfers) {
    if (!isActiveRecord(transfer.deletedAt)) {
      continue;
    }

    const amount = toBigIntAmount(transfer.amount);
    if (activeWalletIds.has(transfer.fromWalletId)) {
      balances[transfer.fromWalletId] -= amount;
    }
    if (activeWalletIds.has(transfer.toWalletId)) {
      balances[transfer.toWalletId] += amount;
    }
  }

  let totalBalance = 0n;
  for (const walletId of activeWalletIds) {
    totalBalance += balances[walletId];
  }

  return {
    balances,
    totalBalance,
    incomeTotal,
    expenseTotal,
  };
}

