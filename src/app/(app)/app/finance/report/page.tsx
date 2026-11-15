import { redirect } from "next/navigation";
import { FinanceReportClientView } from "@/components/finance/FinanceReportClientView";
import { getSessionUser } from "@/features/auth/session";
import { loadFinanceExportDataset } from "@/features/finance/export/export-query";
import { serializeExportDataset } from "@/features/finance/export/types";

export const dynamic = "force-dynamic";

interface FinanceReportPageProps {
  searchParams: Promise<{
    startDate?: string;
    endDate?: string;
    walletId?: string;
    categoryId?: string;
    tzOffset?: string;
  }>;
}

export default async function FinanceReportPage(props: FinanceReportPageProps) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const sp = await props.searchParams;

  const dataset = await loadFinanceExportDataset(
    user.id,
    {
      startDate: sp.startDate,
      endDate: sp.endDate,
      walletId: sp.walletId,
      categoryId: sp.categoryId,
      tzOffset: sp.tzOffset ? Number(sp.tzOffset) : undefined,
    },
    {
      cycleStartDay: user.cycleStartDay,
    },
  );

  const serialized = serializeExportDataset(dataset);

  return <FinanceReportClientView dataset={serialized} />;
}
