import { redirect } from "next/navigation";
import { FinanceReportClientView } from "@/components/finance/FinanceReportClientView";
import { getSessionUser } from "@/features/auth/session";
import { loadFinanceExportDataset } from "@/features/finance/export/export-query";
import {
  reportWebQuerySchema,
  serializeExportDataset,
} from "@/features/finance/export/types";

export const dynamic = "force-dynamic";

interface FinanceReportPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function FinanceReportPage(props: FinanceReportPageProps) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const rawSp = await props.searchParams;
  const parsed = reportWebQuerySchema.safeParse({
    startDate: typeof rawSp.startDate === "string" ? rawSp.startDate : undefined,
    endDate: typeof rawSp.endDate === "string" ? rawSp.endDate : undefined,
    walletId: typeof rawSp.walletId === "string" ? rawSp.walletId : undefined,
    categoryId: typeof rawSp.categoryId === "string" ? rawSp.categoryId : undefined,
    tzOffset: typeof rawSp.tzOffset === "string" ? rawSp.tzOffset : undefined,
  });

  const queryParams = parsed.success ? parsed.data : {};

  let dataset;
  try {
    dataset = await loadFinanceExportDataset(user.id, queryParams, {
      cycleStartDay: user.cycleStartDay,
    });
  } catch {
    // Graceful defense-in-depth fallback to default cycle window if dates are malformed
    dataset = await loadFinanceExportDataset(
      user.id,
      { tzOffset: queryParams.tzOffset },
      {
        cycleStartDay: user.cycleStartDay,
      },
    );
  }

  const serialized = serializeExportDataset(dataset);

  return <FinanceReportClientView dataset={serialized} />;
}
