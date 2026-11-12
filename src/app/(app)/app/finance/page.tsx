import { redirect } from "next/navigation";
import { FinanceWorkspace } from "@/components/finance/FinanceWorkspace";
import { getDb } from "@/db";
import { getSessionUser } from "@/features/auth/session";
import { listCategories } from "@/features/finance/categories-service";
import { FINANCE_LIST_DEFAULT_LIMIT } from "@/features/finance/schemas";
import { listTransactions } from "@/features/finance/transactions-service";
import { listTransfers } from "@/features/finance/transfers-service";
import { loadWalletsWithBalances } from "@/features/finance/wallets-service";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const [walletsList, categoriesList, transactionsPage, transfersPage] =
    await Promise.all([
      loadWalletsWithBalances(getDb(), user.id, { includeArchived: true }),
      listCategories(user.id),
      listTransactions(user.id, { limit: FINANCE_LIST_DEFAULT_LIMIT }),
      listTransfers(user.id, { limit: FINANCE_LIST_DEFAULT_LIMIT }),
    ]);

  return (
    <FinanceWorkspace
      initialWallets={walletsList}
      initialCategories={categoriesList}
      initialTransactions={transactionsPage.items}
      initialTransactionsNextCursor={transactionsPage.nextCursor}
      initialTransfers={transfersPage.items}
      initialTransfersNextCursor={transfersPage.nextCursor}
    />
  );
}

