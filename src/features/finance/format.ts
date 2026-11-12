export type IdrSignMode = "plain" | "signed";

const idrFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

function formatAbsoluteIdr(absValue: bigint | number): string {
  // Intl.NumberFormat natively accepts bigint & number and groups thousands cleanly with dots.
  return idrFormatter.format(absValue).replace(/Rp[\s\u00a0]+/u, "Rp");
}

/**
 * Formats an integer IDR amount using canonical Noka punctuation without fractional decimals (e.g. "Rp285.000", "+Rp50.000", "-Rp50.000", "Rp0").
 */
export function formatIdr(
  amount: number | bigint,
  signMode: IdrSignMode = "plain",
): string {
  const value = typeof amount === "bigint" ? amount : BigInt(Math.trunc(amount));

  if (value === 0n) {
    return "Rp0";
  }

  if (value < 0n) {
    return `-${formatAbsoluteIdr(-value)}`;
  }

  const formatted = formatAbsoluteIdr(value);
  return signMode === "signed" ? `+${formatted}` : formatted;
}

/**
 * Parses a human-typed IDR string (allowing thousand separator dots/spaces) into a non-negative safe integer or null.
 */
export function parseIdrDigits(raw: string): number | null {
  const digitsOnly = raw.replace(/[^\d]/g, "");
  if (digitsOnly.length === 0) {
    return null;
  }

  const parsed = Number(digitsOnly);
  if (!Number.isSafeInteger(parsed)) {
    return null;
  }

  return parsed;
}

