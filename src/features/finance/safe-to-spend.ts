import { DEFAULT_TZ_OFFSET_MINUTES } from "@/features/finance/schemas";

const MS_PER_DAY = 86_400_000;
const MS_PER_MINUTE = 60_000;

export interface CycleWindowInfo {
  startDate: string;
  endDate: string;
  startUtcIso: string;
  endExclusiveUtcIso: string;
  remainingDays: number;
  cycleStartDay: string;
}

export type SafeToSpendStatus =
  | "ok"
  | "no_included_wallets"
  | "non_positive_balance";

export interface SafeToSpendResult {
  safeToSpend: number;
  totalIncludedBalance: number;
  remainingDays: number;
  includedWalletCount: number;
  status: SafeToSpendStatus;
}

export interface SafeToSpendWalletInput {
  currentBalance: number;
  includeInSafeToSpend: boolean;
  archivedAt: string | Date | null;
}

interface CalendarDateParts {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
}

function daysInCalendarMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function formatYmd(parts: CalendarDateParts): string {
  const y = String(parts.year).padStart(4, "0");
  const m = String(parts.month).padStart(2, "0");
  const d = String(parts.day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeCycleStartDay(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "end_of_month") {
    return "end_of_month";
  }
  if (/^\d{1,2}$/.test(trimmed)) {
    const num = Number(trimmed);
    if (Number.isInteger(num) && num >= 1 && num <= 31) {
      return String(num);
    }
  }
  return "1";
}

function resolveCycleStartDayForMonth(
  year: number,
  month: number,
  cycleStartDay: string,
): number {
  const maxDays = daysInCalendarMonth(year, month);
  if (cycleStartDay === "end_of_month") {
    return maxDays;
  }

  const day = Number(cycleStartDay);
  if (!Number.isInteger(day) || day < 1) {
    return 1;
  }
  return Math.min(day, maxDays);
}

function shiftMonth(year: number, month: number, delta: -1 | 1): {
  year: number;
  month: number;
} {
  if (delta === 1) {
    return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  }
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function normalizeTzOffsetMinutes(raw: number): number {
  if (!Number.isInteger(raw) || raw < -720 || raw > 840) {
    return DEFAULT_TZ_OFFSET_MINUTES;
  }
  return raw;
}

/**
 * Resolves the active billing/payday cycle window and inclusive remaining days in the caller's timezone.
 */
export function resolveActiveCycleWindow(
  nowDate: Date,
  rawCycleStartDay: string,
  tzOffsetMinutes = DEFAULT_TZ_OFFSET_MINUTES,
): CycleWindowInfo {
  const tzOffset = normalizeTzOffsetMinutes(tzOffsetMinutes);
  const cycleStartDay = normalizeCycleStartDay(rawCycleStartDay);
  const shifted = new Date(nowDate.getTime() + tzOffset * MS_PER_MINUTE);

  const today: CalendarDateParts = {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };

  const currentMonthStartDay = resolveCycleStartDayForMonth(
    today.year,
    today.month,
    cycleStartDay,
  );

  let start: CalendarDateParts;
  let end: CalendarDateParts;

  if (today.day >= currentMonthStartDay) {
    start = { year: today.year, month: today.month, day: currentMonthStartDay };
    const nextYm = shiftMonth(today.year, today.month, 1);
    const nextStartDay = resolveCycleStartDayForMonth(
      nextYm.year,
      nextYm.month,
      cycleStartDay,
    );
    const endUtc = new Date(
      Date.UTC(nextYm.year, nextYm.month - 1, nextStartDay) - MS_PER_DAY,
    );
    end = {
      year: endUtc.getUTCFullYear(),
      month: endUtc.getUTCMonth() + 1,
      day: endUtc.getUTCDate(),
    };
  } else {
    const prevYm = shiftMonth(today.year, today.month, -1);
    const prevStartDay = resolveCycleStartDayForMonth(
      prevYm.year,
      prevYm.month,
      cycleStartDay,
    );
    start = { year: prevYm.year, month: prevYm.month, day: prevStartDay };
    const endUtc = new Date(
      Date.UTC(today.year, today.month - 1, currentMonthStartDay) - MS_PER_DAY,
    );
    end = {
      year: endUtc.getUTCFullYear(),
      month: endUtc.getUTCMonth() + 1,
      day: endUtc.getUTCDate(),
    };
  }

  const todayMidnightUtc = Date.UTC(today.year, today.month - 1, today.day);
  const endMidnightUtc = Date.UTC(end.year, end.month - 1, end.day);
  const remainingDays = Math.max(
    1,
    Math.round((endMidnightUtc - todayMidnightUtc) / MS_PER_DAY) + 1,
  );

  const startUtcIso = new Date(
    Date.UTC(start.year, start.month - 1, start.day, 0, 0, 0, 0) -
      tzOffset * MS_PER_MINUTE,
  ).toISOString();
  const endExclusiveUtcIso = new Date(
    Date.UTC(end.year, end.month - 1, end.day + 1, 0, 0, 0, 0) -
      tzOffset * MS_PER_MINUTE,
  ).toISOString();

  return {
    startDate: formatYmd(start),
    endDate: formatYmd(end),
    startUtcIso,
    endExclusiveUtcIso,
    remainingDays,
    cycleStartDay,
  };
}

/**
 * Calculates deterministic daily Safe-to-Spend allowance from active included wallets (`DATA-5`, `DEC-12`, `HIGH-2`).
 */
export function calculateSafeToSpend(
  walletsWithBalance: readonly SafeToSpendWalletInput[],
  nowDate: Date,
  cycleStartDay: string,
  tzOffsetMinutes = DEFAULT_TZ_OFFSET_MINUTES,
): SafeToSpendResult {
  const cycle = resolveActiveCycleWindow(nowDate, cycleStartDay, tzOffsetMinutes);
  const includedWallets = walletsWithBalance.filter(
    (wallet) => wallet.archivedAt === null && wallet.includeInSafeToSpend === true,
  );

  if (includedWallets.length === 0) {
    return {
      safeToSpend: 0,
      totalIncludedBalance: 0,
      remainingDays: cycle.remainingDays,
      includedWalletCount: 0,
      status: "no_included_wallets",
    };
  }

  let totalIncludedBigInt = 0n;
  for (const wallet of includedWallets) {
    totalIncludedBigInt += BigInt(Math.trunc(wallet.currentBalance));
  }

  if (totalIncludedBigInt <= 0n) {
    return {
      safeToSpend: 0,
      totalIncludedBalance: Number(totalIncludedBigInt),
      remainingDays: cycle.remainingDays,
      includedWalletCount: includedWallets.length,
      status: "non_positive_balance",
    };
  }

  const dailySafeBigInt = totalIncludedBigInt / BigInt(cycle.remainingDays);
  return {
    safeToSpend: Number(dailySafeBigInt),
    totalIncludedBalance: Number(totalIncludedBigInt),
    remainingDays: cycle.remainingDays,
    includedWalletCount: includedWallets.length,
    status: "ok",
  };
}

