"use client";

import { Plus, Star } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import type { WalletWithBalanceDto } from "@/features/finance/wallets-service";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/context";

export interface WalletListSectionProps {
  wallets: WalletWithBalanceDto[];
  showArchived: boolean;
  onToggleShowArchived: (next: boolean) => void;
  onOpenWalletModal: () => void;
}

/**
 * Displays active and optional archived wallets with ledger-derived PrivacyAmount balances and Safe-to-Spend badges (`F10`, `F13`, `UI-4`).
 */
export function WalletListSection({
  wallets,
  showArchived,
  onToggleShowArchived,
  onOpenWalletModal,
}: WalletListSectionProps) {
  const { t } = useI18n();
  const hasArchived = wallets.some((w) => w.archivedAt !== null);
  const visibleWallets = showArchived
    ? wallets
    : wallets.filter((w) => w.archivedAt === null);

  return (
    <section aria-labelledby="wallets-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="wallets-heading"
          className="text-base font-semibold text-[var(--text-primary)]"
        >
          {t.finance.walletsSectionTitle}
        </h2>
        {hasArchived ? (
          <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => onToggleShowArchived(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent-primary)]"
            />
            <span>{t.finance.showArchivedLabel}</span>
          </label>
        ) : null}
      </div>

      {visibleWallets.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle as="h3" className="text-base">
              {t.finance.noWalletsTitle}
            </CardTitle>
            <CardDescription>{t.finance.noWalletsDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={onOpenWalletModal}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>{t.finance.createFirstWalletCta}</span>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleWallets.map((wallet) => (
            <Card
              key={wallet.id}
              data-testid={`wallet-card-${wallet.name}`}
              className={cn(
                "flex flex-col justify-between gap-2 p-4",
                wallet.archivedAt !== null && "opacity-75",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="truncate font-semibold text-[var(--text-primary)]">
                  {wallet.name}
                </span>
                <div className="flex flex-wrap items-center gap-1">
                  {wallet.isDefault ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-primary)]/15 px-2 py-0.5 text-xs font-medium text-[var(--accent-text)]">
                      <Star className="h-3 w-3" aria-hidden="true" />
                      {t.finance.defaultBadge}
                    </span>
                  ) : null}
                  {wallet.includeInSafeToSpend && wallet.archivedAt === null ? (
                    <span className="rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
                      {t.finance.safeToSpendBadge}
                    </span>
                  ) : null}
                  {wallet.archivedAt !== null ? (
                    <span className="rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
                      {t.finance.archivedBadge}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex items-baseline justify-between gap-2 pt-1">
                <span className="text-lg font-bold text-[var(--text-primary)]">
                  <PrivacyAmount amount={wallet.currentBalance} signMode="plain" />
                </span>
                <span className="text-xs text-[var(--text-secondary)]">
                  {t.finance.walletTypes[wallet.type]}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

