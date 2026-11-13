"use client";

import { useContext } from "react";
import { usePrivacy } from "@/components/providers/PrivacyProvider";
import { formatIdr, type IdrSignMode } from "@/features/finance/format";
import { cn } from "@/lib/cn";
import { I18nContext } from "@/lib/i18n/context";

export interface PrivacyAmountProps {
  amount: number | bigint;
  signMode?: "auto" | IdrSignMode;
  type?: "income" | "expense" | "transfer";
  className?: string;
}

function toBigIntValue(amount: number | bigint): bigint {
  return typeof amount === "bigint" ? amount : BigInt(Math.trunc(amount));
}

function resolveDisplayValues(
  amount: number | bigint,
  signMode: "auto" | IdrSignMode,
  type?: "income" | "expense" | "transfer",
  maskedBase = "Rp •••••",
): { unblurred: string; masked: string } {
  const raw = toBigIntValue(amount);

  if (signMode === "auto") {
    if (type === "income") {
      if (raw === 0n) {
        return { unblurred: "Rp0", masked: maskedBase };
      }
      if (raw > 0n) {
        return {
          unblurred: formatIdr(raw, "signed"),
          masked: `+${maskedBase}`,
        };
      }
      return {
        unblurred: formatIdr(raw, "signed"),
        masked: `-${maskedBase}`,
      };
    }

    if (type === "expense") {
      if (raw === 0n) {
        return { unblurred: "Rp0", masked: maskedBase };
      }
      const negativeValue = raw > 0n ? -raw : raw;
      return {
        unblurred: formatIdr(negativeValue, "signed"),
        masked: `-${maskedBase}`,
      };
    }

    // "transfer" or unspecified type with signMode="auto" renders plain without "+"
    if (raw === 0n) {
      return { unblurred: "Rp0", masked: maskedBase };
    }
    if (raw < 0n) {
      return {
        unblurred: formatIdr(raw, "plain"),
        masked: `-${maskedBase}`,
      };
    }
    return {
      unblurred: formatIdr(raw, "plain"),
      masked: maskedBase,
    };
  }

  if (raw === 0n) {
    return { unblurred: "Rp0", masked: maskedBase };
  }

  if (raw < 0n) {
    return {
      unblurred: formatIdr(raw, signMode),
      masked: `-${maskedBase}`,
    };
  }

  return {
    unblurred: formatIdr(raw, signMode),
    masked: signMode === "signed" ? `+${maskedBase}` : maskedBase,
  };
}

/**
 * Single financial amount renderer enforcing persistent Privacy Blur masking (`UI-4`, `F17`).
 */
export function PrivacyAmount({
  amount,
  signMode = "auto",
  type,
  className,
}: PrivacyAmountProps) {
  const { isBlurred } = usePrivacy();
  const i18n = useContext(I18nContext);
  const maskedBase = i18n?.t?.privacy?.maskedValue ?? "Rp •••••";
  const hiddenAriaLabel =
    i18n?.t?.privacy?.hiddenAriaLabel ?? "Nominal keuangan disembunyikan";

  const { unblurred, masked } = resolveDisplayValues(
    amount,
    signMode,
    type,
    maskedBase,
  );

  if (isBlurred) {
    return (
      <span
        data-privacy-blurred="true"
        aria-label={hiddenAriaLabel}
        className={cn("tabular-nums", className)}
      >
        {masked}
      </span>
    );
  }

  return (
    <span data-privacy-blurred="false" className={cn("tabular-nums", className)}>
      {unblurred}
    </span>
  );
}

