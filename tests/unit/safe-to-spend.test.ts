import { describe, expect, it } from "vitest";
import {
  calculateSafeToSpend,
  resolveActiveCycleWindow,
  type SafeToSpendWalletInput,
} from "@/features/finance/safe-to-spend";

describe("Safe-to-Spend Pure Cycle & Allowance Calculator (TS-007-01)", () => {
  it("resolves standard cycle dates '1'..'28' across mid-cycle, cycle start, and final day", () => {
    // 2026-11-12 05:00Z = 2026-11-12 12:00 WIB (+420)
    const nov12 = new Date("2026-11-12T05:00:00.000Z");

    const cycle1 = resolveActiveCycleWindow(nov12, "1", 420);
    expect(cycle1.startDate).toBe("2026-11-01");
    expect(cycle1.endDate).toBe("2026-11-30");
    // Nov 12..Nov 30 inclusive = 19 days
    expect(cycle1.remainingDays).toBe(19);
    expect(cycle1.startUtcIso).toBe("2026-10-31T17:00:00.000Z");
    expect(cycle1.endExclusiveUtcIso).toBe("2026-11-30T17:00:00.000Z");

    // Cycle start day 25 on Nov 12 -> active cycle started Oct 25 .. Nov 24
    const cycle25 = resolveActiveCycleWindow(nov12, "25", 420);
    expect(cycle25.startDate).toBe("2026-10-25");
    expect(cycle25.endDate).toBe("2026-11-24");
    // Nov 12..Nov 24 inclusive = 13 days
    expect(cycle25.remainingDays).toBe(13);

    // Last day of cycle (Nov 24 with cycleStartDay="25") -> remainingDays === 1
    const nov24NightWib = new Date("2026-11-24T16:30:00.000Z"); // 23:30 WIB
    const endOfCycle = resolveActiveCycleWindow(nov24NightWib, "25", 420);
    expect(endOfCycle.startDate).toBe("2026-10-25");
    expect(endOfCycle.endDate).toBe("2026-11-24");
    expect(endOfCycle.remainingDays).toBe(1);
  });

  it("handles 'end_of_month' and defensive clamping for '29'..'31' in leap & non-leap February", () => {
    // Non-leap Feb 2026: 28 days
    const feb27_2026 = new Date("2026-02-27T05:00:00.000Z");
    const eomBeforeLast = resolveActiveCycleWindow(feb27_2026, "end_of_month", 420);
    expect(eomBeforeLast.startDate).toBe("2026-01-31");
    expect(eomBeforeLast.endDate).toBe("2026-02-27");
    expect(eomBeforeLast.remainingDays).toBe(1);

    const feb28_2026 = new Date("2026-02-28T05:00:00.000Z");
    const eomOnFeb28 = resolveActiveCycleWindow(feb28_2026, "end_of_month", 420);
    expect(eomOnFeb28.startDate).toBe("2026-02-28");
    expect(eomOnFeb28.endDate).toBe("2026-03-30");
    expect(eomOnFeb28.remainingDays).toBe(31);

    // Defensive clamping '31' on non-leap Feb 28 -> starts Feb 28 (min(31, 28))
    const clamp31NonLeap = resolveActiveCycleWindow(feb28_2026, "31", 420);
    expect(clamp31NonLeap.startDate).toBe("2026-02-28");
    expect(clamp31NonLeap.endDate).toBe("2026-03-30");

    // Leap Feb 2024: 29 days, '29' & '31' clamp to Feb 29
    const feb29_2024 = new Date("2024-02-29T05:00:00.000Z");
    const clamp31Leap = resolveActiveCycleWindow(feb29_2024, "31", 420);
    expect(clamp31Leap.startDate).toBe("2024-02-29");
    expect(clamp31Leap.endDate).toBe("2024-03-30");

    const feb28_2024 = new Date("2024-02-28T05:00:00.000Z");
    const clamp29LeapBefore = resolveActiveCycleWindow(feb28_2024, "29", 420);
    expect(clamp29LeapBefore.startDate).toBe("2024-01-29");
    expect(clamp29LeapBefore.endDate).toBe("2024-02-28");
    expect(clamp29LeapBefore.remainingDays).toBe(1);
  });

  it("respects tzOffsetMinutes at midnight UTC+7 boundaries", () => {
    // 2026-11-30 17:00:00Z = 2026-12-01 00:00:00+07:00 (WIB)
    const dec1MidnightWib = new Date("2026-11-30T17:00:00.000Z");
    const wibWindow = resolveActiveCycleWindow(dec1MidnightWib, "1", 420);
    expect(wibWindow.startDate).toBe("2026-12-01");
    expect(wibWindow.endDate).toBe("2026-12-31");
    expect(wibWindow.remainingDays).toBe(31);

    // Same instant in UTC (offset 0) is still Nov 30 (final day of Nov)
    const utcWindow = resolveActiveCycleWindow(dec1MidnightWib, "1", 0);
    expect(utcWindow.startDate).toBe("2026-11-01");
    expect(utcWindow.endDate).toBe("2026-11-30");
    expect(utcWindow.remainingDays).toBe(1);
  });

  it("checks no_included_wallets before non_positive_balance, excludes archived wallets, and floors positive amounts", () => {
    const now = new Date("2026-11-20T05:00:00.000Z"); // cycleStartDay="1" -> Nov 20..Nov 30 = 11 days

    // Guard order: 0 included wallets (even if excluded/archived wallets are negative/positive) -> no_included_wallets
    const noIncluded: SafeToSpendWalletInput[] = [
      { currentBalance: -100_000, includeInSafeToSpend: false, archivedAt: null },
      { currentBalance: 500_000, includeInSafeToSpend: true, archivedAt: "2026-11-01T00:00:00.000Z" },
    ];
    expect(calculateSafeToSpend(noIncluded, now, "1", 420)).toEqual({
      safeToSpend: 0,
      totalIncludedBalance: 0,
      remainingDays: 11,
      includedWalletCount: 0,
      status: "no_included_wallets",
    });

    // Zero or negative balance across included active wallets -> non_positive_balance with safeToSpend === 0
    const zeroBalance = calculateSafeToSpend(
      [{ currentBalance: 0, includeInSafeToSpend: true, archivedAt: null }],
      now,
      "1",
      420,
    );
    expect(zeroBalance).toEqual({
      safeToSpend: 0,
      totalIncludedBalance: 0,
      remainingDays: 11,
      includedWalletCount: 1,
      status: "non_positive_balance",
    });

    const negativeBalance = calculateSafeToSpend(
      [
        { currentBalance: 100_000, includeInSafeToSpend: true, archivedAt: null },
        { currentBalance: -250_000, includeInSafeToSpend: true, archivedAt: null },
      ],
      now,
      "1",
      420,
    );
    expect(negativeBalance).toEqual({
      safeToSpend: 0,
      totalIncludedBalance: -150_000,
      remainingDays: 11,
      includedWalletCount: 2,
      status: "non_positive_balance",
    });

    // Positive balance -> deterministic floor division, excluding bank (false) & archived
    const positive = calculateSafeToSpend(
      [
        { currentBalance: 1_000_000, includeInSafeToSpend: true, archivedAt: null },
        { currentBalance: 999_999, includeInSafeToSpend: true, archivedAt: null },
        { currentBalance: 50_000_000, includeInSafeToSpend: false, archivedAt: null },
        { currentBalance: 10_000_000, includeInSafeToSpend: true, archivedAt: new Date() },
      ],
      now,
      "1",
      420,
    );
    // (1_000_000 + 999_999) / 11 = 1_999_999 / 11 = 181_818.0909 -> floor = 181_818
    expect(positive).toEqual({
      safeToSpend: 181_818,
      totalIncludedBalance: 1_999_999,
      remainingDays: 11,
      includedWalletCount: 2,
      status: "ok",
    });
  });
});

