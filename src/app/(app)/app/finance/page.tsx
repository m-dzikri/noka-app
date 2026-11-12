import { redirect } from "next/navigation";
import { FinanceWorkspace } from "@/components/finance/FinanceWorkspace";
import { getSessionUser } from "@/features/auth/session";
import { listCategories } from "@/features/finance/categories-service";
import { FINANCE_LIST_DEFAULT_LIMIT } from "@/features/finance/schemas";
import { getFinanceSummary } from "@/features/finance/summary-service";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const [initialSummary, initialCategories] = await Promise.all([
    getFinanceSummary(
      user.id,
      { includeArchived: true, limit: FINANCE_LIST_DEFAULT_LIMIT },
      { cycleStartDay: user.cycleStartDay },
    ),
    listCategories(user.id),
  ]);

  return (
    <FinanceWorkspace
      initialSummary={initialSummary}
      initialCategories={initialCategories}
    />
  );
}
