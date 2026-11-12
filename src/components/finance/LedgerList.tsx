"use client";

import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import type { FinanceSummaryFilterType } from "@/features/finance/schemas";
import type {
  SummaryLedgerItem,
  SummaryLedgerTransactionItem,
  SummaryLedgerTransferItem,
} from "@/features/finance/summary-service";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/context";

export interface LedgerListProps {
  items: SummaryLedgerItem[];
  filterType: FinanceSummaryFilterType;
  nextCursor: string | null;
  loadingMore: boolean;
  busyDeleteId: string | null;
  onEditTransaction: (tx: SummaryLedgerTransactionItem) => void;
  onRequestDeleteTransaction: (tx: SummaryLedgerTransactionItem) => void;
  onEditTransfer: (tr: SummaryLedgerTransferItem) => void;
  onRequestDeleteTransfer: (tr: SummaryLedgerTransferItem) => void;
  onLoadMore: () => void;
}

/**
 * Renders unified chronological ledger rows (`transaction` and `transfer`) with PrivacyAmount masking and pagination (`F13`, `UI-4`).
 */
export function LedgerList({
  items,
  filterType,
  nextCursor,
  loadingMore,
  busyDeleteId,
  onEditTransaction,
  onRequestDeleteTransaction,
  onEditTransfer,
  onRequestDeleteTransfer,
  onLoadMore,
}: LedgerListProps) {
  const { locale, t } = useI18n();

  function formatOccurredDisplay(iso: string): string {
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) {
      return iso;
    }
    return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(parsed);
  }

  if (items.length === 0) {
    const emptyText =
      filterType === "transfer"
        ? t.finance.ledger.emptyTransfers
        : filterType === "income" || filterType === "expense"
          ? t.finance.ledger.emptyTransactions
          : t.finance.ledger.emptyCombined;

    return (
      <p className="py-6 text-center text-sm text-[var(--text-secondary)]">
        {emptyText}
      </p>
    );
  }

  return (
    <>
      <ul className="flex flex-col divide-y divide-[var(--border-subtle)]">
        {items.map((item) => {
          if (item.kind === "transaction") {
            return (
              <li
                key={`transaction-${item.id}`}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-[var(--text-primary)]">
                      {item.categoryName}
                    </span>
                    <span className="rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
                      {item.walletName}
                    </span>
                    {item.noteId ? (
                      <span className="rounded-full bg-[var(--accent-primary)]/15 px-2 py-0.5 text-xs text-[var(--accent-text)]">
                        {t.finance.ledger.linkedBadge}
                      </span>
                    ) : null}
                  </div>
                  {item.description ? (
                    <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
                      {item.description}
                    </p>
                  ) : null}
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                    {formatOccurredDisplay(item.occurredAt)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      item.type === "income"
                        ? "text-[var(--status-income)]"
                        : "text-[var(--status-expense)]",
                    )}
                  >
                    <PrivacyAmount amount={item.amount} type={item.type} />
                  </span>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onEditTransaction(item)}
                    aria-label={`${t.finance.ledger.editButton} ${item.categoryName}`}
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    loading={busyDeleteId === item.id}
                    onClick={() => onRequestDeleteTransaction(item)}
                    aria-label={`${t.finance.ledger.deleteButton} ${item.categoryName}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              </li>
            );
          }

          return (
            <li
              key={`transfer-${item.id}`}
              className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 font-medium text-[var(--text-primary)]">
                  <span>{item.fromWalletName}</span>
                  <span aria-label={t.finance.ledger.transferArrowAria}>→</span>
                  <span>{item.toWalletName}</span>
                  <span className="rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 text-xs font-normal text-[var(--text-secondary)]">
                    {t.finance.ledger.transferBadge}
                  </span>
                </div>
                {item.note ? (
                  <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
                    {item.note}
                  </p>
                ) : null}
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {formatOccurredDisplay(item.occurredAt)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  <PrivacyAmount amount={item.amount} type="transfer" />
                </span>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onEditTransfer(item)}
                  aria-label={`${t.finance.ledger.editButton} ${item.fromWalletName}`}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  loading={busyDeleteId === item.id}
                  onClick={() => onRequestDeleteTransfer(item)}
                  aria-label={`${t.finance.ledger.deleteButton} ${item.fromWalletName}`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {nextCursor ? (
        <div className="mt-4 flex justify-center">
          <Button
            variant="secondary"
            loading={loadingMore}
            onClick={onLoadMore}
          >
            {loadingMore
              ? t.finance.ledger.loadingMore
              : t.finance.ledger.loadMore}
          </Button>
        </div>
      ) : null}
    </>
  );
}

