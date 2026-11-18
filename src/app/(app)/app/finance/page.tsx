import { redirect } from "next/navigation";
import { FinanceWorkspace } from "@/components/finance/FinanceWorkspace";
import { getSessionUser } from "@/features/auth/session";
import { listCategoryBudgets } from "@/features/finance/budgets-service";
import { listCategories } from "@/features/finance/categories-service";
import type { PendingRecurringDto } from "@/features/finance/recurring-schemas";
import {
  listRecurringTemplates,
  processDueRecurringTemplates,
} from "@/features/finance/recurring-service";
import { FINANCE_LIST_DEFAULT_LIMIT } from "@/features/finance/schemas";
import { getFinanceSummary } from "@/features/finance/summary-service";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const [
    processResult,
    firstSummary,
    initialCategories,
    firstBudgets,
    firstRecurringTemplates,
  ] = await Promise.all([
    processDueRecurringTemplates(user.id).catch(() => null),
    getFinanceSummary(
      user.id,
      { includeArchived: true, limit: FINANCE_LIST_DEFAULT_LIMIT },
      { cycleStartDay: user.cycleStartDay },
    ),
    listCategories(user.id),
    listCategoryBudgets(user.id, { cycleStartDay: user.cycleStartDay }),
    listRecurringTemplates(user.id),
  ]);

  const initialPendingRecurring: PendingRecurringDto[] =
    processResult?.pendingConfirmations ?? [];

  const [initialSummary, initialBudgets, initialRecurringTemplates] =
    processResult && processResult.appliedCount > 0
      ? await Promise.all([
          getFinanceSummary(
            user.id,
            { includeArchived: true, limit: FINANCE_LIST_DEFAULT_LIMIT },
            { cycleStartDay: user.cycleStartDay },
          ),
          listCategoryBudgets(user.id, { cycleStartDay: user.cycleStartDay }),
          listRecurringTemplates(user.id),
        ])
      : [firstSummary, firstBudgets, firstRecurringTemplates];

  return (
    <FinanceWorkspace
      initialSummary={initialSummary}
      initialCategories={initialCategories}
      initialBudgets={initialBudgets}
      initialRecurringTemplates={initialRecurringTemplates}
      initialPendingRecurring={initialPendingRecurring}
    />
  );
}
